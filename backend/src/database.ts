// ==========================================================================
// PostgreSQL Database Connection Pool
// Implements connection pooling with retry logic for Azure Database
// for PostgreSQL (Flexible Server) with pgvector extension
// ==========================================================================

import pg from 'pg';
const { Pool } = pg;

// --------------------------------------------------------------------------
// Configuration from environment variables
// --------------------------------------------------------------------------
const DB_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'warroom_admin',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'warroom_cases',
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,

  // Connection pool settings optimized for Azure Functions
  max: 10, // Maximum pool connections (shared across function invocations)
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 10000, // Fail connection attempt after 10s
};

// --------------------------------------------------------------------------
// Singleton pool instance (re-used across function invocations)
// --------------------------------------------------------------------------
let pool: pg.Pool | null = null;

/**
 * Get or create the database connection pool.
 * Uses singleton pattern to reuse connections in Azure Functions warm instances.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(DB_CONFIG);

    // Log pool errors (do not crash the process)
    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });

    console.log(`[DB] Pool created: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  }
  return pool;
}

/**
 * Execute a query with automatic retry on transient connection errors.
 * Retries up to 3 times with exponential backoff.
 *
 * @param text - SQL query string
 * @param params - Query parameters
 * @returns Query result
 */
export async function queryWithRetry(
  text: string,
  params?: any[]
): Promise<pg.QueryResult> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await getPool().query(text, params);
      return result;
    } catch (error: any) {
      lastError = error;

      // Determine if the error is retryable (transient connection issues)
      const isRetryable =
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === '57P01' || // admin_shutdown
        error.code === '57P02' || // crash_shutdown
        error.code === '57P03' || // cannot_connect_now
        error.code === '08006' || // connection_failure
        error.code === '08001' || // sqlclient_unable_to_establish_sqlconnection
        error.code === '08004';   // sqlserver_rejected_establishment_of_sqlconnection

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
        console.warn(
          `[DB] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms - Error: ${error.code} ${error.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (!isRetryable) {
        // Non-retryable error - throw immediately
        throw error;
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Database query failed after retries');
}

/**
 * Initialize the database schema.
 * Creates the cases table and pgvector extension if they don't exist.
 * Called once on first function invocation.
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Enable pgvector extension for embedding storage
    await queryWithRetry('CREATE EXTENSION IF NOT EXISTS vector;');

    // Create the cases table with all taxonomy fields
    await queryWithRetry(`
      CREATE TABLE IF NOT EXISTS cases (
        -- Auto-increment primary key
        id SERIAL PRIMARY KEY,

        -- 1. Case ID - Required, Unique
        case_id VARCHAR(100) UNIQUE NOT NULL,

        -- 2. Case Reviewed
        case_reviewed BOOLEAN DEFAULT FALSE,

        -- 3. TA Name
        ta_name VARCHAR(200) DEFAULT '',

        -- 4. TA Reviewer Notes
        ta_reviewer_notes TEXT DEFAULT '',

        -- 5. Case Type
        case_type VARCHAR(50) DEFAULT '',

        -- 6. Issue Type
        issue_type VARCHAR(50) DEFAULT '',

        -- 7. Was the ASC FQR Accurate?
        fqr_accurate VARCHAR(50) DEFAULT '',

        -- 8. Did FQR help resolve issue?
        fqr_help_resolve VARCHAR(80) DEFAULT '',

        -- 9. Was the case Idle > 8 hours?
        idle_over_8_hours BOOLEAN DEFAULT FALSE,

        -- 9a. Reason for Case idleness (conditional)
        idleness_reason VARCHAR(80) DEFAULT '',

        -- 9b. Why waiting for Collab (conditional)
        collab_wait_reason VARCHAR(50) DEFAULT '',

        -- 9c. Why waiting for PG (conditional)
        pg_wait_reason VARCHAR(50) DEFAULT '',

        -- 10. Engineer Workload
        engineer_workload BOOLEAN DEFAULT FALSE,

        -- 10. Unresponsive Cx
        unresponsive_cx BOOLEAN DEFAULT FALSE,

        -- 11. Case Complexity
        case_complexity VARCHAR(50) DEFAULT '',

        -- 12. ICM Linked
        icm_linked BOOLEAN DEFAULT FALSE,

        -- 13. Next Action Owner
        next_action_owner VARCHAR(50) DEFAULT '',

        -- 14. Next Action for Engineer (SNA)
        next_action_sna TEXT DEFAULT '',

        -- 15. Source of Resolution
        source_of_resolution VARCHAR(80) DEFAULT '',

        -- Embedding vector for RAG chatbot (1536 dimensions for text-embedding-ada-002)
        embedding vector(1536),

        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create indexes for common queries
    await queryWithRetry(`
      CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type);
    `);
    await queryWithRetry(`
      CREATE INDEX IF NOT EXISTS idx_cases_issue_type ON cases(issue_type);
    `);
    await queryWithRetry(`
      CREATE INDEX IF NOT EXISTS idx_cases_case_reviewed ON cases(case_reviewed);
    `);
    await queryWithRetry(`
      CREATE INDEX IF NOT EXISTS idx_cases_idle ON cases(idle_over_8_hours);
    `);
    await queryWithRetry(`
      CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
    `);

    // Create a GIN index for full-text search on notes fields
    await queryWithRetry(`
      CREATE INDEX IF NOT EXISTS idx_cases_search
      ON cases USING GIN (
        to_tsvector('english', coalesce(case_id, '') || ' ' || coalesce(ta_name, '') || ' ' || coalesce(ta_reviewer_notes, '') || ' ' || coalesce(next_action_sna, ''))
      );
    `);

    // Create HNSW index for pgvector similarity search (used by RAG chatbot)
    // HNSW provides faster approximate nearest neighbor search than IVFFlat
    await queryWithRetry(`
      CREATE INDEX IF NOT EXISTS idx_cases_embedding
      ON cases USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);

    console.log('[DB] Schema initialization complete');
  } catch (error: any) {
    console.error('[DB] Schema initialization failed:', error.message);
    throw error;
  }
}

// Track initialization state
let dbInitialized = false;

/**
 * Ensure the database is initialized before processing requests.
 * Safe to call multiple times - only runs initialization once.
 */
export async function ensureDbInitialized(): Promise<void> {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

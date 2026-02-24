// ==========================================================================
// PostgreSQL Database Connection Pool
// Implements connection pooling with retry logic for Azure Database
// for PostgreSQL (Flexible Server) with pgvector extension
//
// SFI/QEI Compliance:
//   - No hardcoded credentials (env vars only)
//   - Managed identity support via @azure/identity (when enabled)
//   - TLS certificate validation enabled for Azure PostgreSQL
//   - No infrastructure details leaked in logs
// ==========================================================================

import pg from 'pg';
import { DefaultAzureCredential } from '@azure/identity';

const { Pool } = pg;

// --------------------------------------------------------------------------
// Configuration from environment variables (NO hardcoded fallbacks)
// --------------------------------------------------------------------------
const PGHOST = process.env.PGHOST || '';
const PGPORT = parseInt(process.env.PGPORT || '5432', 10);
const PGUSER = process.env.PGUSER || '';
const PGPASSWORD = process.env.PGPASSWORD || '';
const PGDATABASE = process.env.PGDATABASE || '';
const PGSSLMODE = process.env.PGSSLMODE || '';

// Separate flag for PostgreSQL AAD auth — only enable when the PG server has
// AAD admin configured.  The generic AZURE_USE_MANAGED_IDENTITY flag controls
// OpenAI; this one controls PostgreSQL (defaults to false — password auth).
const USE_MANAGED_IDENTITY_PG = process.env.AZURE_USE_MANAGED_IDENTITY_PG === 'true';

// Azure Database for PostgreSQL uses DigiCert Global Root G2 CA
// which is in Node.js default CA bundle — rejectUnauthorized: true is correct
const DB_CONFIG: pg.PoolConfig = {
  host: PGHOST,
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: PGDATABASE,
  ssl: PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined,

  // Connection pool settings optimized for Azure Functions
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

// --------------------------------------------------------------------------
// Managed Identity Token Refresh for PostgreSQL AAD Auth
// --------------------------------------------------------------------------
const credential = USE_MANAGED_IDENTITY_PG ? new DefaultAzureCredential() : null;

/**
 * Refresh the password with a managed identity token for Azure PostgreSQL.
 * Token scope: https://ossrdbms-aad.database.windows.net/.default
 */
async function refreshManagedIdentityToken(): Promise<void> {
  if (!credential) return;

  try {
    const tokenResponse = await credential.getToken(
      'https://ossrdbms-aad.database.windows.net/.default'
    );
    if (tokenResponse?.token) {
      DB_CONFIG.password = tokenResponse.token;
      // Recreate pool with new token if it exists
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
    }
  } catch (error: any) {
    console.error('[DB] Managed identity token acquisition failed:', error.message);
    throw error;
  }
}

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

    // SFI: Do not log host/port/database — avoid infrastructure details in logs
    console.log('[DB] Connection pool created');
  }
  return pool;
}

/**
 * Execute a query with automatic retry on transient connection errors.
 * Retries up to 3 times with exponential backoff.
 * Handles managed identity token refresh on auth failures (28P01).
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
        error.code === '08004' || // sqlserver_rejected_establishment_of_sqlconnection
        error.code === '28P01';   // invalid_password (token may have expired)

      // If auth error with managed identity, refresh the token
      if (error.code === '28P01' && USE_MANAGED_IDENTITY_PG) {
        console.warn('[DB] Auth failed, refreshing managed identity token...');
        try {
          await refreshManagedIdentityToken();
        } catch (tokenErr) {
          // Token refresh failed — don't retry
          throw error;
        }
      }

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
        // SFI: Only log error code, not full message (may contain connection details)
        console.warn(
          `[DB] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms - Error code: ${error.code}`
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

        -- 10. Case Complexity
        case_complexity VARCHAR(50) DEFAULT '',

        -- 11. ICM Linked
        icm_linked BOOLEAN DEFAULT FALSE,

        -- 12. Next Action for Engineer (SNA)
        next_action_sna TEXT DEFAULT '',

        -- 13. Source of Resolution
        source_of_resolution VARCHAR(80) DEFAULT '',

        -- Reviewer email (populated from SSO / mock auth context)
        reviewer_email VARCHAR(200) DEFAULT '',

        -- Embedding vector for RAG chatbot (1536 dimensions for text-embedding-ada-002)
        embedding vector(1536),

        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --------------------------------------------------------------------------
    // Schema migration for existing databases:
    // Drop removed columns (engineer_workload, unresponsive_cx, next_action_owner)
    // Add new column (reviewer_email)
    // Uses IF EXISTS / IF NOT EXISTS to be idempotent
    // --------------------------------------------------------------------------
    await queryWithRetry(`
      DO $$
      BEGIN
        -- Drop deprecated columns (safe: IF EXISTS prevents errors)
        ALTER TABLE cases DROP COLUMN IF EXISTS engineer_workload;
        ALTER TABLE cases DROP COLUMN IF EXISTS unresponsive_cx;
        ALTER TABLE cases DROP COLUMN IF EXISTS next_action_owner;

        -- Add reviewer_email column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'cases' AND column_name = 'reviewer_email'
        ) THEN
          ALTER TABLE cases ADD COLUMN reviewer_email VARCHAR(200) DEFAULT '';
        END IF;
      END $$;
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

// Track initialization state with a promise lock to prevent race conditions
let dbInitPromise: Promise<void> | null = null;

/**
 * Ensure the database is initialized before processing requests.
 * Uses a promise lock to prevent concurrent initialization attempts
 * (race condition fix — multiple Azure Function invocations can call this simultaneously).
 */
export async function ensureDbInitialized(): Promise<void> {
  if (dbInitPromise) {
    return dbInitPromise;
  }

  // If using managed identity, refresh token before first connection
  if (USE_MANAGED_IDENTITY_PG && !pool) {
    await refreshManagedIdentityToken();
  }

  dbInitPromise = initializeDatabase().catch((err) => {
    // Reset so next call retries
    dbInitPromise = null;
    throw err;
  });

  return dbInitPromise;
}

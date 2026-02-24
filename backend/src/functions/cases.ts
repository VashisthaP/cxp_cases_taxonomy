// ==========================================================================
// Azure Function: Cases CRUD
// POST   /api/cases       - Create a new case
// GET    /api/cases       - List cases (paginated, searchable, filterable)
// GET    /api/cases/{id}  - Get a single case by Case ID
// PUT    /api/cases/{id}  - Update an existing case
// DELETE /api/cases/{id}  - Delete a case
//
// SFI/QEI: JWT auth required, CORS locked, errors sanitized
// ==========================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ensureDbInitialized, queryWithRetry } from '../database';
import { generateEmbedding, buildCaseEmbeddingText } from '../openai';
import {
  authenticateRequest,
  unauthorizedResponse,
  safeErrorResponse,
  getCorsHeaders,
} from '../auth-middleware';

// --------------------------------------------------------------------------
// CREATE CASE - POST /api/cases
// --------------------------------------------------------------------------
async function createCase(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('[Cases] POST /api/cases - Create new case');
  const origin = request.headers.get('origin');
  const CORS_HEADERS = getCorsHeaders(origin);

  try {
    // SFI: Authenticate the request
    const user = await authenticateRequest(request);
    if (!user) {
      return unauthorizedResponse(origin);
    }

    // Ensure database schema is initialized
    await ensureDbInitialized();

    const body = await request.json() as Record<string, any>;

    // Validate required field: case_id
    if (!body.case_id || typeof body.case_id !== 'string' || body.case_id.trim().length === 0) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { success: false, error: 'Case ID is required and must be a non-empty string.' },
      };
    }

    const caseId = body.case_id.trim();

    // Edge Case: Check for duplicate Case ID
    const existingCheck = await queryWithRetry(
      'SELECT case_id FROM cases WHERE case_id = $1',
      [caseId]
    );
    if (existingCheck.rows.length > 0) {
      return {
        status: 409,
        headers: CORS_HEADERS,
        jsonBody: {
          success: false,
          error: 'Duplicate Case ID. This case already exists.',
        },
      };
    }

    // Generate embedding for RAG chatbot (async, non-blocking for user experience)
    let embedding: number[] = [];
    try {
      const embeddingText = buildCaseEmbeddingText(body);
      embedding = await generateEmbedding(embeddingText);
    } catch (embeddingError: any) {
      // Edge Case: Missing/failed embedding - log but don't fail the case creation
      context.warn('[Cases] Embedding generation failed, saving case without embedding');
    }

    // Insert into database — reviewer_email set from authenticated user
    const result = await queryWithRetry(
      `INSERT INTO cases (
        case_id, case_reviewed, ta_name, ta_reviewer_notes,
        case_type, issue_type, fqr_accurate, fqr_help_resolve,
        idle_over_8_hours, idleness_reason, collab_wait_reason, pg_wait_reason,
        case_complexity, icm_linked,
        next_action_sna, source_of_resolution, reviewer_email, embedding
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17,
        ${embedding.length > 0 ? '$18' : 'NULL'}
      )
      RETURNING *`,
      [
        caseId,
        body.case_reviewed ?? false,
        body.ta_name ?? '',
        body.ta_reviewer_notes ?? '',
        body.case_type ?? '',
        body.issue_type ?? '',
        body.fqr_accurate ?? '',
        body.fqr_help_resolve ?? '',
        body.idle_over_8_hours ?? false,
        body.idleness_reason ?? '',
        body.collab_wait_reason ?? '',
        body.pg_wait_reason ?? '',
        body.case_complexity ?? '',
        body.icm_linked ?? false,
        body.next_action_sna ?? '',
        body.source_of_resolution ?? '',
        user.email,  // reviewer_email from authenticated user
        ...(embedding.length > 0 ? [JSON.stringify(embedding)] : []),
      ]
    );

    // Remove the embedding vector from the response (large, not useful for frontend)
    const createdCase = { ...result.rows[0] };
    delete createdCase.embedding;

    context.log(`[Cases] Case created: ${caseId}`);

    return {
      status: 201,
      headers: CORS_HEADERS,
      jsonBody: {
        success: true,
        data: createdCase,
        message: `Case ${caseId} created successfully.`,
      },
    };
  } catch (error: any) {
    context.error('[Cases] Create case error:', error.message);
    return safeErrorResponse(500, 'Failed to create case. Please try again.', request.headers.get('origin'));
  }
}

// --------------------------------------------------------------------------
// LIST CASES - GET /api/cases
// --------------------------------------------------------------------------
async function listCases(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('[Cases] GET /api/cases - List cases');
  const origin = request.headers.get('origin');
  const CORS_HEADERS = getCorsHeaders(origin);

  try {
    // SFI: Authenticate the request
    const user = await authenticateRequest(request);
    if (!user) {
      return unauthorizedResponse(origin);
    }

    await ensureDbInitialized();

    // Parse query parameters
    const page = Math.max(1, parseInt(request.query.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(request.query.get('pageSize') || '20', 10)));
    const search = request.query.get('search') || '';
    const caseType = request.query.get('caseType') || '';
    const issueType = request.query.get('issueType') || '';
    const reviewedParam = request.query.get('reviewed');
    const offset = (page - 1) * pageSize;

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(
        case_id ILIKE $${paramIndex} OR
        ta_name ILIKE $${paramIndex} OR
        ta_reviewer_notes ILIKE $${paramIndex} OR
        next_action_sna ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (caseType) {
      conditions.push(`case_type = $${paramIndex}`);
      params.push(caseType);
      paramIndex++;
    }

    if (issueType) {
      conditions.push(`issue_type = $${paramIndex}`);
      params.push(issueType);
      paramIndex++;
    }

    if (reviewedParam !== null && reviewedParam !== undefined) {
      conditions.push(`case_reviewed = $${paramIndex}`);
      params.push(reviewedParam === 'true');
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await queryWithRetry(
      `SELECT COUNT(*) as total FROM cases ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / pageSize);

    // Get paginated results (exclude embedding column)
    const dataResult = await queryWithRetry(
      `SELECT id, case_id, case_reviewed, ta_name, ta_reviewer_notes,
              case_type, issue_type, fqr_accurate, fqr_help_resolve,
              idle_over_8_hours, idleness_reason, collab_wait_reason, pg_wait_reason,
              case_complexity, icm_linked,
              next_action_sna, source_of_resolution, reviewer_email,
              created_at, updated_at
       FROM cases ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    );

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: {
        success: true,
        data: {
          items: dataResult.rows,
          total,
          page,
          pageSize,
          totalPages,
        },
      },
    };
  } catch (error: any) {
    context.error('[Cases] List cases error:', error.message);
    return safeErrorResponse(500, 'Failed to list cases. Please try again.', request.headers.get('origin'));
  }
}

// --------------------------------------------------------------------------
// GET CASE BY ID - GET /api/cases/{id}
// --------------------------------------------------------------------------
async function getCaseById(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const caseId = request.params.caseId;
  context.log(`[Cases] GET /api/cases/${caseId} - Get case by ID`);
  const origin = request.headers.get('origin');
  const CORS_HEADERS = getCorsHeaders(origin);

  try {
    // SFI: Authenticate the request
    const user = await authenticateRequest(request);
    if (!user) {
      return unauthorizedResponse(origin);
    }

    await ensureDbInitialized();

    const result = await queryWithRetry(
      `SELECT id, case_id, case_reviewed, ta_name, ta_reviewer_notes,
              case_type, issue_type, fqr_accurate, fqr_help_resolve,
              idle_over_8_hours, idleness_reason, collab_wait_reason, pg_wait_reason,
              case_complexity, icm_linked,
              next_action_sna, source_of_resolution, reviewer_email,
              created_at, updated_at
       FROM cases WHERE case_id = $1`,
      [caseId]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: CORS_HEADERS,
        jsonBody: { success: false, error: `Case ${caseId} not found.` },
      };
    }

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: { success: true, data: result.rows[0] },
    };
  } catch (error: any) {
    context.error(`[Cases] Get case error:`, error.message);
    return safeErrorResponse(500, 'Failed to get case. Please try again.', request.headers.get('origin'));
  }
}

// --------------------------------------------------------------------------
// UPDATE CASE - PUT /api/cases/{id}
// --------------------------------------------------------------------------
async function updateCase(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const caseId = request.params.caseId;
  context.log(`[Cases] PUT /api/cases/${caseId} - Update case`);
  const origin = request.headers.get('origin');
  const CORS_HEADERS = getCorsHeaders(origin);

  try {
    // SFI: Authenticate the request
    const user = await authenticateRequest(request);
    if (!user) {
      return unauthorizedResponse(origin);
    }

    await ensureDbInitialized();

    // Verify case exists
    const existingResult = await queryWithRetry(
      'SELECT case_id FROM cases WHERE case_id = $1',
      [caseId]
    );
    if (existingResult.rows.length === 0) {
      return {
        status: 404,
        headers: CORS_HEADERS,
        jsonBody: { success: false, error: `Case ${caseId} not found.` },
      };
    }

    const body = await request.json() as Record<string, any>;

    // Re-generate embedding with updated data
    let embeddingClause = '';
    const embeddingParams: any[] = [];
    try {
      const embeddingText = buildCaseEmbeddingText({ ...body, case_id: caseId });
      const embedding = await generateEmbedding(embeddingText);
      if (embedding.length > 0) {
        embeddingClause = ', embedding = $18';
        embeddingParams.push(JSON.stringify(embedding));
      }
    } catch (embeddingError: any) {
      context.warn('[Cases] Embedding update failed');
    }

    const result = await queryWithRetry(
      `UPDATE cases SET
        case_reviewed = $1,
        ta_name = $2,
        ta_reviewer_notes = $3,
        case_type = $4,
        issue_type = $5,
        fqr_accurate = $6,
        fqr_help_resolve = $7,
        idle_over_8_hours = $8,
        idleness_reason = $9,
        collab_wait_reason = $10,
        pg_wait_reason = $11,
        case_complexity = $12,
        icm_linked = $13,
        next_action_sna = $14,
        source_of_resolution = $15,
        reviewer_email = $16,
        updated_at = NOW()
        ${embeddingClause}
      WHERE case_id = $17
      RETURNING id, case_id, case_reviewed, ta_name, ta_reviewer_notes,
                case_type, issue_type, fqr_accurate, fqr_help_resolve,
                idle_over_8_hours, idleness_reason, collab_wait_reason, pg_wait_reason,
                case_complexity, icm_linked,
                next_action_sna, source_of_resolution, reviewer_email,
                created_at, updated_at`,
      [
        body.case_reviewed ?? false,
        body.ta_name ?? '',
        body.ta_reviewer_notes ?? '',
        body.case_type ?? '',
        body.issue_type ?? '',
        body.fqr_accurate ?? '',
        body.fqr_help_resolve ?? '',
        body.idle_over_8_hours ?? false,
        body.idleness_reason ?? '',
        body.collab_wait_reason ?? '',
        body.pg_wait_reason ?? '',
        body.case_complexity ?? '',
        body.icm_linked ?? false,
        body.next_action_sna ?? '',
        body.source_of_resolution ?? '',
        user.email,  // reviewer_email from authenticated user
        caseId,
        ...embeddingParams,
      ]
    );

    context.log(`[Cases] Case updated: ${caseId}`);

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: {
        success: true,
        data: result.rows[0],
        message: `Case ${caseId} updated successfully.`,
      },
    };
  } catch (error: any) {
    context.error(`[Cases] Update case error:`, error.message);
    return safeErrorResponse(500, 'Failed to update case. Please try again.', request.headers.get('origin'));
  }
}

// --------------------------------------------------------------------------
// DELETE CASE - DELETE /api/cases/{id}
// --------------------------------------------------------------------------
async function deleteCase(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const caseId = request.params.caseId;
  context.log(`[Cases] DELETE /api/cases/${caseId} - Delete case`);
  const origin = request.headers.get('origin');
  const CORS_HEADERS = getCorsHeaders(origin);

  try {
    // SFI: Authenticate the request
    const user = await authenticateRequest(request);
    if (!user) {
      return unauthorizedResponse(origin);
    }

    await ensureDbInitialized();

    const result = await queryWithRetry(
      'DELETE FROM cases WHERE case_id = $1 RETURNING case_id',
      [caseId]
    );

    if (result.rows.length === 0) {
      return {
        status: 404,
        headers: CORS_HEADERS,
        jsonBody: { success: false, error: `Case ${caseId} not found.` },
      };
    }

    context.log(`[Cases] Case deleted: ${caseId}`);

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: {
        success: true,
        message: `Case ${caseId} deleted successfully.`,
      },
    };
  } catch (error: any) {
    context.error(`[Cases] Delete case error:`, error.message);
    return safeErrorResponse(500, 'Failed to delete case. Please try again.', request.headers.get('origin'));
  }
}

// --------------------------------------------------------------------------
// OPTIONS (CORS preflight handler)
// --------------------------------------------------------------------------
async function corsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return { status: 204, headers: getCorsHeaders(request.headers.get('origin')) };
}

// --------------------------------------------------------------------------
// Register Azure Functions
// --------------------------------------------------------------------------

// Create case
app.http('createCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: createCase,
});

// List cases
app.http('listCases', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: listCases,
});

// Get case by ID
app.http('getCaseById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{caseId}',
  handler: getCaseById,
});

// Update case
app.http('updateCase', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'cases/{caseId}',
  handler: updateCase,
});

// Delete case
app.http('deleteCase', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'cases/{caseId}',
  handler: deleteCase,
});

// CORS preflight for /api/cases
app.http('casesCors', {
  methods: ['OPTIONS'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: corsHandler,
});

// CORS preflight for /api/cases/{id}
app.http('caseByIdCors', {
  methods: ['OPTIONS'],
  authLevel: 'anonymous',
  route: 'cases/{caseId}',
  handler: corsHandler,
});

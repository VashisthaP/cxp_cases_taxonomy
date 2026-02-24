// ==========================================================================
// Azure Function: Agentic Chatbot (RAG Pipeline)
// POST /api/chat
// Implements RAG (Retrieval Augmented Generation) using:
//   1. pgvector similarity search to find relevant cases
//   2. Azure OpenAI GPT-4o for natural language response generation
//
// SFI/QEI: JWT auth required, CORS locked, errors sanitized
// ==========================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ensureDbInitialized, queryWithRetry } from '../database';
import { generateEmbedding, chatCompletion } from '../openai';
import { v4 as uuidv4 } from 'uuid';
import {
  authenticateRequest,
  unauthorizedResponse,
  safeErrorResponse,
  getCorsHeaders,
} from '../auth-middleware';

// Number of similar cases to retrieve for RAG context
const TOP_K_CASES = 10;

// Minimum similarity threshold (cosine distance; lower = more similar)
const SIMILARITY_THRESHOLD = 0.8;

// Maximum chat message length to prevent abuse
const MAX_MESSAGE_LENGTH = 2000;

async function chatHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('[Chat] POST /api/chat - Chatbot message received');
  const origin = request.headers.get('origin');
  const CORS_HEADERS = getCorsHeaders(origin);

  try {
    // SFI: Authenticate the request
    const user = await authenticateRequest(request);
    if (!user) {
      return unauthorizedResponse(origin);
    }

    await ensureDbInitialized();

    const body = await request.json() as Record<string, any>;
    const userMessage = body.message?.trim();

    if (!userMessage) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { success: false, error: 'Message is required.' },
      };
    }

    // Validate message length to prevent abuse
    if (userMessage.length > MAX_MESSAGE_LENGTH) {
      return {
        status: 400,
        headers: CORS_HEADERS,
        jsonBody: { success: false, error: `Message must be under ${MAX_MESSAGE_LENGTH} characters.` },
      };
    }

    context.log(`[Chat] User query (${userMessage.length} chars)`);

    // ======================================================================
    // Step 1: Generate embedding for the user's query
    // ======================================================================
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await generateEmbedding(userMessage);
    } catch (embErr: any) {
      context.warn('[Chat] Query embedding generation failed');
    }

    // ======================================================================
    // Step 2: Retrieve relevant cases using pgvector similarity search
    // Falls back to keyword-based search if embeddings are not available
    // ======================================================================
    let relevantCases: any[] = [];

    if (queryEmbedding.length > 0) {
      // pgvector cosine similarity search
      try {
        const vectorResult = await queryWithRetry(
          `SELECT id, case_id, case_reviewed, ta_name, ta_reviewer_notes,
                  case_type, issue_type, fqr_accurate, fqr_help_resolve,
                  idle_over_8_hours, idleness_reason, collab_wait_reason, pg_wait_reason,
                  case_complexity, icm_linked,
                  next_action_sna, source_of_resolution, reviewer_email,
                  created_at, updated_at,
                  1 - (embedding <=> $1::vector) as similarity
           FROM cases
           WHERE embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [JSON.stringify(queryEmbedding), TOP_K_CASES]
        );
        relevantCases = vectorResult.rows;
        context.log(`[Chat] Vector search returned ${relevantCases.length} cases`);
      } catch (vecErr: any) {
        context.warn('[Chat] Vector search failed, falling back to text search');
      }
    }

    // Fallback: Text-based search if vector search returned no results
    if (relevantCases.length === 0) {
      try {
        // Use plainto_tsquery for safe text search (no SQL injection via tsquery operators)
        if (userMessage.length > 2) {
          const textResult = await queryWithRetry(
            `SELECT id, case_id, case_reviewed, ta_name, ta_reviewer_notes,
                    case_type, issue_type, fqr_accurate, fqr_help_resolve,
                    idle_over_8_hours, idleness_reason, collab_wait_reason, pg_wait_reason,
                    case_complexity, icm_linked,
                    next_action_sna, source_of_resolution, reviewer_email,
                    created_at, updated_at
             FROM cases
             WHERE to_tsvector('english',
               coalesce(case_id, '') || ' ' ||
               coalesce(ta_name, '') || ' ' ||
               coalesce(ta_reviewer_notes, '') || ' ' ||
               coalesce(case_type, '') || ' ' ||
               coalesce(issue_type, '') || ' ' ||
               coalesce(next_action_sna, '')
             ) @@ plainto_tsquery('english', $1)
             ORDER BY created_at DESC
             LIMIT $2`,
            [userMessage, TOP_K_CASES]
          );
          relevantCases = textResult.rows;
          context.log(`[Chat] Text search returned ${relevantCases.length} cases`);
        }
      } catch (textErr: any) {
        context.warn('[Chat] Text search also failed');
      }
    }

    // If still no cases, try to get the most recent cases as context
    if (relevantCases.length === 0) {
      try {
        const recentResult = await queryWithRetry(
          `SELECT id, case_id, case_reviewed, ta_name, ta_reviewer_notes,
                  case_type, issue_type, fqr_accurate, fqr_help_resolve,
                  idle_over_8_hours, idleness_reason, collab_wait_reason, pg_wait_reason,
                  case_complexity, icm_linked,
                  next_action_sna, source_of_resolution, reviewer_email,
                  created_at, updated_at
           FROM cases
           ORDER BY created_at DESC
           LIMIT $1`,
          [TOP_K_CASES]
        );
        relevantCases = recentResult.rows;
        context.log(`[Chat] Using ${relevantCases.length} most recent cases as context`);
      } catch (recentErr: any) {
        context.warn('[Chat] Recent cases query failed');
      }
    }

    // ======================================================================
    // Step 3: Generate AI response using GPT-4o with RAG context
    // ======================================================================
    const aiResponse = await chatCompletion(userMessage, relevantCases);

    // Build source references from the relevant cases
    const sources = relevantCases
      .slice(0, 5)
      .map((c: any) => c.case_id)
      .filter(Boolean);

    const responseMessage = {
      id: `assistant-${uuidv4()}`,
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
      sources: sources.length > 0 ? sources : undefined,
    };

    context.log(`[Chat] Response generated (${aiResponse.length} chars, ${sources.length} sources)`);

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: { success: true, data: responseMessage },
    };
  } catch (error: any) {
    context.error('[Chat] Chat handler error:', error.message);
    const origin = request.headers.get('origin');
    return {
      status: 500,
      headers: getCorsHeaders(origin),
      jsonBody: {
        success: false,
        error: 'Chat processing failed. Please try again.',
        data: {
          id: `error-${uuidv4()}`,
          role: 'assistant',
          content: 'I\'m sorry, I encountered an error processing your request. Please try again.',
          timestamp: new Date().toISOString(),
        },
      },
    };
  }
}

// Register the function
app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: chatHandler,
});

// CORS preflight
app.http('chatCors', {
  methods: ['OPTIONS'],
  authLevel: 'anonymous',
  route: 'chat',
  handler: async (request) => ({ status: 204, headers: getCorsHeaders(request.headers.get('origin')) }),
});

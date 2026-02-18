// ==========================================================================
// Azure Function: Health Check
// GET /api/health
// Returns API health status and timestamp
// ==========================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPool } from '../database';

async function healthCheck(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('[Health] Health check requested');

  try {
    // Test database connectivity
    const pool = getPool();
    await pool.query('SELECT 1');

    return {
      status: 200,
      jsonBody: {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          database: 'connected',
          version: '1.0.0',
        },
      },
    };
  } catch (error: any) {
    context.error('[Health] Database connectivity issue:', error.message);

    return {
      status: 503,
      jsonBody: {
        success: false,
        data: {
          status: 'degraded',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          error: error.message,
        },
      },
    };
  }
}

// Register the function with Azure Functions runtime
app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthCheck,
});

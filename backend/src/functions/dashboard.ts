// ==========================================================================
// Azure Function: Dashboard Statistics
// GET /api/dashboard/stats
// Returns aggregated case taxonomy statistics for the dashboard
// ==========================================================================

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ensureDbInitialized, queryWithRetry } from '../database';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function getDashboardStats(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('[Dashboard] GET /api/dashboard/stats - Fetch dashboard statistics');

  try {
    await ensureDbInitialized();

    // Execute multiple aggregation queries in parallel for performance
    const [
      totalResult,
      reviewedResult,
      idleResult,
      caseTypeResult,
      issueTypeResult,
      resolutionResult,
    ] = await Promise.all([
      // Total cases count
      queryWithRetry('SELECT COUNT(*) as total FROM cases'),

      // Reviewed vs pending counts
      queryWithRetry(`
        SELECT
          COUNT(*) FILTER (WHERE case_reviewed = true) as reviewed,
          COUNT(*) FILTER (WHERE case_reviewed = false) as pending
        FROM cases
      `),

      // Idle > 8 hours count
      queryWithRetry(
        'SELECT COUNT(*) as idle FROM cases WHERE idle_over_8_hours = true'
      ),

      // Cases grouped by case_type
      queryWithRetry(`
        SELECT case_type, COUNT(*) as count
        FROM cases
        WHERE case_type != ''
        GROUP BY case_type
        ORDER BY count DESC
      `),

      // Cases grouped by issue_type
      queryWithRetry(`
        SELECT issue_type, COUNT(*) as count
        FROM cases
        WHERE issue_type != ''
        GROUP BY issue_type
        ORDER BY count DESC
      `),

      // Cases grouped by source_of_resolution
      queryWithRetry(`
        SELECT source_of_resolution, COUNT(*) as count
        FROM cases
        WHERE source_of_resolution != ''
        GROUP BY source_of_resolution
        ORDER BY count DESC
      `),
    ]);

    // Transform results into dashboard stats format
    const casesByType: Record<string, number> = {};
    caseTypeResult.rows.forEach((row: any) => {
      casesByType[row.case_type] = parseInt(row.count, 10);
    });

    const casesByIssueType: Record<string, number> = {};
    issueTypeResult.rows.forEach((row: any) => {
      casesByIssueType[row.issue_type] = parseInt(row.count, 10);
    });

    const avgResolutionBySource: Record<string, number> = {};
    resolutionResult.rows.forEach((row: any) => {
      avgResolutionBySource[row.source_of_resolution] = parseInt(row.count, 10);
    });

    const stats = {
      totalCases: parseInt(totalResult.rows[0].total, 10),
      reviewedCases: parseInt(reviewedResult.rows[0].reviewed, 10),
      pendingCases: parseInt(reviewedResult.rows[0].pending, 10),
      idleCases: parseInt(idleResult.rows[0].idle, 10),
      casesByType,
      casesByIssueType,
      avgResolutionBySource,
    };

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: { success: true, data: stats },
    };
  } catch (error: any) {
    context.error('[Dashboard] Stats error:', error.message);
    return {
      status: 500,
      headers: CORS_HEADERS,
      jsonBody: { success: false, error: `Failed to load dashboard stats: ${error.message}` },
    };
  }
}

// Register the function
app.http('dashboardStats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/stats',
  handler: getDashboardStats,
});

// CORS preflight
app.http('dashboardStatsCors', {
  methods: ['OPTIONS'],
  authLevel: 'anonymous',
  route: 'dashboard/stats',
  handler: async () => ({ status: 204, headers: CORS_HEADERS }),
});

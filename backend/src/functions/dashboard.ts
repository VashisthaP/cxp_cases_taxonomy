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

// --------------------------------------------------------------------------
// INSIGHTS DATA - GET /api/dashboard/insights
// Returns 3 cross-tabulated visualizations:
//   1. Idle Time >8h Analysis (by Issue Type + by Case Complexity)
//   2. Source of Resolution (by Issue Type + by Case Complexity)
//   3. FQR Accuracy & Helpfulness (New Cases Only, by Issue Type + by Complexity)
// --------------------------------------------------------------------------
async function getDashboardInsights(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('[Dashboard] GET /api/dashboard/insights - Fetch insights data');

  try {
    await ensureDbInitialized();

    const [
      // Idle Time Analysis
      idleByIssueType,
      idleByComplexity,
      // Source of Resolution
      resByIssueType,
      resByComplexity,
      // FQR Accuracy (New Cases Only)
      fqrByIssueType,
      fqrByComplexity,
      // Reviewer stats (kept for Reviewer Activity table)
      reviewerStatsResult,
    ] = await Promise.all([
      // =====================================================================
      // 1a. Idle Time >8h - By Issue Type
      // Columns: issue_type, total, idle_count, awaiting_cx, engineer_workload,
      //          collab_wait, pg_wait, unsure
      // =====================================================================
      queryWithRetry(`
        SELECT
          COALESCE(NULLIF(issue_type, ''), 'Unknown') as issue_type,
          COUNT(*) as total_cases,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true) as idle_count,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'Awaiting response from Cx') as awaiting_cx,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'Engineer Workload') as engineer_workload,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'Awaiting Collab Response') as collab_wait,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'PG - Awaiting ICM Response') as pg_wait,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'Unsure') as unsure
        FROM cases
        WHERE issue_type != ''
        GROUP BY issue_type
        ORDER BY total_cases DESC
      `),

      // =====================================================================
      // 1b. Idle Time >8h - By Case Complexity
      // =====================================================================
      queryWithRetry(`
        SELECT
          COALESCE(NULLIF(case_complexity, ''), 'Not Complex') as complexity,
          COUNT(*) as total_cases,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true) as idle_count,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason IN ('Awaiting response from Cx', 'AVA')) as awaiting_cx,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'Engineer Workload') as engineer_workload,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'Collaboration Team') as collab_wait,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'PG') as pg_wait,
          COUNT(*) FILTER (WHERE idle_over_8_hours = true AND idleness_reason = 'Unsure') as unsure
        FROM cases
        GROUP BY case_complexity
        ORDER BY total_cases DESC
      `),

      // =====================================================================
      // 2a. Resolution - By Issue Type
      // Columns: issue_type, cases, still_open, asc_fqr, live_troubleshoot, icm_collab_other
      // =====================================================================
      queryWithRetry(`
        SELECT
          COALESCE(NULLIF(issue_type, ''), 'Unknown') as issue_type,
          COUNT(*) as total_cases,
          COUNT(*) FILTER (WHERE source_of_resolution = 'Still Open' OR source_of_resolution = '') as still_open,
          COUNT(*) FILTER (WHERE source_of_resolution = 'ASC FQR') as asc_fqr,
          COUNT(*) FILTER (WHERE source_of_resolution IN ('Live Cx', 'Diagnostics Tools', 'Wiki/Deep Research Agent', 'Ava Post')) as live_troubleshoot,
          COUNT(*) FILTER (WHERE source_of_resolution IN ('ICM', 'Collaboration Task')) as icm_collab_other
        FROM cases
        WHERE issue_type != ''
        GROUP BY issue_type
        ORDER BY total_cases DESC
      `),

      // =====================================================================
      // 2b. Resolution - By Case Complexity
      // Columns: complexity, cases, still_open, dependency_driven
      // =====================================================================
      queryWithRetry(`
        SELECT
          COALESCE(NULLIF(case_complexity, ''), 'Not Complex') as complexity,
          COUNT(*) as total_cases,
          COUNT(*) FILTER (WHERE source_of_resolution = 'Still Open' OR source_of_resolution = '') as still_open,
          COUNT(*) FILTER (WHERE source_of_resolution IN ('ICM', 'Collaboration Task', 'Ava Post')) as dependency_driven
        FROM cases
        GROUP BY case_complexity
        ORDER BY total_cases DESC
      `),

      // =====================================================================
      // 3a. FQR Accuracy - By Issue Type (New Cases Only)
      // Columns: issue_type, new_cases, fqr_accurate_right, fqr_helped, help_pct
      // =====================================================================
      queryWithRetry(`
        SELECT
          COALESCE(NULLIF(issue_type, ''), 'Unknown') as issue_type,
          COUNT(*) as new_cases,
          COUNT(*) FILTER (WHERE fqr_accurate IN ('Yes-Accurate', 'Yes-Right area')) as fqr_accurate_right,
          COUNT(*) FILTER (WHERE fqr_help_resolve = 'Yes') as fqr_helped,
          CASE
            WHEN COUNT(*) > 0 THEN ROUND(
              (COUNT(*) FILTER (WHERE fqr_help_resolve = 'Yes'))::numeric / COUNT(*)::numeric * 100, 1
            )
            ELSE 0
          END as help_pct
        FROM cases
        WHERE case_type = 'New' AND issue_type != ''
        GROUP BY issue_type
        ORDER BY new_cases DESC
      `),

      // =====================================================================
      // 3b. FQR Accuracy - By Case Complexity (New Cases Only)
      // =====================================================================
      queryWithRetry(`
        SELECT
          COALESCE(NULLIF(case_complexity, ''), 'Not Complex') as complexity,
          COUNT(*) as total_cases,
          COUNT(*) FILTER (WHERE fqr_help_resolve = 'Yes') as fqr_helped,
          CASE
            WHEN COUNT(*) > 0 THEN ROUND(
              (COUNT(*) FILTER (WHERE fqr_help_resolve = 'Yes'))::numeric / COUNT(*)::numeric * 100, 1
            )
            ELSE 0
          END as help_pct
        FROM cases
        WHERE case_type = 'New'
        GROUP BY case_complexity
        ORDER BY total_cases DESC
      `),

      // =====================================================================
      // Reviewer activity stats (kept from previous version)
      // =====================================================================
      queryWithRetry(`
        SELECT
          COALESCE(NULLIF(ta_name, ''), 'Unknown') as reviewer,
          COUNT(*) as total_cases,
          COUNT(*) FILTER (WHERE case_reviewed = true) as reviewed,
          COUNT(*) FILTER (WHERE case_reviewed = false) as pending
        FROM cases
        GROUP BY ta_name
        ORDER BY total_cases DESC
        LIMIT 20
      `),
    ]);

    const insights = {
      idleByIssueType: idleByIssueType.rows,
      idleByComplexity: idleByComplexity.rows,
      resByIssueType: resByIssueType.rows,
      resByComplexity: resByComplexity.rows,
      fqrByIssueType: fqrByIssueType.rows,
      fqrByComplexity: fqrByComplexity.rows,
      reviewerStats: reviewerStatsResult.rows,
    };

    return {
      status: 200,
      headers: CORS_HEADERS,
      jsonBody: { success: true, data: insights },
    };
  } catch (error: any) {
    context.error('[Dashboard] Insights error:', error.message);
    return {
      status: 500,
      headers: CORS_HEADERS,
      jsonBody: { success: false, error: `Failed to load insights: ${error.message}` },
    };
  }
}

app.http('dashboardInsights', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'dashboard/insights',
  handler: getDashboardInsights,
});

app.http('dashboardInsightsCors', {
  methods: ['OPTIONS'],
  authLevel: 'anonymous',
  route: 'dashboard/insights',
  handler: async () => ({ status: 204, headers: CORS_HEADERS }),
});

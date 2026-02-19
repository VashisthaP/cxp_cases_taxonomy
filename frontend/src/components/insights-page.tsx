// ==========================================================================
// InsightsPage Component - Cross-tabulated analytics matching reference images
// 3 Sections:
//   1. Idle Time >8 Hours Analysis (By Issue Type + By Case Complexity)
//   2. Source of Resolution (By Issue Type + By Case Complexity)
//   3. FQR Accuracy & Helpfulness (New Cases Only - By Issue Type + Complexity)
// Each section has two data tables + an insights sidebar
// ==========================================================================
"use client";

import React, { useState, useEffect } from 'react';
import { getDashboardInsights } from '@/lib/api';
import type { InsightsData } from '@/types/case';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

// --------------------------------------------------------------------------
// Helper: parse numeric string
// --------------------------------------------------------------------------
function n(val: string | number): number {
  return parseInt(String(val), 10) || 0;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function InsightsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const response = await getDashboardInsights();
      if (response.success && response.data) {
        setData(response.data);
      }
    } catch (error: any) {
      console.error('[Insights] Failed to load insights:', error);
      toast({
        title: 'Error loading insights',
        description: error?.message || 'Failed to load insights data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading insights...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Failed to load insights data.</p>
        <Button variant="outline" className="mt-4" onClick={fetchInsights}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // ========================================================================
  // Compute dynamic insights for each section
  // ========================================================================

  // --- Idle Insights ---
  const totalIdle = data.idleByIssueType.reduce((s, r) => s + n(r.idle_count), 0);
  const totalAwaitCx = data.idleByIssueType.reduce((s, r) => s + n(r.awaiting_cx), 0);
  const totalEngWorkload = data.idleByIssueType.reduce((s, r) => s + n(r.engineer_workload), 0);
  const idlePctCxEng = totalIdle > 0 ? Math.round(((totalAwaitCx + totalEngWorkload) / totalIdle) * 100) : 0;
  const topIdleIssue = data.idleByIssueType.length > 0 ? data.idleByIssueType[0] : null;

  // --- Resolution Insights ---
  const totalCases = data.resByIssueType.reduce((s, r) => s + n(r.total_cases), 0);
  const totalStillOpen = data.resByIssueType.reduce((s, r) => s + n(r.still_open), 0);
  const totalAscFqr = data.resByIssueType.reduce((s, r) => s + n(r.asc_fqr), 0);

  // --- FQR Insights ---
  const totalNewCases = data.fqrByIssueType.reduce((s, r) => s + n(r.new_cases), 0);
  const totalFqrHelped = data.fqrByIssueType.reduce((s, r) => s + n(r.fqr_helped), 0);
  const overallHelpPct = totalNewCases > 0 ? ((totalFqrHelped / totalNewCases) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Case Insights</h2>
          <p className="text-muted-foreground">
            Cross-tabulated analysis of idle time, resolution sources, and FQR effectiveness.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchInsights} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ================================================================== */}
      {/* SECTION 1: Idle Time >8 Hours Analysis                             */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Idle Time {'>'}8 Hours Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
            {/* Tables */}
            <div className="space-y-6">
              {/* By Issue Type */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  By Issue Type
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-semibold">Issue Type</th>
                        <th className="text-right p-2 border-b font-semibold">Total Cases</th>
                        <th className="text-right p-2 border-b font-semibold">Idle {'>'}8h</th>
                        <th className="text-right p-2 border-b font-semibold">Awaiting CX/External</th>
                        <th className="text-right p-2 border-b font-semibold">Engineer Workload</th>
                        <th className="text-right p-2 border-b font-semibold">Collaboration Wait</th>
                        <th className="text-right p-2 border-b font-semibold">PG Wait</th>
                        <th className="text-right p-2 border-b font-semibold">Unsure Next Step</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.idleByIssueType.map((row, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                          <td className="p-2 border-b font-medium">{row.issue_type}</td>
                          <td className="p-2 border-b text-right font-mono">{row.total_cases}</td>
                          <td className="p-2 border-b text-right font-mono font-semibold">{row.idle_count}</td>
                          <td className="p-2 border-b text-right font-mono">{row.awaiting_cx}</td>
                          <td className="p-2 border-b text-right font-mono">{row.engineer_workload}</td>
                          <td className="p-2 border-b text-right font-mono">{row.collab_wait}</td>
                          <td className="p-2 border-b text-right font-mono">{row.pg_wait}</td>
                          <td className="p-2 border-b text-right font-mono">{row.unsure}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* By Case Complexity */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  By Case Complexity
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-semibold">Complexity</th>
                        <th className="text-right p-2 border-b font-semibold">Cases</th>
                        <th className="text-right p-2 border-b font-semibold">Idle Cases</th>
                        <th className="text-right p-2 border-b font-semibold">Awaiting CX/External</th>
                        <th className="text-right p-2 border-b font-semibold">Engineer Workload</th>
                        <th className="text-right p-2 border-b font-semibold">Collaboration Wait</th>
                        <th className="text-right p-2 border-b font-semibold">PG Wait</th>
                        <th className="text-right p-2 border-b font-semibold">Unsure Next Step</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.idleByComplexity.map((row, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                          <td className="p-2 border-b font-medium">{row.complexity}</td>
                          <td className="p-2 border-b text-right font-mono">{row.total_cases}</td>
                          <td className="p-2 border-b text-right font-mono font-semibold">{row.idle_count}</td>
                          <td className="p-2 border-b text-right font-mono">{row.awaiting_cx}</td>
                          <td className="p-2 border-b text-right font-mono">{row.engineer_workload}</td>
                          <td className="p-2 border-b text-right font-mono">{row.collab_wait}</td>
                          <td className="p-2 border-b text-right font-mono">{row.pg_wait}</td>
                          <td className="p-2 border-b text-right font-mono">{row.unsure}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Insights Sidebar */}
            <div className="border-l pl-6 space-y-3">
              <h3 className="font-semibold text-base">Insights</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">~{idlePctCxEng}% of idle time</span> comes
                  from Customer response loop and engineer workload drive.
                </li>
                <li>
                  {topIdleIssue && (
                    <>
                      <span className="font-medium text-foreground">{topIdleIssue.issue_type}</span> drives
                      majority idle volume (largest workload + highest delay).
                    </>
                  )}
                </li>
                <li>
                  <span className="font-medium text-foreground">RCA and PG engagement</span> cases show
                  highest dependency-driven idle.
                </li>
                <li>
                  <span className="font-medium text-foreground">Integration and transferred cases</span> have
                  the highest investigation wait.
                </li>
                <li>
                  <span className="font-medium text-foreground">Throughput loss driven more by waiting</span>{' '}
                  than troubleshooting.
                </li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* SECTION 2: Source of Resolution                                     */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Source of Resolution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
            {/* Tables */}
            <div className="space-y-6">
              {/* Resolution By Issue Type */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Resolution By Issue Type
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-semibold">Issue Type</th>
                        <th className="text-right p-2 border-b font-semibold">Cases</th>
                        <th className="text-right p-2 border-b font-semibold">Case Still Open</th>
                        <th className="text-right p-2 border-b font-semibold">ASC FQR</th>
                        <th className="text-right p-2 border-b font-semibold">Live Troubleshooting</th>
                        <th className="text-right p-2 border-b font-semibold">ICM / Collab / Other</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.resByIssueType.map((row, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                          <td className="p-2 border-b font-medium">{row.issue_type}</td>
                          <td className="p-2 border-b text-right font-mono">{row.total_cases}</td>
                          <td className="p-2 border-b text-right font-mono">{row.still_open}</td>
                          <td className="p-2 border-b text-right font-mono">{row.asc_fqr}</td>
                          <td className="p-2 border-b text-right font-mono">{row.live_troubleshoot}</td>
                          <td className="p-2 border-b text-right font-mono">{row.icm_collab_other}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resolution By Case Complexity */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  Resolution By Case Complexity
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-semibold">Complexity</th>
                        <th className="text-right p-2 border-b font-semibold">Cases</th>
                        <th className="text-right p-2 border-b font-semibold">Still Open</th>
                        <th className="text-right p-2 border-b font-semibold">Dependency Driven Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.resByComplexity.map((row, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                          <td className="p-2 border-b font-medium">{row.complexity}</td>
                          <td className="p-2 border-b text-right font-mono">{row.total_cases}</td>
                          <td className="p-2 border-b text-right font-mono">{row.still_open}</td>
                          <td className="p-2 border-b text-right font-mono">{row.dependency_driven}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Insights Sidebar */}
            <div className="border-l pl-6 space-y-3">
              <h3 className="font-semibold text-base">Insights</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  Majority cases remain open &rarr; low closure velocity.
                  {totalCases > 0 && (
                    <span className="italic">
                      {' '}({totalStillOpen} of {totalCases} still open)
                    </span>
                  )}
                </li>
                <li>
                  Resolution is{' '}
                  <span className="font-medium text-foreground underline">predominantly human-led</span>{' '}
                  (customer follow-up, investigation).
                </li>
                <li>
                  ASC FQR contributes <span className="font-medium text-foreground">minimal direct resolution</span>
                  {totalCases > 0 && <> &mdash; only {totalAscFqr} of {totalCases} cases</>}.
                </li>
                <li>
                  Dependency-driven cases slow resolution pipeline.
                </li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* SECTION 3: FQR Accuracy & Helpfulness (New Cases Only)             */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">FQR Accuracy &amp; Helpfulness (New Cases Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
            {/* Tables */}
            <div className="space-y-6">
              {/* By Issue Type */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  By Issue Type
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-semibold">Issue Type</th>
                        <th className="text-right p-2 border-b font-semibold">New Cases</th>
                        <th className="text-right p-2 border-b font-semibold">FQR Accurate / Right Area</th>
                        <th className="text-right p-2 border-b font-semibold">FQR Helped Resolution</th>
                        <th className="text-right p-2 border-b font-semibold">Help %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fqrByIssueType.map((row, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                          <td className="p-2 border-b font-medium">{row.issue_type}</td>
                          <td className="p-2 border-b text-right font-mono">{row.new_cases}</td>
                          <td className="p-2 border-b text-right font-mono">{row.fqr_accurate_right}</td>
                          <td className="p-2 border-b text-right font-mono">{row.fqr_helped}</td>
                          <td className="p-2 border-b text-right font-mono font-semibold">{row.help_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* By Case Complexity (New Cases) */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                  By Case Complexity (New Cases)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 border-b font-semibold">Complexity</th>
                        <th className="text-right p-2 border-b font-semibold">Cases</th>
                        <th className="text-right p-2 border-b font-semibold">FQR Helped</th>
                        <th className="text-right p-2 border-b font-semibold">Help %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fqrByComplexity.map((row, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                          <td className="p-2 border-b font-medium">{row.complexity}</td>
                          <td className="p-2 border-b text-right font-mono">{row.total_cases}</td>
                          <td className="p-2 border-b text-right font-mono">{row.fqr_helped}</td>
                          <td className="p-2 border-b text-right font-mono font-semibold">{row.help_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Insights Sidebar */}
            <div className="border-l pl-6 space-y-3">
              <h3 className="font-semibold text-base">Insights</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  FQR reduces thinking effort but{' '}
                  <span className="font-medium text-foreground">not resolution time</span>.
                </li>
                <li>
                  Provides correct direction but low precision &mdash; helps primarily{' '}
                  <span className="font-medium text-foreground">advisory/simple cases</span>.
                  {totalNewCases > 0 && (
                    <span className="italic"> Overall help rate: {overallHelpPct}%</span>
                  )}
                </li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* SECTION 4: Reviewer Activity Stats                                 */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-xl">Reviewer Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {data.reviewerStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviewer data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 border-b font-semibold">Reviewer (TA Name)</th>
                    <th className="text-right p-2 border-b font-semibold">Total</th>
                    <th className="text-right p-2 border-b font-semibold">Reviewed</th>
                    <th className="text-right p-2 border-b font-semibold">Pending</th>
                    <th className="text-right p-2 border-b font-semibold">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reviewerStats.map((row, i) => {
                    const total = n(row.total_cases);
                    const reviewed = n(row.reviewed);
                    const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
                    return (
                      <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                        <td className="p-2 border-b font-medium">{row.reviewer}</td>
                        <td className="p-2 border-b text-right font-mono">{row.total_cases}</td>
                        <td className="p-2 border-b text-right font-mono text-green-600">{row.reviewed}</td>
                        <td className="p-2 border-b text-right font-mono text-yellow-600">{row.pending}</td>
                        <td className="p-2 border-b text-right">
                          <Badge
                            variant={pct >= 80 ? 'default' : pct >= 50 ? 'secondary' : 'outline'}
                            className="text-xs font-mono"
                          >
                            {pct}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

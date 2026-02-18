// ==========================================================================
// CaseList Component - Paginated, searchable, filterable case list
// Displays all cases with key taxonomy fields and edit/delete actions
// ==========================================================================
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { listCases, deleteCase } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { CaseData, PaginatedResponse } from '@/types/case';
import { CASE_TYPE_OPTIONS, ISSUE_TYPE_OPTIONS } from '@/types/case';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function CaseList() {
  const { toast } = useToast();

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCaseType, setFilterCaseType] = useState<string>('all');
  const [filterIssueType, setFilterIssueType] = useState<string>('all');
  const [filterReviewed, setFilterReviewed] = useState<string>('all');

  // Edit modal state
  const [editingCase, setEditingCase] = useState<CaseData | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // Fetch cases with current filters/pagination
  // --------------------------------------------------------------------------
  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const response = await listCases({
        page: pagination.page,
        pageSize: pagination.pageSize,
        search: searchQuery || undefined,
        caseType: filterCaseType !== 'all' ? filterCaseType : undefined,
        issueType: filterIssueType !== 'all' ? filterIssueType : undefined,
        reviewed: filterReviewed === 'all' ? undefined : filterReviewed === 'yes',
      });

      if (response.success && response.data) {
        setCases(response.data.items);
        setPagination((prev) => ({
          ...prev,
          total: response.data!.total,
          totalPages: response.data!.totalPages,
        }));
      }
    } catch (error: any) {
      console.error('[CaseList] Failed to fetch cases:', error);
      toast({
        title: 'Error loading cases',
        description: error?.message || 'Failed to load cases. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, searchQuery, filterCaseType, filterIssueType, filterReviewed, toast]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // --------------------------------------------------------------------------
  // Debounced search
  // --------------------------------------------------------------------------
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPagination((prev) => ({ ...prev, page: 1 })); // Reset to page 1 on search
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchInput]);

  // --------------------------------------------------------------------------
  // Delete handler
  // --------------------------------------------------------------------------
  const handleDelete = async (caseId: string) => {
    if (!confirm(`Are you sure you want to delete case ${caseId}?`)) return;

    try {
      setDeletingId(caseId);
      const response = await deleteCase(caseId);
      if (response.success) {
        toast({
          title: 'Case Deleted',
          description: `Case ${caseId} has been deleted.`,
          variant: 'success' as any,
        });
        fetchCases(); // Refresh list
      }
    } catch (error: any) {
      toast({
        title: 'Delete Failed',
        description: error?.message || 'Failed to delete case.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* ================================================================== */}
      {/* Filters Bar */}
      {/* ================================================================== */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Search */}
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by Case ID, TA Name, or Notes..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Case Type Filter */}
            <div className="w-[180px]">
              <Select
                value={filterCaseType}
                onValueChange={(value) => {
                  setFilterCaseType(value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Case Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Case Types</SelectItem>
                  {CASE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Issue Type Filter */}
            <div className="w-[180px]">
              <Select
                value={filterIssueType}
                onValueChange={(value) => {
                  setFilterIssueType(value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Issue Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Issue Types</SelectItem>
                  {ISSUE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reviewed Filter */}
            <div className="w-[140px]">
              <Select
                value={filterReviewed}
                onValueChange={(value) => {
                  setFilterReviewed(value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Reviewed?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Reviewed</SelectItem>
                  <SelectItem value="no">Not Reviewed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Refresh Button */}
            <Button variant="outline" size="icon" onClick={fetchCases} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Cases Table */}
      {/* ================================================================== */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading cases...</span>
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No cases found.</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery ? 'Try adjusting your search or filters.' : 'Create a new case to get started.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Case ID</th>
                    <th className="pb-3 font-medium">Reviewed</th>
                    <th className="pb-3 font-medium">TA Name</th>
                    <th className="pb-3 font-medium">Case Type</th>
                    <th className="pb-3 font-medium">Issue Type</th>
                    <th className="pb-3 font-medium">Idle{'>'}8h</th>
                    <th className="pb-3 font-medium">Next Owner</th>
                    <th className="pb-3 font-medium">Resolution</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.case_id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 font-mono text-xs">{c.case_id}</td>
                      <td className="py-3">
                        {c.case_reviewed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="py-3">{c.ta_name || '-'}</td>
                      <td className="py-3">
                        {c.case_type ? (
                          <Badge variant="outline" className="text-xs">
                            {c.case_type}
                          </Badge>
                        ) : '-'}
                      </td>
                      <td className="py-3">
                        {c.issue_type ? (
                          <Badge variant="secondary" className="text-xs">
                            {c.issue_type}
                          </Badge>
                        ) : '-'}
                      </td>
                      <td className="py-3">
                        {c.idle_over_8_hours ? (
                          <Badge variant="destructive" className="text-xs">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">No</span>
                        )}
                      </td>
                      <td className="py-3 text-xs">{c.next_action_owner || '-'}</td>
                      <td className="py-3">
                        {c.source_of_resolution ? (
                          <Badge
                            variant={c.source_of_resolution === 'Still Open' ? 'warning' : 'success'}
                            className="text-xs"
                          >
                            {c.source_of_resolution}
                          </Badge>
                        ) : '-'}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit case"
                            onClick={() => setEditingCase(c)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Delete case"
                            onClick={() => handleDelete(c.case_id)}
                            disabled={deletingId === c.case_id}
                          >
                            {deletingId === c.case_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
                {pagination.total} cases
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

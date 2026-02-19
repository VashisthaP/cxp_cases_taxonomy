// ==========================================================================
// CaseList Component - Paginated, searchable, filterable case list
// Displays all cases with key taxonomy fields and edit/delete actions
// EDIT BUG FIX: Renders CaseForm in a slide-over dialog when editing
// Removed: Next Owner column (field dropped from schema)
// ==========================================================================
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { listCases, deleteCase } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { CaseData, PaginatedResponse } from '@/types/case';
import { CASE_TYPE_OPTIONS, ISSUE_TYPE_OPTIONS } from '@/types/case';
import { CaseFormValues } from '@/lib/validation';
import { CaseForm } from '@/components/case-form';

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
  X,
} from 'lucide-react';

// --------------------------------------------------------------------------
// Helper: Map CaseData (from DB) to CaseFormValues (for the form)
// --------------------------------------------------------------------------
function caseDataToFormValues(c: CaseData): CaseFormValues {
  return {
    case_id: c.case_id,
    case_reviewed: c.case_reviewed ?? false,
    ta_name: c.ta_name ?? '',
    ta_reviewer_notes: c.ta_reviewer_notes ?? '',
    case_type: c.case_type ?? '',
    issue_type: c.issue_type ?? '',
    fqr_accurate: c.fqr_accurate ?? '',
    fqr_help_resolve: c.fqr_help_resolve ?? '',
    idle_over_8_hours: c.idle_over_8_hours ?? false,
    idleness_reason: c.idleness_reason ?? '',
    collab_wait_reason: c.collab_wait_reason ?? '',
    pg_wait_reason: c.pg_wait_reason ?? '',
    case_complexity: c.case_complexity ?? '',
    icm_linked: c.icm_linked ?? false,
    next_action_sna: c.next_action_sna ?? '',
    source_of_resolution: c.source_of_resolution ?? '',
  };
}

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

  // Edit modal state — now actually used to render the edit form
  const [editingCase, setEditingCase] = useState<CaseData | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Memoize initial form values for the editing case
  const editFormValues = useMemo(
    () => (editingCase ? caseDataToFormValues(editingCase) : undefined),
    [editingCase]
  );

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
  // Edit success handler
  // --------------------------------------------------------------------------
  const handleEditSuccess = () => {
    setEditingCase(null);
    fetchCases(); // Refresh the list to show updated data
    toast({
      title: 'Case Updated',
      description: 'Case has been updated successfully.',
      variant: 'success' as any,
    });
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* ================================================================== */}
      {/* EDIT DIALOG (slide-over overlay) - renders CaseForm in edit mode */}
      {/* FIX: Previously editingCase state was set but no UI was rendered   */}
      {/* ================================================================== */}
      {editingCase && editFormValues && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditingCase(null)}
          />
          {/* Slide-over panel */}
          <div className="relative w-full max-w-4xl bg-background shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b bg-background">
              <h2 className="text-lg font-semibold">
                Edit Case: {editingCase.case_id}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingCase(null)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-6">
              <CaseForm
                initialData={editFormValues}
                isEditMode={true}
                onSuccess={handleEditSuccess}
              />
            </div>
          </div>
        </div>
      )}

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
      {/* Cases Table (Removed "Next Owner" column — field dropped) */}
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
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">TA Name</th>
                    <th className="pb-3 font-medium">Case Type</th>
                    <th className="pb-3 font-medium">Issue Type</th>
                    <th className="pb-3 font-medium">Idle{'>'}8h</th>
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
                          <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Reviewed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">
                            <XCircle className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
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
                      <td className="py-3">
                        {c.source_of_resolution ? (
                          <Badge
                            variant={c.source_of_resolution === 'Still Open' ? 'outline' : 'secondary'}
                            className={`text-xs ${c.source_of_resolution === 'Still Open' ? 'text-orange-600 border-orange-400' : ''}`}
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

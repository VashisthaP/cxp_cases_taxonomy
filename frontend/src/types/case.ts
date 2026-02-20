// ==========================================================================
// BC VM PCY - Case Taxonomy Insights - TypeScript Types & Interfaces
// Full data taxonomy as specified in the requirements
// ==========================================================================

// --------------------------------------------------------------------------
// Enum types for all dropdown/select fields
// --------------------------------------------------------------------------

/** Case Type dropdown options */
export type CaseType = 'New' | 'Transferred from other team' | 'Re-Opened';

/** Issue Type dropdown options */
export type IssueType =
  | 'Advisory'
  | 'Break fix'
  | 'RCA'
  | 'Performance'
  | 'Outage'
  | 'Billing'
  | 'Technical and Billing';

/** ASC FQR Accuracy dropdown options */
export type FqrAccuracy =
  | 'Yes-Accurate'
  | 'Yes-Right area'
  | 'No-Misrouted'
  | 'FQR Not Generated';

/** Did FQR help resolve issue dropdown options */
export type FqrHelpResolve =
  | 'Yes'
  | 'No'
  | 'No-Generic'
  | 'No-Could not fetch details'
  | 'No-TA intervention required';

/** Reason for Case Idleness (shown when idle > 8 hours = Yes) */
export type IdlenessReason =
  | 'Awaiting response from Cx'
  | 'Awaiting Collab Response'
  | 'PG - Awaiting ICM Response'
  | 'AVA'
  | 'Unsure'
  | 'Engineer Workload'
  | 'NA';

/** Why waiting for Collab (shown when idleness reason = Awaiting Collab Response) */
export type CollabWaitReason =
  | 'Incorrect Team'
  | 'Not Triaged'
  | 'Unsure'
  | 'In Progress';

/** Why waiting for PG (shown when idleness reason = PG - Awaiting ICM Response) */
export type PgWaitReason =
  | 'Incorrect PG'
  | 'Not Triaged'
  | 'Unsure'
  | 'In Progress';

/** Case Complexity dropdown options */
export type CaseComplexity =
  | 'Aged-Not complex'
  | 'Transferred'
  | 'Collabs'
  | 'PG Engagement'
  | 'Integration Related';

/** Source of Resolution dropdown options */
export type SourceOfResolution =
  | 'ASC FQR'
  | 'Wiki/Deep Research Agent'
  | 'Ava Post'
  | 'Collaboration Task'
  | 'ICM'
  | 'Diagnostics Tools'
  | 'Live Cx'
  | 'Still Open';

// --------------------------------------------------------------------------
// Main Case Data Interface - Full Taxonomy
// --------------------------------------------------------------------------

/**
 * Represents a single case with all taxonomy fields.
 * This interface maps directly to the PostgreSQL `cases` table.
 */
export interface CaseData {
  /** 1. Case ID - Required, Unique text identifier */
  case_id: string;

  /** 2. Case Reviewed - Boolean toggle */
  case_reviewed: boolean;

  /** 3. TA Name - Text input */
  ta_name: string;

  /** 4. TA Reviewer Notes - Textarea for observations */
  ta_reviewer_notes: string;

  /** 5. Case Type - Dropdown selection */
  case_type: CaseType | '';

  /** 6. Issue Type - Dropdown selection */
  issue_type: IssueType | '';

  /** 7. Was the ASC FQR Accurate? */
  fqr_accurate: FqrAccuracy | '';

  /** 8. Did FQR help resolve issue? */
  fqr_help_resolve: FqrHelpResolve | '';

  /** 9. Was the case Idle > 8 hours? */
  idle_over_8_hours: boolean;

  /** 9a. Reason for Case idleness (conditional - shown when idle_over_8_hours = true) */
  idleness_reason: IdlenessReason | '';

  /** 9b. Why waiting for Collab (conditional - shown when idleness_reason = "Awaiting Collab Response") */
  collab_wait_reason: CollabWaitReason | '';

  /** 9c. Why waiting for PG (conditional - shown when idleness_reason = "PG - Awaiting ICM Response") */
  pg_wait_reason: PgWaitReason | '';

  /** 10. Case Complexity - Dropdown selection */
  case_complexity: CaseComplexity | '';

  /** 12. ICM Linked - Boolean toggle */
  icm_linked: boolean;

  /** 12. Next Action for Engineer (SNA) - Textarea */
  next_action_sna: string;

  /** 13. Source of Resolution - Dropdown selection */
  source_of_resolution: SourceOfResolution | '';

  /** Reviewer email (populated from SSO/mock auth) */
  reviewer_email?: string;

  /** Auto-generated fields */
  id?: number;
  created_at?: string;
  updated_at?: string;
}

// --------------------------------------------------------------------------
// API response types
// --------------------------------------------------------------------------

/** Standard API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Chat message for the agentic chatbot */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sources?: string[];
}

/** Chat request body */
export interface ChatRequest {
  message: string;
  conversationId?: string;
}

/** Dashboard summary statistics */
export interface DashboardStats {
  totalCases: number;
  reviewedCases: number;
  pendingCases: number;
  idleCases: number;
  casesByType: Record<string, number>;
  casesByIssueType: Record<string, number>;
  avgResolutionBySource: Record<string, number>;
}

/** Insights data returned by GET /api/dashboard/insights */
export interface InsightsData {
  // Idle Time >8h Analysis
  idleByIssueType: Array<{
    issue_type: string; total_cases: string; idle_count: string;
    awaiting_cx: string; engineer_workload: string; collab_wait: string;
    pg_wait: string; unsure: string;
  }>;
  idleByComplexity: Array<{
    complexity: string; total_cases: string; idle_count: string;
    awaiting_cx: string; engineer_workload: string; collab_wait: string;
    pg_wait: string; unsure: string;
  }>;
  // Source of Resolution
  resByIssueType: Array<{
    issue_type: string; total_cases: string; still_open: string;
    asc_fqr: string; live_troubleshoot: string; icm_collab_other: string;
  }>;
  resByComplexity: Array<{
    complexity: string; total_cases: string; still_open: string;
    dependency_driven: string;
  }>;
  // FQR Accuracy (New Cases Only)
  fqrByIssueType: Array<{
    issue_type: string; new_cases: string; fqr_accurate_right: string;
    fqr_helped: string; help_pct: string;
  }>;
  fqrByComplexity: Array<{
    complexity: string; total_cases: string; fqr_helped: string;
    help_pct: string;
  }>;
  // Reviewer Stats
  reviewerStats: Array<{
    reviewer: string; total_cases: string; reviewed: string; pending: string;
  }>;
}

// --------------------------------------------------------------------------
// Dropdown option arrays (for rendering Select components)
// --------------------------------------------------------------------------

export const CASE_TYPE_OPTIONS: CaseType[] = [
  'New',
  'Transferred from other team',
  'Re-Opened',
];

export const ISSUE_TYPE_OPTIONS: IssueType[] = [
  'Advisory',
  'Break fix',
  'RCA',
  'Performance',
  'Outage',
  'Billing',
  'Technical and Billing',
];

export const FQR_ACCURACY_OPTIONS: FqrAccuracy[] = [
  'Yes-Accurate',
  'Yes-Right area',
  'No-Misrouted',
  'FQR Not Generated',
];

export const FQR_HELP_RESOLVE_OPTIONS: FqrHelpResolve[] = [
  'Yes',
  'No',
  'No-Generic',
  'No-Could not fetch details',
  'No-TA intervention required',
];

export const IDLENESS_REASON_OPTIONS: IdlenessReason[] = [
  'Awaiting response from Cx',
  'Awaiting Collab Response',
  'PG - Awaiting ICM Response',
  'AVA',
  'Unsure',
  'Engineer Workload',
  'NA',
];

export const COLLAB_WAIT_REASON_OPTIONS: CollabWaitReason[] = [
  'Incorrect Team',
  'Not Triaged',
  'Unsure',
  'In Progress',
];

export const PG_WAIT_REASON_OPTIONS: PgWaitReason[] = [
  'Incorrect PG',
  'Not Triaged',
  'Unsure',
  'In Progress',
];

export const CASE_COMPLEXITY_OPTIONS: CaseComplexity[] = [
  'Aged-Not complex',
  'Transferred',
  'Collabs',
  'PG Engagement',
  'Integration Related',
];

export const SOURCE_OF_RESOLUTION_OPTIONS: SourceOfResolution[] = [
  'ASC FQR',
  'Wiki/Deep Research Agent',
  'Ava Post',
  'Collaboration Task',
  'ICM',
  'Diagnostics Tools',
  'Live Cx',
  'Still Open',
];

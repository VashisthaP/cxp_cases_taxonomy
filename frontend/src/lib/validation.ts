// ==========================================================================
// Zod Validation Schema for Case Data Taxonomy
// Strict validation with conditional field logic
// ==========================================================================

import { z } from 'zod';

/**
 * Full Zod schema for the Case taxonomy.
 * Implements:
 *  - Required/unique Case ID
 *  - All dropdown enums
 *  - Conditional logic for idle > 8 hours -> idleness reason -> collab/PG wait reason
 *  - Edge case handling for empty strings on optional dropdowns
 */
export const caseFormSchema = z.object({
  // 1. Case ID - Required, non-empty, trimmed
  case_id: z
    .string()
    .min(1, 'Case ID is required')
    .max(100, 'Case ID must be 100 characters or less')
    .trim(),

  // 2. Case Reviewed - Boolean toggle
  case_reviewed: z.boolean().default(false),

  // 3. TA Name - Optional text
  ta_name: z.string().max(200, 'TA Name must be 200 characters or less').default(''),

  // 4. TA Reviewer Notes - Optional textarea
  ta_reviewer_notes: z.string().max(5000, 'Notes must be 5000 characters or less').default(''),

  // 5. Case Type - Dropdown
  case_type: z.enum(['New', 'Transferred from other team', 'Re-Opened', '']).default(''),

  // 6. Issue Type - Dropdown
  issue_type: z.enum([
    'Advisory', 'Break fix', 'RCA', 'Performance', 'Outage', 'Billing',
    'Technical and Billing', ''
  ]).default(''),

  // 7. Was the ASC FQR Accurate?
  fqr_accurate: z.enum([
    'Yes-Accurate', 'Yes-Right area', 'No-Misrouted', 'FQR Not Generated', ''
  ]).default(''),

  // 8. Did FQR help resolve issue?
  fqr_help_resolve: z.enum([
    'Yes', 'No', 'No-Generic', 'No-Could not fetch details',
    'No-TA intervention required', ''
  ]).default(''),

  // 9. Was the case Idle > 8 hours?
  idle_over_8_hours: z.boolean().default(false),

  // 9a. Reason for Case idleness (conditional)
  idleness_reason: z.enum([
    'Awaiting response from Cx', 'Awaiting Collab Response', 'PG - Awaiting ICM Response', 'AVA',
    'Unsure', 'Engineer Workload', 'NA', ''
  ]).default(''),

  // 9b. Why waiting for Collab (conditional)
  collab_wait_reason: z.enum([
    'Incorrect Team', 'Not Triaged', 'Unsure', 'In Progress', ''
  ]).default(''),

  // 9c. Why waiting for PG (conditional)
  pg_wait_reason: z.enum([
    'Incorrect PG', 'Not Triaged', 'Unsure', 'In Progress', ''
  ]).default(''),

  // 10. Case Complexity
  case_complexity: z.enum([
    'Aged-Not complex', 'Transferred', 'Collabs', 'PG Engagement',
    'Integration Related', ''
  ]).default(''),

  // 12. ICM Linked - Boolean
  icm_linked: z.boolean().default(false),

  // 12. Next Action for Engineer (SNA)
  next_action_sna: z.string().max(5000, 'SNA must be 5000 characters or less').default(''),

  // 13. Source of Resolution
  source_of_resolution: z.enum([
    'ASC FQR', 'Wiki/Deep Research Agent', 'Ava Post', 'Collaboration Task',
    'ICM', 'Diagnostics Tools', 'Live Cx', 'Still Open', ''
  ]).default(''),
}).superRefine((data, ctx) => {
  // --------------------------------------------------------------------------
  // Conditional Validation Logic
  // --------------------------------------------------------------------------

  // If case is idle > 8 hours, idleness reason is required
  if (data.idle_over_8_hours && !data.idleness_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please select a reason for case idleness',
      path: ['idleness_reason'],
    });
  }

  // If idleness reason is "Awaiting Collab Response", collab wait reason is required
  if (data.idleness_reason === 'Awaiting Collab Response' && !data.collab_wait_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please select why waiting for Collab',
      path: ['collab_wait_reason'],
    });
  }

  // If idleness reason is "PG - Awaiting ICM Response", PG wait reason is required
  if (data.idleness_reason === 'PG - Awaiting ICM Response' && !data.pg_wait_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please select why waiting for PG',
      path: ['pg_wait_reason'],
    });
  }

  // Clear nested fields when parent condition is not met (data cleanup)
  if (!data.idle_over_8_hours) {
    data.idleness_reason = '';
    data.collab_wait_reason = '';
    data.pg_wait_reason = '';
  }

  if (data.idleness_reason !== 'Awaiting Collab Response') {
    data.collab_wait_reason = '';
  }

  if (data.idleness_reason !== 'PG - Awaiting ICM Response') {
    data.pg_wait_reason = '';
  }
});

/** Inferred TypeScript type from the Zod schema */
export type CaseFormValues = z.infer<typeof caseFormSchema>;

/**
 * Default values for a new case form.
 * All fields initialized to their default/empty state.
 */
export const defaultCaseValues: CaseFormValues = {
  case_id: '',
  case_reviewed: false,
  ta_name: '',
  ta_reviewer_notes: '',
  case_type: '',
  issue_type: '',
  fqr_accurate: '',
  fqr_help_resolve: '',
  idle_over_8_hours: false,
  idleness_reason: '',
  collab_wait_reason: '',
  pg_wait_reason: '',
  case_complexity: '',
  icm_linked: false,
  next_action_sna: '',
  source_of_resolution: '',
};

// ==========================================================================
// CaseForm Component - Full Taxonomy Entry Form
// Implements all 15 fields with conditional logic for idle/collab/PG fields
// Uses react-hook-form + Zod validation
// ==========================================================================
"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { caseFormSchema, CaseFormValues, defaultCaseValues } from '@/lib/validation';
import { createCase, updateCase } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Type options arrays
import {
  CASE_TYPE_OPTIONS,
  ISSUE_TYPE_OPTIONS,
  FQR_ACCURACY_OPTIONS,
  FQR_HELP_RESOLVE_OPTIONS,
  IDLENESS_REASON_OPTIONS,
  COLLAB_WAIT_REASON_OPTIONS,
  PG_WAIT_REASON_OPTIONS,
  CASE_COMPLEXITY_OPTIONS,
  NEXT_ACTION_OWNER_OPTIONS,
  SOURCE_OF_RESOLUTION_OPTIONS,
} from '@/types/case';

import { Loader2, Save, RotateCcw } from 'lucide-react';

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

interface CaseFormProps {
  /** Pre-fill form with existing data for edit mode */
  initialData?: CaseFormValues;
  /** Whether the form is in edit mode vs create mode */
  isEditMode?: boolean;
  /** Callback on successful submission */
  onSuccess?: () => void;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function CaseForm({ initialData, isEditMode = false, onSuccess }: CaseFormProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Initialize react-hook-form with Zod resolver
  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseFormSchema),
    defaultValues: initialData || defaultCaseValues,
    mode: 'onBlur', // Validate on blur for better UX
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = form;

  // --------------------------------------------------------------------------
  // Watch conditional fields for dynamic rendering
  // --------------------------------------------------------------------------
  const idleOver8Hours = watch('idle_over_8_hours');
  const idlenessReason = watch('idleness_reason');

  // --------------------------------------------------------------------------
  // Form submission handler
  // --------------------------------------------------------------------------
  const onSubmit = async (data: CaseFormValues) => {
    try {
      setSubmitting(true);

      if (isEditMode && initialData) {
        // Update existing case
        const response = await updateCase(initialData.case_id, data);
        if (response.success) {
          toast({
            title: 'Case Updated',
            description: `Case ${data.case_id} has been updated successfully.`,
            variant: 'success' as any,
          });
          onSuccess?.();
        }
      } else {
        // Create new case
        const response = await createCase(data);
        if (response.success) {
          toast({
            title: 'Case Created',
            description: `Case ${data.case_id} has been created successfully.`,
            variant: 'success' as any,
          });
          reset(defaultCaseValues); // Reset form after creation
          onSuccess?.();
        }
      }
    } catch (error: any) {
      // Handle duplicate Case ID error (409 Conflict)
      const errorMessage = error?.message || 'An unexpected error occurred.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      console.error('[CaseForm] Submission error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Render helper for Select fields
  // --------------------------------------------------------------------------
  const renderSelect = (
    name: keyof CaseFormValues,
    label: string,
    options: string[],
    placeholder: string = 'Select...'
  ) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Select
        value={watch(name) as string}
        onValueChange={(value) => setValue(name, value as any, { shouldValidate: true })}
      >
        <SelectTrigger id={name}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errors[name] && (
        <p className="text-sm text-destructive">{errors[name]?.message as string}</p>
      )}
    </div>
  );

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ================================================================== */}
      {/* Section 1: Case Identification */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Case Identification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {/* 1. Case ID - Required, Unique */}
          <div className="space-y-2">
            <Label htmlFor="case_id">
              Case ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="case_id"
              placeholder="Enter unique Case ID"
              {...register('case_id')}
              disabled={isEditMode} // Cannot change Case ID in edit mode
              className={errors.case_id ? 'border-destructive' : ''}
            />
            {errors.case_id && (
              <p className="text-sm text-destructive">{errors.case_id.message}</p>
            )}
          </div>

          {/* 2. Case Reviewed - Checkbox/Toggle */}
          <div className="flex items-center space-x-3 pt-8">
            <Switch
              id="case_reviewed"
              checked={watch('case_reviewed')}
              onCheckedChange={(checked) =>
                setValue('case_reviewed', checked, { shouldValidate: true })
              }
            />
            <Label htmlFor="case_reviewed">Case Reviewed</Label>
          </div>

          {/* 3. TA Name */}
          <div className="space-y-2">
            <Label htmlFor="ta_name">TA Name</Label>
            <Input
              id="ta_name"
              placeholder="Enter TA Name"
              {...register('ta_name')}
            />
          </div>

          {/* 5. Case Type - Dropdown */}
          {renderSelect('case_type', 'Case Type', CASE_TYPE_OPTIONS)}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 2: TA Reviewer Notes */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reviewer Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 4. TA Reviewer Notes - Textarea */}
          <div className="space-y-2">
            <Label htmlFor="ta_reviewer_notes">
              TA Reviewer Notes
              <span className="ml-2 text-xs text-muted-foreground">
                Observations from TA Reviewer
              </span>
            </Label>
            <Textarea
              id="ta_reviewer_notes"
              placeholder="Enter observations from TA Reviewer..."
              rows={4}
              {...register('ta_reviewer_notes')}
            />
            {errors.ta_reviewer_notes && (
              <p className="text-sm text-destructive">{errors.ta_reviewer_notes.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 3: Issue Classification */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Issue Classification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {/* 6. Issue Type */}
          {renderSelect('issue_type', 'Issue Type', ISSUE_TYPE_OPTIONS)}

          {/* 7. Was the ASC FQR Accurate? */}
          {renderSelect('fqr_accurate', 'Was the ASC FQR Accurate?', FQR_ACCURACY_OPTIONS)}

          {/* 8. Did FQR help resolve issue? */}
          {renderSelect('fqr_help_resolve', 'Did FQR help resolve issue?', FQR_HELP_RESOLVE_OPTIONS)}

          {/* 11. Case Complexity */}
          {renderSelect('case_complexity', 'Case Complexity', CASE_COMPLEXITY_OPTIONS)}
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 4: Idle Status & Conditional Fields */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Idle Status & Workload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 9. Was the case Idle > 8 hours? */}
          <div className="flex items-center space-x-3">
            <Switch
              id="idle_over_8_hours"
              checked={idleOver8Hours}
              onCheckedChange={(checked) => {
                setValue('idle_over_8_hours', checked, { shouldValidate: true });
                // Clear nested conditional fields when toggled off
                if (!checked) {
                  setValue('idleness_reason', '', { shouldValidate: true });
                  setValue('collab_wait_reason', '', { shouldValidate: true });
                  setValue('pg_wait_reason', '', { shouldValidate: true });
                }
              }}
            />
            <Label htmlFor="idle_over_8_hours">Was the case Idle {'>'} 8 hours?</Label>
          </div>

          {/* ---------- Conditional: Idleness Reason (shown when idle > 8hrs = Yes) ---------- */}
          {idleOver8Hours && (
            <div className="form-transition-enter ml-6 border-l-2 border-primary/20 pl-4 space-y-4">
              {/* 9a. Reason for Case Idleness */}
              {renderSelect(
                'idleness_reason',
                'Reason for Case Idleness',
                IDLENESS_REASON_OPTIONS,
                'Select reason...'
              )}

              {/* ---------- Nested: Why waiting for Collab (shown when reason = "Collaboration Team") ---------- */}
              {idlenessReason === 'Collaboration Team' && (
                <div className="form-transition-enter ml-4 border-l-2 border-yellow-300/50 pl-4">
                  {renderSelect(
                    'collab_wait_reason',
                    'Why waiting for Collab?',
                    COLLAB_WAIT_REASON_OPTIONS,
                    'Select reason...'
                  )}
                </div>
              )}

              {/* ---------- Nested: Why waiting for PG (shown when reason = "PG") ---------- */}
              {idlenessReason === 'PG' && (
                <div className="form-transition-enter ml-4 border-l-2 border-orange-300/50 pl-4">
                  {renderSelect(
                    'pg_wait_reason',
                    'Why waiting for PG?',
                    PG_WAIT_REASON_OPTIONS,
                    'Select reason...'
                  )}
                </div>
              )}
            </div>
          )}

          {/* 10. Engineer Workload / Unresponsive Cx - Checkboxes */}
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="engineer_workload"
                checked={watch('engineer_workload')}
                onCheckedChange={(checked) =>
                  setValue('engineer_workload', !!checked, { shouldValidate: true })
                }
              />
              <Label htmlFor="engineer_workload">Engineer Workload</Label>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="unresponsive_cx"
                checked={watch('unresponsive_cx')}
                onCheckedChange={(checked) =>
                  setValue('unresponsive_cx', !!checked, { shouldValidate: true })
                }
              />
              <Label htmlFor="unresponsive_cx">Unresponsive Cx</Label>
            </div>
          </div>

          {/* 12. ICM Linked */}
          <div className="flex items-center space-x-3">
            <Switch
              id="icm_linked"
              checked={watch('icm_linked')}
              onCheckedChange={(checked) =>
                setValue('icm_linked', checked, { shouldValidate: true })
              }
            />
            <Label htmlFor="icm_linked">ICM Linked</Label>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 5: Actions & Resolution */}
      {/* ================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actions & Resolution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* 13. Next Action Owner */}
            {renderSelect('next_action_owner', 'Next Action Owner', NEXT_ACTION_OWNER_OPTIONS)}

            {/* 15. Source of Resolution */}
            {renderSelect(
              'source_of_resolution',
              'Source of Resolution',
              SOURCE_OF_RESOLUTION_OPTIONS
            )}
          </div>

          {/* 14. Next Action for Engineer (SNA) */}
          <div className="space-y-2">
            <Label htmlFor="next_action_sna">Next Action for Engineer (SNA)</Label>
            <Textarea
              id="next_action_sna"
              placeholder="Describe the next action for the engineer..."
              rows={3}
              {...register('next_action_sna')}
            />
            {errors.next_action_sna && (
              <p className="text-sm text-destructive">{errors.next_action_sna.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Form Actions */}
      {/* ================================================================== */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEditMode ? 'Updating...' : 'Saving...'}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isEditMode ? 'Update Case' : 'Save Case'}
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => reset(initialData || defaultCaseValues)}
          disabled={submitting || !isDirty}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </div>
    </form>
  );
}

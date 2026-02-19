// ==========================================================================
// CaseForm Component - 3-Column Taxonomy Entry Form (Refactored)
// Layout: Header bar -> Col 1 (ASC FQR) | Col 2 (Idle Time) | Col 3 (Resolution)
// Removed fields: engineer_workload, unresponsive_cx, next_action_owner
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
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Type options arrays (removed NEXT_ACTION_OWNER_OPTIONS)
import {
  CASE_TYPE_OPTIONS,
  ISSUE_TYPE_OPTIONS,
  FQR_ACCURACY_OPTIONS,
  FQR_HELP_RESOLVE_OPTIONS,
  IDLENESS_REASON_OPTIONS,
  COLLAB_WAIT_REASON_OPTIONS,
  PG_WAIT_REASON_OPTIONS,
  CASE_COMPLEXITY_OPTIONS,
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
  // FIX: Use initialData as defaultValues to properly populate edit forms
  const form = useForm<CaseFormValues>({
    resolver: zodResolver(caseFormSchema),
    defaultValues: initialData || defaultCaseValues,
    mode: 'onBlur',
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
        const response = await createCase(data);
        if (response.success) {
          toast({
            title: 'Case Created',
            description: `Case ${data.case_id} has been created successfully.`,
            variant: 'success' as any,
          });
          reset(defaultCaseValues);
          onSuccess?.();
        }
      }
    } catch (error: any) {
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
  // Render - 3-Column Layout
  // --------------------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ================================================================== */}
      {/* Header Bar: Case ID, TA Name, Case Reviewed, Case Type */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {isEditMode ? `Edit Case: ${initialData?.case_id}` : 'New Case Entry'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          {/* Case ID */}
          <div className="space-y-2">
            <Label htmlFor="case_id">
              Case ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="case_id"
              placeholder="Enter unique Case ID"
              {...register('case_id')}
              disabled={isEditMode}
              className={errors.case_id ? 'border-destructive' : ''}
            />
            {errors.case_id && (
              <p className="text-sm text-destructive">{errors.case_id.message}</p>
            )}
          </div>

          {/* TA Name */}
          <div className="space-y-2">
            <Label htmlFor="ta_name">TA Name</Label>
            <Input
              id="ta_name"
              placeholder="Enter TA Name"
              {...register('ta_name')}
            />
          </div>

          {/* Case Type */}
          {renderSelect('case_type', 'Case Type', CASE_TYPE_OPTIONS)}

          {/* Case Reviewed */}
          <div className="flex items-center space-x-3 pt-7">
            <Switch
              id="case_reviewed"
              checked={watch('case_reviewed')}
              onCheckedChange={(checked) =>
                setValue('case_reviewed', checked, { shouldValidate: true })
              }
            />
            <Label htmlFor="case_reviewed">Case Reviewed</Label>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* 3-Column: ASC FQR | Idle Time | Resolution */}
      {/* ================================================================== */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ============================================================== */}
        {/* Column 1: ASC FQR & Issue Classification */}
        {/* ============================================================== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ASC FQR & Classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderSelect('issue_type', 'Issue Type', ISSUE_TYPE_OPTIONS)}
            {renderSelect('fqr_accurate', 'Was the ASC FQR Accurate?', FQR_ACCURACY_OPTIONS)}
            {renderSelect('fqr_help_resolve', 'Did FQR help resolve?', FQR_HELP_RESOLVE_OPTIONS)}
            {renderSelect('case_complexity', 'Case Complexity', CASE_COMPLEXITY_OPTIONS)}
          </CardContent>
        </Card>

        {/* ============================================================== */}
        {/* Column 2: Idle Time & Conditional Fields */}
        {/* ============================================================== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Idle Time Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Idle > 8 hours toggle */}
            <div className="flex items-center space-x-3">
              <Switch
                id="idle_over_8_hours"
                checked={idleOver8Hours}
                onCheckedChange={(checked) => {
                  setValue('idle_over_8_hours', checked, { shouldValidate: true });
                  if (!checked) {
                    setValue('idleness_reason', '', { shouldValidate: true });
                    setValue('collab_wait_reason', '', { shouldValidate: true });
                    setValue('pg_wait_reason', '', { shouldValidate: true });
                  }
                }}
              />
              <Label htmlFor="idle_over_8_hours">Idle {'>'} 8 hours?</Label>
            </div>

            {/* Conditional idleness fields */}
            {idleOver8Hours && (
              <div className="form-transition-enter border-l-2 border-primary/20 pl-3 space-y-4">
                {renderSelect(
                  'idleness_reason',
                  'Reason for Idleness',
                  IDLENESS_REASON_OPTIONS,
                  'Select reason...'
                )}

                {idlenessReason === 'Collaboration Team' && (
                  <div className="form-transition-enter border-l-2 border-yellow-300/50 pl-3">
                    {renderSelect(
                      'collab_wait_reason',
                      'Why waiting for Collab?',
                      COLLAB_WAIT_REASON_OPTIONS,
                      'Select reason...'
                    )}
                  </div>
                )}

                {idlenessReason === 'PG' && (
                  <div className="form-transition-enter border-l-2 border-orange-300/50 pl-3">
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

            {/* ICM Linked */}
            <div className="flex items-center space-x-3 pt-2">
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

        {/* ============================================================== */}
        {/* Column 3: Resolution & Actions */}
        {/* ============================================================== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resolution & Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderSelect(
              'source_of_resolution',
              'Source of Resolution',
              SOURCE_OF_RESOLUTION_OPTIONS
            )}

            {/* Next Action for Engineer (SNA) */}
            <div className="space-y-2">
              <Label htmlFor="next_action_sna">Next Action (SNA)</Label>
              <Textarea
                id="next_action_sna"
                placeholder="Next action for the engineer..."
                rows={3}
                {...register('next_action_sna')}
              />
              {errors.next_action_sna && (
                <p className="text-sm text-destructive">{errors.next_action_sna.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* TA Reviewer Notes (full width) */}
      {/* ================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">TA Reviewer Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="ta_reviewer_notes"
            placeholder="Enter observations from TA Reviewer..."
            rows={4}
            {...register('ta_reviewer_notes')}
          />
          {errors.ta_reviewer_notes && (
            <p className="text-sm text-destructive">{errors.ta_reviewer_notes.message}</p>
          )}
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

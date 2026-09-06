import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { FieldFertilizerPlanEditor } from './FieldFertilizerPlanEditor';
import { loadFieldPlan, saveFieldPlan, type FieldPlanContext } from '../../lib/fieldFertilizerRatesCrud';
import type { PlanSavePayload } from '../../lib/fieldFertilizerRates';

/**
 * The loading half of the plan editor — V-5.
 *
 * Deliberately thin, and deliberately separate: `FieldFertilizerPlanEditor` must stay free
 * of the Supabase client so it can be rendered with fixtures. Everything that touches the
 * database lives here or in `fieldFertilizerRatesCrud`.
 *
 * A failed save keeps the modal open with the message and the user's numbers intact — the
 * discipline `MarkPurchasedModal` established, because signal at the plant is unreliable
 * and losing a screen of typed tonnage is worse than the error itself.
 */

interface Props {
  fieldId: string;
  onClose: () => void;
  /** Called after a successful save so the field page can re-read its costs. */
  onSaved: () => void;
}

export function FieldFertilizerPlanModal({ fieldId, onClose, onSaved }: Props) {
  const [context, setContext] = useState<FieldPlanContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContext(null);
    setLoadError(null);
    loadFieldPlan(fieldId)
      .then((c) => {
        if (!cancelled) setContext(c);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this field');
      });
    return () => {
      cancelled = true;
    };
  }, [fieldId]);

  const handleSave = async (payload: PlanSavePayload[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveFieldPlan(fieldId, payload);
      onSaved();
      onClose();
    } catch (err) {
      // Stay open, keep their numbers, show what went wrong.
      setSaveError(err instanceof Error ? err.message : 'Could not save the plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title="Fertilizer plan"
      subtitle={context ? `${context.fieldName} · ${context.acreage} acres` : undefined}
      size="lg"
    >
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {!loadError && !context && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      )}

      {context && (
        <FieldFertilizerPlanEditor
          fieldName={context.fieldName}
          acreage={context.acreage}
          programs={context.programs}
          numericOverride={context.numericOverride}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onCancel={onClose}
        />
      )}
    </ResponsiveModal>
  );
}

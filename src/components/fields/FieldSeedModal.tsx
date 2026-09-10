import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { FieldSeedEditor } from './FieldSeedEditor';
import { loadFieldSeed, saveFieldSeed, type FieldSeedContext, type FieldSeedSave } from '../../lib/fieldSeedCrud';

/**
 * The loading half of the seed editor — U-1.
 *
 * Deliberately thin, and deliberately separate, for the reason `FieldFertilizerPlanModal`
 * gives: the editor must stay free of the Supabase client so it can be rendered with
 * fixtures.
 *
 * A failed save keeps the sheet open with the message and the entry intact — the discipline
 * `MarkPurchasedModal` established, because losing a screen of typed numbers is worse than
 * the error itself.
 */

interface Props {
  fieldId: string;
  onClose: () => void;
  /** Called after a successful save so the field page can re-read its costs. */
  onSaved: () => void;
}

export function FieldSeedModal({ fieldId, onClose, onSaved }: Props) {
  const [context, setContext] = useState<FieldSeedContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContext(null);
    setLoadError(null);
    loadFieldSeed(fieldId)
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

  const handleSave = async (save: FieldSeedSave) => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveFieldSeed(fieldId, save);
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the seed assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title="Seed"
      subtitle={context ? `${context.fieldName} · ${context.acreage} acres` : undefined}
    >
      {loadError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {!loadError && !context && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      )}

      {context && (
        <FieldSeedEditor
          fieldName={context.fieldName}
          acreage={context.acreage}
          cropType={context.cropType}
          hasCostRow={context.hasCostRow}
          currentVarietyId={context.currentVarietyId}
          effectiveSeedingRate={context.effectiveSeedingRate}
          varieties={context.varieties}
          saving={saving}
          error={saveError}
          onSave={handleSave}
          onCancel={onClose}
        />
      )}
    </ResponsiveModal>
  );
}

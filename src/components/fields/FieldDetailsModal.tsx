import { useState } from 'react';
import { ResponsiveModal } from '../ResponsiveModal';
import { FieldDetailsForm } from './FieldDetailsForm';
import { createField, updateField, type FieldDetailsValues } from '../../lib/fieldCrud';

/**
 * The saving half of the field-details editor — U-3.
 *
 * Opened from two places that used to disagree about what editing a field means: the pencil
 * on a field card (which showed an inline form on the Fields page) and the field page
 * itself (which offered rent and tax and nothing else). Both now open this.
 *
 * A failed save keeps the sheet open with the message and the entry intact.
 */

interface Props {
  /** Create mode when there is no field id. */
  fieldId?: string;
  seasonId: string;
  userId: string;
  initial?: FieldDetailsValues;
  onClose: () => void;
  /** Called after a successful save, with the id of the field written. */
  onSaved: (fieldId: string) => void;
}

export function FieldDetailsModal({
  fieldId,
  seasonId,
  userId,
  initial,
  onClose,
  onSaved,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: FieldDetailsValues) => {
    setSaving(true);
    setError(null);
    try {
      if (fieldId) {
        await updateField(fieldId, values);
        onSaved(fieldId);
      } else {
        const created = await createField(seasonId, userId, values);
        onSaved(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      title={fieldId ? 'Edit field' : 'New field'}
      subtitle={fieldId ? initial?.name : undefined}
    >
      <FieldDetailsForm
        mode={fieldId ? 'edit' : 'create'}
        initial={initial}
        saving={saving}
        error={error}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </ResponsiveModal>
  );
}

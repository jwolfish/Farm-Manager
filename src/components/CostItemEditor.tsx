import { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { OverrideBadge } from './OverrideBadge';

interface CostItemEditorProps {
  label: string;
  value: number;
  isOverridden: boolean;
  templateValue?: number;
  onSave: (newValue: number) => Promise<void>;
  onReset?: () => Promise<void>;
  disabled?: boolean;
}

export function CostItemEditor({
  label,
  value,
  isOverridden,
  templateValue,
  onSave,
  onReset,
  disabled = false
}: CostItemEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setEditValue(value.toString());
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditValue(value.toString());
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const numValue = parseFloat(editValue);
      if (!isNaN(numValue)) {
        await onSave(numValue);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!onReset) return;
    setSaving(true);
    try {
      await onReset();
    } catch (error) {
      console.error('Error resetting:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700 min-w-[200px]">{label}</span>
        {isOverridden && !isEditing && (
          <OverrideBadge
            isOverridden={isOverridden}
            templateValue={templateValue}
            onReset={onReset ? handleReset : undefined}
          />
        )}
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-32 pl-6 pr-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              step="0.01"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
            title="Save"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">${value.toFixed(2)}</span>
          {!disabled && (
            <button
              onClick={handleEdit}
              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

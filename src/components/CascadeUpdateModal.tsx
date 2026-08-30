import { useState, useEffect } from 'react';
import { X, AlertTriangle, Check, FileText } from 'lucide-react';
import { getFieldsUsingTemplate, getFieldOverrides, cascadeTemplateUpdate } from '../lib/templateUtils';

interface FieldInfo {
  field_id: string;
  fields: {
    id: string;
    name: string;
    acreage: number;
    crop_type: string;
  };
}

interface CascadeUpdateModalProps {
  templateId: string;
  templateName: string;
  // Resolves when the cascade has finished. It reports its own outcome -- both the
  // success case and any per-field errors -- through the app's notification system,
  // so this modal must not try to report on it as well.
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function CascadeUpdateModal({
  templateId,
  templateName,
  onConfirm,
  onCancel
}: CascadeUpdateModalProps) {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [fieldsData, setFieldsData] = useState<{
    fullyUpdating: FieldInfo[];
    partiallyUpdating: FieldInfo[];
  }>({ fullyUpdating: [], partiallyUpdating: [] });

  useEffect(() => {
    loadFieldsData();
  }, [templateId]);

  const loadFieldsData = async () => {
    try {
      const fields = await getFieldsUsingTemplate(templateId);

      const fullyUpdating: FieldInfo[] = [];
      const partiallyUpdating: FieldInfo[] = [];

      for (const field of fields) {
        const overrides = await getFieldOverrides(field.field_id);
        if (overrides.length > 0) {
          partiallyUpdating.push(field as FieldInfo);
        } else {
          fullyUpdating.push(field as FieldInfo);
        }
      }

      setFieldsData({ fullyUpdating, partiallyUpdating });
    } catch (error) {
      console.error('Error loading fields data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setUpdating(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Error updating template:', error);
      alert('An error occurred while updating the template');
    } finally {
      setUpdating(false);
    }
  };

  const totalFields = fieldsData.fullyUpdating.length + fieldsData.partiallyUpdating.length;

  if (totalFields === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <h2 className="text-2xl font-bold text-gray-900">Update Linked Fields?</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={updating}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-900">
                  Template <span className="font-semibold">{templateName}</span> is linked to{' '}
                  <span className="font-semibold">{totalFields}</span> field{totalFields !== 1 ? 's' : ''}.
                  Do you want to update these fields with the new template values?
                </p>
              </div>

              {fieldsData.fullyUpdating.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    Will Fully Update ({fieldsData.fullyUpdating.length})
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    These fields have no custom values and will receive all template changes:
                  </p>
                  <div className="space-y-2">
                    {fieldsData.fullyUpdating.map((field) => (
                      <div
                        key={field.field_id}
                        className="bg-green-50 border border-green-200 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{field.fields.name}</span>
                          <span className="text-sm text-gray-600 capitalize">
                            {field.fields.crop_type} • {field.fields.acreage} acres
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fieldsData.partiallyUpdating.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    Will Partially Update ({fieldsData.partiallyUpdating.length})
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    These fields have custom values that will be preserved. Only non-customized items will update:
                  </p>
                  <div className="space-y-2">
                    {fieldsData.partiallyUpdating.map((field) => (
                      <div
                        key={field.field_id}
                        className="bg-amber-50 border border-amber-200 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{field.fields.name}</span>
                          <span className="text-sm text-gray-600 capitalize">
                            {field.fields.crop_type} • {field.fields.acreage} acres
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <button
            onClick={onCancel}
            disabled={updating}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={updating || loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors flex items-center gap-2"
          >
            {updating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Updating...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Update Template & Fields
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

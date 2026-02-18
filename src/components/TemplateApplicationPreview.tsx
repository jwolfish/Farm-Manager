import { useEffect, useState, useMemo, useCallback } from 'react';
import { X, AlertTriangle, Check, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTemplate, applyTemplateToFields, type SeedVarietyAssignment } from '../lib/templateUtils';
import type { CropType } from '../lib/database.types';

interface Field {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
}

interface FieldCost {
  field_id: string;
  total_cost_per_acre: number;
}

interface TemplateApplicationPreviewProps {
  templateId: string;
  selectedFields: Field[];
  seedAssignments: SeedVarietyAssignment[];
  onBack: () => void;
  onComplete: () => void;
}

export function TemplateApplicationPreview({
  templateId,
  selectedFields,
  seedAssignments,
  onBack,
  onComplete
}: TemplateApplicationPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [template, setTemplate] = useState<any>(null);
  const [existingCosts, setExistingCosts] = useState<Map<string, FieldCost>>(new Map());
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const templateData = await getTemplate(templateId);
        setTemplate(templateData);

        const fieldIdArray = selectedFields.map(f => f.id);
        const { data: costsData } = await supabase
          .from('field_costs')
          .select('field_id, total_cost_per_acre')
          .in('field_id', fieldIdArray);

        const costsMap = new Map(
          (costsData || []).map(c => [c.field_id, c])
        );
        setExistingCosts(costsMap);

        if (costsData && costsData.length > 0) {
          setShowOverwriteWarning(true);
        }
      } catch (error) {
        console.error('Error loading preview data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [templateId]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const result = await applyTemplateToFields(
        templateId,
        selectedFields.map(f => f.id),
        seedAssignments
      );

      if (result.success) {
        onComplete();
      } else {
        console.error('Errors applying template:', result.errors);
        alert(`Failed to apply template to some fields:\n${result.errors.map(e => e.error).join('\n')}`);
      }
    } catch (error) {
      console.error('Error applying template:', error);
      alert('An error occurred while applying the template');
    } finally {
      setApplying(false);
    }
  };

  if (loading || !template) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  const seedAssignmentMap = new Map(seedAssignments.map(sa => [sa.fieldId, sa]));

  const fieldsWithComparison = selectedFields.map(field => {
    const existing = existingCosts.get(field.id);
    const seedAssignment = seedAssignmentMap.get(field.id);
    const newCost = (template.total_cost_per_acre || 0) + (seedAssignment?.seedCostPerAcre || 0);

    return {
      field,
      existingCost: existing?.total_cost_per_acre || 0,
      newCost,
      difference: newCost - (existing?.total_cost_per_acre || 0),
      hasExisting: !!existing
    };
  });

  const totalExisting = fieldsWithComparison.reduce((sum, f) => sum + f.existingCost * f.field.acreage, 0);
  const totalNew = fieldsWithComparison.reduce((sum, f) => sum + f.newCost * f.field.acreage, 0);
  const totalDifference = totalNew - totalExisting;
  const fieldsToOverwrite = fieldsWithComparison.filter(f => f.hasExisting).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Preview Changes</h2>
            <p className="text-sm text-gray-600 mt-1">
              Review cost changes before applying template
            </p>
          </div>
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {showOverwriteWarning && fieldsToOverwrite > 0 && (
          <div className="mx-6 mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">Existing Costs Will Be Overwritten</h3>
                <p className="text-sm text-yellow-800 mt-1">
                  {fieldsToOverwrite} field{fieldsToOverwrite !== 1 ? 's have' : ' has'} existing cost data that will be replaced.
                  Any custom overrides will be removed. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Current Total</div>
              <div className="text-2xl font-bold text-gray-900">
                ${totalExisting.toFixed(2)}
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600 mb-1">New Total</div>
              <div className="text-2xl font-bold text-blue-900">
                ${totalNew.toFixed(2)}
              </div>
            </div>
            <div className={`rounded-lg p-4 ${totalDifference >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className={`text-sm mb-1 ${totalDifference >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                Change
              </div>
              <div className={`text-2xl font-bold flex items-center gap-2 ${totalDifference >= 0 ? 'text-red-900' : 'text-green-900'}`}>
                {totalDifference >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                {totalDifference >= 0 ? '+' : ''}${totalDifference.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Field</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Acres</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Current ($/acre)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">New ($/acre)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Change</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Total Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {fieldsWithComparison.map(({ field, existingCost, newCost, difference, hasExisting }) => (
                    <tr key={field.id} className={hasExisting ? 'bg-yellow-50' : 'bg-white'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{field.name}</span>
                          {hasExisting && (
                            <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">
                              Will Overwrite
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">{field.acreage}</td>
                      <td className="px-4 py-3 text-right">
                        {hasExisting ? (
                          <span className="text-gray-600">${existingCost.toFixed(2)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-blue-600">${newCost.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasExisting ? (
                          <span className={difference >= 0 ? 'text-red-600' : 'text-green-600'}>
                            {difference >= 0 ? '+' : ''}${difference.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-blue-600">New</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        ${(newCost * field.acreage).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Template: {template.name}</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Fertilizer:</span>
                <span className="ml-2 font-medium">${((template.fertilizer_programs as any[] || []).reduce((sum: number, p: any) => sum + (p.cost_per_acre || 0), 0)).toFixed(2)}/acre</span>
              </div>
              <div>
                <span className="text-gray-600">Chemical:</span>
                <span className="ml-2 font-medium">${((template.chemical_programs as any[] || []).reduce((sum: number, p: any) => sum + (p.cost_per_acre || 0), 0)).toFixed(2)}/acre</span>
              </div>
              <div>
                <span className="text-gray-600">Tillage:</span>
                <span className="ml-2 font-medium">${Number(template.tillage_cost_per_acre || 0).toFixed(2)}/acre</span>
              </div>
              <div>
                <span className="text-gray-600">Planting:</span>
                <span className="ml-2 font-medium">${Number(template.planting_cost_per_acre || 0).toFixed(2)}/acre</span>
              </div>
              <div>
                <span className="text-gray-600">Harvest:</span>
                <span className="ml-2 font-medium">${Number(template.harvest_cost_per_acre || 0).toFixed(2)}/acre</span>
              </div>
              <div>
                <span className="text-gray-600">Equipment:</span>
                <span className="ml-2 font-medium">${Number(template.equipment_cost_per_acre || 0).toFixed(2)}/acre</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <button
            onClick={onBack}
            disabled={applying}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors flex items-center gap-2"
          >
            {applying ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Applying...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Apply Template to {selectedFields.length} Field{selectedFields.length !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

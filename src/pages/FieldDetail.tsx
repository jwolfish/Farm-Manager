import { useEffect, useState } from 'react';
import { ArrowLeft, Sprout, FileText, AlertCircle, Unlink } from 'lucide-react';
import { FieldApplicationHistory } from '../components/fields/FieldApplicationHistory';
import { supabase } from '../lib/supabase';
import {
  getTemplate,
  getResolvedFieldCosts,
  createOrUpdateOverride,
  deleteOverride,
  deleteAllOverrides,
  unlinkFieldFromTemplate,
  type ResolvedFieldCosts
} from '../lib/templateUtils';
import type { FieldCostValues, OverrideValue } from '../lib/templateLib/fieldCostOverrides';
import { CostItemEditor } from '../components/CostItemEditor';
import type { CropType } from '../lib/database.types';

interface Field {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
  land_rent_per_acre: number;
  property_tax_per_acre: number;
  notes: string | null;
}

interface FieldDetailProps {
  fieldId: string;
  seasonId: string;
  onBack: () => void;
}

export function FieldDetail({ fieldId, onBack }: FieldDetailProps) {
  const [field, setField] = useState<Field | null>(null);
  const [fieldCosts, setFieldCosts] = useState<ResolvedFieldCosts | null>(null);
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFieldData();
  }, [fieldId]);

  const loadFieldData = async () => {
    setLoading(true);
    try {
      const { data: fieldData, error: fieldError } = await supabase
        .from('fields')
        .select('*')
        .eq('id', fieldId)
        .maybeSingle();

      if (fieldError) throw fieldError;
      setField(fieldData);

      const costs = await getResolvedFieldCosts(fieldId);
      setFieldCosts(costs);

      if (costs?.templateId) {
        const templateData = await getTemplate(costs.templateId);
        setTemplate(templateData);
      } else {
        setTemplate(null);
      }
    } catch (error) {
      console.error('Error loading field data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCostItemUpdate = async (itemName: string, newValue: number) => {
    await createOrUpdateOverride(fieldId, itemName, newValue);
    await loadFieldData();
  };

  const handleResetOverride = async (itemName: string) => {
    await deleteOverride(fieldId, itemName);
    await loadFieldData();
  };

  const handleResetAllOverrides = async () => {
    if (confirm('Reset all custom values to template defaults? This cannot be undone.')) {
      await deleteAllOverrides(fieldId);
      await loadFieldData();
    }
  };

  const handleUnlinkTemplate = async () => {
    if (confirm('Unlink this field from its template? Cost data will be preserved but the field will no longer update with template changes.')) {
      await unlinkFieldFromTemplate(fieldId);
      await loadFieldData();
    }
  };

  const handleLandRentUpdate = async (newValue: number) => {
    try {
      const { error } = await supabase
        .from('fields')
        .update({ land_rent_per_acre: newValue })
        .eq('id', fieldId);

      if (error) throw error;
      await loadFieldData();
    } catch (error) {
      console.error('Error updating land rent:', error);
      alert('Failed to update land rent');
    }
  };

  const handlePropertyTaxUpdate = async (newValue: number) => {
    try {
      const { error } = await supabase
        .from('fields')
        .update({ property_tax_per_acre: newValue })
        .eq('id', fieldId);

      if (error) throw error;
      await loadFieldData();
    } catch (error) {
      console.error('Error updating property tax:', error);
      alert('Failed to update property tax');
    }
  };

  if (loading || !field) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const defaultCosts: FieldCostValues = {
    seed_cost_per_acre: 0,
    fertilizer_cost_per_acre: 0,
    chemical_cost_per_acre: 0,
    tillage_cost_per_acre: 0,
    planting_cost_per_acre: 0,
    harvest_cost_per_acre: 0,
    equipment_cost_per_acre: 0,
    custom_services_cost_per_acre: 0,
    labor_cost_per_acre: 0,
    crop_insurance_cost_per_acre: 0,
    drying_storage_cost_per_acre: 0,
    hauling_cost_per_acre: 0,
    other_expenses_per_acre: 0,
    total_cost_per_acre: 0,
  };
  const costs = fieldCosts?.costs ?? defaultCosts;
  const overrides = fieldCosts?.overrides || new Map<string, OverrideValue>();
  const hasOverrides = overrides.size > 0;

  const totalCostPerAcre = costs.total_cost_per_acre || 0;
  const totalFieldCost = totalCostPerAcre * field.acreage;

  const landCostPerAcre = field.land_rent_per_acre + field.property_tax_per_acre;
  const totalWithLand = totalFieldCost + (landCostPerAcre * field.acreage);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Fields</span>
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{field.name}</h1>
              <div className="flex items-center gap-4 text-gray-600">
                <div className="flex items-center gap-1">
                  <Sprout className="w-4 h-4" />
                  <span className="capitalize">{field.crop_type}</span>
                </div>
                <div>{field.acreage} acres</div>
              </div>
              {field.notes && (
                <p className="text-sm text-gray-600 mt-2">{field.notes}</p>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Total Cost Per Acre</div>
              <div className="text-3xl font-bold text-green-600">${(totalCostPerAcre + landCostPerAcre).toFixed(2)}</div>
              <div className="text-xs text-gray-500 mt-1">
                Operational: ${totalCostPerAcre.toFixed(2)} + Land: ${landCostPerAcre.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                ${totalWithLand.toFixed(2)} total for field
              </div>
            </div>
          </div>
        </div>

        {template && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900">Linked to Template: {template.name}</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    This field uses the template for its cost structure.
                    {hasOverrides && ` ${overrides.size} custom value${overrides.size !== 1 ? 's' : ''} set.`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {hasOverrides && (
                  <button
                    onClick={handleResetAllOverrides}
                    className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                  >
                    Reset All Custom Values
                  </button>
                )}
                <button
                  onClick={handleUnlinkTemplate}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                >
                  <Unlink className="w-4 h-4" />
                  Unlink
                </button>
              </div>
            </div>
          </div>
        )}

        {!fieldCosts && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">No Cost Data</h3>
                <p className="text-sm text-yellow-800 mt-1">
                  This field doesn't have any cost assignments yet. Assign costs from the Field Costs page.
                </p>
              </div>
            </div>
          </div>
        )}

        {fieldCosts && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900">Seed</h2>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between py-2 px-3">
                  <span className="text-sm text-gray-700">Seed Cost</span>
                  <span className="font-medium text-gray-900">${(costs.seed_cost_per_acre || 0).toFixed(2)}/acre</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900">Fertilizer Programs</h2>
              </div>
              <div className="p-4">
                <CostItemEditor
                  label="Total Fertilizer Cost"
                  value={costs.fertilizer_cost_per_acre || 0}
                  isOverridden={overrides.has('fertilizer_cost_per_acre')}
                  templateValue={template ? Number(template.fertilizer_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('fertilizer_cost_per_acre', val)}
                  onReset={overrides.has('fertilizer_cost_per_acre') ? () => handleResetOverride('fertilizer_cost_per_acre') : undefined}
                  disabled={!template}
                />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900">Chemical Programs</h2>
              </div>
              <div className="p-4">
                <CostItemEditor
                  label="Total Chemical Cost"
                  value={costs.chemical_cost_per_acre || 0}
                  isOverridden={overrides.has('chemical_cost_per_acre')}
                  templateValue={template ? Number(template.chemical_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('chemical_cost_per_acre', val)}
                  onReset={overrides.has('chemical_cost_per_acre') ? () => handleResetOverride('chemical_cost_per_acre') : undefined}
                  disabled={!template}
                />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900">Operational Costs</h2>
              </div>
              <div className="p-4 space-y-1">
                <CostItemEditor
                  label="Tillage"
                  value={costs.tillage_cost_per_acre || 0}
                  isOverridden={overrides.has('tillage_cost_per_acre')}
                  templateValue={template ? Number(template.tillage_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('tillage_cost_per_acre', val)}
                  onReset={overrides.has('tillage_cost_per_acre') ? () => handleResetOverride('tillage_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Planting"
                  value={costs.planting_cost_per_acre || 0}
                  isOverridden={overrides.has('planting_cost_per_acre')}
                  templateValue={template ? Number(template.planting_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('planting_cost_per_acre', val)}
                  onReset={overrides.has('planting_cost_per_acre') ? () => handleResetOverride('planting_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Harvest"
                  value={costs.harvest_cost_per_acre || 0}
                  isOverridden={overrides.has('harvest_cost_per_acre')}
                  templateValue={template ? Number(template.harvest_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('harvest_cost_per_acre', val)}
                  onReset={overrides.has('harvest_cost_per_acre') ? () => handleResetOverride('harvest_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Equipment"
                  value={costs.equipment_cost_per_acre || 0}
                  isOverridden={overrides.has('equipment_cost_per_acre')}
                  templateValue={template ? Number(template.equipment_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('equipment_cost_per_acre', val)}
                  onReset={overrides.has('equipment_cost_per_acre') ? () => handleResetOverride('equipment_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Custom Services"
                  value={costs.custom_services_cost_per_acre || 0}
                  isOverridden={overrides.has('custom_services_cost_per_acre')}
                  templateValue={template ? Number(template.custom_services_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('custom_services_cost_per_acre', val)}
                  onReset={overrides.has('custom_services_cost_per_acre') ? () => handleResetOverride('custom_services_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Labor"
                  value={costs.labor_cost_per_acre || 0}
                  isOverridden={overrides.has('labor_cost_per_acre')}
                  templateValue={template ? Number(template.labor_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('labor_cost_per_acre', val)}
                  onReset={overrides.has('labor_cost_per_acre') ? () => handleResetOverride('labor_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Crop Insurance"
                  value={costs.crop_insurance_cost_per_acre || 0}
                  isOverridden={overrides.has('crop_insurance_cost_per_acre')}
                  templateValue={template ? Number(template.crop_insurance_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('crop_insurance_cost_per_acre', val)}
                  onReset={overrides.has('crop_insurance_cost_per_acre') ? () => handleResetOverride('crop_insurance_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Drying & Storage"
                  value={costs.drying_storage_cost_per_acre || 0}
                  isOverridden={overrides.has('drying_storage_cost_per_acre')}
                  templateValue={template ? Number(template.drying_storage_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('drying_storage_cost_per_acre', val)}
                  onReset={overrides.has('drying_storage_cost_per_acre') ? () => handleResetOverride('drying_storage_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Hauling"
                  value={costs.hauling_cost_per_acre || 0}
                  isOverridden={overrides.has('hauling_cost_per_acre')}
                  templateValue={template ? Number(template.hauling_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('hauling_cost_per_acre', val)}
                  onReset={overrides.has('hauling_cost_per_acre') ? () => handleResetOverride('hauling_cost_per_acre') : undefined}
                  disabled={!template}
                />
                <CostItemEditor
                  label="Other Expenses"
                  value={costs.other_expenses_per_acre || 0}
                  isOverridden={overrides.has('other_expenses_per_acre')}
                  templateValue={template ? Number(template.other_expenses_cost_per_acre || 0) : undefined}
                  onSave={(val) => handleCostItemUpdate('other_expenses_per_acre', val)}
                  onReset={overrides.has('other_expenses_per_acre') ? () => handleResetOverride('other_expenses_per_acre') : undefined}
                  disabled={!template}
                />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200 p-4">
                <h2 className="text-lg font-semibold text-gray-900">Land Costs</h2>
                <p className="text-sm text-gray-600 mt-1">Land costs are field-specific and not included in templates</p>
              </div>
              <div className="p-4 space-y-1">
                <CostItemEditor
                  label="Land Rent"
                  value={field.land_rent_per_acre}
                  isOverridden={false}
                  onSave={handleLandRentUpdate}
                  disabled={false}
                />
                <CostItemEditor
                  label="Property Tax"
                  value={field.property_tax_per_acre}
                  isOverridden={false}
                  onSave={handlePropertyTaxUpdate}
                  disabled={false}
                />
                <div className="flex items-center justify-between py-2 px-3 border-t border-gray-200 mt-2 pt-2">
                  <span className="text-sm font-semibold text-gray-900">Total Land Cost</span>
                  <span className="font-semibold text-gray-900">${landCostPerAcre.toFixed(2)}/acre</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <FieldApplicationHistory fieldId={fieldId} />
        </div>

        <div className="bg-gray-900 text-white rounded-lg shadow-lg p-6 mt-6 sticky bottom-6">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-400">Operational Costs</div>
              <div className="text-2xl font-bold">${totalFieldCost.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">
                ${totalCostPerAcre.toFixed(2)}/acre
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Land Costs</div>
              <div className="text-2xl font-bold">${(landCostPerAcre * field.acreage).toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">
                ${landCostPerAcre.toFixed(2)}/acre
              </div>
            </div>
            <div className="border-l border-gray-700 pl-6">
              <div className="text-sm text-gray-400">Total Cost</div>
              <div className="text-3xl font-bold text-green-400">${totalWithLand.toFixed(2)}</div>
              <div className="text-xs text-gray-400 mt-1">
                ${(totalWithLand / field.acreage).toFixed(2)}/acre
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

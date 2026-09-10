import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, AlertCircle, Unlink } from 'lucide-react';
import { FieldApplicationHistory } from '../components/fields/FieldApplicationHistory';
import { FieldProgramDetails } from '../components/fields/FieldProgramDetails';
import { FieldFertilizerPlanModal } from '../components/fields/FieldFertilizerPlanModal';
import { FieldSeedModal } from '../components/fields/FieldSeedModal';
import { FieldDetailsModal } from '../components/fields/FieldDetailsModal';
import { FieldDetailHeader } from '../components/fields/FieldDetailHeader';
import { FieldCostSummaryBar } from '../components/fields/FieldCostSummaryBar';
import { supabase } from '../lib/supabase';
import { describeCustomisationLoss, type FieldCustomisation } from '../lib/fieldCustomisation';
import { loadFieldCustomisations } from '../lib/fieldCustomisationCrud';
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
  user_id: string;
}

interface FieldDetailProps {
  fieldId: string;
  seasonId: string;
  onBack: () => void;
}

export function FieldDetail({ fieldId, seasonId, onBack }: FieldDetailProps) {
  const [field, setField] = useState<Field | null>(null);
  const [fieldCosts, setFieldCosts] = useState<ResolvedFieldCosts | null>(null);
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [planOpen, setPlanOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Bumped after a plan save so FieldProgramDetails re-reads the override it renders from.
  const [programsRefresh, setProgramsRefresh] = useState(0);
  /*
   * What this field would lose to a reset or an unlink — U-2. Held in state rather than read
   * inside the handler so the confirm can be synchronous and still name the numbers.
   */
  const [customisation, setCustomisation] = useState<FieldCustomisation | null>(null);

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

      if (fieldData) {
        const [summary] = await loadFieldCustomisations([{ id: fieldId, name: fieldData.name }]);
        setCustomisation(summary ?? null);
      }

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

  /*
   * U-2. Both of these call `deleteAllOverrides`, which clears `field_cost_overrides` AND
   * `field_fertilizer_rates`. The old copy said "this cannot be undone" without saying what
   * "this" was, and unlink said "cost data will be preserved" — which is true of
   * `field_costs` and false of the per-field prescription. Both now name the count.
   */
  const lossWarning = customisation ? describeCustomisationLoss([customisation]) : null;

  const handleResetAllOverrides = async () => {
    const message = lossWarning
      ? `Reset all custom values to template defaults?\n\n${lossWarning}\n\nThis cannot be undone.`
      : 'Reset all custom values to template defaults? This cannot be undone.';
    if (confirm(message)) {
      await deleteAllOverrides(fieldId);
      await loadFieldData();
    }
  };

  const handleUnlinkTemplate = async () => {
    const base =
      'Unlink this field from its template?\n\nIts cost figures are kept, but it will no longer follow template changes.';
    const message = lossWarning ? `${base}\n\n${lossWarning}` : base;
    if (confirm(message)) {
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
      {planOpen && (
        <FieldFertilizerPlanModal
          fieldId={fieldId}
          onClose={() => setPlanOpen(false)}
          onSaved={() => {
            setProgramsRefresh((n) => n + 1);
            loadFieldData();
          }}
        />
      )}
      {editOpen && (
        /*
          U-3. The same editor the Fields page opens, so a field's own details have one home
          rather than two — land rent and property tax were editable here AND on the card's
          inline form, while name, crop and acreage were only reachable from a bare pencil.
          `seasonId` and `userId` are required by the create path and unused on this one.
        */
        <FieldDetailsModal
          fieldId={fieldId}
          seasonId={seasonId}
          userId={field.user_id}
          initial={{
            name: field.name,
            cropType: field.crop_type,
            acreage: field.acreage,
            landRentPerAcre: field.land_rent_per_acre,
            propertyTaxPerAcre: field.property_tax_per_acre,
            notes: field.notes,
          }}
          onClose={() => setEditOpen(false)}
          onSaved={loadFieldData}
        />
      )}
      {seedOpen && (
        <FieldSeedModal
          fieldId={fieldId}
          onClose={() => setSeedOpen(false)}
          onSaved={() => {
            setProgramsRefresh((n) => n + 1);
            loadFieldData();
          }}
        />
      )}
      <div className="max-w-6xl mx-auto p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Fields</span>
        </button>

        <FieldDetailHeader
          name={field.name}
          cropType={field.crop_type}
          acreage={field.acreage}
          notes={field.notes}
          operationalCostPerAcre={totalCostPerAcre}
          landCostPerAcre={landCostPerAcre}
          totalForField={totalWithLand}
          onEdit={() => setEditOpen(true)}
        />

        {/* MOB-3: stacked on a phone. Two labelled buttons and a two-line paragraph do not
            fit beside each other at 375 px, and `Reset All Custom Values` is the longest
            label on the screen. */}
        {template && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-blue-900 break-words">
                    Linked to Template: {template.name}
                  </h3>
                  <p className="text-sm text-blue-700 mt-1">
                    This field uses the template for its cost structure.
                    {hasOverrides && ` ${overrides.size} custom value${overrides.size !== 1 ? 's' : ''} set.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {hasOverrides && (
                  <button
                    onClick={handleResetAllOverrides}
                    className="px-3 py-2.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                  >
                    Reset All Custom Values
                  </button>
                )}
                <button
                  onClick={handleUnlinkTemplate}
                  className="px-3 py-2.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-1"
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
            <FieldProgramDetails
              key={programsRefresh}
              fieldId={fieldId}
              seedCostPerAcre={costs.seed_cost_per_acre || 0}
              fertilizerCostPerAcre={costs.fertilizer_cost_per_acre || 0}
              chemicalCostPerAcre={costs.chemical_cost_per_acre || 0}
              onEditFertilizerPlan={() => setPlanOpen(true)}
              onEditSeed={() => setSeedOpen(true)}
            />

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

        <FieldCostSummaryBar
          operationalTotal={totalFieldCost}
          landTotal={landCostPerAcre * field.acreage}
          grandTotal={totalWithLand}
          operationalPerAcre={totalCostPerAcre}
          landPerAcre={landCostPerAcre}
          perAcre={field.acreage > 0 ? totalWithLand / field.acreage : 0}
        />
      </div>
    </div>
  );
}

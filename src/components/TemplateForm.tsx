import { X } from 'lucide-react';
import { type TemplateWithStats } from '../lib/templateUtils';
import { CascadeUpdateModal } from './CascadeUpdateModal';
import { useTemplateForm } from '../hooks/useTemplateForm';

interface TemplateFormProps {
  seasonId: string;
  template?: TemplateWithStats | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function TemplateForm({ seasonId, template, onClose, onSuccess }: TemplateFormProps) {
  const {
    loading, formError,
    formData, setFormData,
    fertilizerPrograms, chemicalPrograms,
    selectedFertilizerPrograms, selectedChemicalPrograms,
    showCascadeModal,
    toggleFertilizerProgram, toggleChemicalProgram,
    calculateFertilizerProgramCost, calculateChemicalProgramCost, calculateTotalCost,
    handleSubmit, handleCascadeConfirm, handleCascadeCancel,
  } = useTemplateForm(seasonId, template, onClose, onSuccess);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-900">
            {template ? 'Edit Template' : 'Create Template'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Template Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
                placeholder="e.g., 2026 Corn - Standard"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                rows={2}
                placeholder="Optional description for this template"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Fertilizer Programs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fertilizerPrograms.map((program) => (
                <label
                  key={program.id}
                  className="flex items-center p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFertilizerPrograms.has(program.id)}
                    onChange={() => toggleFertilizerProgram(program.id)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="ml-3 flex-1 text-sm text-neutral-900">{program.program_name}</span>
                  <span className="text-sm text-neutral-600">
                    ${calculateFertilizerProgramCost(program).toFixed(2)}/ac
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Chemical Programs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {chemicalPrograms.map((program) => (
                <label
                  key={program.id}
                  className="flex items-center p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedChemicalPrograms.has(program.id)}
                    onChange={() => toggleChemicalProgram(program.id)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="ml-3 flex-1 text-sm text-neutral-900">{program.program_name}</span>
                  <span className="text-sm text-neutral-600">
                    ${calculateChemicalProgramCost(program).toFixed(2)}/ac
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">Operational Costs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'tillage_cost_per_acre', label: 'Tillage' },
                { key: 'planting_cost_per_acre', label: 'Planting' },
                { key: 'harvest_cost_per_acre', label: 'Harvest' },
                { key: 'equipment_cost_per_acre', label: 'Equipment' },
                { key: 'custom_services_cost_per_acre', label: 'Custom Services' },
                { key: 'labor_cost_per_acre', label: 'Labor' },
                { key: 'crop_insurance_cost_per_acre', label: 'Crop Insurance' },
                { key: 'other_expenses_per_acre', label: 'Other Expenses' },
                { key: 'drying_storage_cost_per_acre', label: 'Drying/Storage' },
                { key: 'hauling_cost_per_acre', label: 'Hauling' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    {label} ($/acre)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData[key as keyof typeof formData]}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {formError}
            </div>
          )}

          <div className="border-t border-neutral-200 pt-6 flex items-center justify-between">
            <div>
              <div className="text-sm text-neutral-600">Total Cost per Acre</div>
              <div className="text-2xl font-bold text-neutral-900">${calculateTotalCost().toFixed(2)}</div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Saving...' : (template ? 'Update Template' : 'Create Template')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showCascadeModal && template && (
        <CascadeUpdateModal
          templateId={template.id}
          templateName={template.name}
          onConfirm={handleCascadeConfirm}
          onCancel={handleCascadeCancel}
        />
      )}
    </div>
  );
}

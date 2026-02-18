import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, Sprout, FileText, Square, CheckSquare, Filter } from 'lucide-react';
import { hasOverrides } from '../lib/templateUtils';
import { TemplateSelector } from '../components/TemplateSelector';
import { SeedVarietyAssignmentComponent } from '../components/SeedVarietyAssignment';
import { TemplateApplicationPreview } from '../components/TemplateApplicationPreview';
import type { CropType } from '../lib/database.types';
import type { SeedVarietyAssignment } from '../lib/templateUtils';

interface Field {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
  land_rent_per_acre: number;
  property_tax_per_acre: number;
  notes: string | null;
}

interface FieldWithCosts extends Field {
  template_name: string | null;
  total_cost_per_acre: number | null;
  has_overrides: boolean;
}

interface FieldsProps {
  seasonId: string | null;
  onViewFieldDetail?: (fieldId: string) => void;
}

export function Fields({ seasonId, onViewFieldDetail }: FieldsProps) {
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldWithCosts[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    crop_type: 'corn' as CropType,
    acreage: '',
    land_rent_per_acre: '',
    property_tax_per_acre: '',
    notes: '',
  });

  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [overrideFilter, setOverrideFilter] = useState<string>('all');
  const [cropFilter, setCropFilter] = useState<CropType | 'all'>('all');

  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showSeedAssignment, setShowSeedAssignment] = useState(false);
  const [showApplicationPreview, setShowApplicationPreview] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [seedAssignments, setSeedAssignments] = useState<SeedVarietyAssignment[]>([]);

  const wizardActiveRef = useRef(false);
  const beforeUnloadHandlerRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);

  useEffect(() => {
    if (seasonId && user) {
      loadFields();
    }
  }, [seasonId, user]);

  const loadFields = async () => {
    if (!seasonId || !user) return;

    if (wizardActiveRef.current) {
      return;
    }

    setLoading(true);
    try {
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('fields')
        .select('*')
        .eq('season_id', seasonId)
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (fieldsError) throw fieldsError;

      const { data: costsData, error: costsError } = await supabase
        .from('field_costs')
        .select(`
          field_id,
          total_cost_per_acre,
          template_id,
          cost_templates (
            name
          )
        `)
        .in('field_id', (fieldsData || []).map(f => f.id));

      if (costsError) throw costsError;

      const costsMap = new Map(
        (costsData || []).map(c => [c.field_id, c])
      );

      const fieldsWithOverrides = await Promise.all(
        (fieldsData || []).map(async (field) => {
          const costData = costsMap.get(field.id);
          const hasOverridesFlag = costData ? await hasOverrides(field.id) : false;

          return {
            ...field,
            template_name: costData?.cost_templates?.name || null,
            total_cost_per_acre: costData?.total_cost_per_acre || null,
            has_overrides: hasOverridesFlag
          } as FieldWithCosts;
        })
      );

      setFields(fieldsWithOverrides);
    } catch (error) {
      console.error('Error loading fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const enableWizardProtection = useCallback(() => {
    wizardActiveRef.current = true;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    beforeUnloadHandlerRef.current = handler;
    window.addEventListener('beforeunload', handler);
  }, []);

  const disableWizardProtection = useCallback(() => {
    wizardActiveRef.current = false;

    if (beforeUnloadHandlerRef.current) {
      window.removeEventListener('beforeunload', beforeUnloadHandlerRef.current);
      beforeUnloadHandlerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      disableWizardProtection();
    };
  }, [disableWizardProtection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seasonId || !user) return;

    try {
      if (editingField) {
        const { error } = await supabase
          .from('fields')
          .update({
            name: formData.name,
            crop_type: formData.crop_type,
            acreage: parseFloat(formData.acreage),
            land_rent_per_acre: parseFloat(formData.land_rent_per_acre) || 0,
            property_tax_per_acre: parseFloat(formData.property_tax_per_acre) || 0,
            notes: formData.notes || null,
          })
          .eq('id', editingField.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('fields').insert({
          season_id: seasonId,
          user_id: user.id,
          name: formData.name,
          crop_type: formData.crop_type,
          acreage: parseFloat(formData.acreage),
          land_rent_per_acre: parseFloat(formData.land_rent_per_acre) || 0,
          property_tax_per_acre: parseFloat(formData.property_tax_per_acre) || 0,
          notes: formData.notes || null,
        });

        if (error) throw error;
      }

      setFormData({ name: '', crop_type: 'corn', acreage: '', land_rent_per_acre: '', property_tax_per_acre: '', notes: '' });
      setEditingField(null);
      setShowForm(false);
      loadFields();
    } catch (error) {
      console.error('Error saving field:', error);
      alert('Error saving field. Please try again.');
    }
  };

  const handleEdit = (field: Field) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      crop_type: field.crop_type,
      acreage: field.acreage.toString(),
      land_rent_per_acre: field.land_rent_per_acre.toString(),
      property_tax_per_acre: field.property_tax_per_acre.toString(),
      notes: field.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field? This will also delete all associated cost data.')) {
      return;
    }

    try {
      const { error } = await supabase.from('fields').delete().eq('id', fieldId);

      if (error) throw error;
      loadFields();
    } catch (error) {
      console.error('Error deleting field:', error);
      alert('Error deleting field. Please try again.');
    }
  };

  const handleFieldSelect = (fieldId: string) => {
    setSelectedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedFields.size === filteredFields.length) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(filteredFields.map(f => f.id)));
    }
  };

  const handleApplyTemplate = useCallback(() => {
    if (selectedFields.size === 0) {
      alert('Please select at least one field');
      return;
    }
    enableWizardProtection();
    setShowTemplateSelector(true);
  }, [selectedFields.size, enableWizardProtection]);

  const handleTemplateSelected = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);
    setShowTemplateSelector(false);
    setShowSeedAssignment(true);
  }, []);

  const handleSeedAssignmentComplete = useCallback((assignments: SeedVarietyAssignment[]) => {
    setSeedAssignments(assignments);
    setShowSeedAssignment(false);
    setShowApplicationPreview(true);
  }, []);

  const handleApplicationComplete = useCallback(() => {
    disableWizardProtection();
    setShowApplicationPreview(false);
    setSelectedTemplateId(null);
    setSeedAssignments([]);
    setSelectedFields(new Set());
    loadFields();
  }, [disableWizardProtection]);

  const handleWizardCancel = useCallback(() => {
    disableWizardProtection();
    setShowTemplateSelector(false);
    setShowSeedAssignment(false);
    setShowApplicationPreview(false);
    setSelectedTemplateId(null);
    setSeedAssignments([]);
  }, [disableWizardProtection]);

  const handleSeedAssignmentBack = useCallback(() => {
    setShowSeedAssignment(false);
    setShowTemplateSelector(true);
  }, []);

  const handlePreviewBack = useCallback(() => {
    setShowApplicationPreview(false);
    setShowSeedAssignment(true);
  }, []);

  const getCropBadgeColor = (crop: CropType) => {
    switch (crop) {
      case 'corn':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'soybeans':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'wheat':
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  const filteredFields = useMemo(() => {
    return fields.filter(field => {
      if (cropFilter !== 'all' && field.crop_type !== cropFilter) return false;
      if (templateFilter === 'none' && field.template_name !== null) return false;
      if (templateFilter !== 'all' && templateFilter !== 'none' && field.template_name !== templateFilter) return false;
      if (overrideFilter === 'has' && !field.has_overrides) return false;
      if (overrideFilter === 'none' && field.has_overrides) return false;
      return true;
    });
  }, [fields, cropFilter, templateFilter, overrideFilter]);

  const uniqueTemplates = useMemo(() => {
    return Array.from(new Set(fields.map(f => f.template_name).filter(Boolean)));
  }, [fields]);

  const selectedFieldsData = useMemo(() => {
    return fields.filter(f => selectedFields.has(f.id));
  }, [fields, selectedFields]);

  if (!seasonId) {
    return (
      <div className="p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium">Please create or select a season to manage fields</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fields</h1>
          <p className="text-gray-600 mt-2">Manage your fields and crop assignments</p>
        </div>
        <div className="flex gap-3">
          {selectedFields.size > 0 && (
            <button
              onClick={handleApplyTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-5 h-5" />
              Apply Template ({selectedFields.size})
            </button>
          )}
          <button
            onClick={() => {
              setShowForm(true);
              setEditingField(null);
              setFormData({ name: '', crop_type: 'corn', acreage: '', land_rent_per_acre: '', property_tax_per_acre: '', notes: '' });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Field
          </button>
        </div>
      </div>

      {fields.length > 0 && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <Filter className="w-5 h-5 text-gray-500" />
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Crop Type</label>
                <select
                  value={cropFilter}
                  onChange={(e) => setCropFilter(e.target.value as CropType | 'all')}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Crops</option>
                  <option value="corn">Corn</option>
                  <option value="soybeans">Soybeans</option>
                  <option value="wheat">Wheat</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                <select
                  value={templateFilter}
                  onChange={(e) => setTemplateFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Templates</option>
                  <option value="none">No Template</option>
                  {uniqueTemplates.map(template => (
                    <option key={template} value={template!}>{template}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customization</label>
                <select
                  value={overrideFilter}
                  onChange={(e) => setOverrideFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Fields</option>
                  <option value="has">Has Custom Values</option>
                  <option value="none">No Custom Values</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingField ? 'Edit Field' : 'New Field'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Field Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="e.g., North 40, Field A"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Crop Type</label>
                <select
                  value={formData.crop_type}
                  onChange={(e) => setFormData({ ...formData, crop_type: e.target.value as CropType })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value="corn">Corn</option>
                  <option value="soybeans">Soybeans</option>
                  <option value="wheat">Wheat</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Acreage</label>
              <input
                type="number"
                step="0.01"
                value={formData.acreage}
                onChange={(e) => setFormData({ ...formData, acreage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., 120.5"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Land Rent (per acre)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.land_rent_per_acre}
                    onChange={(e) => setFormData({ ...formData, land_rent_per_acre: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Property Tax (per acre)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.property_tax_per_acre}
                    onChange={(e) => setFormData({ ...formData, property_tax_per_acre: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Soil type, rotation history, etc."
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                {editingField ? 'Update Field' : 'Create Field'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingField(null);
                  setFormData({ name: '', crop_type: 'corn', acreage: '', notes: '' });
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500">Loading fields...</div>
      ) : fields.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <Sprout className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No fields yet</h3>
          <p className="text-gray-600 mb-4">Add your first field to start tracking costs</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Field
          </button>
        </div>
      ) : (
        <>
          {filteredFields.length > 0 && (
            <div className="mb-3 flex items-center gap-3 text-sm">
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 text-gray-700 hover:text-blue-600"
              >
                {selectedFields.size === filteredFields.length ? (
                  <CheckSquare className="w-5 h-5" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
                Select All
              </button>
              {selectedFields.size > 0 && (
                <span className="text-gray-600">
                  {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>
          )}

          {filteredFields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No fields match the selected filters
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFields.map((field) => {
                const isSelected = selectedFields.has(field.id);
                const statusColor = field.template_name
                  ? field.has_overrides
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-green-300 bg-green-50'
                  : 'border-gray-200 bg-white';

                return (
                  <div
                    key={field.id}
                    className={`rounded-lg shadow-sm border-2 p-5 transition-all ${statusColor} ${
                      isSelected ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <button
                        onClick={() => handleFieldSelect(field.id)}
                        className="mt-1 flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => onViewFieldDetail?.(field.id)}
                          className="text-left w-full"
                        >
                          <h3 className="font-semibold text-gray-900 text-lg hover:text-blue-600 transition-colors">
                            {field.name}
                          </h3>
                        </button>
                        <p className="text-sm text-gray-600 mt-1">{field.acreage} acres</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleEdit(field)}
                          className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(field.id)}
                          className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${getCropBadgeColor(field.crop_type)}`}>
                        {field.crop_type.charAt(0).toUpperCase() + field.crop_type.slice(1)}
                      </div>
                      {field.has_overrides && (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          Custom
                        </span>
                      )}
                    </div>

                    {field.template_name ? (
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="text-gray-700">{field.template_name}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 mb-2">No template</div>
                    )}

                    <div className="space-y-1">
                      {field.total_cost_per_acre !== null && (
                        <div className="text-lg font-semibold text-green-600">
                          ${field.total_cost_per_acre.toFixed(2)}/acre
                          <span className="text-xs text-gray-500 ml-1 font-normal">(operational)</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Rent: </span>
                          <span className="font-medium text-gray-900">${field.land_rent_per_acre.toFixed(2)}/ac</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Tax: </span>
                          <span className="font-medium text-gray-900">${field.property_tax_per_acre.toFixed(2)}/ac</span>
                        </div>
                      </div>
                      {field.total_cost_per_acre !== null && (
                        <div className="text-sm text-gray-700 pt-1 border-t">
                          <span className="text-gray-600">Total: </span>
                          <span className="font-semibold text-gray-900">
                            ${(field.total_cost_per_acre + field.land_rent_per_acre + field.property_tax_per_acre).toFixed(2)}/acre
                          </span>
                        </div>
                      )}
                    </div>

                    {field.notes && (
                      <p className="mt-3 text-sm text-gray-600 border-t pt-3">{field.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showTemplateSelector && seasonId && user && (
        <TemplateSelector
          seasonId={seasonId}
          selectedFields={selectedFieldsData}
          onClose={handleWizardCancel}
          onSelectTemplate={handleTemplateSelected}
        />
      )}

      {showSeedAssignment && seasonId && user && selectedTemplateId && (
        <SeedVarietyAssignmentComponent
          seasonId={seasonId}
          userId={user.id}
          selectedFields={selectedFieldsData}
          onBack={handleSeedAssignmentBack}
          onContinue={handleSeedAssignmentComplete}
        />
      )}

      {showApplicationPreview && selectedTemplateId && (
        <TemplateApplicationPreview
          templateId={selectedTemplateId}
          selectedFields={selectedFieldsData}
          seedAssignments={seedAssignments}
          onBack={handlePreviewBack}
          onComplete={handleApplicationComplete}
        />
      )}
    </div>
  );
}

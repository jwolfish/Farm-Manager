import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Sprout, Square, CheckSquare, Filter, FileText, Grid3x3 } from 'lucide-react';
/*
 * Lazy, like the Fertilizer Contracts tab and for the same reason: the grid, its panel and
 * its data layer are ~20 kB that every first paint of the Fields page would otherwise carry
 * for a screen most visits never open, on a bundle already well over WI-22's target.
 */
const FieldFertilizerRateGridPanel = lazy(() =>
  import('../components/fields/FieldFertilizerRateGridPanel').then((m) => ({
    default: m.FieldFertilizerRateGridPanel,
  }))
);
import { TemplateSelector } from '../components/TemplateSelector';
import { SeedVarietyAssignmentComponent } from '../components/SeedVarietyAssignment';
import { TemplateApplicationPreview } from '../components/TemplateApplicationPreview';
import { Pagination } from '../components/Pagination';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FieldCard } from '../components/fields/FieldCard';
import { FieldDetailsModal } from '../components/fields/FieldDetailsModal';
import { deleteField } from '../lib/fieldCrud';
import type { CropType } from '../lib/database.types';
import type { SeedVarietyAssignment } from '../lib/templateUtils';
import type { FieldWithCosts } from '../components/fields/FieldCard';

const FIELDS_PAGE_SIZE = 24;

interface FieldsProps {
  seasonId: string | null;
  onViewFieldDetail?: (fieldId: string) => void;
  /**
   * A viewer on a shared farm. `App.tsx` has passed this since the role work; the prop was
   * never declared here, so every mutating control on this page was shown to a viewer and
   * the compiler had been reporting it as a TS2322 sitting inside the baseline.
   */
  readOnly?: boolean;
}

export function Fields({ seasonId, onViewFieldDetail, readOnly }: FieldsProps) {
  const { user } = useAuth();
  const [fields, setFields] = useState<FieldWithCosts[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  /* U-3: one modal for both create and edit. `null` means closed. */
  const [editing, setEditing] = useState<{ field: FieldWithCosts | null } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [overrideFilter, setOverrideFilter] = useState<string>('all');
  const [cropFilter, setCropFilter] = useState<CropType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [showRateGrid, setShowRateGrid] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showSeedAssignment, setShowSeedAssignment] = useState(false);
  const [showApplicationPreview, setShowApplicationPreview] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [seedAssignments, setSeedAssignments] = useState<SeedVarietyAssignment[]>([]);

  const wizardActiveRef = useRef(false);
  const beforeUnloadHandlerRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);

  const loadFields = useCallback(async () => {
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

      const fieldIdsWithCosts = (fieldsData || [])
        .filter(f => costsMap.has(f.id))
        .map(f => f.id);

      let fieldsWithOverridesSet = new Set<string>();
      if (fieldIdsWithCosts.length > 0) {
        const { data: overridesData } = await supabase
          .from('field_cost_overrides')
          .select('field_id')
          .in('field_id', fieldIdsWithCosts);

        for (const row of overridesData || []) {
          fieldsWithOverridesSet.add(row.field_id);
        }
      }

      const fieldsWithOverrides = (fieldsData || []).map((field) => {
        const costData = costsMap.get(field.id);
        return {
          ...field,
          template_name: costData?.cost_templates?.name || null,
          total_cost_per_acre: costData?.total_cost_per_acre || null,
          has_overrides: fieldsWithOverridesSet.has(field.id),
        } as FieldWithCosts;
      });

      setFields(fieldsWithOverrides);
    } catch (error) {
      console.error('Error loading fields:', error);
    } finally {
      setLoading(false);
    }
  }, [seasonId, user]);

  useEffect(() => {
    if (seasonId && user) {
      loadFields();
    }
  }, [seasonId, user, loadFields]);

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

  const handleEdit = (field: FieldWithCosts) => setEditing({ field });

  const handleDelete = async (fieldId: string) => {
    const field = fields.find((f) => f.id === fieldId);
    const name = field ? `"${field.name}"` : 'this field';
    if (
      !confirm(
        `Delete ${name}?\n\nIts costs, custom values, fertilizer rates and yields go with it. This cannot be undone.`
      )
    ) {
      return;
    }

    setDeleteError(null);
    try {
      await deleteField(fieldId);
      loadFields();
    } catch (error) {
      // Was `alert('Error deleting field. Please try again.')` with the reason discarded.
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the field.');
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
  }, [disableWizardProtection, loadFields]);

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

  const totalPages = Math.ceil(filteredFields.length / FIELDS_PAGE_SIZE);
  const paginatedFields = useMemo(() => {
    const start = (currentPage - 1) * FIELDS_PAGE_SIZE;
    return filteredFields.slice(start, start + FIELDS_PAGE_SIZE);
  }, [filteredFields, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [cropFilter, templateFilter, overrideFilter]);

  const uniqueTemplates = useMemo(() => {
    return Array.from(new Set(fields.map(f => f.template_name).filter(Boolean)));
  }, [fields]);

  const selectedFieldsData = useMemo(() => {
    return fields.filter(f => selectedFields.has(f.id));
  }, [fields, selectedFields]);

  if (!seasonId) {
    return (
      <div className="p-4 sm:p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium">Please create or select a season to manage fields</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      {/*
        MOB-3. Three full-label buttons in a plain `flex` row is the shape MOB-2 found
        stretching the Products page to 1,044 px: nothing contains it, so the PAGE grows and
        scrolls sideways. They wrap now, and the row stacks under the heading on a phone.
      */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fields</h1>
          <p className="text-gray-600 mt-2">Manage your fields and crop assignments</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {selectedFields.size > 0 && !readOnly && (
            <button
              onClick={handleApplyTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-5 h-5" />
              Apply Template ({selectedFields.size})
            </button>
          )}
          {/*
            The bulk rate grid lives here rather than under Products → Programs, because it
            reads fields down the page and because it is the surface the CSV import (V-7)
            will populate for review.
          */}
          {!readOnly && (
            <button
              onClick={() => setShowRateGrid(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Grid3x3 className="w-5 h-5" />
              Fertilizer Rates
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => setEditing({ field: null })}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Field
            </button>
          )}
        </div>
      </div>

      {showRateGrid && seasonId && (
        // R-6. Lazy chunk, and a full-screen panel — so a rejected import here would
        // otherwise take the Fields page with it. Closing the grid is the way out.
        <ErrorBoundary
          label="the Fertilizer Rates grid"
          resetKey={showRateGrid}
          action={{ label: 'Close', onClick: () => setShowRateGrid(false) }}
        >
          <Suspense fallback={<div className="fixed inset-0 z-50 bg-white p-8 text-gray-500">Loading…</div>}>
            <FieldFertilizerRateGridPanel
              seasonId={seasonId}
              onClose={() => setShowRateGrid(false)}
              onSaved={loadFields}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {deleteError && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{deleteError}</span>
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="shrink-0 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {fields.length > 0 && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          {/* MOB-3: three labelled selects side by side leave ~110 px each at 375 px. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Filter className="hidden w-5 h-5 text-gray-500 sm:block" />
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
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


      {loading ? (
        <div className="text-center text-gray-500">Loading fields...</div>
      ) : fields.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <Sprout className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No fields yet</h3>
          <p className="text-gray-600 mb-4">Add your first field to start tracking costs</p>
          <button
            onClick={() => setEditing({ field: null })}
            className="inline-flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
              {paginatedFields.map((field) => (
                <FieldCard
                  key={field.id}
                  field={field}
                  isSelected={selectedFields.has(field.id)}
                  onSelect={handleFieldSelect}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onViewDetail={onViewFieldDetail}
                  onEditRates={() => setShowRateGrid(true)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
          {filteredFields.length > FIELDS_PAGE_SIZE && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalCount={filteredFields.length}
              pageSize={FIELDS_PAGE_SIZE}
            />
          )}
        </>
      )}

      {editing && seasonId && user && (
        <FieldDetailsModal
          fieldId={editing.field?.id}
          seasonId={seasonId}
          userId={user.id}
          initial={
            editing.field
              ? {
                  name: editing.field.name,
                  cropType: editing.field.crop_type,
                  acreage: editing.field.acreage,
                  landRentPerAcre: editing.field.land_rent_per_acre,
                  propertyTaxPerAcre: editing.field.property_tax_per_acre,
                  notes: editing.field.notes,
                }
              : undefined
          }
          onClose={() => setEditing(null)}
          onSaved={loadFields}
        />
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

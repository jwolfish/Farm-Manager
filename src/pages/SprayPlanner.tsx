import { useEffect, useRef, useState } from 'react';
import {
  Droplets,
  FlaskConical,
  FileDown,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ClipboardList,
  Printer,
  Search,
  X,
  Pencil,
  Save,
  Loader2,
  Package,
} from 'lucide-react';
import { CropType } from '../lib/database.types';
import { useSprayPlanner, ChemicalItem } from '../hooks/useSprayPlanner';
import { WorkOrderEditModal } from '../components/WorkOrderEditModal';
import { SavedWorkOrdersList } from '../components/SavedWorkOrdersList';
import { WorkOrderDetailModal } from '../components/WorkOrderDetailModal';
import type { SavedWorkOrder } from '../lib/workOrderCrud';
import { toBestPracticalUnit, convertUnits } from '../lib/unitConversions';
import { convertSavedWorkOrdersToSprayFormat } from '../lib/exports/savedWorkOrderAdapter';
import { exportSprayLogPDF } from '../lib/exports/sprayLogPdfExport';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_COLORS: Record<CropType, { badge: string; badgeText: string; section: string; border: string; headerText: string }> = {
  corn:     { badge: 'bg-amber-100',  badgeText: 'text-amber-800',  section: 'bg-amber-50',  border: 'border-amber-200', headerText: 'text-amber-800' },
  soybeans: { badge: 'bg-green-100',  badgeText: 'text-green-800',  section: 'bg-green-50',  border: 'border-green-200', headerText: 'text-green-800' },
  wheat:    { badge: 'bg-orange-100', badgeText: 'text-orange-800', section: 'bg-orange-50', border: 'border-orange-200', headerText: 'text-orange-800' },
};

interface Props {
  currentSeasonId: string | null;
  effectiveUserId: string | null;
  farmId: string | null;
}

function fmtAcres(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function SprayPlanner({ currentSeasonId, effectiveUserId, farmId }: Props) {
  const {
    fields, programs, loading, error,
    actionError, dismissActionError,
    selectedFields, selectedPrograms,
    workOrders, crossTotals, expandedCards, resultsRef,
    cropGroups, selectedAcres, canGenerate,
    toggleField, toggleAllByCrop, toggleAllFields, clearAllFields, toggleProgram,
    generate, acreOverrides, chemOverrides, sprayVolumeOverrides,
    setWorkOrderOverrides,
    handleExportCSV, handleExportPDF, handleExportSprayLog, toggleExpandedCard,
    computePreviewTotals,
    savedWorkOrders, savedLoading,
    handleSaveWorkOrder, handleDeleteSavedWorkOrder,
    handleApplyWorkOrder, handleUnapplyWorkOrder,
    savingProgramId,
    applyingId,
    inventoryMap,
    seasonName,
  } = useSprayPlanner(currentSeasonId, effectiveUserId, farmId);

  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const [editingWorkOrderId, setEditingWorkOrderId] = useState<string | null>(null);
  const [viewingSavedWo, setViewingSavedWo] = useState<SavedWorkOrder | null>(null);
  const [generatingLogs, setGeneratingLogs] = useState(false);

  const handleGenerateSprayLogs = async (selected: SavedWorkOrder[]) => {
    if (selected.length === 0 || generatingLogs) return;
    setGeneratingLogs(true);
    try {
      const sprayWorkOrders = await convertSavedWorkOrdersToSprayFormat(selected);
      exportSprayLogPDF(sprayWorkOrders, seasonName);
    } finally {
      setGeneratingLogs(false);
    }
  };

  const editingWorkOrder = workOrders?.find((wo) => wo.programId === editingWorkOrderId) ?? null;

  function handleSaveWorkOrderOverrides(
    programId: string,
    acres: number | null,
    sprayVol: number | null,
    chemicals: ChemicalItem[] | null,
  ) {
    setWorkOrderOverrides(programId, acres, sprayVol, chemicals);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setFieldPickerOpen(false);
        setFieldSearch('');
      }
    }
    if (fieldPickerOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fieldPickerOpen]);

  if (!currentSeasonId) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Droplets className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No active season selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map((j) => <div key={j} className="h-10 bg-gray-100 rounded" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Apply/unapply failures — inventory was not changed */}
      {actionError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
          <span className="flex-1">{actionError}</span>
          <button
            onClick={dismissActionError}
            className="text-red-400 hover:text-red-700 flex-shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Droplets className="w-5 h-5 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Spray Planner</h1>
        </div>
        <p className="text-gray-500 text-sm ml-12">Select fields and chemical programs to generate a custom spray work order.</p>
      </div>

      {/* Step 1 — Field Selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible" ref={pickerRef}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <h2 className="font-semibold text-gray-900">Select Fields</h2>
          </div>
          <div className="flex items-center gap-3">
            {selectedFields.size > 0 && (
              <>
                <span className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-900">{selectedFields.size}</span> field{selectedFields.size !== 1 ? 's' : ''} · <span className="font-semibold text-gray-900">{fmtAcres(selectedAcres)}</span> ac
                </span>
                <button
                  onClick={clearAllFields}
                  className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {/* Token picker input */}
        <div className="relative px-6 py-4">
          {fields.length === 0 ? (
            <p className="text-sm text-gray-400 py-1">No fields found for the active season.</p>
          ) : (
            <>
              {/* Token input area */}
              <button
                type="button"
                onClick={() => setFieldPickerOpen((o) => !o)}
                className={`w-full min-h-[44px] flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg border text-left transition-all ${
                  fieldPickerOpen
                    ? 'border-blue-400 ring-2 ring-blue-100'
                    : 'border-gray-300 hover:border-gray-400'
                } bg-white`}
              >
                {selectedFields.size === 0 ? (
                  <span className="text-sm text-gray-400 flex-1">Click to select fields...</span>
                ) : (
                  <>
                    {fields
                      .filter((f) => selectedFields.has(f.id))
                      .map((f) => {
                        const col = CROP_COLORS[f.cropType];
                        return (
                          <span
                            key={f.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${col.badge} ${col.badgeText} border border-current border-opacity-20`}
                          >
                            {f.name}
                            <span className="opacity-60 text-xs">{fmtAcres(f.acreage)}ac</span>
                            <span
                              role="button"
                              tabIndex={0}
                              onMouseDown={(e) => { e.stopPropagation(); toggleField(f.id); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleField(f.id); } }}
                              className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer leading-none"
                            >
                              <X className="w-3 h-3" />
                            </span>
                          </span>
                        );
                      })}
                  </>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto flex-shrink-0 transition-transform ${fieldPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {fieldPickerOpen && (
                <div className="absolute left-6 right-6 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {/* Search + Select All row */}
                  <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-gray-100">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        autoFocus
                        type="text"
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        placeholder="Search fields..."
                        className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={toggleAllFields}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap transition-colors px-1"
                    >
                      {selectedFields.size === fields.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  {/* Crop groups */}
                  <div className="overflow-y-auto max-h-72">
                    {[...cropGroups.entries()].map(([cropType, cropFields]) => {
                      const filtered = fieldSearch.trim()
                        ? cropFields.filter((f) => f.name.toLowerCase().includes(fieldSearch.toLowerCase()))
                        : cropFields;
                      if (filtered.length === 0) return null;

                      const col = CROP_COLORS[cropType];
                      const allGroupSelected = filtered.every((f) => selectedFields.has(f.id));
                      const someGroupSelected = filtered.some((f) => selectedFields.has(f.id));

                      return (
                        <div key={cropType}>
                          {/* Group header */}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleAllByCrop(cropType)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100"
                          >
                            <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              allGroupSelected ? 'bg-blue-600 border-blue-600' : someGroupSelected ? 'bg-blue-100 border-blue-400' : 'border-gray-300'
                            }`}>
                              {allGroupSelected && <span className="text-white text-xs leading-none" style={{ fontSize: '8px' }}>✓</span>}
                              {someGroupSelected && !allGroupSelected && <div className="w-1.5 h-0.5 bg-blue-600 rounded" />}
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badge} ${col.badgeText}`}>
                              {CROP_LABELS[cropType]}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">{filtered.length} field{filtered.length !== 1 ? 's' : ''}</span>
                          </button>

                          {/* Field rows */}
                          {filtered.map((f) => {
                            const selected = selectedFields.has(f.id);
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => toggleField(f.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-gray-50 last:border-0 ${
                                  selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                  selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                                }`}>
                                  {selected && <span className="text-white text-xs leading-none">✓</span>}
                                </div>
                                <span className={`text-sm flex-1 ${selected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{f.name}</span>
                                <span className="text-xs text-gray-400">{fmtAcres(f.acreage)} ac</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Step 2 — Program Selection */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
          <h2 className="font-semibold text-gray-900">Select Programs to Spray</h2>
          {selectedPrograms.size > 0 && (
            <span className="ml-auto text-sm text-gray-500">
              <span className="font-semibold text-gray-900">{selectedPrograms.size}</span> selected
            </span>
          )}
        </div>

        {programs.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">
            <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>No chemical programs found. Add programs in the Products page.</p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            {programs.map((prog) => {
              const selected = selectedPrograms.has(prog.id);
              const col = CROP_COLORS[prog.cropType];
              return (
                <button
                  key={prog.id}
                  onClick={() => toggleProgram(prog.id)}
                  className={`text-left px-4 py-3 rounded-xl border transition-all ${
                    selected
                      ? 'bg-blue-50 border-blue-300 shadow-sm ring-1 ring-blue-200'
                      : 'bg-gray-50 border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}>
                          {selected && <span className="text-white text-xs leading-none">✓</span>}
                        </div>
                        <span className="font-semibold text-sm text-gray-900">{prog.name}</span>
                      </div>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${col.badge} ${col.badgeText} mb-2`}>
                        {CROP_LABELS[prog.cropType]}
                      </span>
                      {prog.chemicals.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {prog.chemicals.map((ch) => (
                            <span key={ch.chemicalId} className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
                              {ch.chemicalName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {(prog.applicationCostPerAcre > 0 || prog.chemicalCostPerAcre > 0) && (
                      <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                        ${(prog.applicationCostPerAcre + prog.chemicalCostPerAcre).toFixed(2)}/ac
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="flex justify-end">
        <button
          onClick={generate}
          disabled={!canGenerate}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm shadow-sm transition-all ${
            canGenerate
              ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md active:scale-95'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Generate Work Order
        </button>
      </div>

      {/* Warning: no program selected */}
      {selectedFields.size > 0 && selectedPrograms.size === 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
          Select at least one chemical program to generate a work order.
        </div>
      )}

      {/* Work Order Results */}
      {workOrders && (
        <div ref={resultsRef} className="space-y-5">
          {/* Low-stock alert banner */}
          {(() => {
            const lowItems = workOrders.flatMap((wo) =>
              wo.chemTotals
                .filter((ct) => {
                  const inv = inventoryMap.get(ct.masterProductId ?? '') ?? inventoryMap.get(ct.chemicalName);
                  if (!inv) return false;
                  const needed = convertUnits(ct.rateUnit, inv.unitType, ct.totalRaw);
                  // Cannot compare across units that will not convert, so this
                  // is not claimed as low stock. Apply blocks on it separately.
                  if (!needed.ok) return false;
                  return needed.value > inv.onHand;
                })
                .map((ct) => ct.chemicalName)
            );
            const unique = [...new Set(lowItems)];
            if (unique.length === 0) return null;
            return (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 text-sm text-amber-800">
                <Package className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <span className="font-semibold">{unique.length} chemical{unique.length !== 1 ? 's' : ''} exceed{unique.length === 1 ? 's' : ''} current on-hand inventory: </span>
                  {unique.join(', ')}
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Spray Work Order</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} · {fmtAcres(selectedAcres)} ac · {selectedPrograms.size} program{selectedPrograms.size !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gray-900 border border-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Work Order PDF
              </button>
              <button
                onClick={handleExportSprayLog}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-700 border border-green-700 rounded-lg hover:bg-green-800 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                Spray Log PDF
              </button>
            </div>
          </div>

          {workOrders.map((wo) => {
            const col = CROP_COLORS[wo.cropType];
            const expanded = expandedCards.has(wo.programId);
            return (
              <div key={wo.programId} className={`border ${col.border} rounded-xl overflow-hidden shadow-sm`}>
                <div className={`${col.section} px-5 py-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <FlaskConical className={`w-4 h-4 ${col.headerText}`} />
                        <h3 className={`font-bold text-lg ${col.headerText}`}>{wo.programName}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge} ${col.badgeText}`}>
                          {CROP_LABELS[wo.cropType]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {wo.fields.map((fe) => (
                          <span
                            key={fe.fieldId}
                            className="inline-block bg-white/70 border border-white/80 rounded-md px-2 py-0.5 text-xs font-medium text-gray-700"
                          >
                            {fe.fieldName} <span className="text-gray-400">({fmtAcres(fe.acreage)} ac)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                      <div>
                        <p className={`text-2xl font-bold ${col.headerText}`}>{fmtAcres(wo.effectiveAcres)}</p>
                        {acreOverrides.has(wo.programId) ? (
                          <p className={`text-xs ${col.headerText} opacity-60`}>
                            overridden · fields: {fmtAcres(wo.totalAcres)} ac
                          </p>
                        ) : (
                          <p className={`text-xs ${col.headerText} opacity-70`}>total acres</p>
                        )}
                      </div>
                      {(wo.applicationCostPerAcre > 0 || wo.chemicalCostPerAcre > 0) && (
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-700">
                            ${(wo.applicationCostPerAcre + wo.chemicalCostPerAcre).toFixed(2)}/ac
                          </p>
                          <p className="text-xs text-gray-400">
                            Chem: ${wo.chemicalCostPerAcre.toFixed(2)} + App: ${wo.applicationCostPerAcre.toFixed(2)}
                          </p>
                        </div>
                      )}
                      {wo.sprayVolumeGalPerAcre !== null && (
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${col.headerText}`}>
                            {wo.sprayVolumeGalPerAcre.toLocaleString('en-US', { maximumFractionDigits: 1 })} gal/ac
                          </p>
                          <p className={`text-xs ${col.headerText} opacity-60`}>
                            {wo.totalSprayVolumeGal!.toLocaleString('en-US', { maximumFractionDigits: 0 })} gal total
                          </p>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditingWorkOrderId(wo.programId)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/60 hover:bg-white/90 border border-white/50 transition-colors ${col.headerText}`}
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleSaveWorkOrder(wo)}
                          disabled={savingProgramId === wo.programId}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 transition-colors disabled:opacity-50"
                        >
                          {savingProgramId === wo.programId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white px-5 py-4">
                  {/* Section header */}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Chemical Mix — {fmtAcres(wo.effectiveAcres)} Combined Acres
                      {(acreOverrides.has(wo.programId) || chemOverrides.has(wo.programId) || sprayVolumeOverrides.has(wo.programId)) && (
                        <span className="ml-1.5 text-amber-600 normal-case font-normal">(modified)</span>
                      )}
                    </p>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 font-semibold text-gray-600 text-xs">Chemical</th>
                        <th className="text-right py-2 font-semibold text-gray-600 text-xs">Rate / Acre</th>
                        <th className="text-right py-2 font-semibold text-gray-600 text-xs">Total Needed</th>
                        <th className="text-right py-2 font-semibold text-gray-600 text-xs">On Hand</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wo.chemTotals.map((ct, i) => {
                        const inv = inventoryMap.get(ct.masterProductId ?? '') ?? inventoryMap.get(ct.chemicalName);
                        const onHand = inv?.onHand ?? null;
                        const neededInInvUnit = inv ? convertUnits(ct.rateUnit, inv.unitType, ct.totalRaw) : null;
                        const isLow =
                          onHand !== null && neededInInvUnit !== null && neededInInvUnit.ok && neededInInvUnit.value > onHand;
                        const onHandDisplay = onHand !== null
                          ? `${onHand.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ${inv!.unitType}`
                          : '\u2014';
                        return (
                          <tr key={ct.chemicalId} className={`${isLow ? 'bg-amber-50' : i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                            <td className="py-2.5 px-2 font-medium text-gray-900 rounded-l">
                              <span className="flex items-center gap-1">
                                {ct.chemicalName}
                                {isLow && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right text-gray-600">
                              {ct.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 2 })} {ct.rateUnit}
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold text-gray-900">{ct.totalDisplay}</td>
                            <td className={`py-2.5 px-2 text-right ${isLow ? 'font-semibold text-amber-600' : 'text-gray-500'}`}>{onHandDisplay}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {wo.fields.length > 1 && (
                  <div className="border-t border-gray-100">
                    <button
                      onClick={() => toggleExpandedCard(wo.programId)}
                      className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      <span>Per-Field Breakdown</span>
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    {expanded && (
                      <div className="bg-gray-50 px-5 pb-4 space-y-4 pt-1">
                        {wo.fields.map((fe) => (
                          <div key={fe.fieldId}>
                            <p className="text-xs font-semibold text-gray-700 mb-2">
                              {fe.fieldName}{' '}
                              <span className="font-normal text-gray-400">({fmtAcres(fe.acreage)} ac)</span>
                            </p>
                            <table className="w-full text-xs">
                              <tbody>
                                {fe.chemicals.map((ch) => (
                                  <tr key={ch.chemicalId} className="border-b border-gray-100 last:border-0">
                                    <td className="py-1.5 text-gray-700">{ch.chemicalName}</td>
                                    <td className="py-1.5 text-right text-gray-500">
                                      {ch.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 2 })} {ch.rateUnit}/ac
                                    </td>
                                    <td className="py-1.5 text-right font-semibold text-gray-900 pl-4">{ch.totalDisplay}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {crossTotals.length > 0 && workOrders.length > 1 && (
            <div className="bg-gray-900 rounded-xl px-5 py-5 text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
                Full Spray Day — Combined Chemical Totals
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {crossTotals.map((ct) => (
                  <div key={ct.chemicalId} className="bg-gray-800 rounded-lg px-4 py-3">
                    <p className="text-xs text-gray-400 mb-1 leading-snug">{ct.chemicalName}</p>
                    <p className="text-xl font-bold text-white">{ct.totalDisplay}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved Work Orders */}
      <SavedWorkOrdersList
        workOrders={savedWorkOrders}
        loading={savedLoading}
        onView={(wo) => setViewingSavedWo(wo)}
        onDelete={handleDeleteSavedWorkOrder}
        onApply={handleApplyWorkOrder}
        onUnapply={handleUnapplyWorkOrder}
        onGenerateSprayLogs={handleGenerateSprayLogs}
        applyingId={applyingId}
      />

      {/* Master edit modal */}
      {editingWorkOrder && (
        <WorkOrderEditModal
          workOrder={editingWorkOrder}
          acreOverrideActive={acreOverrides.has(editingWorkOrder.programId)}
          sprayVolActive={sprayVolumeOverrides.has(editingWorkOrder.programId)}
          chemOverrideActive={chemOverrides.has(editingWorkOrder.programId)}
          farmId={farmId}
          computePreviewTotals={computePreviewTotals}
          onSave={handleSaveWorkOrderOverrides}
          onClose={() => setEditingWorkOrderId(null)}
        />
      )}

      {/* Saved work order detail modal */}
      {viewingSavedWo && (
        <WorkOrderDetailModal
          workOrder={viewingSavedWo}
          onApply={(wo) => { handleApplyWorkOrder(wo); setViewingSavedWo(null); }}
          onUnapply={(wo) => { handleUnapplyWorkOrder(wo); setViewingSavedWo(null); }}
          onClose={() => setViewingSavedWo(null)}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import {
  X,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  RotateCcw,
  Save,
} from 'lucide-react';
import type { WorkOrderResult, ChemicalItem } from '../hooks/useSprayPlanner';

const RATE_UNITS = ['fl oz', 'pt', 'qt', 'gal', 'oz', 'lbs', 'lb'] as const;

function fmtAcres(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface WorkOrderEditDraft {
  acres: string;
  sprayVol: string;
  chemicals: ChemicalItem[];
}

interface Props {
  workOrder: WorkOrderResult;
  acreOverrideActive: boolean;
  sprayVolActive: boolean;
  chemOverrideActive: boolean;
  computePreviewTotals: (chems: ChemicalItem[], effectiveAcres: number) => Array<ChemicalItem & { totalDisplay: string }>;
  onSave: (programId: string, acres: number | null, sprayVol: number | null, chemicals: ChemicalItem[] | null) => void;
  onClose: () => void;
}

export function WorkOrderEditModal({
  workOrder: wo,
  acreOverrideActive,
  sprayVolActive,
  chemOverrideActive,
  computePreviewTotals,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<WorkOrderEditDraft>(() => ({
    acres: fmtAcres(wo.effectiveAcres),
    sprayVol: wo.sprayVolumeGalPerAcre?.toString() ?? '',
    chemicals: wo.chemTotals.map((ct) => ({
      chemicalId: ct.chemicalId,
      chemicalName: ct.chemicalName,
      epaRegNumber: ct.epaRegNumber,
      ratePerAcre: ct.ratePerAcre,
      rateUnit: ct.rateUnit,
      pricePerUnit: ct.pricePerUnit,
      priceUnit: ct.priceUnit,
      itemNotes: ct.itemNotes,
    })),
  }));

  const [dragState, setDragState] = useState<{ fromIdx: number } | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const previewAcres = (() => {
    const v = parseFloat(draft.acres);
    return !isNaN(v) && v > 0 ? v : wo.effectiveAcres;
  })();

  function updateChem(idx: number, patch: Partial<ChemicalItem>) {
    setDraft((prev) => ({
      ...prev,
      chemicals: prev.chemicals.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  }

  function deleteChem(idx: number) {
    setDraft((prev) => ({
      ...prev,
      chemicals: prev.chemicals.filter((_, i) => i !== idx),
    }));
  }

  function addChem() {
    const newItem: ChemicalItem = {
      chemicalId: `custom-${crypto.randomUUID()}`,
      chemicalName: '',
      epaRegNumber: null,
      ratePerAcre: 0,
      rateUnit: 'fl oz',
      pricePerUnit: 0,
      priceUnit: 'fl oz',
      itemNotes: null,
    };
    setDraft((prev) => ({ ...prev, chemicals: [...prev.chemicals, newItem] }));
  }

  function moveChem(fromIdx: number, toIdx: number) {
    if (toIdx < 0 || toIdx >= draft.chemicals.length) return;
    setDraft((prev) => {
      const updated = [...prev.chemicals];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      return { ...prev, chemicals: updated };
    });
  }

  function resetAcres() {
    setDraft((prev) => ({ ...prev, acres: fmtAcres(wo.totalAcres) }));
  }

  function resetSprayVol() {
    setDraft((prev) => ({ ...prev, sprayVol: '' }));
  }

  function resetChemicals() {
    setDraft((prev) => ({
      ...prev,
      chemicals: wo.chemTotals.map((ct) => ({
        chemicalId: ct.chemicalId,
        chemicalName: ct.chemicalName,
        epaRegNumber: ct.epaRegNumber,
        ratePerAcre: ct.ratePerAcre,
        rateUnit: ct.rateUnit,
        pricePerUnit: ct.pricePerUnit,
        priceUnit: ct.priceUnit,
        itemNotes: ct.itemNotes,
      })),
    }));
  }

  function handleSave() {
    const acresVal = parseFloat(draft.acres);
    const acresOut = !isNaN(acresVal) && acresVal > 0 && acresVal <= 100000 && isFinite(acresVal) ? acresVal : null;

    const sprayVal = parseFloat(draft.sprayVol);
    const sprayOut = !isNaN(sprayVal) && sprayVal > 0 && sprayVal <= 10000 && isFinite(sprayVal) ? sprayVal : null;

    const chemsChanged =
      wo.chemTotals.length !== draft.chemicals.length ||
      wo.chemTotals.some((orig, i) => {
        const d = draft.chemicals[i];
        return (
          orig.chemicalId !== d.chemicalId ||
          orig.ratePerAcre !== d.ratePerAcre ||
          orig.rateUnit !== d.rateUnit ||
          orig.chemicalName !== d.chemicalName
        );
      });
    const chemsOut = chemsChanged ? draft.chemicals : null;

    onSave(wo.programId, acresOut, sprayOut, chemsOut);
    onClose();
  }

  const previewTotals = computePreviewTotals(draft.chemicals, previewAcres);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{wo.programName}</h2>
            <p className="text-sm text-gray-400 mt-0.5">Edit work order details</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Acreage section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Acreage</label>
              {acreOverrideActive && (
                <button
                  onClick={resetAcres}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to field acres ({fmtAcres(wo.totalAcres)} ac)
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.acres}
                onChange={(e) => setDraft((prev) => ({ ...prev, acres: e.target.value }))}
                className="w-36 px-3 py-2 text-right font-semibold text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
              <span className="text-sm text-gray-500 font-medium">acres</span>
              {parseFloat(draft.acres) !== wo.totalAcres && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  field total: {fmtAcres(wo.totalAcres)} ac
                </span>
              )}
            </div>
          </div>

          {/* Spray volume section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spray Volume</label>
              {sprayVolActive && (
                <button
                  onClick={resetSprayVol}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                step="0.1"
                value={draft.sprayVol}
                onChange={(e) => setDraft((prev) => ({ ...prev, sprayVol: e.target.value }))}
                placeholder="—"
                className="w-36 px-3 py-2 text-right font-semibold text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
              <span className="text-sm text-gray-500 font-medium">gal / ac</span>
              {parseFloat(draft.sprayVol) > 0 && (
                <span className="text-xs text-gray-500">
                  = {(parseFloat(draft.sprayVol) * previewAcres).toLocaleString('en-US', { maximumFractionDigits: 0 })} gal total
                </span>
              )}
            </div>
          </div>

          {/* Chemical mix section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chemical Mix</label>
              {chemOverrideActive && (
                <button
                  onClick={resetChemicals}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to program defaults
                </button>
              )}
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[20px_1fr_80px_90px_56px_32px] gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span />
                <span className="text-xs font-semibold text-gray-500">Chemical Name</span>
                <span className="text-xs font-semibold text-gray-500 text-right">Rate/Acre</span>
                <span className="text-xs font-semibold text-gray-500 text-center">Unit</span>
                <span />
                <span />
              </div>

              <div className="divide-y divide-gray-50">
                {draft.chemicals.map((ch, idx) => {
                  const isDragOver = dragOverIdx === idx && dragState !== null && dragState.fromIdx !== idx;
                  return (
                    <div
                      key={ch.chemicalId}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        setDragState({ fromIdx: idx });
                        setDragOverIdx(null);
                      }}
                      onDragEnd={() => { setDragState(null); setDragOverIdx(null); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDragEnter={() => {
                        if (dragState !== null && dragState.fromIdx !== idx) setDragOverIdx(idx);
                      }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragState !== null) moveChem(dragState.fromIdx, idx);
                        setDragState(null);
                        setDragOverIdx(null);
                      }}
                      className={`grid grid-cols-[20px_1fr_80px_90px_56px_32px] gap-1.5 items-center px-3 py-2 transition-colors ${
                        isDragOver
                          ? 'border-t-2 border-blue-400 bg-blue-50'
                          : dragState?.fromIdx === idx
                          ? 'opacity-40 bg-gray-100'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-gray-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={ch.chemicalName}
                        onChange={(e) => updateChem(idx, { chemicalName: e.target.value })}
                        placeholder="Chemical name"
                        className="px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white w-full"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={ch.ratePerAcre || ''}
                        onChange={(e) => updateChem(idx, { ratePerAcre: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="px-2 py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white w-full"
                      />
                      <select
                        value={ch.rateUnit}
                        onChange={(e) => updateChem(idx, { rateUnit: e.target.value, priceUnit: e.target.value })}
                        className="px-1 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 bg-white w-full"
                      >
                        {RATE_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => moveChem(idx, idx - 1)}
                          disabled={idx === 0}
                          className="p-1 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-0 disabled:pointer-events-none"
                          title="Move up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => moveChem(idx, idx + 1)}
                          disabled={idx === draft.chemicals.length - 1}
                          className="p-1 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-0 disabled:pointer-events-none"
                          title="Move down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => deleteChem(idx)}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex items-center justify-center"
                        title="Remove chemical"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add row */}
              <div className="px-3 py-2 border-t border-dashed border-gray-200">
                <button
                  onClick={addChem}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium py-1 px-2 hover:bg-blue-50 rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add chemical
                </button>
              </div>
            </div>

            {/* Totals preview */}
            {draft.chemicals.length > 0 && (
              <div className="mt-3 bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Totals Preview — {fmtAcres(previewAcres)} ac
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {previewTotals.map((ct) => (
                      <tr key={ct.chemicalId}>
                        <td className="py-1 text-gray-600">{ct.chemicalName || <em className="text-gray-300">unnamed</em>}</td>
                        <td className="py-1 text-right text-gray-500">
                          {ct.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 3 })} {ct.rateUnit}/ac
                        </td>
                        <td className="py-1 text-right font-bold text-gray-800 pl-4 w-24">{ct.totalDisplay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

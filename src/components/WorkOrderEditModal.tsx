import { useState } from 'react';
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';
import type { WorkOrderResult, ChemicalItem } from '../hooks/useSprayPlanner';
import { ChemicalProductPicker } from './ChemicalProductPicker';
import { ResponsiveModal } from './ResponsiveModal';
import { parseNumberField } from '../lib/mathUtils';

const RATE_UNITS = ['fl oz', 'pt', 'qt', 'gal', 'oz', 'lbs', 'lb'] as const;

function fmtAcres(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/*
 * Mobile-first sizing, scoped so the desktop form keeps its density (MOB-2's rule).
 * ROW_ICON_BUTTON is 44px on a phone and the original p-1 from sm: up.
 */
const ROW_ICON_BUTTON = 'w-11 h-11 sm:w-auto sm:h-auto sm:p-1 flex items-center justify-center rounded transition-colors';
const HEADER_LINK = 'flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0';

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
  farmId: string | null;
  computePreviewTotals: (chems: ChemicalItem[], effectiveAcres: number) => Array<ChemicalItem & { totalDisplay: string }>;
  onSave: (programId: string, acres: number | null, sprayVol: number | null, chemicals: ChemicalItem[] | null) => void;
  onClose: () => void;
}

function chemicalsFrom(wo: WorkOrderResult): ChemicalItem[] {
  return wo.chemTotals.map((ct) => ({
    chemicalId: ct.chemicalId,
    chemicalName: ct.chemicalName,
    epaRegNumber: ct.epaRegNumber,
    // Reset used to copy every field EXCEPT this one, so a reset work order lost its
    // inventory links and Apply then refused it ("link all chemicals"). One copier
    // for both the initial draft and the reset means they cannot drift apart again.
    masterProductId: ct.masterProductId,
    ratePerAcre: ct.ratePerAcre,
    rateUnit: ct.rateUnit,
    pricePerUnit: ct.pricePerUnit,
    priceUnit: ct.priceUnit,
    itemNotes: ct.itemNotes,
  }));
}

export function WorkOrderEditModal({
  workOrder: wo,
  acreOverrideActive,
  sprayVolActive,
  chemOverrideActive,
  farmId,
  computePreviewTotals,
  onSave,
  onClose,
}: Props) {
  /*
   * Acres are seeded WITHOUT a thousands separator. fmtAcres gives "1,050.0", which a
   * type="number" box cannot display — it rendered empty — and parseFloat read back as
   * 1, so saving an untouched 1,050-acre work order overrode it to one acre.
   */
  const [draft, setDraft] = useState<WorkOrderEditDraft>(() => ({
    acres: wo.effectiveAcres.toFixed(1),
    sprayVol: wo.sprayVolumeGalPerAcre?.toString() ?? '',
    chemicals: chemicalsFrom(wo),
  }));
  /*
   * What is typed in each rate box, by chemicalId. The number lives on the chemical;
   * the text has to live separately or "0." collapses to 0 on the keystroke and a rate
   * of 0.5 cannot be typed at all.
   */
  const [rateText, setRateText] = useState<Record<string, string>>({});

  const [dragState, setDragState] = useState<{ fromIdx: number } | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const acresParsed = parseNumberField(draft.acres);
  const sprayParsed = parseNumberField(draft.sprayVol);
  const previewAcres = acresParsed !== null && acresParsed > 0 ? acresParsed : wo.effectiveAcres;

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
    setShowPicker(true);
  }

  function handlePickerSelect(result: { masterProductId: string | null; chemicalName: string; unitType: string }) {
    const newItem: ChemicalItem = {
      chemicalId: result.masterProductId ?? `custom-${crypto.randomUUID()}`,
      chemicalName: result.chemicalName,
      epaRegNumber: null,
      masterProductId: result.masterProductId,
      ratePerAcre: 0,
      rateUnit: result.unitType || 'fl oz',
      pricePerUnit: 0,
      priceUnit: result.unitType || 'fl oz',
      itemNotes: null,
    };
    setDraft((prev) => ({ ...prev, chemicals: [...prev.chemicals, newItem] }));
    setShowPicker(false);
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
    setDraft((prev) => ({ ...prev, acres: wo.totalAcres.toFixed(1) }));
  }

  function resetSprayVol() {
    setDraft((prev) => ({ ...prev, sprayVol: '' }));
  }

  function resetChemicals() {
    setDraft((prev) => ({ ...prev, chemicals: chemicalsFrom(wo) }));
    setRateText({});
  }

  function handleSave() {
    const acresOut = acresParsed !== null && acresParsed > 0 && acresParsed <= 100000 ? acresParsed : null;
    const sprayOut = sprayParsed !== null && sprayParsed > 0 && sprayParsed <= 10000 ? sprayParsed : null;

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
    <ResponsiveModal
      open
      onClose={onClose}
      size="lg"
      title={wo.programName}
      subtitle="Edit work order details"
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      }
    >
      <div className="space-y-6 pb-5">
        {/* Acreage section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="wo-edit-acres" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Acreage</label>
            {acreOverrideActive && (
              <button type="button" onClick={resetAcres} className={HEADER_LINK}>
                <RotateCcw className="w-3 h-3" />
                Reset to field acres ({fmtAcres(wo.totalAcres)} ac)
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="wo-edit-acres"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.acres}
              onChange={(e) => setDraft((prev) => ({ ...prev, acres: e.target.value }))}
              className="w-36 px-3 py-3 sm:py-2 text-right font-semibold text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            <span className="text-sm text-gray-500 font-medium">acres</span>
            {acresParsed !== wo.totalAcres && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                field total: {fmtAcres(wo.totalAcres)} ac
              </span>
            )}
          </div>
        </div>

        {/* Spray volume section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="wo-edit-spray" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spray Volume</label>
            {sprayVolActive && (
              <button type="button" onClick={resetSprayVol} className={HEADER_LINK}>
                <RotateCcw className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="wo-edit-spray"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.sprayVol}
              onChange={(e) => setDraft((prev) => ({ ...prev, sprayVol: e.target.value }))}
              placeholder="—"
              className="w-36 px-3 py-3 sm:py-2 text-right font-semibold text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            <span className="text-sm text-gray-500 font-medium">gal / ac</span>
            {sprayParsed !== null && sprayParsed > 0 && (
              <span className="text-xs text-gray-500">
                = {(sprayParsed * previewAcres).toLocaleString('en-US', { maximumFractionDigits: 0 })} gal total
              </span>
            )}
          </div>
        </div>

        {/* Chemical mix section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chemical Mix</p>
            {chemOverrideActive && (
              <button type="button" onClick={resetChemicals} className={HEADER_LINK}>
                <RotateCcw className="w-3 h-3" />
                Reset to program defaults
              </button>
            )}
          </div>

          {/* No overflow-hidden here: the chemical picker opens BELOW the add row, and a
              clipping container hid it. The header takes the rounded top instead. */}
          <div className="border border-gray-100 rounded-xl">
            {/* Column headers — desktop only; on a phone each row labels itself by layout */}
            <div className="hidden sm:grid grid-cols-[20px_1fr_80px_90px_56px_32px] gap-1.5 px-3 py-2 bg-gray-50 border-b border-gray-100 rounded-t-xl">
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
                    /*
                     * Phone: two lines — name + delete, then rate + unit + reorder — because
                     * five fixed columns (278px + gaps) left the name box ~0px wide in a
                     * 300px sheet. From sm: up, the original single-row grid, unchanged.
                     */
                    className={`flex flex-wrap sm:grid sm:grid-cols-[20px_1fr_80px_90px_56px_32px] gap-1.5 items-center px-3 py-2 transition-colors ${
                      isDragOver
                        ? 'border-t-2 border-blue-400 bg-blue-50'
                        : dragState?.fromIdx === idx
                        ? 'opacity-40 bg-gray-100'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-gray-50/50'
                    }`}
                  >
                    {/* HTML drag does nothing on a touchscreen; the arrows are the phone's reorder */}
                    <div className="hidden sm:flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      aria-label="Chemical name"
                      value={ch.chemicalName}
                      onChange={(e) => updateChem(idx, { chemicalName: e.target.value })}
                      placeholder="Chemical name"
                      className="order-1 sm:order-none w-[calc(100%-3.125rem)] sm:w-full px-2 py-3 sm:py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label="Rate per acre"
                      value={rateText[ch.chemicalId] ?? (ch.ratePerAcre ? String(ch.ratePerAcre) : '')}
                      onChange={(e) => {
                        const text = e.target.value;
                        setRateText((prev) => ({ ...prev, [ch.chemicalId]: text }));
                        updateChem(idx, { ratePerAcre: parseNumberField(text) ?? 0 });
                      }}
                      placeholder="0"
                      className="order-3 sm:order-none flex-1 min-w-0 sm:w-full px-2 py-3 sm:py-1 text-sm text-right border border-gray-200 rounded focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
                    />
                    <select
                      aria-label="Rate unit"
                      value={ch.rateUnit}
                      onChange={(e) => updateChem(idx, { rateUnit: e.target.value, priceUnit: e.target.value })}
                      className="order-4 sm:order-none w-24 sm:w-full px-1 py-3 sm:py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 bg-white"
                    >
                      {RATE_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <div className="order-5 sm:order-none flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveChem(idx, idx - 1)}
                        disabled={idx === 0}
                        className={`${ROW_ICON_BUTTON} text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-0 disabled:pointer-events-none`}
                        title="Move up"
                        aria-label="Move up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveChem(idx, idx + 1)}
                        disabled={idx === draft.chemicals.length - 1}
                        className={`${ROW_ICON_BUTTON} text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-0 disabled:pointer-events-none`}
                        title="Move down"
                        aria-label="Move down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteChem(idx)}
                      className={`order-2 sm:order-none ${ROW_ICON_BUTTON} text-red-400 hover:text-red-600 hover:bg-red-50`}
                      title="Remove chemical"
                      aria-label="Remove chemical"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add row */}
            <div className="px-3 py-2 border-t border-dashed border-gray-200 relative">
              <button
                type="button"
                onClick={addChem}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium min-h-[44px] sm:min-h-0 sm:py-1 px-2 hover:bg-blue-50 rounded transition-colors"
              >
                {farmId ? <Search className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {farmId ? 'Search & add chemical' : 'Add chemical'}
              </button>
              {showPicker && farmId && (
                <ChemicalProductPicker
                  farmId={farmId}
                  onSelect={handlePickerSelect}
                  onClose={() => setShowPicker(false)}
                />
              )}
            </div>
          </div>

          {/* Totals preview */}
          {draft.chemicals.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-xl px-4 py-3 overflow-x-auto">
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
    </ResponsiveModal>
  );
}

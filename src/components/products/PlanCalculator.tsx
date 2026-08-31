import { useMemo, useState } from 'react';
import { Calculator, AlertTriangle } from 'lucide-react';
import { ResponsiveModal } from '../ResponsiveModal';
import {
  computePlanNeed,
  sumSelectedAcres,
  buildPlanNote,
  type PlanField,
  type PlanProgram,
  type PlanNeedLine,
} from '../../lib/fertilizerPlanMath';

/**
 * "These fields, this program — how many tons?" — F-6.
 *
 * The last piece of the fertilizer feature, and deliberately the last: everything
 * before it is a complete tracker, and this only removes hand arithmetic from a
 * screen that already works.
 *
 * Reachable from two places at two scopes, which is the same arithmetic asked
 * twice:
 *   - the load ticket, to fill a delivery from the plan;
 *   - the booking form, to answer "how much do I contract for these fields?".
 *
 * Rates are used as the program writes them. What you edit is the resulting
 * tonnage, after applying — the owner's decision, and it covers the common case
 * (the plan said 23.4, the truck brought 24) without building per-field rate
 * overrides, which would be the largest chunk of UI in the whole feature.
 *
 * PRESENTATION ONLY, AND IN ITS OWN FILE ON PURPOSE. It takes its data as props
 * and imports nothing that reaches Supabase, so it can be rendered with fixtures
 * — which is how this layout was checked at desktop and phone widths without
 * signing in. Splitting only the component was not enough: the import chain
 * still pulled in the Supabase client, which throws at module load when no
 * credentials are present. The loader lives in PlanCalculatorModal.tsx.
 */

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export interface PlanResult {
  lines: PlanNeedLine[];
  /** The plain-language memo, ready to append to the ticket's notes. */
  note: string;
}

export interface CalculatorProps {
  open: boolean;
  onClose: () => void;
  fields: PlanField[];
  programs: PlanProgram[];
  loading: boolean;
  error: string | null;
  /**
   * Restrict the answer to one product. The booking form wants a single number
   * for the product it is already about; the load ticket wants them all.
   */
  productId?: string;
  onApply: (result: PlanResult) => void;
}

export function PlanCalculator({
  open, onClose, fields, programs, loading, error, productId, onApply,
}: CalculatorProps) {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [selectedPrograms, setSelectedPrograms] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const allLines = useMemo(
    () => computePlanNeed(fields, programs, selectedFields, selectedPrograms),
    [fields, programs, selectedFields, selectedPrograms]
  );

  // Scoped to one product for the booking form, but computed over the whole
  // selection first so the filter cannot change the arithmetic.
  const lines = useMemo(
    () => (productId ? allLines.filter((l) => l.productId === productId) : allLines),
    [allLines, productId]
  );

  const acres = useMemo(
    () => sumSelectedAcres(fields, selectedFields),
    [fields, selectedFields]
  );

  const note = useMemo(
    () => buildPlanNote(fields, programs, selectedFields, selectedPrograms),
    [fields, programs, selectedFields, selectedPrograms]
  );

  const allFieldsSelected = fields.length > 0 && selectedFields.size === fields.length;

  const canApply = lines.length > 0 && lines.some((l) => l.total > 0);

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      size="lg"
      title="Work it out from the plan"
      /* Short enough to survive the sheet's truncation on a phone. The detail —
         that rates come from the program as written — is repeated in full at the
         foot of the body, where there is room for it. */
      subtitle="Pick fields and a program"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply({ lines, note })}
            disabled={!canApply}
            className="flex-1 py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-60"
          >
            Use these quantities
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-gray-500">Loading fields and programs…</p>
        ) : (
          <>
            {fields.length === 0 && (
              <p className="py-4 text-sm text-gray-500">
                This season has no fields yet, so there is nothing to work out.
              </p>
            )}
            {fields.length > 0 && programs.length === 0 && (
              <p className="py-4 text-sm text-gray-500">
                This season has no fertilizer programs yet. Build one on the Application
                Programs tab and its rates will be available here.
              </p>
            )}

            {fields.length > 0 && programs.length > 0 && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Fields
                      {selectedFields.size > 0 && (
                        <span className="ml-2 text-gray-500 font-normal">
                          {selectedFields.size} selected · {num(acres)} ac
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedFields(
                          allFieldsSelected ? new Set() : new Set(fields.map((f) => f.id))
                        )
                      }
                      className="py-2 px-3 text-sm font-medium text-green-700 hover:bg-green-50 rounded-lg"
                    >
                      {allFieldsSelected ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {fields.map((field) => (
                      <label
                        key={field.id}
                        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFields.has(field.id)}
                          onChange={() => setSelectedFields((s) => toggle(s, field.id))}
                          className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="grow min-w-0 truncate text-gray-900">{field.name}</span>
                        <span className="text-sm text-gray-500 shrink-0">{num(field.acreage)} ac</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fertilizer programs
                  </label>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {programs.map((program) => (
                      <label
                        key={program.id}
                        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPrograms.has(program.id)}
                          onChange={() => setSelectedPrograms((s) => toggle(s, program.id))}
                          className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="grow min-w-0 truncate text-gray-900">{program.name}</span>
                        <span className="text-sm text-gray-500 shrink-0">
                          {program.items.length} product{program.items.length === 1 ? '' : 's'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2">
                    <Calculator className="w-4 h-4" /> Works out to
                  </p>
                  {lines.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      {productId
                        ? 'None of the selected programs contain this product.'
                        : 'Pick at least one field and one program.'}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {lines.map((line) => (
                        <div key={line.productId}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-gray-900 min-w-0 truncate">{line.productName}</span>
                            <span className="font-semibold text-gray-900 tabular-nums shrink-0">
                              {num(line.total)} {line.unit}
                            </span>
                          </div>
                          {line.issues.length > 0 && (
                            <p className="text-xs text-amber-700 flex items-start gap-1.5 mt-0.5">
                              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>
                                Incomplete — {line.issues.join('; ')}. Fix the product's units
                                before ordering from this figure.
                              </span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {note && <p className="mt-3 text-xs text-gray-500 italic">{note}</p>}
                </div>

                <p className="text-xs text-gray-500">
                  Rates come from the programs as written. Adjust the tonnage after applying
                  if the truck brings something different — that number is what gets saved.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}

import { useState } from 'react';
import { FlaskConical, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { parseNumberField } from '../../lib/mathUtils';
import {
  costResolvedItems,
  rateFromFieldTotal,
  fieldTotalFromRate,
  type FertilizerProductMeta,
  type PlanEditorRow,
  type PlanEditorProgram,
  type PlanSavePayload,
} from '../../lib/fieldFertilizerRates';

/**
 * The per-field fertilizer plan editor — V-5.
 *
 * PRESENTATION ONLY. No Supabase import, so it can be mounted with fixtures and looked at
 * in a browser. That split is not a style preference: every fertilizer step before F-4b
 * shipped with "not opened in a browser" against it, because the components reached the
 * Supabase client at module load and threw on a machine with no credentials. F-6 had to cut
 * `PlanCalculator` out of `PlanCalculatorModal` for exactly this. Loading and saving live in
 * the container.
 *
 * TWO CONTROLS, because §7.2 needs both:
 *
 *   1. WHICH PROGRAMS RUN on this field. A field that got two years of P&K at once gets
 *      none of that pass the next year, and the owner says that is routine. An empty rate
 *      set cannot express it — under replace-wholly, no rows means "inherit", which is
 *      indistinguishable from never having touched it. So the pass comes off the list.
 *
 *   2. THE RATES within a program. Any custom row replaces the program's list wholly.
 *
 * ENTRY IS BY TOTAL (§7.1). The owner reads "8.2 ton on Home 80" off the prescription, so
 * the total is the primary box. The rate is derived and shown beside it, and is editable
 * too, because the stored value is the rate — it is what survives a re-measured field.
 */

export type { PlanEditorRow, PlanEditorProgram, PlanSavePayload };

interface DraftRow {
  product: FertilizerProductMeta;
  rateUnit: string;
  rateText: string;
  totalText: string;
  issue: string | null;
}

interface DraftProgram {
  programId: string;
  programName: string;
  applicationCost: number;
  enabled: boolean;
  isCustom: boolean;
  rows: DraftRow[];
  programRows: PlanEditorRow[];
}

interface Props {
  fieldName: string;
  acreage: number;
  programs: PlanEditorProgram[];
  saving?: boolean;
  error?: string | null;
  /** Set when the field also carries a numeric fertilizer_cost_per_acre override. */
  numericOverride?: number | null;
  onSave: (payload: PlanSavePayload[]) => void;
  onCancel: () => void;
}

function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 10 ** dp) / 10 ** dp);
}

function toDraftRow(row: PlanEditorRow, acreage: number): DraftRow {
  const total = fieldTotalFromRate(
    row.rate, row.rateUnit, row.product.unitType, acreage, row.product.density
  );
  return {
    product: row.product,
    rateUnit: row.rateUnit,
    /*
     * DO NOT shorten this to `formatRate`, however untidy 57.1429 looks beside the V-6
     * grid's 57.14. `handleSave` below emits `parseNumberField(r.rateText)` — the text in
     * the box IS what gets stored — so rounding the display here rounds the stored rate
     * every time the plan is re-saved, whether or not this row was touched.
     *
     * The grid can shorten its display because it saves the exact `cell.rate` it holds in
     * state and never re-reads the box. The asymmetry is deliberate.
     */
    rateText: fmt(row.rate, 4),
    totalText: total.ok ? fmt(total.value, 3) : '',
    issue: total.ok ? null : total.issue,
  };
}

export function FieldFertilizerPlanEditor({
  fieldName,
  acreage,
  programs,
  saving = false,
  error = null,
  numericOverride = null,
  onSave,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<DraftProgram[]>(() =>
    programs.map((p) => ({
      programId: p.programId,
      programName: p.programName,
      applicationCost: p.applicationCost,
      enabled: p.enabled,
      isCustom: p.isCustom,
      rows: p.rows.map((r) => toDraftRow(r, acreage)),
      programRows: p.programRows,
    }))
  );

  const patchProgram = (programId: string, patch: (p: DraftProgram) => DraftProgram) =>
    setDraft((d) => d.map((p) => (p.programId === programId ? patch(p) : p)));

  const editTotal = (programId: string, productId: string, text: string) =>
    patchProgram(programId, (p) => ({
      ...p,
      isCustom: true,
      rows: p.rows.map((r) => {
        if (r.product.productId !== productId) return r;
        const parsed = parseNumberField(text);
        if (parsed === null) return { ...r, totalText: text, rateText: '', issue: null };
        const rate = rateFromFieldTotal(
          parsed, r.product.unitType, r.rateUnit, acreage, r.product.density
        );
        return {
          ...r,
          totalText: text,
          rateText: rate.ok ? fmt(rate.value, 4) : '',
          issue: rate.ok ? null : rate.issue,
        };
      }),
    }));

  const editRate = (programId: string, productId: string, text: string) =>
    patchProgram(programId, (p) => ({
      ...p,
      isCustom: true,
      rows: p.rows.map((r) => {
        if (r.product.productId !== productId) return r;
        const parsed = parseNumberField(text);
        if (parsed === null) return { ...r, rateText: text, totalText: '', issue: null };
        const total = fieldTotalFromRate(
          parsed, r.rateUnit, r.product.unitType, acreage, r.product.density
        );
        return {
          ...r,
          rateText: text,
          totalText: total.ok ? fmt(total.value, 3) : '',
          issue: total.ok ? null : total.issue,
        };
      }),
    }));

  const resetProgram = (programId: string) =>
    patchProgram(programId, (p) => ({
      ...p,
      isCustom: false,
      rows: p.programRows.map((r) => toDraftRow(r, acreage)),
    }));

  /** Live $/ac for one pass, through the same accumulator the field cost will use. */
  const programCost = (p: DraftProgram) => {
    const items = p.rows
      .map((r) => ({
        product: r.product,
        rate: parseNumberField(r.rateText) ?? 0,
        rateUnit: r.rateUnit,
        isCustom: p.isCustom,
      }))
      .filter((i) => Number.isFinite(i.rate));
    return costResolvedItems(items, p.applicationCost);
  };

  const enabledTotal = draft
    .filter((p) => p.enabled)
    .reduce((sum, p) => sum + programCost(p).costPerAcre, 0);

  /*
   * A conversion failure is a NOTE, not a blocker — found by rendering this, 6 Sep.
   *
   * The first version disabled Save whenever any row could not convert. That meant a field
   * carrying one liquid with no density could not have ANY of its rates edited: the Potash
   * figure the owner came to change is perfectly valid and perfectly storable, and it was
   * being held hostage by a different product in a different pass.
   *
   * What actually fails is the DISPLAY of that row's total and its contribution to the
   * cost — the rate itself stores fine, and `costResolvedItems` already reports the
   * shortfall by name so the $/ac presents as an undercount rather than a total (WI-11).
   */
  const conversionNotes = draft
    .filter((p) => p.enabled)
    .flatMap((p) => p.rows.filter((r) => r.issue).map((r) => `${r.product.productName}: ${r.issue}`));

  /*
   * This is the real blocker: a rate box holding something that is not a number. `handleSave`
   * drops those rows, so saving would silently discard what the user typed.
   */
  const blockingIssues = draft
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.rows
        .filter((r) => r.rateText.trim() !== '' && parseNumberField(r.rateText) === null)
        .map((r) => `${r.product.productName}: "${r.rateText}" is not a number`)
    );

  const handleSave = () =>
    onSave(
      draft.map((p) => ({
        programId: p.programId,
        enabled: p.enabled,
        isCustom: p.isCustom,
        costPerAcre: programCost(p).costPerAcre,
        rates: p.isCustom
          ? p.rows
              .map((r, i) => ({
                productId: r.product.productId,
                rate: parseNumberField(r.rateText),
                unit: r.rateUnit,
                sortOrder: i,
              }))
              .filter((r): r is { productId: string; rate: number; unit: string; sortOrder: number } =>
                r.rate !== null)
          : [],
      }))
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Fertilizer plan</h2>
          <p className="text-sm text-gray-600">
            {fieldName} &middot; {acreage} acres
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Fertilizer</div>
          <div className="text-xl font-semibold text-gray-900">
            ${enabledTotal.toFixed(2)}<span className="text-sm font-normal text-gray-500">/acre</span>
          </div>
        </div>
      </div>

      {numericOverride !== null && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            This field also has a typed fertilizer cost of ${numericOverride.toFixed(2)}/acre.
            Saving a plan here replaces it as the source of the field&rsquo;s fertilizer money &mdash;
            two numbers claiming the same cost is how they end up disagreeing.
          </p>
        </div>
      )}

      {draft.map((p) => {
        const cost = programCost(p);
        return (
          <div key={p.programId} className="rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => patchProgram(p.programId, (x) => ({ ...x, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <FlaskConical className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-gray-900">{p.programName}</span>
                {p.isCustom && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Custom rates
                  </span>
                )}
              </label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  {p.enabled ? `$${cost.costPerAcre.toFixed(2)}/acre` : 'not applied'}
                </span>
                {p.isCustom && (
                  <button
                    type="button"
                    onClick={() => resetProgram(p.programId)}
                    className="flex items-center gap-1 rounded px-2 py-3 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-900"
                    title="Discard this field's rates and go back to the program"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset to program
                  </button>
                )}
              </div>
            </div>

            {p.enabled && (
              <div className="overflow-x-auto p-3">
                <table className="w-full min-w-[460px] text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-1 text-left font-medium">Product</th>
                      <th className="pb-1 text-right font-medium">Total for field</th>
                      <th className="pb-1 text-right font-medium">Rate / acre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r) => (
                      <tr key={r.product.productId} className="align-top">
                        <td className="py-1.5 pr-2 text-gray-800">
                          {r.product.productName}
                          {r.issue && (
                            <div className="text-xs text-red-600">{r.issue}</div>
                          )}
                        </td>
                        <td className="py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.totalText}
                              onChange={(e) => editTotal(p.programId, r.product.productId, e.target.value)}
                              aria-label={`Total ${r.product.productName} for ${fieldName}`}
                              className="w-24 rounded border border-gray-300 px-2 py-3 text-right focus:border-transparent focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="w-10 text-left text-xs text-gray-500">
                              {r.product.unitType}
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.rateText}
                              onChange={(e) => editRate(p.programId, r.product.productId, e.target.value)}
                              aria-label={`Rate per acre of ${r.product.productName}`}
                              className="w-24 rounded border border-gray-300 px-2 py-3 text-right focus:border-transparent focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="w-10 text-left text-xs text-gray-500">
                              {r.rateUnit}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {p.rows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-2 text-xs text-gray-400">
                          No products in this program
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {cost.unpricedItems.length > 0 && (
                  <p className="mt-2 text-xs text-red-600">
                    Not costed &mdash; {cost.unpricedItems.join('; ')}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {conversionNotes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">
            These rates save, but cannot be shown as a total or costed:
          </p>
          {conversionNotes.map((i) => (
            <div key={i}>{i}</div>
          ))}
        </div>
      )}

      {blockingIssues.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {blockingIssues.map((i) => (
            <div key={i}>{i}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || blockingIssues.length > 0}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save plan
        </button>
      </div>
    </div>
  );
}

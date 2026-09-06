import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Lock, RotateCcw } from 'lucide-react';
import { parseNumberField } from '../../lib/mathUtils';
import {
  fieldTotalFromRate,
  rateFromFieldTotal,
  type SeasonProgram,
  type FertilizerProductMeta,
} from '../../lib/fieldFertilizerRates';
import {
  changedRows,
  costGridRow,
  costProgramItself,
  gridRowToSavePayload,
  programCells,
  type GridColumn,
  type GridRow,
  type GridSavePayload,
  type RateGridModel,
} from '../../lib/fieldFertilizerGrid';

/**
 * The bulk rate grid — V-6. Fields down, products across, one program at a time.
 *
 * PRESENTATION ONLY, no Supabase import, for the reason V-5's editor records: a component
 * that reaches the client at module load cannot be rendered on a machine with no
 * credentials, and rendering is what has found a real defect in five consecutive rounds of
 * this feature.
 *
 * WHY A GRID AT ALL. §5.3: "Entering 17 fields one modal at a time is the thing that would
 * make this feature go unused; a soil-test spreadsheet already looks like this grid." It is
 * also the CSV import's review surface (§10.7), so it is load bearing twice.
 *
 * ENTRY IS BY TOTAL by default (§7.1) — a prescription summary reports tons on a field, not
 * a rate — with one toggle for the whole grid rather than two boxes per cell, because 32
 * fields × 3 products × 2 boxes is not a screen anybody can read.
 *
 * REPLACE-WHOLLY, MADE VISIBLE. Typing into any cell of an inheriting row makes that whole
 * row the field's own list. The cells already show the program's numbers, so what the user
 * is adopting is on screen before they adopt it — but the row's chip changes from
 * *Program* to *Custom* so that adoption is not silent.
 */

interface DraftCell {
  text: string;
  /** The canonical stored value. Null when the box is blank OR holds something unparseable. */
  rate: number | null;
  rateUnit: string;
  /** The box holds text that is not a number — the save would drop it, so it blocks. */
  bad: boolean;
  /** A conversion that could not be shown as a total. A note, never a blocker. */
  issue: string | null;
}

interface DraftRow extends Omit<GridRow, 'cells'> {
  cells: Record<string, DraftCell>;
}

type EntryMode = 'total' | 'rate';

interface Props {
  seasonLabel: string;
  programs: SeasonProgram[];
  products: ReadonlyMap<string, FertilizerProductMeta>;
  /** The grid for the currently selected program. */
  grid: RateGridModel;
  selectedProgramId: string;
  onSelectProgram: (programId: string) => void;
  saving?: boolean;
  error?: string | null;
  notice?: string | null;
  onSave: (payload: GridSavePayload[]) => void;
  onClose: () => void;
}

function fmt(n: number, dp: number): string {
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 10 ** dp) / 10 ** dp);
}

function cellText(
  rate: number | null,
  rateUnit: string,
  product: FertilizerProductMeta,
  acreage: number,
  mode: EntryMode
): { text: string; issue: string | null } {
  if (rate === null) return { text: '', issue: null };
  if (mode === 'rate') return { text: fmt(rate, 4), issue: null };
  const total = fieldTotalFromRate(rate, rateUnit, product.unitType, acreage, product.density);
  return total.ok ? { text: fmt(total.value, 3), issue: null } : { text: '', issue: total.issue };
}

function toDraft(
  rows: readonly GridRow[],
  columns: readonly GridColumn[],
  mode: EntryMode
): DraftRow[] {
  return rows.map((row) => {
    const cells: Record<string, DraftCell> = {};
    for (const column of columns) {
      const cell = row.cells[column.product.productId];
      const rate = cell?.rate ?? null;
      const rateUnit = cell?.rateUnit ?? column.rateUnit;
      const { text, issue } = cellText(rate, rateUnit, column.product, row.acreage, mode);
      cells[column.product.productId] = { text, rate, rateUnit, bad: false, issue };
    }
    return { ...row, cells };
  });
}

/** A draft row, back in the shape the pure model reasons about. */
function toGridRow(row: DraftRow): GridRow {
  const cells: Record<string, { rate: number | null; rateUnit: string }> = {};
  for (const [productId, cell] of Object.entries(row.cells)) {
    cells[productId] = { rate: cell.rate, rateUnit: cell.rateUnit };
  }
  return { ...row, cells };
}

export function FieldFertilizerRateGrid({
  seasonLabel,
  programs,
  products,
  grid,
  selectedProgramId,
  onSelectProgram,
  saving = false,
  error = null,
  notice = null,
  onSave,
  onClose,
}: Props) {
  const [mode, setMode] = useState<EntryMode>('total');
  const [draft, setDraft] = useState<DraftRow[]>(() => toDraft(grid.rows, grid.columns, 'total'));
  /*
   * Switching passes rebuilds the draft. Done explicitly rather than by remounting on a
   * `key`, so `requestProgram` below can ask before throwing away work — a remount would
   * discard an edit in progress with no warning, and the whole point of this screen is that
   * it holds a lot of typing at once.
   */
  const [draftProgramId, setDraftProgramId] = useState(selectedProgramId);

  if (draftProgramId !== selectedProgramId) {
    setDraftProgramId(selectedProgramId);
    setDraft(toDraft(grid.rows, grid.columns, mode));
  }

  const program = programs.find((p) => p.programId === selectedProgramId);
  const programCost = useMemo(
    () => (program ? costProgramItself(program, products) : 0),
    [program, products]
  );
  const resetCells = useMemo(
    () => (program ? programCells(program, grid.columns) : {}),
    [program, grid.columns]
  );

  const setMode2 = (next: EntryMode) => {
    setMode(next);
    setDraft((rows) =>
      rows.map((row) => {
        const cells: Record<string, DraftCell> = {};
        for (const [productId, cell] of Object.entries(row.cells)) {
          const product = grid.columns.find((c) => c.product.productId === productId)?.product;
          if (!product) continue;
          // A box holding garbage keeps its garbage across a mode flip, so the user can
          // see and fix what they typed rather than have it silently vanish.
          if (cell.bad) { cells[productId] = cell; continue; }
          const { text, issue } = cellText(cell.rate, cell.rateUnit, product, row.acreage, next);
          cells[productId] = { ...cell, text, issue };
        }
        return { ...row, cells };
      })
    );
  };

  const patchRow = (fieldId: string, patch: (r: DraftRow) => DraftRow) =>
    setDraft((rows) => rows.map((r) => (r.fieldId === fieldId ? patch(r) : r)));

  const editCell = (fieldId: string, productId: string, text: string) =>
    patchRow(fieldId, (row) => {
      const column = grid.columns.find((c) => c.product.productId === productId);
      if (!column) return row;
      const cell = row.cells[productId];
      const trimmed = text.trim();

      if (trimmed === '') {
        return {
          ...row,
          // Replace-wholly: touching any cell adopts the whole row.
          isCustom: true,
          cells: { ...row.cells, [productId]: { ...cell, text, rate: null, bad: false, issue: null } },
        };
      }

      const parsed = parseNumberField(text);
      if (parsed === null) {
        return {
          ...row,
          isCustom: true,
          cells: { ...row.cells, [productId]: { ...cell, text, rate: null, bad: true, issue: null } },
        };
      }

      if (mode === 'rate') {
        return {
          ...row,
          isCustom: true,
          cells: { ...row.cells, [productId]: { ...cell, text, rate: parsed, bad: false, issue: null } },
        };
      }

      const rate = rateFromFieldTotal(
        parsed, column.product.unitType, cell.rateUnit, row.acreage, column.product.density
      );
      return {
        ...row,
        isCustom: true,
        cells: {
          ...row.cells,
          [productId]: {
            ...cell,
            text,
            rate: rate.ok ? rate.value : null,
            bad: false,
            issue: rate.ok ? null : rate.issue,
          },
        },
      };
    });

  const resetRow = (fieldId: string) =>
    patchRow(fieldId, (row) => {
      const cells: Record<string, DraftCell> = {};
      for (const column of grid.columns) {
        const source = resetCells[column.product.productId];
        const rate = source?.rate ?? null;
        const rateUnit = source?.rateUnit ?? column.rateUnit;
        const { text, issue } = cellText(rate, rateUnit, column.product, row.acreage, mode);
        cells[column.product.productId] = { text, rate, rateUnit, bad: false, issue };
      }
      return { ...row, isCustom: false, cells };
    });

  const asGridRows = draft.map(toGridRow);
  const changed = changedRows(grid.rows, asGridRows, grid.columns);
  const badCells = draft.flatMap((row) =>
    grid.columns
      .filter((c) => row.cells[c.product.productId]?.bad)
      .map((c) => `${row.fieldName} · ${c.product.productName}: "${row.cells[c.product.productId].text}"`)
  );
  const conversionNotes = [
    ...new Set(
      draft.flatMap((row) =>
        grid.columns
          .map((c) => row.cells[c.product.productId]?.issue)
          .filter((i): i is string => !!i)
      )
    ),
  ];

  const requestProgram = (programId: string) => {
    if (
      changed.length > 0 &&
      !confirm(
        `${changed.length} field${changed.length === 1 ? '' : 's'} on ${grid.programName} ` +
          'have unsaved changes. Switching passes discards them. Continue?'
      )
    ) {
      return;
    }
    onSelectProgram(programId);
  };

  const handleSave = () =>
    onSave(
      changed.map((row) =>
        gridRowToSavePayload(row, selectedProgramId, grid.columns, grid.applicationCost, programCost)
      )
    );

  const rowChip = (row: DraftRow) => {
    if (!row.applies) return <span className="text-xs text-gray-400">not applied</span>;
    if (row.isCustom) {
      return (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
          Custom
        </span>
      );
    }
    return <span className="text-xs text-gray-400">Program</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Field fertilizer rates</h2>
          <p className="text-sm text-gray-600">
            {seasonLabel} &middot; one pass at a time, every field on it
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Program rate</div>
          <div className="text-lg font-semibold text-gray-900">
            ${programCost.toFixed(2)}
            <span className="text-sm font-normal text-gray-500">/acre</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          <span className="sr-only">Fertilizer program</span>
          <select
            value={selectedProgramId}
            onChange={(e) => requestProgram(e.target.value)}
            aria-label="Fertilizer program"
            className="rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
          >
            {programs.map((p) => (
              <option key={p.programId} value={p.programId}>
                {p.programName}
              </option>
            ))}
          </select>
        </label>

        <div className="flex rounded-lg bg-gray-100 p-1">
          {(['total', 'rate'] as EntryMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode2(m)}
              className={`rounded-md px-3 py-3 text-sm font-medium transition-colors ${
                mode === m ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {m === 'total' ? 'Total for field' : 'Rate / acre'}
            </button>
          ))}
        </div>

        <span className="text-sm text-gray-500">
          {changed.length === 0
            ? 'no changes'
            : `${changed.length} field${changed.length === 1 ? '' : 's'} changed`}
        </span>
      </div>

      {grid.rows.length === 0 && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          This season has no fields yet.
        </p>
      )}

      {grid.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600">
                {/*
                  The On checkbox lives INSIDE this cell rather than in a column of its own.
                  At 375 px a separate column plus the field name consumed the entire
                  viewport and not one product cell was reachable without scrolling — the
                  same defect F-4b found, where the column the screen exists for is the one
                  that falls off the right edge. Found by rendering this, 6 Sep.
                */}
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium">
                  Field
                </th>
                {grid.columns.map((c) => (
                  <th key={c.product.productId} className="px-2 py-2 text-right font-medium">
                    <div className="whitespace-nowrap">{c.product.productName}</div>
                    <div className="font-normal text-gray-400">
                      {mode === 'total' ? c.product.unitType : `${c.rateUnit}/ac`}
                      {c.fieldOnly && ' · field only'}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">$/acre</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {draft.map((row) => {
                const cost = costGridRow(toGridRow(row), grid.columns, grid.applicationCost);
                /*
                 * A box holding something that is not a number contributes nothing, so the
                 * row's $/ac would read as a smaller, entirely plausible figure while the
                 * user is still typing — found by rendering this, 6 Sep. The save is
                 * already blocked; the cost is shown as unknown rather than as a number
                 * that quietly leaves a product out.
                 */
                const rowHasBadCell = grid.columns.some(
                  (c) => row.cells[c.product.productId]?.bad
                );
                return (
                  <tr
                    key={row.fieldId}
                    className={`border-t border-gray-100 ${
                      row.readOnly ? 'bg-gray-50' : row.applies ? '' : 'bg-gray-50/60'
                    }`}
                  >
                    <td className="sticky left-0 z-10 max-w-[11rem] bg-inherit px-3 py-1.5 sm:max-w-none">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={row.applies}
                          disabled={row.readOnly}
                          onChange={(e) =>
                            patchRow(row.fieldId, (r) => ({ ...r, applies: e.target.checked }))
                          }
                          aria-label={`Run ${grid.programName} on ${row.fieldName}`}
                          className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 disabled:opacity-40"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2">
                            {row.readOnly && (
                              <Lock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900">{row.fieldName}</span>
                            {rowChip(row)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {row.acreage} ac
                            {row.readOnlyReason && <> &middot; {row.readOnlyReason}</>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {grid.columns.map((c) => {
                      const cell = row.cells[c.product.productId];
                      return (
                        <td key={c.product.productId} className="px-2 py-1.5 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={cell?.text ?? ''}
                            disabled={row.readOnly || !row.applies}
                            onChange={(e) => editCell(row.fieldId, c.product.productId, e.target.value)}
                            aria-label={`${c.product.productName} for ${row.fieldName}`}
                            className={`w-24 rounded border px-2 py-3 text-right disabled:bg-gray-100 disabled:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-blue-500 ${
                              cell?.bad ? 'border-red-400 bg-red-50' : 'border-gray-300'
                            } ${row.isCustom ? 'text-gray-900' : 'text-gray-400'}`}
                          />
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-1.5 text-right text-gray-700">
                      {!row.applies ? '—' : rowHasBadCell ? (
                        <span className="text-red-600">?</span>
                      ) : (
                        `$${cost.costPerAcre.toFixed(2)}`
                      )}
                      {row.applies && !rowHasBadCell && cost.unpricedItems.length > 0 && (
                        <div className="text-xs text-red-600">undercounted</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.isCustom && !row.readOnly && (
                        <button
                          type="button"
                          onClick={() => resetRow(row.fieldId)}
                          title={`Discard ${row.fieldName}'s rates and go back to the program`}
                          className="rounded p-2 text-amber-700 hover:bg-amber-50 hover:text-amber-900"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span className="sr-only">Reset {row.fieldName} to the program</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        A blank box means that product is not applied on that field. Typing in any box makes
        the whole row this field&rsquo;s own list &mdash; the numbers already shown are the
        program&rsquo;s, so what you see is what gets adopted.
        {draft.some((r) => r.readOnly) && (
          <>
            {' '}
            Locked fields have no cost row yet: give them a cost template first, because
            applying one afterwards clears any rates entered here.
          </>
        )}
      </p>

      {grid.issues.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {grid.issues.map((i) => (
            <div key={i}>{i}</div>
          ))}
        </div>
      )}

      {conversionNotes.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="mb-1 font-medium">
              Some rates save but cannot be shown as a total or costed:
            </p>
            {conversionNotes.map((i) => (
              <div key={i}>{i}</div>
            ))}
          </div>
        </div>
      )}

      {badCells.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="mb-1 font-medium">These boxes are not numbers, so nothing can be saved:</p>
          {badCells.map((i) => (
            <div key={i}>{i}</div>
          ))}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {notice}
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
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || changed.length === 0 || badCells.length > 0}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {changed.length === 0
            ? 'Save'
            : `Save ${changed.length} field${changed.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

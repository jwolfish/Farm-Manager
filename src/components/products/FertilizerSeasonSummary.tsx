import type { SeasonCommitment, SeasonTotals } from '../../lib/fertilizerContractMath';

/**
 * The season summary at the top of the Fertilizer Contracts tab — F-4b.
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO GO.
 *
 * Four tiles carrying cross-product totals: contracted, delivered, left to
 * call, delivery fees. The owner called the first three "a munged total of
 * every ton currently booked", and they were worse than unhelpful — they were
 * wrong. Every rollup is expressed in ITS OWN product's unit, so the tiles
 * added Potash in tons to a liquid in gallons. It read plausibly only because
 * every product on this farm happens to be priced by the ton today; the first
 * gallon-priced product would have made it silently nonsense.
 *
 * So the tonnage figures are per product, in that product's unit, and the only
 * cross-product number left in the header is money — which adds up because a
 * dollar is a dollar whatever the product is sold by.
 *
 * Card-first, per the convention for new screens in this feature: no <table>,
 * so it reflows to a stacked list on a phone instead of scrolling sideways.
 */

const num = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export interface SummaryRow {
  productId: string;
  productName: string;
  /** The product's own unit — every figure on the row is in this. */
  unit: string;
  /** Plan need, or null when the product is in no program. */
  plan: number | null;
  contracted: number;
  delivered: number;
  /** Contracted minus delivered. Negative when over-taken, which is allowed. */
  remaining: number;
  unattributedDelivered: number;
  /** Load lines excluded from the rollup because their unit would not convert. */
  issueCount: number;
}

interface Props {
  rows: SummaryRow[];
  commitment: SeasonCommitment;
  season: SeasonTotals;
}

export function FertilizerSeasonSummary({ rows, commitment, season }: Props) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-baseline justify-between gap-x-4 gap-y-1 flex-wrap border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Season summary</h3>
        <p className="text-sm text-gray-600">
          Committed{' '}
          <span className="font-semibold text-gray-900">{money(commitment.committed)}</span>
          {commitment.unpricedContracts > 0 && (
            <span className="text-gray-500">
              {' '}+ {commitment.unpricedContracts} unpriced
            </span>
          )}
          {' · '}
          Delivery fees{' '}
          <span className="font-semibold text-gray-900">{money(season.deliveryFees)}</span>
          <span className="text-gray-500"> across {season.loadCount} loads</span>
        </p>
      </div>

      {/* Column headings earn their space only once the columns are aligned. */}
      <div className="hidden sm:grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-3 px-4 py-2 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <span>Product</span>
        <span className="text-right">Plan</span>
        <span className="text-right">Contracted</span>
        <span className="text-right">Delivered</span>
        <span className="text-right">Left to call</span>
      </div>

      <div className="divide-y divide-gray-100">
        {rows.map((row) => {
          const over = row.remaining < 0;
          return (
            <div
              key={row.productId}
              className="px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] sm:gap-3 sm:items-baseline"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{row.productName}</p>
                <p className="text-xs text-gray-500">
                  per {row.unit}
                  {row.unattributedDelivered > 0 && (
                    <span className="text-amber-700">
                      {' · '}{num(row.unattributedDelivered)} on no booking
                    </span>
                  )}
                  {row.issueCount > 0 && (
                    <span className="text-amber-700">
                      {' · '}{row.issueCount} not counted
                    </span>
                  )}
                </p>
              </div>

              {/* `sm:contents` drops this wrapper at sm+ so the cells become
                  direct children of the grid and align with the headings. */}
              <div className="mt-2 grid grid-cols-4 gap-2 sm:mt-0 sm:contents">
                <Cell label="Plan" value={row.plan === null ? '—' : num(row.plan)} />
                <Cell label="Contracted" value={num(row.contracted)} />
                <Cell label="Delivered" value={num(row.delivered)} />
                {/* Always "Left to call", never "Over contract": the longer
                    label wrapped to two lines on a phone and knocked the row
                    out of alignment, and a red negative already says it. The
                    product card below spells it out in words. */}
                <Cell
                  label="Left to call"
                  value={num(row.remaining)}
                  emphasis
                  tone={over ? 'over' : 'normal'}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One number. The label shows only on a phone, where the columns have collapsed
 * and a bare figure would be unreadable; from `sm:` up the heading carries it.
 */
function Cell({
  label,
  value,
  emphasis,
  tone = 'normal',
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'normal' | 'over';
}) {
  return (
    <div className="sm:text-right">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 sm:hidden">{label}</p>
      <p
        className={`tabular-nums ${emphasis ? 'font-semibold' : ''} ${
          tone === 'over' ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

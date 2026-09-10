/**
 * The field page's sticky total bar — extracted for MOB-3, presentation only.
 *
 * It was an unguarded `grid-cols-3 gap-6` holding three money figures, one of them a
 * `text-3xl`. At 375 px that is about 100 px per column before padding, so the figures wrap
 * mid-number and the third column's left border lands in the middle of nothing.
 *
 * On a phone the two inputs stack as a row each and the total keeps its own line, which is
 * also the reading order: operational plus land makes total.
 */

interface Props {
  operationalTotal: number;
  landTotal: number;
  grandTotal: number;
  operationalPerAcre: number;
  landPerAcre: number;
  perAcre: number;
}

export function FieldCostSummaryBar({
  operationalTotal,
  landTotal,
  grandTotal,
  operationalPerAcre,
  landPerAcre,
  perAcre,
}: Props) {
  return (
    <div className="bg-gray-900 text-white rounded-lg shadow-lg p-4 sm:p-6 mt-6 sticky bottom-4 sm:bottom-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
        <div>
          <div className="text-xs sm:text-sm text-gray-400">Operational Costs</div>
          <div className="text-lg sm:text-2xl font-bold">${operationalTotal.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-1">${operationalPerAcre.toFixed(2)}/acre</div>
        </div>
        <div>
          <div className="text-xs sm:text-sm text-gray-400">Land Costs</div>
          <div className="text-lg sm:text-2xl font-bold">${landTotal.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-1">${landPerAcre.toFixed(2)}/acre</div>
        </div>
        {/*
          Full width under the other two on a phone, so the number that matters most is the
          one that is never cramped. The left border is a desktop-only divider — at 375 px
          it would sit under the row above rather than between two columns.
        */}
        <div className="col-span-2 border-t border-gray-700 pt-3 sm:col-span-1 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <div className="text-xs sm:text-sm text-gray-400">Total Cost</div>
          <div className="text-2xl sm:text-3xl font-bold text-green-400">${grandTotal.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-1">${perAcre.toFixed(2)}/acre</div>
        </div>
      </div>
    </div>
  );
}

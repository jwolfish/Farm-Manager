import { SaleRecord, SeasonSummary } from '../../lib/reportTypes';
import { SalesByMonth } from './sales/SalesByMonth';
import { PricingPerformance } from './sales/PricingPerformance';
import { BuyerBreakdown } from './sales/BuyerBreakdown';

interface Props {
  salesData: SaleRecord[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  loading: boolean;
  error: string | null;
  currentSeasonId: string | null;
}

export function SalesReports({ salesData, seasonData, farmName, loading, error, currentSeasonId }: Props) {
  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-48 mb-3" />
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SalesByMonth salesData={salesData} seasonData={seasonData} farmName={farmName} currentSeasonId={currentSeasonId} />
      <PricingPerformance salesData={salesData} seasonData={seasonData} farmName={farmName} currentSeasonId={currentSeasonId} />
      <BuyerBreakdown salesData={salesData} seasonData={seasonData} farmName={farmName} currentSeasonId={currentSeasonId} />
    </div>
  );
}

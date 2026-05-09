import { Sprout } from 'lucide-react';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { CropSummaryCard } from '../components/dashboard/CropSummaryCard';

interface DashboardProps {
  seasonId: string | null;
}

export function Dashboard({ seasonId }: DashboardProps) {
  const { metrics, salesData, hedgeData, loading } = useDashboardMetrics(seasonId);

  if (!seasonId) {
    return (
      <div className="p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium">Please create or select a season to get started</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading metrics...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Cost per bushel and key metrics by crop</p>
      </div>

      {metrics.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <Sprout className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No fields yet</h3>
          <p className="text-gray-600 mb-4">Create fields to start tracking your crop costs</p>
        </div>
      ) : (
        <div className="space-y-6">
          {metrics.map((metric) => (
            <CropSummaryCard
              key={metric.crop_type}
              metric={metric}
              salesData={salesData[metric.crop_type]}
              hedgeData={hedgeData[metric.crop_type]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

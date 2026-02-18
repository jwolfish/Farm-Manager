import { Wheat } from 'lucide-react';

export function YieldReports() {
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <Wheat className="w-8 h-8 text-green-500 mx-auto mb-3" />
        <p className="font-semibold text-green-800">Yield and Production Reports</p>
        <p className="text-sm text-green-600 mt-1">Coming soon — yield trends, crop-type comparisons, and harvest summaries</p>
      </div>
    </div>
  );
}

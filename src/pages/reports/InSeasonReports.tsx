import { SeedBagRequirements } from './seeds/SeedBagRequirements';

interface Props {
  currentSeasonId: string | null;
  effectiveUserId: string | null;
  loading: boolean;
  error: string | null;
}

export function InSeasonReports({ currentSeasonId, effectiveUserId, loading, error }: Props) {
  if (loading) {
    return (
      <div className="space-y-6">
        {[1].map((i) => (
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
      <SeedBagRequirements currentSeasonId={currentSeasonId} effectiveUserId={effectiveUserId} />
    </div>
  );
}

import { Plus } from 'lucide-react';

/*
 * WI-29b. The five screens App.tsx used to hold as inline JSX, moved out unchanged.
 *
 * This file imports NOTHING from lib/. That is the point of it, not a coincidence:
 * `App.tsx` reaches the Supabase client at module load, so it throws on a machine with
 * no credentials, and these five screens have therefore NEVER been rendered — not once
 * in the whole remediation. It is the same cut F-4b made between the season summary and
 * its container, V-5 between the plan editor and its modal, V-6 between the rate grid
 * and its panel, and R-6 between the error panel and the boundary. Every one of those
 * found a real defect the moment the screen was actually looked at.
 *
 * They are presentation only. Every decision about WHICH of them to show stays in
 * App.tsx, driven by `resolveAppLoadPresentation` (R-1) — a component that decided when
 * to take the screen would be the amplifier coming back by another route.
 */

export interface SeasonFormData {
  year: number;
  name: string;
  importFromSeason: string;
}

export interface SeasonOption {
  id: string;
  name: string;
}

/**
 * R-1's full-screen error. Reached only when a load fails and there is nothing on
 * screen worth keeping; a failure after the first successful render is a banner
 * instead, which is the whole of R-1.
 */
export function AppLoadFailedScreen({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-3">Failed to Load</h2>
        <p className="text-gray-600 mb-6">{message}</p>
        <button
          onClick={onRetry}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

/**
 * The only legitimate full-screen load: a first render, or a farm switch, which
 * legitimately replaces everything.
 *
 * The three-part status line is a diagnostic left over from the random-reload
 * investigation. It is kept deliberately — while that thread is open, a user reporting
 * "it hung on Loading" can say which of the three was stuck, and that is the only
 * information anyone has ever had about it.
 */
export function AppLoadingScreen({
  authLoading,
  dataLoading,
  signedIn,
}: {
  authLoading: boolean;
  dataLoading: boolean;
  signedIn: boolean;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-gray-600 mb-2">Loading...</div>
        <div className="text-xs text-gray-400">
          Auth: {authLoading ? 'checking' : 'ready'} | Data: {dataLoading ? 'loading' : 'ready'} | User:{' '}
          {signedIn ? 'logged in' : 'none'}
        </div>
      </div>
    </div>
  );
}

/**
 * R-5's screen, and the one with a rule attached: it may be shown ONLY for a load that
 * SUCCEEDED and found no seasons. App.tsx gates it on `chrome.emptySeasonsIsConfirmed`
 * for that reason — a failed load reaching here would tell someone with four seasons
 * that they have none.
 */
export function FirstSeasonScreen({
  farmName,
  formData,
  onChange,
  onSubmit,
}: {
  farmName: string | null | undefined;
  formData: SeasonFormData;
  onChange: (next: SeasonFormData) => void;
  onSubmit: (e?: React.FormEvent) => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <Plus className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Welcome to Crop Tracker!</h2>
        <p className="text-gray-600 mb-6">
          {farmName
            ? `Let's create the first growing season for ${farmName}`
            : "Let's create your first growing season to get started tracking costs"}
        </p>

        <form onSubmit={onSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <input
              type="number"
              value={formData.year}
              onChange={(e) => onChange({ ...formData, year: parseInt(e.target.value) })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Season Name (Optional)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onChange({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder={`${formData.year} Growing Season`}
            />
          </div>
          <button
            type="submit"
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            Create Season
          </button>
        </form>
      </div>
    </div>
  );
}

/** The same form reached deliberately from the season picker, plus the import option. */
export function CreateSeasonScreen({
  formData,
  seasons,
  onChange,
  onSubmit,
  onCancel,
}: {
  formData: SeasonFormData;
  seasons: SeasonOption[];
  onChange: (next: SeasonFormData) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Season</h2>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <input
              type="number"
              value={formData.year}
              onChange={(e) => onChange({ ...formData, year: parseInt(e.target.value) })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Season Name (Optional)</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => onChange({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder={`${formData.year} Growing Season`}
            />
          </div>
          {seasons.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Import Data from Previous Season (Optional)
              </label>
              <select
                value={formData.importFromSeason}
                onChange={(e) => onChange({ ...formData, importFromSeason: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">Start with empty season</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              {formData.importFromSeason && (
                <p className="text-xs text-gray-500 mt-2">
                  You'll be able to select which items to import and update prices in the next step
                </p>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              {formData.importFromSeason ? 'Continue to Import' : 'Create Season'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Deleting a season cascades to every field, product, program and yield under it. */
export function DeleteSeasonScreen({
  seasonName,
  onConfirm,
  onCancel,
}: {
  seasonName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Delete Season</h2>
        <p className="text-gray-600 mb-6">
          Are you sure you want to delete <strong>{seasonName}</strong>? This will permanently delete all
          associated fields, products, programs, and yields. This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Delete Season
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

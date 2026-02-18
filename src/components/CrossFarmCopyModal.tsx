import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import { supabase } from '../lib/supabase';
import { X, Tractor, Calendar, ArrowRight, AlertTriangle } from 'lucide-react';

interface CrossFarmCopyModalProps {
  currentSeasonId: string;
  onSelectSourceSeason: (sourceSeasonId: string) => void;
  onCancel: () => void;
}

interface FarmOption {
  id: string;
  farmName: string;
}

interface SeasonOption {
  id: string;
  name: string;
  year: number;
}

export function CrossFarmCopyModal({ currentSeasonId, onSelectSourceSeason, onCancel }: CrossFarmCopyModalProps) {
  const { user } = useAuth();
  const { ownedFarms, activeFarm } = useFarm();
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const otherFarms: FarmOption[] = ownedFarms.filter(f => f.id !== activeFarm?.farmId);

  useEffect(() => {
    if (!selectedFarmId) {
      setSeasons([]);
      setSelectedSeasonId(null);
      return;
    }
    loadSeasons(selectedFarmId);
  }, [selectedFarmId]);

  const loadSeasons = async (farmId: string) => {
    setLoadingSeasons(true);
    setSelectedSeasonId(null);
    const { data } = await (supabase as any)
      .from('seasons')
      .select('id, name, year')
      .eq('farm_id', farmId)
      .order('year', { ascending: false });
    setSeasons(data || []);
    setLoadingSeasons(false);
  };

  const handleConfirm = () => {
    if (selectedSeasonId) {
      onSelectSourceSeason(selectedSeasonId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Tractor className="w-5 h-5 text-green-600" />
            <h2 className="text-base font-semibold text-gray-900">Copy from Another Farm</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {otherFarms.length === 0 ? (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 font-medium">No other farms available</p>
              <p className="text-xs text-gray-400 mt-1">You need at least two farms to copy between them.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source Farm
                </label>
                <div className="space-y-2">
                  {otherFarms.map((farm) => (
                    <button
                      key={farm.id}
                      onClick={() => setSelectedFarmId(farm.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                        selectedFarmId === farm.id
                          ? 'border-green-500 bg-green-50 text-green-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <Tractor className={`w-4 h-4 flex-shrink-0 ${selectedFarmId === farm.id ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className="text-sm font-medium truncate">{farm.farmName}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedFarmId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Season
                  </label>
                  {loadingSeasons ? (
                    <div className="text-sm text-gray-400 py-2">Loading seasons...</div>
                  ) : seasons.length === 0 ? (
                    <div className="text-sm text-gray-400 py-2">No seasons found in this farm.</div>
                  ) : (
                    <div className="space-y-2">
                      {seasons.map((season) => (
                        <button
                          key={season.id}
                          onClick={() => setSelectedSeasonId(season.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                            selectedSeasonId === season.id
                              ? 'border-green-500 bg-green-50 text-green-800'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <Calendar className={`w-4 h-4 flex-shrink-0 ${selectedSeasonId === season.id ? 'text-green-600' : 'text-gray-400'}`} />
                          <span className="text-sm font-medium">{season.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedSeasonId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700">
                  You'll be able to choose exactly which products and templates to copy in the next step. Prices can be adjusted before importing.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          {otherFarms.length > 0 && (
            <button
              onClick={handleConfirm}
              disabled={!selectedSeasonId}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 text-gray-700 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

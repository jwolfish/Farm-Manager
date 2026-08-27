import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider, useNotifications } from './contexts/NotificationContext';
import { FarmProvider, useFarm } from './contexts/FarmContext';
import { ToastContainer } from './components/Toast';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Fields } from './pages/Fields';
import { FieldDetail } from './pages/FieldDetail';
import { Products } from './pages/Products';
import { CostTemplates } from './pages/CostTemplates';
import { Yields } from './pages/Yields';
import { SalesTracking } from './pages/SalesTracking';
import { Reports } from './pages/Reports';
import { SprayPlanner } from './pages/SprayPlanner';
import { AccountSettings } from './pages/AccountSettings';
import { FarmSettings } from './pages/FarmSettings';
import { Team } from './pages/Team';
import { DashboardLayout } from './components/DashboardLayout';
import { SeasonImportWizard } from './components/SeasonImportWizard';
import { supabase } from './lib/supabase';
import { fetchSharedFarms, SharedFarm } from './lib/teamMembers';
import { fetchOwnedFarms, createFarm, Farm } from './lib/farms';
import { Plus } from 'lucide-react';
import { useCascadeTaskNotifications } from './hooks/useCascadeTaskNotifications';

interface Season {
  id: string;
  year: number;
  name: string;
  is_active: boolean;
  farm_id?: string | null;
}

const SEASON_LOAD_TIMEOUT_MS = 10000;

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { addNotification } = useNotifications();
  const { activeFarm, ownedFarms, setOwnedFarms, setOwnFarm, setOwnFarmById, setSharedFarm, activeFarmId } = useFarm();
  const wasAuthenticated = useRef(false);
  const loadedForUserIdRef = useRef<string | null>(null);
  const [activePage, setActivePage] = useState<string>(() => {
    return sessionStorage.getItem('activePage') || 'dashboard';
  });
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonFormData, setSeasonFormData] = useState({
    year: new Date().getFullYear(),
    name: '',
    importFromSeason: '',
  });
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [pendingSeasonId, setPendingSeasonId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [sharedFarms, setSharedFarms] = useState<SharedFarm[]>([]);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  useCascadeTaskNotifications(user?.id ?? null);

  const loadSeasonsByFarm = useCallback(async (farmId: string, forUserId: string) => {
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEASON_LOAD_TIMEOUT_MS);
    try {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('farm_id', farmId)
        .order('year', { ascending: false })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) throw error;

      setSeasons(data || []);

      if (data && data.length > 0) {
        const active = data.find((s: Season) => s.is_active) || data[0];
        setCurrentSeason(active);
      } else {
        setCurrentSeason(null);
      }
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (!isAbort) {
        console.error('Error loading seasons:', error);
        setDataLoadError('Could not load seasons. Please check your connection and try again.');
      } else {
        setDataLoadError('Loading seasons timed out. Please try again.');
      }
      setSeasons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSeasons = useCallback(async (forUserId: string) => {
    if (activeFarmId) {
      await loadSeasonsByFarm(activeFarmId, forUserId);
    } else {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('seasons')
          .select('*')
          .eq('user_id', forUserId)
          .order('year', { ascending: false });

        if (error) throw error;
        setSeasons(data || []);
        if (data && data.length > 0) {
          const active = data.find((s: Season) => s.is_active) || data[0];
          setCurrentSeason(active);
        } else {
          setCurrentSeason(null);
        }
      } catch (error) {
        console.error('Error loading seasons:', error);
        setSeasons([]);
      } finally {
        setLoading(false);
      }
    }
  }, [activeFarmId, loadSeasonsByFarm]);

  const loadSharedFarms = useCallback(async () => {
    if (!user) return;
    const farms = await fetchSharedFarms(user.id);
    setSharedFarms(farms);
  }, [user]);

  const loadInitialData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setDataLoadError(null);
    try {
      const [farmsResult, sharedFarmsResult, profileResult] = await Promise.allSettled([
        fetchOwnedFarms(user.id),
        fetchSharedFarms(user.id),
        supabase.from('user_profiles').select('farm_name').eq('id', user.id).maybeSingle(),
      ]);

      if (farmsResult.status === 'rejected') {
        setDataLoadError('Could not load your farms. Please check your connection and try again.');
        setLoading(false);
        return;
      }

      const farms = farmsResult.value;
      const sharedFarmsData = sharedFarmsResult.status === 'fulfilled' ? sharedFarmsResult.value : [];
      const profileData = profileResult.status === 'fulfilled' ? profileResult.value : { data: null };

      if (sharedFarmsResult.status === 'rejected') console.error('Error loading shared farms:', sharedFarmsResult.reason);
      if (profileResult.status === 'rejected') console.error('Error loading profile:', profileResult.reason);

      setSharedFarms(sharedFarmsData);

      let resolvedFarms = farms;

      if (farms.length === 0) {
        const defaultName = profileData.data?.farm_name || 'My Farm';
        const { farm: newFarm } = await createFarm(user.id, defaultName);
        if (newFarm) {
          resolvedFarms = [newFarm];
        }
      }

      setOwnedFarms(resolvedFarms);

      if (resolvedFarms.length > 0) {
        const firstFarm = resolvedFarms[0];
        setOwnFarmById(user.id, firstFarm);
        await loadSeasonsByFarm(firstFarm.id, user.id);
      } else {
        setOwnFarm(user.id, null, profileData.data?.farm_name ?? null);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      setDataLoadError('Something went wrong loading your account. Please try again.');
      setLoading(false);
    }
  }, [user, setOwnedFarms, setOwnFarmById, setOwnFarm, loadSeasonsByFarm]);

  useEffect(() => {
    if (user) {
      wasAuthenticated.current = true;
      if (loadedForUserIdRef.current !== user.id) {
        loadedForUserIdRef.current = user.id;
        loadInitialData();
      }
    } else if (!authLoading) {
      loadedForUserIdRef.current = null;
      setLoading(false);
    }
  }, [user?.id, authLoading, loadInitialData]);

  const handleNavigate = (page: string) => {
    sessionStorage.setItem('activePage', page);
    setActivePage(page);
  };

  const handleSeasonChange = async (seasonId: string) => {
    const season = seasons.find((s) => s.id === seasonId);
    if (season) {
      setCurrentSeason(season);

      if (user && activeFarm?.isOwn !== false) {
        const { error } = await supabase.rpc('set_active_season', { p_season_id: seasonId });
        if (error) console.error('set_active_season failed:', error);
      }
    }
  };

  const handleCreateSeason = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    try {
      const name = seasonFormData.name || `${seasonFormData.year} Growing Season`;

      const insertData: any = {
        user_id: user.id,
        year: seasonFormData.year,
        name,
        is_active: seasons.length === 0,
      };

      if (activeFarmId) {
        insertData.farm_id = activeFarmId;
      }

      const { data, error } = await supabase
        .from('seasons')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      const defaultEquipmentRates = (['corn', 'soybeans', 'wheat'] as const).map((crop, i) => ({
        season_id: data.id,
        user_id: user.id,
        crop_type: crop,
        rate_per_acre: [185.0, 155.0, 145.0][i],
        source: 'Iowa Custom Rate Survey 2026',
        is_overridden: false,
      }));

      await supabase.from('equipment_rates').insert(defaultEquipmentRates);

      if (seasonFormData.importFromSeason) {
        setPendingSeasonId(data.id);
        setShowImportWizard(true);
        setShowSeasonForm(false);
      } else {
        setSeasonFormData({ year: new Date().getFullYear(), name: '', importFromSeason: '' });
        setShowSeasonForm(false);
        if (activeFarmId) {
          await loadSeasonsByFarm(activeFarmId, user.id);
        } else {
          await loadSeasons(user.id);
        }
        setCurrentSeason(data as Season);
      }
    } catch (error) {
      console.error('Error creating season:', error);
      alert('Error creating season. Please try again.');
    }
  };

  const handleImportComplete = async () => {
    const importedSeasonId = pendingSeasonId;
    setShowImportWizard(false);
    setPendingSeasonId(null);
    setSeasonFormData({ year: new Date().getFullYear(), name: '', importFromSeason: '' });
    if (user) {
      if (activeFarmId) {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        );
        const controller = new AbortController();
        const dataPromise = supabase
          .from('seasons')
          .select('*')
          .eq('farm_id', activeFarmId)
          .order('year', { ascending: false })
          .abortSignal(controller.signal);
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const { data, error } = await Promise.race([dataPromise, timeoutPromise]) as any;
          clearTimeout(timeoutId);
          if (!error && data) {
            setSeasons(data);
            if (importedSeasonId) {
              const season = data.find((s: Season) => s.id === importedSeasonId);
              if (season) setCurrentSeason(season);
            }
          }
        } catch {
          clearTimeout(timeoutId);
          controller.abort();
        }
      } else {
        const { data: freshData } = await supabase
          .from('seasons')
          .select('*')
          .eq('user_id', user.id)
          .order('year', { ascending: false });
        if (freshData) {
          setSeasons(freshData);
          if (importedSeasonId) {
            const season = freshData.find((s: Season) => s.id === importedSeasonId);
            if (season) setCurrentSeason(season);
          } else if (freshData.length > 0) {
            const active = freshData.find((s: Season) => s.is_active) || freshData[0];
            setCurrentSeason(active);
          }
        }
      }
    }
  };

  const handleImportCancel = () => {
    setShowImportWizard(false);
    setPendingSeasonId(null);
    setSeasonFormData({ year: new Date().getFullYear(), name: '', importFromSeason: '' });
    if (user) {
      if (activeFarmId) {
        loadSeasonsByFarm(activeFarmId, user.id);
      } else {
        loadSeasons(user.id);
      }
    }
  };

  const handleDeleteSeason = (season: Season) => {
    setSeasonToDelete(season);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteSeason = async () => {
    if (!seasonToDelete || !user) return;

    try {
      const { error } = await supabase.from('seasons').delete().eq('id', seasonToDelete.id).eq('user_id', user.id);

      if (error) throw error;

      setShowDeleteConfirm(false);
      setSeasonToDelete(null);

      if (currentSeason?.id === seasonToDelete.id) {
        setCurrentSeason(null);
      }

      if (activeFarmId) {
        await loadSeasonsByFarm(activeFarmId, user.id);
      } else {
        await loadSeasons(user.id);
      }
    } catch (error) {
      console.error('Error deleting season:', error);
      alert('Error deleting season. Please try again.');
    }
  };

  const cancelDeleteSeason = () => {
    setShowDeleteConfirm(false);
    setSeasonToDelete(null);
  };

  const handleViewFieldDetail = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    handleNavigate('field-detail');
  };

  const handleBackFromFieldDetail = () => {
    setSelectedFieldId(null);
    handleNavigate('fields');
  };

  const handleSwitchToOwnedFarm = useCallback(async (farm: Farm) => {
    if (!user) return;
    setOwnFarmById(user.id, farm);
    await loadSeasonsByFarm(farm.id, user.id);
    handleNavigate('dashboard');
  }, [user, setOwnFarmById, loadSeasonsByFarm]);

  const handleSwitchToSharedFarm = useCallback(async (farm: SharedFarm) => {
    if (!user) return;

    const { data: accessRecord } = await supabase
      .from('team_members')
      .select('id, status')
      .eq('invited_user_id', user.id)
      .eq('farm_id', farm.farmId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (!accessRecord) {
      addNotification('Access to this farm is no longer available.', 'error');
      await loadSharedFarms();
      return;
    }

    setSharedFarm({
      farmId: farm.farmId,
      ownerId: farm.ownerId,
      ownerName: farm.ownerName,
      farmName: farm.farmName,
      role: farm.role,
    });
    if (farm.farmId) {
      await loadSeasonsByFarm(farm.farmId, farm.ownerId);
    } else {
      await loadSeasons(farm.ownerId);
    }
    handleNavigate('dashboard');
  }, [user, setSharedFarm, addNotification, loadSharedFarms, loadSeasonsByFarm, loadSeasons]);

  const handleSwitchToOwnFarm = useCallback(async () => {
    if (!user) return;
    const farms = ownedFarms.length > 0 ? ownedFarms : await fetchOwnedFarms(user.id);
    if (farms.length > 0) {
      setOwnFarmById(user.id, farms[0]);
      await loadSeasonsByFarm(farms[0].id, user.id);
    } else {
      setOwnFarm(user.id, null, null);
      await loadSeasons(user.id);
    }
    handleNavigate('dashboard');
  }, [user, ownedFarms, setOwnFarmById, setOwnFarm, loadSeasonsByFarm, loadSeasons]);

  const handleFarmCreated = useCallback(async (newFarm: Farm) => {
    if (!user) return;
    const updatedFarms = [...ownedFarms, newFarm];
    setOwnedFarms(updatedFarms);
    setOwnFarmById(user.id, newFarm);
    await loadSeasonsByFarm(newFarm.id, user.id);
    handleNavigate('dashboard');
  }, [user, ownedFarms, setOwnedFarms, setOwnFarmById, loadSeasonsByFarm]);

  const handleFarmsUpdated = useCallback(async () => {
    if (!user) return;
    const farms = await fetchOwnedFarms(user.id);
    setOwnedFarms(farms);
    if (activeFarm?.isOwn && activeFarm.farmId) {
      const updated = farms.find(f => f.id === activeFarm.farmId);
      if (updated) {
        setOwnFarmById(user.id, updated);
      }
    }
  }, [user, ownedFarms, activeFarm, setOwnedFarms, setOwnFarmById]);

  const handleInviteAccepted = useCallback(async () => {
    await loadSharedFarms();
  }, [loadSharedFarms]);

  if (dataLoadError && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Failed to Load</h2>
          <p className="text-gray-600 mb-6">{dataLoadError}</p>
          <button
            onClick={() => {
              setDataLoadError(null);
              loadInitialData();
            }}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 mb-2">Loading...</div>
          <div className="text-xs text-gray-400">
            Auth: {authLoading ? 'checking' : 'ready'} | Data: {loading ? 'loading' : 'ready'} | User: {user ? 'logged in' : 'none'}
          </div>
        </div>
      </div>
    );
  }

  if (!user && !wasAuthenticated.current) {
    return <Auth />;
  }

  if (!user && wasAuthenticated.current) {
    sessionStorage.removeItem('activePage');
    return <Auth />;
  }

  const isOwnFarm = activeFarm?.isOwn !== false;
  const activeRole = activeFarm?.role ?? 'admin';

  if (isOwnFarm && seasons.length === 0 && !showSeasonForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <Plus className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Welcome to Crop Tracker!</h2>
          <p className="text-gray-600 mb-6">
            {activeFarm?.farmName
              ? `Let's create the first growing season for ${activeFarm.farmName}`
              : "Let's create your first growing season to get started tracking costs"}
          </p>

          <form onSubmit={handleCreateSeason} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
              <input
                type="number"
                value={seasonFormData.year}
                onChange={(e) => setSeasonFormData({ ...seasonFormData, year: parseInt(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Season Name (Optional)</label>
              <input
                type="text"
                value={seasonFormData.name}
                onChange={(e) => setSeasonFormData({ ...seasonFormData, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={`${seasonFormData.year} Growing Season`}
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

  if (showSeasonForm) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Season</h2>

          <form onSubmit={handleCreateSeason} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
              <input
                type="number"
                value={seasonFormData.year}
                onChange={(e) => setSeasonFormData({ ...seasonFormData, year: parseInt(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Season Name (Optional)</label>
              <input
                type="text"
                value={seasonFormData.name}
                onChange={(e) => setSeasonFormData({ ...seasonFormData, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder={`${seasonFormData.year} Growing Season`}
              />
            </div>
            {seasons.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Import Data from Previous Season (Optional)
                </label>
                <select
                  value={seasonFormData.importFromSeason}
                  onChange={(e) => setSeasonFormData({ ...seasonFormData, importFromSeason: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Start with empty season</option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
                {seasonFormData.importFromSeason && (
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
                {seasonFormData.importFromSeason ? 'Continue to Import' : 'Create Season'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSeasonForm(false);
                  setSeasonFormData({ year: new Date().getFullYear(), name: '', importFromSeason: '' });
                }}
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

  if (showImportWizard && pendingSeasonId && seasonFormData.importFromSeason && user) {
    return (
      <SeasonImportWizard
        sourceSeasonId={seasonFormData.importFromSeason}
        newSeasonId={pendingSeasonId}
        userId={user.id}
        onComplete={handleImportComplete}
        onCancel={handleImportCancel}
      />
    );
  }

  if (showDeleteConfirm && seasonToDelete) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Delete Season</h2>
          <p className="text-gray-600 mb-6">
            Are you sure you want to delete <strong>{seasonToDelete.name}</strong>? This will permanently delete all
            associated fields, products, programs, and yields. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={confirmDeleteSeason}
              className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Delete Season
            </button>
            <button
              onClick={cancelDeleteSeason}
              className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activePage === 'field-detail' && selectedFieldId && currentSeason?.id) {
    return (
      <FieldDetail
        fieldId={selectedFieldId}
        seasonId={currentSeason.id}
        onBack={handleBackFromFieldDetail}
      />
    );
  }

  return (
    <DashboardLayout
      activePage={activePage}
      onNavigate={handleNavigate}
      currentSeason={currentSeason}
      seasons={seasons}
      onSeasonChange={handleSeasonChange}
      onCreateSeason={isOwnFarm ? () => setShowSeasonForm(true) : undefined}
      onDeleteSeason={isOwnFarm ? handleDeleteSeason : undefined}
      activeFarmContext={activeFarm}
      sharedFarms={sharedFarms}
      onSwitchToOwnedFarm={handleSwitchToOwnedFarm}
      onSwitchToSharedFarm={handleSwitchToSharedFarm}
      onSwitchToOwnFarm={handleSwitchToOwnFarm}
      onFarmCreated={handleFarmCreated}
      onInviteAccepted={handleInviteAccepted}
      activeRole={activeRole}
    >
      {activePage === 'dashboard' && <Dashboard seasonId={currentSeason?.id || null} />}
      {activePage === 'fields' && (
        <Fields
          seasonId={currentSeason?.id || null}
          onViewFieldDetail={handleViewFieldDetail}
          readOnly={activeRole === 'viewer'}
        />
      )}
      {activePage === 'products' && <Products seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
      {activePage === 'templates' && <CostTemplates seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
      {activePage === 'yields' && <Yields seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
      {activePage === 'sales' && <SalesTracking seasonId={currentSeason?.id || null} readOnly={activeRole === 'viewer'} />}
      {activePage === 'spray-planner' && (
        <SprayPlanner
          currentSeasonId={currentSeason?.id || null}
          effectiveUserId={activeFarm ? activeFarm.ownerId ?? user?.id ?? null : user?.id ?? null}
          farmId={activeFarm?.farmId ?? null}
        />
      )}
      {activePage === 'reports' && <Reports currentSeasonId={currentSeason?.id || null} />}
      {activePage === 'account-settings' && isOwnFarm && <AccountSettings />}
      {activePage === 'farm-settings' && isOwnFarm && (
        <FarmSettings onFarmsUpdated={handleFarmsUpdated} />
      )}
      {activePage === 'team' && isOwnFarm && (
        <Team
          onSwitchToFarm={handleSwitchToSharedFarm}
          onSwitchToOwnFarm={handleSwitchToOwnFarm}
          sharedFarms={sharedFarms}
          onRefreshSharedFarms={loadSharedFarms}
        />
      )}
    </DashboardLayout>
  );
}

function AppWithFarm() {
  const { user } = useAuth();
  return (
    <FarmProvider currentUserId={user?.id ?? null}>
      <AppContent />
    </FarmProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppWithFarm />
        <ToastContainer />
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;

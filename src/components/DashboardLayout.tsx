import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFarm } from '../contexts/FarmContext';
import type { ActiveFarm } from '../contexts/FarmContext';
import { Farm, createFarm } from '../lib/farms';
import { SharedFarm } from '../lib/teamMembers';
import { NotificationBell } from './NotificationBell';
import {
  LayoutDashboard,
  Sprout,
  Database,
  BarChart3,
  Users,
  LogOut,
  Wheat,
  ChevronDown,
  Calendar,
  Trash2,
  FileText,
  TrendingUp,
  Settings,
  Eye,
  ArrowLeft,
  Plus,
  User,
  Tractor,
  Check,
  Droplets,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  currentSeason?: { id: string; year: number; name: string } | null;
  seasons?: Array<{ id: string; year: number; name: string }>;
  onSeasonChange?: (seasonId: string) => void;
  onCreateSeason?: () => void;
  onDeleteSeason?: (season: { id: string; year: number; name: string; is_active?: boolean }) => void;
  activeFarmContext?: ActiveFarm | null;
  sharedFarms?: SharedFarm[];
  onSwitchToOwnedFarm?: (farm: Farm) => void;
  onSwitchToSharedFarm?: (farm: SharedFarm) => void;
  onSwitchToOwnFarm?: () => void;
  onFarmCreated?: (farm: Farm) => void;
  onInviteAccepted?: () => void;
  activeRole?: 'admin' | 'editor' | 'viewer';
}

export function DashboardLayout({
  children,
  activePage,
  onNavigate,
  currentSeason,
  seasons = [],
  onSeasonChange,
  onCreateSeason,
  onDeleteSeason,
  activeFarmContext,
  sharedFarms = [],
  onSwitchToOwnedFarm,
  onSwitchToSharedFarm,
  onSwitchToOwnFarm,
  onFarmCreated,
  onInviteAccepted,
  activeRole = 'admin',
}: DashboardLayoutProps) {
  const { user, signOut } = useAuth();
  const { ownedFarms } = useFarm();
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [showFarmDropdown, setShowFarmDropdown] = useState(false);
  const [showCreateFarmModal, setShowCreateFarmModal] = useState(false);
  const [newFarmName, setNewFarmName] = useState('');
  const [creatingFarm, setCreatingFarm] = useState(false);
  const [createFarmError, setCreateFarmError] = useState<string | null>(null);
  const farmDropdownRef = useRef<HTMLDivElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  const isSharedFarm = activeFarmContext?.isOwn === false;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (farmDropdownRef.current && !farmDropdownRef.current.contains(e.target as Node)) {
        setShowFarmDropdown(false);
      }
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(e.target as Node)) {
        setShowSeasonDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'fields', name: 'Fields', icon: Sprout },
    { id: 'products', name: 'Products', icon: Database },
    { id: 'templates', name: 'Cost Templates', icon: FileText },
    { id: 'yields', name: 'Yields', icon: Wheat },
    { id: 'sales', name: 'Sales', icon: TrendingUp },
    { id: 'spray-planner', name: 'Spray Planner', icon: Droplets },
    { id: 'reports', name: 'Reports', icon: BarChart3 },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newFarmName.trim()) return;
    setCreatingFarm(true);
    setCreateFarmError(null);

    const { farm, error } = await createFarm(user.id, newFarmName.trim());
    if (error || !farm) {
      setCreateFarmError(error || 'Failed to create farm');
      setCreatingFarm(false);
      return;
    }

    setNewFarmName('');
    setShowCreateFarmModal(false);
    setShowFarmDropdown(false);
    setCreatingFarm(false);
    onFarmCreated?.(farm);
  };

  const displayFarmName = isSharedFarm
    ? (activeFarmContext?.farmName ?? activeFarmContext?.ownerName ?? 'Shared Farm')
    : (activeFarmContext?.farmName ?? null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {isSharedFarm && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-medium z-10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span>
              Viewing{' '}
              <strong>
                {activeFarmContext?.farmName ?? activeFarmContext?.ownerName ?? 'shared farm'}
              </strong>
              {activeRole === 'viewer' && ' (read-only)'}
              {activeRole === 'editor' && ' (editor)'}
            </span>
          </div>
          <button
            onClick={onSwitchToOwnFarm}
            className="flex items-center gap-1.5 px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-colors text-white text-xs font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to my farm
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-5 pt-5 pb-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${isSharedFarm ? 'bg-amber-500' : 'bg-green-600'}`}>
                  <Wheat className="w-5 h-5 text-white" />
                </div>
                <h1 className="font-bold text-gray-900 text-base leading-tight">Farm Manager</h1>
              </div>
              <NotificationBell onInviteAccepted={onInviteAccepted ?? (() => {})} />
            </div>

            <div ref={farmDropdownRef} className="relative">
              {!isSharedFarm ? (
                <button
                  onClick={() => setShowFarmDropdown((v) => !v)}
                  className="w-full rounded-lg px-3 py-2 bg-green-50 border border-green-200 hover:bg-green-100 transition-colors text-left group"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-green-500">Farm</p>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-bold leading-snug break-words text-green-800 flex-1 min-w-0 truncate">
                      {displayFarmName || 'My Farm'}
                    </p>
                    <ChevronDown className={`w-3.5 h-3.5 text-green-600 flex-shrink-0 transition-transform ${showFarmDropdown ? 'rotate-180' : ''}`} />
                  </div>
                </button>
              ) : (
                <div className="rounded-lg px-3 py-2 bg-amber-50 border border-amber-200">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-amber-500">Farm</p>
                  <p className="text-sm font-bold leading-snug break-words text-amber-800">
                    {displayFarmName}
                  </p>
                </div>
              )}

              {showFarmDropdown && !isSharedFarm && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                  {ownedFarms.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My Farms</p>
                      </div>
                      {ownedFarms.map((farm) => {
                        const isActive = activeFarmContext?.farmId === farm.id;
                        return (
                          <button
                            key={farm.id}
                            onClick={() => {
                              setShowFarmDropdown(false);
                              if (!isActive) onSwitchToOwnedFarm?.(farm);
                            }}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                              isActive ? 'bg-green-50 text-green-700' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="truncate font-medium">{farm.farmName}</span>
                            {isActive && <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {sharedFarms.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 bg-gray-50 border-t border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shared With Me</p>
                      </div>
                      {sharedFarms.map((farm) => (
                        <button
                          key={farm.invitationId}
                          onClick={() => {
                            setShowFarmDropdown(false);
                            onSwitchToSharedFarm?.(farm);
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-amber-50 transition-colors"
                        >
                          <span className="truncate font-medium block">{farm.farmName ?? farm.ownerEmail}</span>
                          <span className="text-xs text-amber-600 capitalize">{farm.role}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-gray-100">
                    <button
                      onClick={() => {
                        setShowFarmDropdown(false);
                        setShowCreateFarmModal(true);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-green-600 hover:bg-green-50 transition-colors font-medium flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add New Farm
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-b border-gray-200 relative" ref={seasonDropdownRef}>
            <button
              onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">
                  {currentSeason ? currentSeason.name : 'Select Season'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>

            {showSeasonDropdown && (
              <div className="absolute left-4 right-4 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <div className="py-1">
                  {seasons.map((season) => (
                    <div
                      key={season.id}
                      className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors ${
                        currentSeason?.id === season.id ? 'bg-green-50' : ''
                      }`}
                    >
                      <button
                        onClick={() => {
                          onSeasonChange?.(season.id);
                          setShowSeasonDropdown(false);
                        }}
                        className={`flex-1 text-left text-sm ${
                          currentSeason?.id === season.id ? 'text-green-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        {season.name}
                      </button>
                      {!isSharedFarm && seasons.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSeason?.(season);
                            setShowSeasonDropdown(false);
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete season"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!isSharedFarm && (
                    <>
                      <div className="border-t border-gray-200 my-1" />
                      <button
                        onClick={() => {
                          onCreateSeason?.();
                          setShowSeasonDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors font-medium"
                      >
                        + Create New Season
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </button>
              );
            })}

            {!isSharedFarm && (
              <button
                onClick={() => onNavigate('team')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activePage === 'team'
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Users className="w-5 h-5" />
                Team
              </button>
            )}
          </nav>

          <div className="p-4 border-t border-gray-200 space-y-1">
            {!isSharedFarm && (
              <>
                <button
                  onClick={() => onNavigate('farm-settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activePage === 'farm-settings'
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Tractor className="w-5 h-5" />
                  Farm Settings
                </button>
                <button
                  onClick={() => onNavigate('account-settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activePage === 'account-settings'
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <User className="w-5 h-5" />
                  Account
                </button>
              </>
            )}
            {isSharedFarm && (
              <button
                onClick={() => onNavigate('account-settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activePage === 'account-settings'
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Settings className="w-5 h-5" />
                Account
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {showCreateFarmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="bg-green-50 p-2 rounded-lg">
                <Tractor className="w-5 h-5 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Add New Farm</h2>
            </div>

            <form onSubmit={handleCreateFarm} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Farm Name</label>
                <input
                  type="text"
                  value={newFarmName}
                  onChange={(e) => setNewFarmName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  placeholder="e.g. North Fields Operation"
                  autoFocus
                  required
                />
              </div>
              {createFarmError && (
                <p className="text-sm text-red-600">{createFarmError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creatingFarm || !newFarmName.trim()}
                  className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {creatingFarm ? 'Creating...' : 'Create Farm'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateFarmModal(false);
                    setNewFarmName('');
                    setCreateFarmError(null);
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

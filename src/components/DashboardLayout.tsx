import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { ActiveFarm } from '../contexts/FarmContext';
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
  onSwitchToOwnFarm?: () => void;
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
  onSwitchToOwnFarm,
  onInviteAccepted,
  activeRole = 'admin',
}: DashboardLayoutProps) {
  const { user, signOut } = useAuth();
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [farmName, setFarmName] = useState<string | null>(null);

  const isSharedFarm = activeFarmContext?.isOwn === false;

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('farm_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.farm_name) setFarmName(data.farm_name);
      });
  }, [user, activePage]);

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'fields', name: 'Fields', icon: Sprout },
    { id: 'products', name: 'Products', icon: Database },
    { id: 'templates', name: 'Cost Templates', icon: FileText },
    { id: 'yields', name: 'Yields', icon: Wheat },
    { id: 'sales', name: 'Sales', icon: TrendingUp },
    { id: 'reports', name: 'Reports', icon: BarChart3 },
  ];

  const ownerNavigation = [
    { id: 'team', name: 'Team', icon: Users },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const displayFarmName = isSharedFarm
    ? (activeFarmContext?.farmName ?? activeFarmContext?.ownerName ?? 'Shared Farm')
    : farmName;

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
                <h1 className="font-bold text-gray-900 text-base leading-tight">Crop Tracker</h1>
              </div>
              <NotificationBell onInviteAccepted={onInviteAccepted ?? (() => {})} />
            </div>
            {displayFarmName ? (
              <div className={`rounded-lg px-3 py-2 ${isSharedFarm ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${isSharedFarm ? 'text-amber-500' : 'text-green-500'}`}>Farm</p>
                <p className={`text-sm font-bold leading-snug break-words ${isSharedFarm ? 'text-amber-800' : 'text-green-800'}`}>
                  {displayFarmName}
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 px-1">Cost Management</p>
            )}
          </div>

          <div className="p-4 border-b border-gray-200 relative">
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

            {!isSharedFarm && ownerNavigation.map((item) => {
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
          </nav>

          <div className="p-4 border-t border-gray-200 space-y-1">
            {!isSharedFarm && (
              <button
                onClick={() => onNavigate('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activePage === 'settings'
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Settings className="w-5 h-5" />
                Settings
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
    </div>
  );
}

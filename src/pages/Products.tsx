import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Package, Droplet, FlaskConical, Layers, Copy } from 'lucide-react';
import type { CropType } from '../lib/database.types';
import { FertilizerPrograms } from '../components/FertilizerPrograms';
import { ChemicalPrograms } from '../components/ChemicalPrograms';
import { CrossFarmCopyModal } from '../components/CrossFarmCopyModal';
import { SeasonImportWizard } from '../components/SeasonImportWizard';
import { useFarm } from '../contexts/FarmContext';
import { SeedsTab } from '../components/products/SeedsTab';
import type { SeedVariety } from '../components/products/SeedsTab';
import { FertilizersTab } from '../components/products/FertilizersTab';
import type { FertilizerProduct } from '../components/products/FertilizersTab';
import { ChemicalsTab } from '../components/products/ChemicalsTab';
import type { IndividualChemical } from '../components/products/ChemicalsTab';

interface ProductsProps {
  seasonId: string | null;
  readOnly?: boolean;
}

type ProductType = 'seeds' | 'fertilizers' | 'chemicals' | 'programs';

export function Products({ seasonId, readOnly = false }: ProductsProps) {
  const { user } = useAuth();
  const { ownedFarms } = useFarm();
  const [activeTab, setActiveTab] = useState<ProductType>('seeds');
  const [programType, setProgramType] = useState<'fertilizer' | 'chemical'>('fertilizer');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCrossFarmModal, setShowCrossFarmModal] = useState(false);
  const [crossFarmSourceSeasonId, setCrossFarmSourceSeasonId] = useState<string | null>(null);

  const [seeds, setSeeds] = useState<SeedVariety[]>([]);
  const [fertilizers, setFertilizers] = useState<FertilizerProduct[]>([]);
  const [chemicals, setChemicals] = useState<IndividualChemical[]>([]);

  const loadedTabsRef = useRef<Set<ProductType>>(new Set());
  const loadedKeyRef = useRef<string | null>(null);

  const loadProducts = useCallback(async (options?: { force?: boolean }) => {
    if (!seasonId || !user) return;

    const key = `${seasonId}:${user.id}`;
    if (loadedKeyRef.current !== key) {
      loadedTabsRef.current = new Set();
      loadedKeyRef.current = key;
    }
    if (!options?.force && loadedTabsRef.current.has(activeTab)) return;

    setLoading(true);
    try {
      if (activeTab === 'seeds') {
        const { data } = await supabase
          .from('seed_varieties')
          .select('*')
          .eq('season_id', seasonId)
          .eq('user_id', user.id)
          .order('product_name');
        setSeeds(data || []);
      } else if (activeTab === 'fertilizers') {
        const { data } = await supabase
          .from('fertilizer_products')
          .select('*')
          .eq('season_id', seasonId)
          .eq('user_id', user.id)
          .order('product_name');
        setFertilizers(data || []);
      } else if (activeTab === 'chemicals') {
        const { data } = await supabase
          .from('individual_chemicals')
          .select('*')
          .eq('season_id', seasonId)
          .eq('user_id', user.id)
          .order('chemical_name');
        setChemicals(data || []);
      }
      loadedTabsRef.current.add(activeTab);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }, [seasonId, user, activeTab]);

  useEffect(() => {
    if (seasonId && user) loadProducts();
  }, [seasonId, user, activeTab, loadProducts]);

  const reloadActiveTab = useCallback(() => {
    loadedTabsRef.current.delete(activeTab);
    loadProducts({ force: true });
  }, [activeTab, loadProducts]);

  const reloadAllTabs = useCallback(() => {
    loadedTabsRef.current = new Set();
    loadProducts({ force: true });
  }, [loadProducts]);

  const tabs = [
    { id: 'seeds' as ProductType, name: 'Seed Varieties', icon: Package },
    { id: 'fertilizers' as ProductType, name: 'Fertilizers', icon: Droplet },
    { id: 'chemicals' as ProductType, name: 'Chemicals', icon: FlaskConical },
    { id: 'programs' as ProductType, name: 'Application Programs', icon: Layers },
  ];

  if (!seasonId) {
    return (
      <div className="p-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-800 font-medium">Please create or select a season to manage products</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Product Master Lists</h1>
        <p className="text-gray-600 mt-2">Manage your reusable product libraries</p>
      </div>

      <div className="mb-6 flex items-center gap-2 border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setShowForm(false); }}
              className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {activeTab !== 'programs' && !readOnly && (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add {activeTab === 'seeds' ? 'Seed Variety' : activeTab === 'fertilizers' ? 'Fertilizer' : 'Chemical'}
          </button>
          {ownedFarms.length > 1 && seasonId && (
            <button
              onClick={() => setShowCrossFarmModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Copy className="w-4 h-4" />
              Copy from another farm
            </button>
          )}
        </div>
      )}

      {activeTab === 'seeds' && (
        <SeedsTab seeds={seeds} seasonId={seasonId} onReload={reloadActiveTab} showForm={showForm} onHideForm={() => setShowForm(false)} />
      )}
      {activeTab === 'fertilizers' && (
        <FertilizersTab fertilizers={fertilizers} seasonId={seasonId} onReload={reloadActiveTab} showForm={showForm} onHideForm={() => setShowForm(false)} />
      )}
      {activeTab === 'chemicals' && (
        <ChemicalsTab chemicals={chemicals} seasonId={seasonId} onReload={reloadActiveTab} showForm={showForm} onHideForm={() => setShowForm(false)} />
      )}
      {activeTab === 'programs' && (
        <div className="space-y-6">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setProgramType('fertilizer')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                programType === 'fertilizer' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Fertilizer Programs
            </button>
            <button
              onClick={() => setProgramType('chemical')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                programType === 'chemical' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Chemical Programs
            </button>
          </div>
          {programType === 'fertilizer' && <FertilizerPrograms seasonId={seasonId} />}
          {programType === 'chemical' && <ChemicalPrograms seasonId={seasonId} />}
        </div>
      )}

      {showCrossFarmModal && seasonId && user && (
        <CrossFarmCopyModal
          currentSeasonId={seasonId}
          onSelectSourceSeason={(sourceSeasonId) => {
            setCrossFarmSourceSeasonId(sourceSeasonId);
            setShowCrossFarmModal(false);
          }}
          onCancel={() => setShowCrossFarmModal(false)}
        />
      )}

      {crossFarmSourceSeasonId && seasonId && user && (
        <div className="fixed inset-0 z-50">
          <SeasonImportWizard
            sourceSeasonId={crossFarmSourceSeasonId}
            newSeasonId={seasonId}
            userId={user.id}
            onComplete={() => { setCrossFarmSourceSeasonId(null); reloadAllTabs(); }}
            onCancel={() => setCrossFarmSourceSeasonId(null)}
          />
        </div>
      )}
    </div>
  );
}

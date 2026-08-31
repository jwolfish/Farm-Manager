import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Package, Droplet, FlaskConical, Layers, Copy, ShoppingCart, Truck } from "lucide-react";
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
import { ShoppingListsTab } from '../components/products/ShoppingListsTab';

/*
 * Lazy on purpose, unlike its sibling tabs.
 *
 * The initial bundle is already 475 kB gzipped against WI-22's 300 kB target,
 * and that download — not layout — is what actually makes this app feel bad on
 * rural cell data. Loading a tab nobody has opened would have added ~29 kB to
 * every first paint. The other tabs are eager because they predate this and
 * converting them is WI-22's job, not this feature's.
 */
const FertilizerContractsTab = lazy(() =>
  import('../components/products/FertilizerContractsTab').then((m) => ({
    default: m.FertilizerContractsTab,
  }))
);

interface ProductsProps {
  seasonId: string | null;
  readOnly?: boolean;
}

type ProductType = "seeds" | "fertilizers" | "chemicals" | "programs" | "shopping" | "contracts";

export function Products({ seasonId, readOnly = false }: ProductsProps) {
  const { user } = useAuth();
  const { ownedFarms } = useFarm();
  const [activeTab, setActiveTab] = useState<ProductType>('seeds');
  const [programType, setProgramType] = useState<'fertilizer' | 'chemical'>('fertilizer');
  const [, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCrossFarmModal, setShowCrossFarmModal] = useState(false);
  const [crossFarmSourceSeasonId, setCrossFarmSourceSeasonId] = useState<string | null>(null);

  const [seeds, setSeeds] = useState<SeedVariety[]>([]);
  const [fertilizers, setFertilizers] = useState<FertilizerProduct[]>([]);
  const [chemicals, setChemicals] = useState<IndividualChemical[]>([]);
  /**
   * Priced bookings per fertilizer product. Where there is at least one, the
   * F-3 trigger owns that product's price and the Fertilizers form must not
   * offer to type over it (F-4a fault 5).
   */
  const [pricedBookings, setPricedBookings] = useState<Record<string, number>>({});

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
          .select('*, master_products!master_product_id(on_hand_quantity, unit_type)')
          .eq('season_id', seasonId)
          .order('product_name');
        const enriched = (data || []).map((row: any) => ({
          ...row,
          on_hand_quantity: row.master_products?.on_hand_quantity ?? null,
          master_unit_type: row.master_products?.unit_type ?? null,
        })) as SeedVariety[];
        setSeeds(enriched);
      } else if (activeTab === 'fertilizers') {
        const [productsRes, contractsRes] = await Promise.all([
          supabase
            .from('fertilizer_products')
            .select('*')
            .eq('season_id', seasonId)
            .order('product_name'),
          supabase
            .from('fertilizer_contracts')
            .select('fertilizer_product_id, price_per_unit')
            .eq('season_id', seasonId),
        ]);
        setFertilizers(productsRes.data || []);

        const counts: Record<string, number> = {};
        for (const row of contractsRes.data || []) {
          // Unpriced bookings count as tonnage but leave the price alone, so
          // they must not lock the field.
          if (row.price_per_unit === null) continue;
          counts[row.fertilizer_product_id] = (counts[row.fertilizer_product_id] ?? 0) + 1;
        }
        setPricedBookings(counts);
      } else if (activeTab === 'chemicals') {
        const { data } = await supabase
          .from('individual_chemicals')
          .select('*, master_products!master_product_id(on_hand_quantity, unit_type)')
          .eq('season_id', seasonId)
          .order('chemical_name');
        const enriched = (data || []).map((row: any) => ({
          ...row,
          on_hand_quantity: row.master_products?.on_hand_quantity ?? null,
          master_unit_type: row.master_products?.unit_type ?? null,
        })) as IndividualChemical[];
        setChemicals(enriched);
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

  /*
   * The Contracts tab changes `fertilizer_products.price_per_unit` through the
   * F-3 trigger, and the Fertilizers tab is not mounted at the time, so it has
   * no way to know its cached rows are now wrong. Dropping it from the cache
   * makes the next visit re-read — which is what `reloadAllTabs` already does
   * for the cross-farm copy, only narrower.
   *
   * Found live: Urea reading $550 on the Fertilizers tab against $590 in the
   * database, written the moment a spot buy was saved.
   */
  const invalidateFertilizers = useCallback(() => {
    loadedTabsRef.current.delete('fertilizers');
  }, []);

  const tabs = [
    { id: 'seeds' as ProductType, name: 'Seed Varieties', icon: Package },
    { id: 'fertilizers' as ProductType, name: 'Fertilizers', icon: Droplet },
    { id: 'chemicals' as ProductType, name: 'Chemicals', icon: FlaskConical },
    { id: 'programs' as ProductType, name: 'Application Programs', icon: Layers },
    { id: "shopping" as ProductType, name: "Shopping Lists", icon: ShoppingCart },
    { id: "contracts" as ProductType, name: "Fertilizer Contracts", icon: Truck },
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

      {activeTab !== 'programs' && activeTab !== 'shopping' && activeTab !== 'contracts' && !readOnly && (
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
        <SeedsTab seeds={seeds} seasonId={seasonId} onReload={reloadActiveTab} showForm={showForm} onHideForm={() => setShowForm(false)} readOnly={readOnly} />
      )}
      {activeTab === 'fertilizers' && (
        <FertilizersTab fertilizers={fertilizers} seasonId={seasonId} onReload={reloadActiveTab} showForm={showForm} onHideForm={() => setShowForm(false)} pricedBookings={pricedBookings} />
      )}
      {activeTab === 'chemicals' && (
        <ChemicalsTab chemicals={chemicals} seasonId={seasonId} onReload={reloadActiveTab} showForm={showForm} onHideForm={() => setShowForm(false)} readOnly={readOnly} />
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
      {activeTab === 'shopping' && (
        <ShoppingListsTab seasonId={seasonId} readOnly={readOnly} />
      )}

      {activeTab === 'contracts' && (
        <Suspense fallback={<div className="py-12 text-center text-gray-500">Loading…</div>}>
          <FertilizerContractsTab seasonId={seasonId} readOnly={readOnly} onPricesChanged={invalidateFertilizers} />
        </Suspense>
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

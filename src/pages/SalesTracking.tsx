import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { SalesCommoditySection } from '../components/SalesCommoditySection';
import { HedgeCommoditySection } from '../components/HedgeCommoditySection';
import type { Hedge } from '../components/HedgeCommoditySection';
import type { CropType } from '../lib/database.types';

interface Sale {
  id: string;
  crop_type: CropType;
  sale_date: string;
  delivery_month: string;
  destination: string;
  bushels_sold: number;
  price_per_bushel: number;
  total_revenue: number;
  notes: string | null;
}

interface HedgeRow extends Hedge {
  crop_type: CropType;
}

interface SalesTrackingProps {
  seasonId: string | null;
  readOnly?: boolean;
}

type Tab = 'sales' | 'hedges';

export function SalesTracking({ seasonId, readOnly }: SalesTrackingProps) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<Tab>('sales');
  const [sales, setSales] = useState<Sale[]>([]);
  const [hedges, setHedges] = useState<HedgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (seasonId && user) {
      loadAll();
    }
  }, [seasonId, user?.id]);

  const loadAll = async () => {
    if (!seasonId || !user) return;
    setLoading(true);
    await Promise.all([loadSales(), loadHedges()]);
    setLoading(false);
  };

  const loadSales = async () => {
    if (!seasonId || !user) return;
    const { data, error } = await supabase
      .from('commodity_sales')
      .select('id, crop_type, sale_date, delivery_month, destination, bushels_sold, price_per_bushel, total_revenue, notes')
      .eq('season_id', seasonId)
      .eq('user_id', user.id)
      .order('sale_date', { ascending: false });

    if (error) {
      console.error('Error loading sales:', error);
      addNotification('Failed to load sales data', 'error');
      return;
    }
    setSales(data || []);
  };

  const loadHedges = async () => {
    if (!seasonId || !user) return;
    const { data, error } = await supabase
      .from('commodity_hedges')
      .select('id, crop_type, contract_date, delivery_month, contract_type, broker_elevator, bushels_hedged, futures_price, basis, net_price, notes')
      .eq('season_id', seasonId)
      .eq('user_id', user.id)
      .order('contract_date', { ascending: false });

    if (error) {
      console.error('Error loading hedges:', error);
      addNotification('Failed to load hedge data', 'error');
      return;
    }
    setHedges((data || []) as HedgeRow[]);
  };

  const handleAddSale = async (
    cropType: CropType,
    data: {
      sale_date: string;
      delivery_month: string;
      destination: string;
      bushels_sold: number;
      price_per_bushel: number;
      notes: string;
    }
  ) => {
    if (!seasonId || !user) return;

    const { error } = await supabase
      .from('commodity_sales')
      .insert({
        season_id: seasonId,
        user_id: user.id,
        crop_type: cropType,
        sale_date: data.sale_date,
        delivery_month: data.delivery_month,
        destination: data.destination,
        bushels_sold: data.bushels_sold,
        price_per_bushel: data.price_per_bushel,
        notes: data.notes || null,
      });

    if (error) {
      console.error('Error adding sale:', error);
      addNotification('Failed to add sale', 'error');
      throw error;
    }

    addNotification('Sale added successfully', 'success');
    await loadSales();
  };

  const handleUpdateSale = async (
    saleId: string,
    data: {
      sale_date: string;
      delivery_month: string;
      destination: string;
      bushels_sold: number;
      price_per_bushel: number;
      notes: string;
    }
  ) => {
    const { error } = await supabase
      .from('commodity_sales')
      .update({
        sale_date: data.sale_date,
        delivery_month: data.delivery_month,
        destination: data.destination,
        bushels_sold: data.bushels_sold,
        price_per_bushel: data.price_per_bushel,
        notes: data.notes || null,
      })
      .eq('id', saleId);

    if (error) {
      console.error('Error updating sale:', error);
      addNotification('Failed to update sale', 'error');
      throw error;
    }

    addNotification('Sale updated successfully', 'success');
    await loadSales();
  };

  const handleDeleteSale = async (saleId: string) => {
    const { error } = await supabase
      .from('commodity_sales')
      .delete()
      .eq('id', saleId);

    if (error) {
      console.error('Error deleting sale:', error);
      addNotification('Failed to delete sale', 'error');
      throw error;
    }

    addNotification('Sale deleted', 'success');
    await loadSales();
  };

  const handleAddHedge = async (
    cropType: CropType,
    data: {
      contract_date: string;
      delivery_month: string;
      contract_type: string;
      broker_elevator: string;
      bushels_hedged: number;
      futures_price: number;
      basis: number;
      notes: string;
    }
  ) => {
    if (!seasonId || !user) return;

    const net_price = data.futures_price + data.basis;

    const { error } = await supabase
      .from('commodity_hedges')
      .insert({
        season_id: seasonId,
        user_id: user.id,
        crop_type: cropType,
        contract_date: data.contract_date,
        delivery_month: data.delivery_month,
        contract_type: data.contract_type,
        broker_elevator: data.broker_elevator,
        bushels_hedged: data.bushels_hedged,
        futures_price: data.futures_price,
        basis: data.basis,
        net_price,
        notes: data.notes || null,
      });

    if (error) {
      console.error('Error adding hedge:', error);
      addNotification('Failed to add hedge', 'error');
      throw error;
    }

    addNotification('Hedge added successfully', 'success');
    await loadHedges();
  };

  const handleUpdateHedge = async (
    hedgeId: string,
    data: {
      contract_date: string;
      delivery_month: string;
      contract_type: string;
      broker_elevator: string;
      bushels_hedged: number;
      futures_price: number;
      basis: number;
      notes: string;
    }
  ) => {
    const net_price = data.futures_price + data.basis;

    const { error } = await supabase
      .from('commodity_hedges')
      .update({
        contract_date: data.contract_date,
        delivery_month: data.delivery_month,
        contract_type: data.contract_type,
        broker_elevator: data.broker_elevator,
        bushels_hedged: data.bushels_hedged,
        futures_price: data.futures_price,
        basis: data.basis,
        net_price,
        notes: data.notes || null,
      })
      .eq('id', hedgeId);

    if (error) {
      console.error('Error updating hedge:', error);
      addNotification('Failed to update hedge', 'error');
      throw error;
    }

    addNotification('Hedge updated successfully', 'success');
    await loadHedges();
  };

  const handleDeleteHedge = async (hedgeId: string) => {
    const { error } = await supabase
      .from('commodity_hedges')
      .delete()
      .eq('id', hedgeId);

    if (error) {
      console.error('Error deleting hedge:', error);
      addNotification('Failed to delete hedge', 'error');
      throw error;
    }

    addNotification('Hedge deleted', 'success');
    await loadHedges();
  };

  const salesByCrop = (cropType: CropType) => sales.filter((s) => s.crop_type === cropType);
  const hedgesByCrop = (cropType: CropType) => hedges.filter((h) => h.crop_type === cropType);

  const allTotalBushels = sales.reduce((sum, s) => sum + Number(s.bushels_sold), 0);
  const allTotalRevenue = sales.reduce((sum, s) => sum + Number(s.total_revenue), 0);
  const allHedgedBushels = hedges.reduce((sum, h) => sum + Number(h.bushels_hedged), 0);
  const allHedgedValue = hedges.reduce((sum, h) => sum + Number(h.bushels_hedged) * Number(h.net_price), 0);

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
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTab === 'sales' ? (
            <TrendingUp className="w-7 h-7 text-green-600" />
          ) : (
            <TrendingDown className="w-7 h-7 text-blue-600" />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales & Hedging</h1>
            <p className="text-sm text-gray-600">Track commodity sales and hedge positions</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('sales')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'sales'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Cash Sales
          {sales.length > 0 && (
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'sales' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {sales.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('hedges')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'hedges'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Hedge Positions
          {hedges.length > 0 && (
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'hedges' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {hedges.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'sales' && (
        <>
          {sales.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Sales</div>
                <div className="text-3xl font-bold text-gray-900">{sales.length}</div>
                <div className="text-xs text-gray-500">across all commodities</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Bushels Sold</div>
                <div className="text-3xl font-bold text-gray-900">
                  {allTotalBushels.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-500">all commodities combined</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Sales Revenue</div>
                <div className="text-3xl font-bold text-green-700">
                  ${allTotalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500">all commodities combined</div>
              </div>
            </div>
          )}

          <SalesCommoditySection
            cropType="corn"
            sales={salesByCrop('corn')}
            onAddSale={handleAddSale}
            onUpdateSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
          />
          <SalesCommoditySection
            cropType="soybeans"
            sales={salesByCrop('soybeans')}
            onAddSale={handleAddSale}
            onUpdateSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
          />
          <SalesCommoditySection
            cropType="wheat"
            sales={salesByCrop('wheat')}
            onAddSale={handleAddSale}
            onUpdateSale={handleUpdateSale}
            onDeleteSale={handleDeleteSale}
          />
        </>
      )}

      {activeTab === 'hedges' && (
        <>
          {hedges.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Positions</div>
                <div className="text-3xl font-bold text-gray-900">{hedges.length}</div>
                <div className="text-xs text-gray-500">across all commodities</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Bushels Hedged</div>
                <div className="text-3xl font-bold text-gray-900">
                  {allHedgedBushels.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </div>
                <div className="text-xs text-gray-500">all commodities combined</div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="text-sm font-medium text-gray-600 mb-1">Total Locked-In Value</div>
                <div className="text-3xl font-bold text-blue-700">
                  ${allHedgedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500">at net price</div>
              </div>
            </div>
          )}

          <HedgeCommoditySection
            cropType="corn"
            hedges={hedgesByCrop('corn')}
            onAddHedge={handleAddHedge}
            onUpdateHedge={handleUpdateHedge}
            onDeleteHedge={handleDeleteHedge}
          />
          <HedgeCommoditySection
            cropType="soybeans"
            hedges={hedgesByCrop('soybeans')}
            onAddHedge={handleAddHedge}
            onUpdateHedge={handleUpdateHedge}
            onDeleteHedge={handleDeleteHedge}
          />
          <HedgeCommoditySection
            cropType="wheat"
            hedges={hedgesByCrop('wheat')}
            onAddHedge={handleAddHedge}
            onUpdateHedge={handleUpdateHedge}
            onDeleteHedge={handleDeleteHedge}
          />
        </>
      )}
    </div>
  );
}

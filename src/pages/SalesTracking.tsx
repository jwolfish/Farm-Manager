import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { TrendingUp } from 'lucide-react';
import { SalesCommoditySection } from '../components/SalesCommoditySection';
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

interface SalesTrackingProps {
  seasonId: string | null;
}

export function SalesTracking({ seasonId }: SalesTrackingProps) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (seasonId && user) {
      loadSales();
    }
  }, [seasonId, user?.id]);

  const loadSales = async () => {
    if (!seasonId || !user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('commodity_sales')
        .select('id, crop_type, sale_date, delivery_month, destination, bushels_sold, price_per_bushel, total_revenue, notes')
        .eq('season_id', seasonId)
        .eq('user_id', user.id)
        .order('sale_date', { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error('Error loading sales:', error);
      addNotification('Failed to load sales data', 'error');
    } finally {
      setLoading(false);
    }
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

  const salesByCrop = (cropType: CropType) =>
    sales.filter((s) => s.crop_type === cropType);

  const allTotalBushels = sales.reduce((sum, s) => sum + Number(s.bushels_sold), 0);
  const allTotalRevenue = sales.reduce((sum, s) => sum + Number(s.total_revenue), 0);

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
          <TrendingUp className="w-7 h-7 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Tracking</h1>
            <p className="text-sm text-gray-600">Track commodity sales across your operation</p>
          </div>
        </div>
      </div>

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
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import type { CropType } from '../lib/database.types';
import type { Hedge } from '../components/HedgeCommoditySection';

export interface Sale {
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

export interface HedgeRow extends Hedge {
  crop_type: CropType;
}

export function useSalesTracking(seasonId: string | null) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
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
    data: { sale_date: string; delivery_month: string; destination: string; bushels_sold: number; price_per_bushel: number; notes: string }
  ) => {
    if (!seasonId || !user) return;
    const { error } = await supabase.from('commodity_sales').insert({
      season_id: seasonId,
      user_id: user.id,
      crop_type: cropType,
      ...data,
      notes: data.notes || null,
    });
    if (error) { addNotification('Failed to add sale', 'error'); throw error; }
    addNotification('Sale added successfully', 'success');
    await loadSales();
  };

  const handleUpdateSale = async (
    saleId: string,
    data: { sale_date: string; delivery_month: string; destination: string; bushels_sold: number; price_per_bushel: number; notes: string }
  ) => {
    const { error } = await supabase.from('commodity_sales').update({ ...data, notes: data.notes || null }).eq('id', saleId);
    if (error) { addNotification('Failed to update sale', 'error'); throw error; }
    addNotification('Sale updated successfully', 'success');
    await loadSales();
  };

  const handleDeleteSale = async (saleId: string) => {
    const { error } = await supabase.from('commodity_sales').delete().eq('id', saleId);
    if (error) { addNotification('Failed to delete sale', 'error'); throw error; }
    addNotification('Sale deleted', 'success');
    await loadSales();
  };

  const handleAddHedge = async (
    cropType: CropType,
    data: { contract_date: string; delivery_month: string; contract_type: string; broker_elevator: string; bushels_hedged: number; futures_price: number; basis: number; notes: string }
  ) => {
    if (!seasonId || !user) return;
    const net_price = data.futures_price + data.basis;
    const { error } = await supabase.from('commodity_hedges').insert({
      season_id: seasonId,
      user_id: user.id,
      crop_type: cropType,
      ...data,
      net_price,
      notes: data.notes || null,
    });
    if (error) { addNotification('Failed to add hedge', 'error'); throw error; }
    addNotification('Hedge added successfully', 'success');
    await loadHedges();
  };

  const handleUpdateHedge = async (
    hedgeId: string,
    data: { contract_date: string; delivery_month: string; contract_type: string; broker_elevator: string; bushels_hedged: number; futures_price: number; basis: number; notes: string }
  ) => {
    const net_price = data.futures_price + data.basis;
    const { error } = await supabase.from('commodity_hedges').update({ ...data, net_price, notes: data.notes || null }).eq('id', hedgeId);
    if (error) { addNotification('Failed to update hedge', 'error'); throw error; }
    addNotification('Hedge updated successfully', 'success');
    await loadHedges();
  };

  const handleDeleteHedge = async (hedgeId: string) => {
    const { error } = await supabase.from('commodity_hedges').delete().eq('id', hedgeId);
    if (error) { addNotification('Failed to delete hedge', 'error'); throw error; }
    addNotification('Hedge deleted', 'success');
    await loadHedges();
  };

  const salesByCrop = (cropType: CropType) => sales.filter((s) => s.crop_type === cropType);
  const hedgesByCrop = (cropType: CropType) => hedges.filter((h) => h.crop_type === cropType);

  return {
    sales,
    hedges,
    loading,
    salesByCrop,
    hedgesByCrop,
    handleAddSale,
    handleUpdateSale,
    handleDeleteSale,
    handleAddHedge,
    handleUpdateHedge,
    handleDeleteHedge,
  };
}

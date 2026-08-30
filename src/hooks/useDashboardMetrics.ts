import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { CropType } from '../lib/database.types';

export interface CropMetrics {
  crop_type: CropType;
  total_acres: number;
  avg_cost_per_acre: number;
  avg_yield_per_acre: number | null;
  avg_cost_per_bushel: number | null;
  avg_price_per_bushel: number | null;
  avg_profit_per_acre: number | null;
  total_cost: number;
  total_revenue: number | null;
  total_profit: number | null;
}

export interface SalesData {
  crop_type: CropType;
  total_bushels_sold: number;
  weighted_avg_price: number;
  total_sales_revenue: number;
  sale_count: number;
}

export interface HedgeData {
  crop_type: CropType;
  total_bushels_hedged: number;
  weighted_avg_net_price: number;
  weighted_avg_futures: number;
  weighted_avg_basis: number;
  hedge_count: number;
}

const EMPTY_SALES: Record<CropType, SalesData> = {
  corn: { crop_type: 'corn', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
  soybeans: { crop_type: 'soybeans', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
  wheat: { crop_type: 'wheat', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
};

const EMPTY_HEDGES: Record<CropType, HedgeData> = {
  corn: { crop_type: 'corn', total_bushels_hedged: 0, weighted_avg_net_price: 0, weighted_avg_futures: 0, weighted_avg_basis: 0, hedge_count: 0 },
  soybeans: { crop_type: 'soybeans', total_bushels_hedged: 0, weighted_avg_net_price: 0, weighted_avg_futures: 0, weighted_avg_basis: 0, hedge_count: 0 },
  wheat: { crop_type: 'wheat', total_bushels_hedged: 0, weighted_avg_net_price: 0, weighted_avg_futures: 0, weighted_avg_basis: 0, hedge_count: 0 },
};

export function useDashboardMetrics(seasonId: string | null) {
  const { user } = useAuth();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [metrics, setMetrics] = useState<CropMetrics[]>([]);
  const [salesData, setSalesData] = useState<Record<CropType, SalesData>>(EMPTY_SALES);
  const [hedgeData, setHedgeData] = useState<Record<CropType, HedgeData>>(EMPTY_HEDGES);
  const [loading, setLoading] = useState(true);

  const loadFieldMetrics = async () => {
    if (!seasonId || !user) return;

    const { data: seasonData, error: seasonError } = await supabase
      .from('seasons')
      .select('corn_price_per_bushel, soybeans_price_per_bushel, wheat_price_per_bushel')
      .eq('id', seasonId)
      .maybeSingle();

    if (seasonError) { console.error('Error loading season:', seasonError); return; }

    const { data: fields, error: fieldsError } = await supabase
      .from('fields')
      .select(`*, field_costs (*), field_yields (*)`)
      .eq('season_id', seasonId);

    if (fieldsError) { console.error('Error loading fields:', fieldsError); return; }

    const cropMetrics: Record<CropType, CropMetrics> = {
      corn: { crop_type: 'corn', total_acres: 0, avg_cost_per_acre: 0, avg_yield_per_acre: null, avg_cost_per_bushel: null, avg_price_per_bushel: null, avg_profit_per_acre: null, total_cost: 0, total_revenue: null, total_profit: null },
      soybeans: { crop_type: 'soybeans', total_acres: 0, avg_cost_per_acre: 0, avg_yield_per_acre: null, avg_cost_per_bushel: null, avg_price_per_bushel: null, avg_profit_per_acre: null, total_cost: 0, total_revenue: null, total_profit: null },
      wheat: { crop_type: 'wheat', total_acres: 0, avg_cost_per_acre: 0, avg_yield_per_acre: null, avg_cost_per_bushel: null, avg_price_per_bushel: null, avg_profit_per_acre: null, total_cost: 0, total_revenue: null, total_profit: null },
    };

    fields?.forEach((field) => {
      const crop = field.crop_type as CropType;
      const fieldCost = Array.isArray(field.field_costs) ? field.field_costs[0] : field.field_costs;
      const yieldData = Array.isArray(field.field_yields) ? field.field_yields[0] : field.field_yields;

      cropMetrics[crop].total_acres += Number(field.acreage);

      const landCostPerAcre = Number(field.land_rent_per_acre || 0) + Number(field.property_tax_per_acre || 0);
      const operationalCostPerAcre = fieldCost ? Number(fieldCost.total_cost_per_acre) : 0;
      const totalCostPerAcre = operationalCostPerAcre + landCostPerAcre;

      cropMetrics[crop].total_cost += totalCostPerAcre * Number(field.acreage);

      if (yieldData) {
        const yieldPerAcre = Number(yieldData.yield_bushels_per_acre);
        const pricePerBushel = seasonData?.[`${crop}_price_per_bushel` as keyof typeof seasonData] as number | null;

        if (yieldPerAcre > 0) {
          cropMetrics[crop].avg_yield_per_acre =
            (cropMetrics[crop].avg_yield_per_acre || 0) + yieldPerAcre * Number(field.acreage);

          const costPerBushel = totalCostPerAcre / yieldPerAcre;
          cropMetrics[crop].avg_cost_per_bushel =
            (cropMetrics[crop].avg_cost_per_bushel || 0) + costPerBushel * Number(field.acreage);

          if (pricePerBushel !== null) {
            const revenuePerAcre = yieldPerAcre * pricePerBushel;
            const profitPerAcre = revenuePerAcre - totalCostPerAcre;

            cropMetrics[crop].avg_price_per_bushel =
              (cropMetrics[crop].avg_price_per_bushel || 0) + pricePerBushel * Number(field.acreage);
            cropMetrics[crop].total_revenue =
              (cropMetrics[crop].total_revenue || 0) + revenuePerAcre * Number(field.acreage);
            cropMetrics[crop].total_profit =
              (cropMetrics[crop].total_profit || 0) + profitPerAcre * Number(field.acreage);
          }
        }
      }
    });

    Object.values(cropMetrics).forEach((metric) => {
      if (metric.total_acres > 0) {
        metric.avg_cost_per_acre = metric.total_cost / metric.total_acres;
        if (metric.avg_cost_per_bushel) metric.avg_cost_per_bushel = metric.avg_cost_per_bushel / metric.total_acres;
        if (metric.avg_yield_per_acre) metric.avg_yield_per_acre = metric.avg_yield_per_acre / metric.total_acres;
        if (metric.avg_price_per_bushel) metric.avg_price_per_bushel = metric.avg_price_per_bushel / metric.total_acres;
        if (metric.total_profit) metric.avg_profit_per_acre = metric.total_profit / metric.total_acres;
      }
    });

    setMetrics(Object.values(cropMetrics).filter(m => m.total_acres > 0));
  };

  const loadSalesData = async () => {
    if (!seasonId || !user) return;

    const { data: salesRows, error } = await supabase
      .from('commodity_sales')
      .select('crop_type, bushels_sold, price_per_bushel, total_revenue')
      .eq('season_id', seasonId);

    if (error || !salesRows) return;

    const grouped: Record<CropType, SalesData> = { ...EMPTY_SALES };

    salesRows.forEach((row) => {
      const crop = row.crop_type as CropType;
      grouped[crop] = { ...grouped[crop] };
      grouped[crop].total_bushels_sold += Number(row.bushels_sold);
      grouped[crop].total_sales_revenue += Number(row.total_revenue);
      grouped[crop].sale_count += 1;
    });

    (['corn', 'soybeans', 'wheat'] as CropType[]).forEach((crop) => {
      if (grouped[crop].total_bushels_sold > 0) {
        const weightedSum = salesRows
          .filter(r => r.crop_type === crop)
          .reduce((sum, r) => sum + Number(r.bushels_sold) * Number(r.price_per_bushel), 0);
        grouped[crop].weighted_avg_price = weightedSum / grouped[crop].total_bushels_sold;
      }
    });

    setSalesData(grouped);
  };

  const loadHedgeData = async () => {
    if (!seasonId || !user) return;

    const { data: hedgeRows, error } = await supabase
      .from('commodity_hedges')
      .select('crop_type, bushels_hedged, futures_price, basis, net_price')
      .eq('season_id', seasonId);

    if (error || !hedgeRows) return;

    const grouped: Record<CropType, HedgeData> = {
      corn: { crop_type: 'corn', total_bushels_hedged: 0, weighted_avg_net_price: 0, weighted_avg_futures: 0, weighted_avg_basis: 0, hedge_count: 0 },
      soybeans: { crop_type: 'soybeans', total_bushels_hedged: 0, weighted_avg_net_price: 0, weighted_avg_futures: 0, weighted_avg_basis: 0, hedge_count: 0 },
      wheat: { crop_type: 'wheat', total_bushels_hedged: 0, weighted_avg_net_price: 0, weighted_avg_futures: 0, weighted_avg_basis: 0, hedge_count: 0 },
    };

    hedgeRows.forEach((row) => {
      const crop = row.crop_type as CropType;
      grouped[crop].total_bushels_hedged += Number(row.bushels_hedged);
      grouped[crop].hedge_count += 1;
    });

    (['corn', 'soybeans', 'wheat'] as CropType[]).forEach((crop) => {
      const total = grouped[crop].total_bushels_hedged;
      if (total > 0) {
        const cropRows = hedgeRows.filter(r => r.crop_type === crop);
        grouped[crop].weighted_avg_net_price = cropRows.reduce((s, r) => s + Number(r.bushels_hedged) * Number(r.net_price), 0) / total;
        grouped[crop].weighted_avg_futures = cropRows.reduce((s, r) => s + Number(r.bushels_hedged) * Number(r.futures_price), 0) / total;
        grouped[crop].weighted_avg_basis = cropRows.reduce((s, r) => s + Number(r.bushels_hedged) * Number(r.basis), 0) / total;
      }
    });

    setHedgeData(grouped);
  };

  const loadAll = async () => {
    if (!seasonId || !user) return;
    setLoading(true);
    await Promise.all([loadFieldMetrics(), loadSalesData(), loadHedgeData()]);
    setLoading(false);
  };

  useEffect(() => {
    if (seasonId && user) loadAll();
  }, [seasonId, user?.id]);

  useEffect(() => {
    if (!seasonId || !user) return;

    const debouncedLoad = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => { loadAll(); }, 300);
    };

    const userFilter = `user_id=eq.${user.id}`;
    const channel = supabase
      .channel(`dashboard-updates-${user.id}-${seasonId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fields', filter: `season_id=eq.${seasonId}` }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_costs', filter: userFilter }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_yields', filter: userFilter }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commodity_sales', filter: `season_id=eq.${seasonId}` }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commodity_hedges', filter: `season_id=eq.${seasonId}` }, debouncedLoad)
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [seasonId, user?.id]);

  return { metrics, salesData, hedgeData, loading };
}

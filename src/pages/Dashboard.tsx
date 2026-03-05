import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Sprout, DollarSign, TrendingUp, TrendingDown, Truck } from 'lucide-react';
import type { CropType } from '../lib/database.types';

interface CropMetrics {
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

interface SalesData {
  crop_type: CropType;
  total_bushels_sold: number;
  weighted_avg_price: number;
  total_sales_revenue: number;
  sale_count: number;
}

interface DashboardProps {
  seasonId: string | null;
}

export function Dashboard({ seasonId }: DashboardProps) {
  const { user } = useAuth();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [metrics, setMetrics] = useState<CropMetrics[]>([]);
  const [salesData, setSalesData] = useState<Record<CropType, SalesData>>({
    corn: { crop_type: 'corn', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
    soybeans: { crop_type: 'soybeans', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
    wheat: { crop_type: 'wheat', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (seasonId && user) {
      loadMetrics();
    }
  }, [seasonId, user?.id]);

  useEffect(() => {
    if (!seasonId || !user) return;

    const debouncedLoad = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        loadMetrics();
      }, 300);
    };

    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fields', filter: `season_id=eq.${seasonId}` }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_costs' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_yields' }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commodity_sales' }, debouncedLoad)
      .subscribe();

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [seasonId, user?.id]);

  const loadMetrics = async () => {
    if (!seasonId || !user) return;

    setLoading(true);
    try {
      const { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('corn_price_per_bushel, soybeans_price_per_bushel, wheat_price_per_bushel')
        .eq('id', seasonId)
        .maybeSingle();

      if (seasonError) throw seasonError;

      const { data: fields, error: fieldsError } = await supabase
        .from('fields')
        .select(`
          *,
          field_costs (*),
          field_yields (*)
        `)
        .eq('season_id', seasonId)
        .eq('user_id', user.id);

      if (fieldsError) throw fieldsError;

      const cropMetrics: Record<CropType, CropMetrics> = {
        corn: {
          crop_type: 'corn',
          total_acres: 0,
          avg_cost_per_acre: 0,
          avg_yield_per_acre: null,
          avg_cost_per_bushel: null,
          avg_price_per_bushel: null,
          avg_profit_per_acre: null,
          total_cost: 0,
          total_revenue: null,
          total_profit: null,
        },
        soybeans: {
          crop_type: 'soybeans',
          total_acres: 0,
          avg_cost_per_acre: 0,
          avg_yield_per_acre: null,
          avg_cost_per_bushel: null,
          avg_price_per_bushel: null,
          avg_profit_per_acre: null,
          total_cost: 0,
          total_revenue: null,
          total_profit: null,
        },
        wheat: {
          crop_type: 'wheat',
          total_acres: 0,
          avg_cost_per_acre: 0,
          avg_yield_per_acre: null,
          avg_cost_per_bushel: null,
          avg_price_per_bushel: null,
          avg_profit_per_acre: null,
          total_cost: 0,
          total_revenue: null,
          total_profit: null,
        },
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
          if (metric.avg_cost_per_bushel) {
            metric.avg_cost_per_bushel = metric.avg_cost_per_bushel / metric.total_acres;
          }
          if (metric.avg_yield_per_acre) {
            metric.avg_yield_per_acre = metric.avg_yield_per_acre / metric.total_acres;
          }
          if (metric.avg_price_per_bushel) {
            metric.avg_price_per_bushel = metric.avg_price_per_bushel / metric.total_acres;
          }
          if (metric.total_profit) {
            metric.avg_profit_per_acre = metric.total_profit / metric.total_acres;
          }
        }
      });

      setMetrics(Object.values(cropMetrics).filter(m => m.total_acres > 0));

      const { data: salesRows, error: salesError } = await supabase
        .from('commodity_sales')
        .select('crop_type, bushels_sold, price_per_bushel, total_revenue')
        .eq('season_id', seasonId)
        .eq('user_id', user.id);

      if (!salesError && salesRows) {
        const grouped: Record<CropType, SalesData> = {
          corn: { crop_type: 'corn', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
          soybeans: { crop_type: 'soybeans', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
          wheat: { crop_type: 'wheat', total_bushels_sold: 0, weighted_avg_price: 0, total_sales_revenue: 0, sale_count: 0 },
        };

        salesRows.forEach((row) => {
          const crop = row.crop_type as CropType;
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
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumberWithCommas = (value: number | null, decimals: number = 0) => {
    if (value === null) return 'N/A';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return 'N/A';
    return `$${formatNumberWithCommas(value, 2)}`;
  };

  const formatNumber = (value: number | null, decimals: number = 2) => {
    if (value === null) return 'N/A';
    return formatNumberWithCommas(value, decimals);
  };

  const getCropIcon = (crop: CropType) => {
    return Sprout;
  };

  const getCropColor = (crop: CropType) => {
    switch (crop) {
      case 'corn':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'soybeans':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'wheat':
        return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

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
      <div className="p-8">
        <div className="text-center text-gray-500">Loading metrics...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Cost per bushel and key metrics by crop</p>
      </div>

      {metrics.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <Sprout className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No fields yet</h3>
          <p className="text-gray-600 mb-4">Create fields to start tracking your crop costs</p>
        </div>
      ) : (
        <div className="space-y-6">
          {metrics.map((metric) => {
            const CropIcon = getCropIcon(metric.crop_type);
            const cropColor = getCropColor(metric.crop_type);

            return (
              <div key={metric.crop_type} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className={`px-6 py-4 border-b flex items-center gap-3 ${cropColor}`}>
                  <CropIcon className="w-6 h-6" />
                  <div>
                    <h2 className="text-xl font-bold capitalize">{metric.crop_type}</h2>
                    <p className="text-sm opacity-80">{formatNumber(metric.total_acres, 0)} acres</p>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5 border border-blue-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-900">Cost per Bushel</span>
                        <DollarSign className="w-5 h-5 text-blue-600" />
                      </div>
                      <p className="text-3xl font-bold text-blue-900">
                        {formatCurrency(metric.avg_cost_per_bushel)}
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Cost per Acre</span>
                        <DollarSign className="w-5 h-5 text-gray-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(metric.avg_cost_per_acre)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Including land costs</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Avg Yield</span>
                        <Sprout className="w-5 h-5 text-gray-600" />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatNumber(metric.avg_yield_per_acre)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">Bushels per acre</p>
                    </div>

                    <div className={`rounded-lg p-5 border ${
                      metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0
                        ? 'bg-green-50 border-green-200'
                        : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-medium ${
                          metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0
                            ? 'text-green-900'
                            : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0
                            ? 'text-red-900'
                            : 'text-gray-700'
                        }`}>
                          Profit per Acre
                        </span>
                        {metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0 ? (
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        ) : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0 ? (
                          <TrendingDown className="w-5 h-5 text-red-600" />
                        ) : (
                          <DollarSign className="w-5 h-5 text-gray-600" />
                        )}
                      </div>
                      <p className={`text-2xl font-bold ${
                        metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0
                          ? 'text-green-900'
                          : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0
                          ? 'text-red-900'
                          : 'text-gray-900'
                      }`}>
                        {formatCurrency(metric.avg_profit_per_acre)}
                      </p>
                      <p className={`text-xs mt-1 ${
                        metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0
                          ? 'text-green-700'
                          : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0
                          ? 'text-red-700'
                          : 'text-gray-600'
                      }`}>
                        Revenue - Costs
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-6 border-t border-gray-200">
                    <div>
                      <p className="text-sm text-gray-600">Total Cost</p>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(metric.total_cost)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Bushels Produced</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {metric.avg_yield_per_acre
                          ? formatNumber(metric.avg_yield_per_acre * metric.total_acres, 0)
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Current Avg Price per Bushel</p>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(metric.avg_price_per_bushel)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Revenue</p>
                      <p className="text-lg font-semibold text-gray-900">{formatCurrency(metric.total_revenue)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Profit</p>
                      <p className={`text-lg font-semibold ${
                        metric.total_profit && metric.total_profit > 0
                          ? 'text-green-600'
                          : metric.total_profit && metric.total_profit < 0
                          ? 'text-red-600'
                          : 'text-gray-900'
                      }`}>
                        {formatCurrency(metric.total_profit)}
                      </p>
                    </div>
                  </div>

                  {(() => {
                    const cropSales = salesData[metric.crop_type];
                    const totalProduced = metric.avg_yield_per_acre
                      ? metric.avg_yield_per_acre * metric.total_acres
                      : 0;
                    const bushelsRemaining = totalProduced - cropSales.total_bushels_sold;
                    const percentSold = totalProduced > 0
                      ? (cropSales.total_bushels_sold / totalProduced) * 100
                      : 0;

                    if (cropSales.sale_count === 0 && totalProduced === 0) return null;

                    return (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="flex items-center gap-2 mb-4">
                          <Truck className="w-4 h-4 text-gray-600" />
                          <h4 className="text-sm font-semibold text-gray-700">Sales to Date</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Bushels Sold</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {cropSales.total_bushels_sold > 0
                                ? formatNumber(cropSales.total_bushels_sold, 0)
                                : '0'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Avg Sale Price</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {cropSales.weighted_avg_price > 0
                                ? formatCurrency(cropSales.weighted_avg_price)
                                : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total Sales Revenue</p>
                            <p className="text-lg font-semibold text-green-700">
                              {cropSales.total_sales_revenue > 0
                                ? formatCurrency(cropSales.total_sales_revenue)
                                : '$0.00'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Bushels Remaining</p>
                            <p className={`text-lg font-semibold ${
                              bushelsRemaining > 0 ? 'text-amber-600' : 'text-gray-900'
                            }`}>
                              {totalProduced > 0
                                ? formatNumber(Math.max(bushelsRemaining, 0), 0)
                                : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">% Sold</p>
                            <p className="text-lg font-semibold text-gray-900">
                              {totalProduced > 0
                                ? `${Math.min(percentSold, 100).toFixed(1)}%`
                                : 'N/A'}
                            </p>
                            {totalProduced > 0 && (
                              <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className="bg-green-500 h-1.5 rounded-full transition-all"
                                  style={{ width: `${Math.min(percentSold, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

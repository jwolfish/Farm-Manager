import { Sprout, DollarSign, TrendingUp, TrendingDown, Truck, ShieldCheck } from 'lucide-react';
import type { CropType } from '../../lib/database.types';
import type { CropMetrics, SalesData, HedgeData } from '../../hooks/useDashboardMetrics';

interface Props {
  metric: CropMetrics;
  salesData: SalesData;
  hedgeData: HedgeData;
}

function fmt(value: number | null, decimals = 0): string {
  if (value === null) return 'N/A';
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(value: number | null): string {
  if (value === null) return 'N/A';
  return `$${fmt(value, 2)}`;
}

function getCropColor(crop: CropType): string {
  switch (crop) {
    case 'corn': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'soybeans': return 'bg-green-100 text-green-700 border-green-200';
    case 'wheat': return 'bg-amber-100 text-amber-700 border-amber-200';
  }
}

export function CropSummaryCard({ metric, salesData, hedgeData }: Props) {
  const cropColor = getCropColor(metric.crop_type);
  const totalProduced = metric.avg_yield_per_acre ? metric.avg_yield_per_acre * metric.total_acres : 0;
  const bushelsRemaining = totalProduced - salesData.total_bushels_sold;
  const percentSold = totalProduced > 0 ? (salesData.total_bushels_sold / totalProduced) * 100 : 0;
  const percentHedged = totalProduced > 0 ? (hedgeData.total_bushels_hedged / totalProduced) * 100 : 0;
  const showSalesRow = salesData.sale_count > 0 || totalProduced > 0;
  const showHedgeRow = hedgeData.hedge_count > 0;

  const profitColor = metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0
    ? 'bg-green-50 border-green-200'
    : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0
    ? 'bg-red-50 border-red-200'
    : 'bg-gray-50 border-gray-200';

  const profitTextColor = metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0 ? 'text-green-900'
    : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0 ? 'text-red-900'
    : 'text-gray-700';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className={`px-6 py-4 border-b flex items-center gap-3 ${cropColor}`}>
        <Sprout className="w-6 h-6" />
        <div>
          <h2 className="text-xl font-bold capitalize">{metric.crop_type}</h2>
          <p className="text-sm opacity-80">{fmt(metric.total_acres)} acres</p>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">Cost per Bushel</span>
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-blue-900">{fmtCurrency(metric.avg_cost_per_bushel)}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Cost per Acre</span>
              <DollarSign className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{fmtCurrency(metric.avg_cost_per_acre)}</p>
            <p className="text-xs text-gray-600 mt-1">Including land costs</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Avg Yield</span>
              <Sprout className="w-5 h-5 text-gray-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{fmt(metric.avg_yield_per_acre, 2)}</p>
            <p className="text-xs text-gray-600 mt-1">Bushels per acre</p>
          </div>

          <div className={`rounded-lg p-5 border ${profitColor}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${profitTextColor}`}>Profit per Acre</span>
              {metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0 ? (
                <TrendingDown className="w-5 h-5 text-red-600" />
              ) : (
                <DollarSign className="w-5 h-5 text-gray-600" />
              )}
            </div>
            <p className={`text-2xl font-bold ${
              metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0 ? 'text-green-900'
              : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0 ? 'text-red-900'
              : 'text-gray-900'
            }`}>
              {fmtCurrency(metric.avg_profit_per_acre)}
            </p>
            <p className={`text-xs mt-1 ${
              metric.avg_profit_per_acre && metric.avg_profit_per_acre > 0 ? 'text-green-700'
              : metric.avg_profit_per_acre && metric.avg_profit_per_acre < 0 ? 'text-red-700'
              : 'text-gray-600'
            }`}>
              Revenue - Costs
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-6 border-t border-gray-200">
          <div>
            <p className="text-sm text-gray-600">Total Cost</p>
            <p className="text-lg font-semibold text-gray-900">{fmtCurrency(metric.total_cost)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Bushels Produced</p>
            <p className="text-lg font-semibold text-gray-900">
              {metric.avg_yield_per_acre ? fmt(metric.avg_yield_per_acre * metric.total_acres) : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Current Avg Price per Bushel</p>
            <p className="text-lg font-semibold text-gray-900">{fmtCurrency(metric.avg_price_per_bushel)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Revenue</p>
            <p className="text-lg font-semibold text-gray-900">{fmtCurrency(metric.total_revenue)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Profit</p>
            <p className={`text-lg font-semibold ${
              metric.total_profit && metric.total_profit > 0 ? 'text-green-600'
              : metric.total_profit && metric.total_profit < 0 ? 'text-red-600'
              : 'text-gray-900'
            }`}>
              {fmtCurrency(metric.total_profit)}
            </p>
          </div>
        </div>

        {showSalesRow && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Truck className="w-4 h-4 text-gray-600" />
              <h4 className="text-sm font-semibold text-gray-700">Cash Sales to Date</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-600">Bushels Sold</p>
                <p className="text-lg font-semibold text-gray-900">
                  {salesData.total_bushels_sold > 0 ? fmt(salesData.total_bushels_sold) : '0'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Sale Price</p>
                <p className="text-lg font-semibold text-gray-900">
                  {salesData.weighted_avg_price > 0 ? fmtCurrency(salesData.weighted_avg_price) : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Sales Revenue</p>
                <p className="text-lg font-semibold text-green-700">
                  {salesData.total_sales_revenue > 0 ? fmtCurrency(salesData.total_sales_revenue) : '$0.00'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Bushels Remaining</p>
                <p className={`text-lg font-semibold ${bushelsRemaining > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                  {totalProduced > 0 ? fmt(Math.max(bushelsRemaining, 0)) : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">% Sold</p>
                <p className="text-lg font-semibold text-gray-900">
                  {totalProduced > 0 ? `${Math.min(percentSold, 100).toFixed(1)}%` : 'N/A'}
                </p>
                {totalProduced > 0 && (
                  <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(percentSold, 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showHedgeRow && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-gray-700">Hedge Positions</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-600">Bushels Hedged</p>
                <p className="text-lg font-semibold text-gray-900">{fmt(hedgeData.total_bushels_hedged)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Net Price</p>
                <p className="text-lg font-semibold text-blue-700">{fmtCurrency(hedgeData.weighted_avg_net_price)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Futures / Basis</p>
                <p className="text-lg font-semibold text-gray-900">
                  {fmtCurrency(hedgeData.weighted_avg_futures)} / {hedgeData.weighted_avg_basis >= 0 ? '+' : ''}{fmtCurrency(hedgeData.weighted_avg_basis)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Locked-In Value</p>
                <p className="text-lg font-semibold text-blue-700">
                  {fmtCurrency(hedgeData.total_bushels_hedged * hedgeData.weighted_avg_net_price)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">% Hedged</p>
                <p className="text-lg font-semibold text-gray-900">
                  {totalProduced > 0
                    ? `${Math.min(percentHedged, 100).toFixed(1)}%`
                    : `${hedgeData.total_bushels_hedged.toLocaleString('en-US', { maximumFractionDigits: 0 })} bu`}
                </p>
                {totalProduced > 0 && (
                  <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(percentHedged, 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

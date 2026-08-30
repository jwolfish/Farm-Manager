import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { SaleRecord, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportPricingPerformancePDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_COLORS: Record<CropType, string> = {
  corn: '#f59e0b',
  soybeans: '#16a34a',
  wheat: '#d97706',
};

interface Props {
  salesData: SaleRecord[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

interface PriceStat {
  cropType: CropType;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  totalBushels: number;
  salesCount: number;
  weightedAvg: number;
  bestSale: SaleRecord;
  worstSale: SaleRecord;
}

function buildPriceStats(sales: SaleRecord[]): PriceStat[] {
  const byCrop = new Map<CropType, SaleRecord[]>();
  for (const s of sales) {
    if (!byCrop.has(s.cropType)) byCrop.set(s.cropType, []);
    byCrop.get(s.cropType)!.push(s);
  }

  const stats: PriceStat[] = [];
  for (const [crop, cropSales] of byCrop) {
    const prices = cropSales.map((s) => s.pricePerBushel);
    const totalBu = cropSales.reduce((s, r) => s + r.bushelsSold, 0);
    const weightedSum = cropSales.reduce((s, r) => s + r.pricePerBushel * r.bushelsSold, 0);
    const best = [...cropSales].sort((a, b) => b.pricePerBushel - a.pricePerBushel)[0];
    const worst = [...cropSales].sort((a, b) => a.pricePerBushel - b.pricePerBushel)[0];
    stats.push({
      cropType: crop,
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalBushels: totalBu,
      salesCount: cropSales.length,
      weightedAvg: totalBu > 0 ? weightedSum / totalBu : 0,
      bestSale: best,
      worstSale: worst,
    });
  }
  return stats;
}

export function PricingPerformance({ salesData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || 'all');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');

  const seasonFiltered = salesData
    .filter((s) => selectedSeason === 'all' || s.seasonId === selectedSeason);

  const filtered = seasonFiltered
    .filter((s) => selectedCrop === 'all' || s.cropType === selectedCrop);

  const availableCrops = [...new Set(seasonFiltered.map((s) => s.cropType))];
  const stats = buildPriceStats(filtered);

  const chronologicalSales = [...filtered].sort((a, b) => a.saleDate.localeCompare(b.saleDate));
  const timelineData = chronologicalSales.map((s, i) => ({
    index: i + 1,
    date: new Date(s.saleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: s.pricePerBushel,
    crop: CROP_LABELS[s.cropType],
    cropType: s.cropType,
    bushels: s.bushelsSold,
    destination: s.destination,
  }));

  const groupedTimeline = new Map<CropType, typeof timelineData>();
  for (const d of timelineData) {
    if (!groupedTimeline.has(d.cropType)) groupedTimeline.set(d.cropType, []);
    groupedTimeline.get(d.cropType)!.push(d);
  }

  const handleExportCSV = () => {
    const headers = ['Season', 'Crop', 'Sale Date', 'Destination', 'Bushels', 'Price/bu', 'vs Avg Price'];
    const rows: (string | number)[][] = [];
    for (const stat of stats) {
      const cropSales = filtered.filter((s) => s.cropType === stat.cropType);
      for (const s of cropSales.sort((a, b) => a.saleDate.localeCompare(b.saleDate))) {
        rows.push([
          s.seasonName,
          CROP_LABELS[s.cropType],
          s.saleDate,
          s.destination,
          s.bushelsSold.toFixed(0),
          s.pricePerBushel.toFixed(3),
          (s.pricePerBushel - stat.weightedAvg).toFixed(3),
        ]);
      }
    }
    exportTableToCSV('pricing-performance', headers, rows);
  };

  const handleExportPDF = () => {
    exportPricingPerformancePDF(filtered, seasonData, farmName);
  };

  if (salesData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Pricing Performance" description="Analyze your sale prices vs averages over time">
        <div className="text-center py-12 text-gray-400">No sales data recorded yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Pricing Performance"
      description="Track sale prices over time and measure performance against weighted averages"
      onExportCSV={filtered.length > 0 ? handleExportCSV : undefined}
      onExportPDF={filtered.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Pricing Performance" />

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Season</label>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          >
            <option value="all">All Seasons</option>
            {seasonData.map((s) => (
              <option key={s.seasonId} value={s.seasonId}>{s.seasonName}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Crop Type</label>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value as CropType | 'all')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          >
            <option value="all">All Crops</option>
            {availableCrops.map((c) => (
              <option key={c} value={c}>{CROP_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No sales for this selection.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {stats.map((stat) => {
              const spread = stat.maxPrice - stat.minPrice;
              const spreadPct = stat.avgPrice > 0 ? (spread / stat.avgPrice) * 100 : 0;
              return (
                <div key={stat.cropType} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-gray-900">{CROP_LABELS[stat.cropType]}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: CROP_COLORS[stat.cropType] + '22', color: CROP_COLORS[stat.cropType] }}>
                      {stat.salesCount} sales
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Weighted Avg</span>
                      <span className="font-bold text-gray-900">${stat.weightedAvg.toFixed(3)}/bu</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Best Price</span>
                      <span className="text-green-700 font-medium flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />${stat.maxPrice.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Worst Price</span>
                      <span className="text-red-600 font-medium flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" />${stat.minPrice.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Price Spread</span>
                      <span className="text-gray-700 font-medium">${spread.toFixed(3)} ({spreadPct.toFixed(1)}%)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Bushels</span>
                      <span className="text-gray-700">{stat.totalBushels.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {timelineData.length > 1 && (
            <div className="mb-8">
              <p className="text-sm font-semibold text-gray-700 mb-3">Price Timeline</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" type="category" tick={{ fontSize: 11 }} allowDuplicatedCategory={false} />
                  <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip formatter={(v: number) => `$${v.toFixed(3)}/bu`} />
                  <Legend />
                  {([...groupedTimeline.entries()] as [CropType, typeof timelineData][]).map(([crop, points]) => (
                    <Line
                      key={crop}
                      data={points}
                      type="monotone"
                      dataKey="price"
                      name={CROP_LABELS[crop]}
                      stroke={CROP_COLORS[crop]}
                      strokeWidth={2}
                      dot={{ r: 4, fill: CROP_COLORS[crop] }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Season</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Date</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Destination</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Bushels</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Price/bu</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">vs Avg</th>
                </tr>
              </thead>
              <tbody>
                {chronologicalSales.map((s, i) => {
                  const stat = stats.find((st) => st.cropType === s.cropType);
                  const diff = stat ? s.pricePerBushel - stat.weightedAvg : 0;
                  return (
                    <tr key={s.id} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 text-gray-600">{s.seasonName}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: CROP_COLORS[s.cropType] + '22', color: CROP_COLORS[s.cropType] }}>
                          {CROP_LABELS[s.cropType]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {new Date(s.saleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">{s.destination || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{s.bushelsSold.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-900">${s.pricePerBushel.toFixed(3)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`flex items-center justify-end gap-1 font-medium text-xs ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {diff >= 0 ? '+' : ''}{diff.toFixed(3)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ReportCard>
  );
}

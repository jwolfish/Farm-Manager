import { useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { SaleRecord, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportBuyerBreakdownPDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const PIE_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#7c3aed',
  '#db2777', '#65a30d', '#f97316', '#14b8a6', '#f59e0b', '#6366f1',
];

const fmt = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtBu = (v: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' bu';

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-sm">
      <p className="font-medium text-gray-900">{d.name}</p>
      <p className="text-gray-600">{fmtBu(d.value)}</p>
      <p className="text-gray-500">{fmt(d.payload.revenue)}</p>
    </div>
  );
}

function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex gap-2 text-gray-600">
          <span>{p.name}:</span>
          <span className="font-medium">{p.name === 'Avg Price' ? `$${(p.value as number).toFixed(3)}/bu` : fmtBu(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

interface BuyerStat {
  destination: string;
  totalBushels: number;
  totalRevenue: number;
  salesCount: number;
  avgPrice: number;
  crops: Set<CropType>;
}

interface Props {
  salesData: SaleRecord[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

export function BuyerBreakdown({ salesData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || 'all');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');
  const [metric, setMetric] = useState<'bushels' | 'revenue'>('bushels');

  const seasonFiltered = salesData
    .filter((s) => selectedSeason === 'all' || s.seasonId === selectedSeason);

  const filtered = seasonFiltered
    .filter((s) => selectedCrop === 'all' || s.cropType === selectedCrop);

  const availableCrops = [...new Set(seasonFiltered.map((s) => s.cropType))];

  const buyerMap = new Map<string, BuyerStat>();
  for (const s of filtered) {
    const dest = s.destination || 'Unknown';
    if (!buyerMap.has(dest)) {
      buyerMap.set(dest, { destination: dest, totalBushels: 0, totalRevenue: 0, salesCount: 0, avgPrice: 0, crops: new Set() });
    }
    const entry = buyerMap.get(dest)!;
    entry.totalBushels += s.bushelsSold;
    entry.totalRevenue += s.totalRevenue;
    entry.salesCount += 1;
    entry.crops.add(s.cropType);
  }
  for (const entry of buyerMap.values()) {
    entry.avgPrice = entry.totalBushels > 0 ? entry.totalRevenue / entry.totalBushels : 0;
  }

  const buyers = [...buyerMap.values()].sort((a, b) =>
    metric === 'bushels' ? b.totalBushels - a.totalBushels : b.totalRevenue - a.totalRevenue
  );

  const pieData = buyers.map((b) => ({
    name: b.destination.length > 20 ? b.destination.slice(0, 20) + '…' : b.destination,
    value: metric === 'bushels' ? b.totalBushels : b.totalRevenue,
    revenue: b.totalRevenue,
  }));

  const barData = buyers.slice(0, 10).map((b) => ({
    name: b.destination.length > 18 ? b.destination.slice(0, 18) + '…' : b.destination,
    Bushels: Math.round(b.totalBushels),
    'Avg Price': Math.round(b.avgPrice * 1000) / 1000,
  }));

  const handleExportCSV = () => {
    const headers = ['Destination', 'Crops', '# Sales', 'Total Bushels', 'Total Revenue', 'Avg Price/bu', '% of Bushels'];
    const totalBu = buyers.reduce((s, b) => s + b.totalBushels, 0);
    const rows = buyers.map((b) => [
      b.destination,
      [...b.crops].map((c) => CROP_LABELS[c]).join(', '),
      b.salesCount,
      b.totalBushels.toFixed(0),
      b.totalRevenue.toFixed(2),
      b.avgPrice.toFixed(3),
      totalBu > 0 ? ((b.totalBushels / totalBu) * 100).toFixed(1) + '%' : '0%',
    ]);
    exportTableToCSV('buyer-breakdown', headers, rows);
  };

  const handleExportPDF = () => {
    exportBuyerBreakdownPDF(filtered, seasonData, farmName);
  };

  if (salesData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Buyer & Destination Breakdown" description="Volume and revenue by elevator or buyer">
        <div className="text-center py-12 text-gray-400">No sales data recorded yet.</div>
      </ReportCard>
    );
  }

  const totalBu = buyers.reduce((s, b) => s + b.totalBushels, 0);
  const totalRev = buyers.reduce((s, b) => s + b.totalRevenue, 0);

  return (
    <ReportCard
      title="Buyer & Destination Breakdown"
      description="See which elevators and buyers receive the most volume and revenue"
      onExportCSV={filtered.length > 0 ? handleExportCSV : undefined}
      onExportPDF={filtered.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Buyer & Destination Breakdown" />

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
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Metric</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setMetric('bushels')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${metric === 'bushels' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Bushels
            </button>
            <button
              onClick={() => setMetric('revenue')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${metric === 'revenue' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Revenue
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No sales for this selection.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-sky-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-sky-600 mb-1">Total Buyers</p>
              <p className="text-lg font-bold text-sky-900">{buyers.length}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-green-600 mb-1">Total Bushels</p>
              <p className="text-lg font-bold text-green-900">{fmtBu(totalBu)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-gray-600 mb-1">Total Revenue</p>
              <p className="text-lg font-bold text-gray-900">{fmt(totalRev)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {pieData.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 text-center">
                  Share by {metric === 'bushels' ? 'Bushels' : 'Revenue'}
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      outerRadius={100}
                      dataKey="value"
                      labelLine={false}
                      label={renderCustomLabel}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Legend verticalAlign="bottom" formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {barData.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2 text-center">Bushels & Avg Price by Buyer</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData} margin={{ top: 5, right: 20, left: 5, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis yAxisId="left" tickFormatter={(v) => v.toLocaleString()} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="Bushels" fill="#2563eb" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="right" dataKey="Avg Price" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Destination</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crops</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Sales</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Bushels</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">% of Total</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Revenue</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((b, i) => {
                  const pct = totalBu > 0 ? (b.totalBushels / totalBu) * 100 : 0;
                  return (
                    <tr key={b.destination} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{b.destination}</td>
                      <td className="py-2.5 px-3 text-gray-500 text-xs">
                        {[...b.crops].map((c) => CROP_LABELS[c]).join(', ')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{b.salesCount}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{fmtBu(b.totalBushels)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-gray-600 text-xs w-8">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-green-700">{fmt(b.totalRevenue)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">${b.avgPrice.toFixed(3)}/bu</td>
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

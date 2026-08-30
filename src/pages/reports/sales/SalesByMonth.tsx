import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { SaleRecord, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportSalesByMonthPDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';

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

const fmt = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtBu = (v: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' bu';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: p.color || p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium text-gray-900">
            {typeof p.value === 'number' && p.name.includes('Revenue')
              ? fmt(p.value)
              : typeof p.value === 'number' && p.name.includes('Price')
              ? `$${p.value.toFixed(2)}/bu`
              : fmtBu(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  salesData: SaleRecord[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

export function SalesByMonth({ salesData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || seasonData[seasonData.length - 1]?.seasonId || '');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');
  const [chartMode, setChartMode] = useState<'bushels' | 'revenue'>('bushels');

  const seasonSales = salesData.filter((s) => s.seasonId === selectedSeason);
  const cropFiltered = selectedCrop === 'all' ? seasonSales : seasonSales.filter((s) => s.cropType === selectedCrop);
  const availableCrops = [...new Set(seasonSales.map((s) => s.cropType))];
  const currentSeason = seasonData.find((s) => s.seasonId === selectedSeason);

  const monthMap = new Map<string, Record<CropType, { bushels: number; revenue: number }>>();
  for (const sale of cropFiltered) {
    if (!monthMap.has(sale.deliveryMonth)) {
      monthMap.set(sale.deliveryMonth, { corn: { bushels: 0, revenue: 0 }, soybeans: { bushels: 0, revenue: 0 }, wheat: { bushels: 0, revenue: 0 } });
    }
    const entry = monthMap.get(sale.deliveryMonth)!;
    entry[sale.cropType].bushels += sale.bushelsSold;
    entry[sale.cropType].revenue += sale.totalRevenue;
  }

  const monthLabels = [...monthMap.keys()].sort();
  const chartData = monthLabels.map((month) => {
    const entry = monthMap.get(month)!;
    const label = month.length === 7
      ? new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : month;
    return {
      month: label,
      ...(chartMode === 'bushels'
        ? Object.fromEntries(
            (Object.keys(entry) as CropType[])
              .filter((c) => entry[c].bushels > 0)
              .map((c) => [CROP_LABELS[c], entry[c].bushels])
          )
        : Object.fromEntries(
            (Object.keys(entry) as CropType[])
              .filter((c) => entry[c].revenue > 0)
              .map((c) => [CROP_LABELS[c], entry[c].revenue])
          )),
    };
  });

  const activeCrops = selectedCrop === 'all'
    ? availableCrops
    : availableCrops.filter((c) => c === selectedCrop);

  const totalBushels = cropFiltered.reduce((s, r) => s + r.bushelsSold, 0);
  const totalRevenue = cropFiltered.reduce((s, r) => s + r.totalRevenue, 0);
  const avgPrice = totalBushels > 0 ? totalRevenue / totalBushels : 0;

  const handleExportCSV = () => {
    const headers = ['Sale Date', 'Delivery Month', 'Crop', 'Destination', 'Bushels Sold', 'Price/bu', 'Total Revenue', 'Notes'];
    const rows = cropFiltered.map((s) => [
      s.saleDate,
      s.deliveryMonth,
      CROP_LABELS[s.cropType],
      s.destination,
      s.bushelsSold.toFixed(0),
      s.pricePerBushel.toFixed(3),
      s.totalRevenue.toFixed(2),
      s.notes || '',
    ]);
    exportTableToCSV(`sales-by-month-${currentSeason?.seasonName || ''}`, headers, rows);
  };

  const handleExportPDF = () => {
    exportSalesByMonthPDF(salesData, seasonData, selectedSeason, farmName);
  };

  if (salesData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Sales by Delivery Month" description="Bushels sold and revenue by month">
        <div className="text-center py-12 text-gray-400">No sales data recorded yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Sales by Delivery Month"
      description="Visualize when and how much you sold each month across crops"
      onExportCSV={cropFiltered.length > 0 ? handleExportCSV : undefined}
      onExportPDF={seasonSales.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Sales by Delivery Month" seasonName={currentSeason?.seasonName} />

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Season</label>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          >
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
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Show</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setChartMode('bushels')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${chartMode === 'bushels' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Bushels
            </button>
            <button
              onClick={() => setChartMode('revenue')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${chartMode === 'revenue' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Revenue
            </button>
          </div>
        </div>
      </div>

      {cropFiltered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No sales for this selection.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-sky-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-sky-600 mb-1">Total Bushels</p>
              <p className="text-lg font-bold text-sky-900">{fmtBu(totalBushels)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-green-600 mb-1">Total Revenue</p>
              <p className="text-lg font-bold text-green-900">{fmt(totalRevenue)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-gray-600 mb-1">Avg Price</p>
              <p className="text-lg font-bold text-gray-900">${avgPrice.toFixed(2)}/bu</p>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="mb-8">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => chartMode === 'revenue' ? `$${(v / 1000).toFixed(0)}k` : v.toLocaleString()}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {activeCrops.map((crop) => (
                    <Bar key={crop} dataKey={CROP_LABELS[crop]} fill={CROP_COLORS[crop]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Sale Date</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Delivery</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Destination</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Bushels</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Price/bu</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {[...cropFiltered].sort((a, b) => a.saleDate.localeCompare(b.saleDate)).map((s, i) => (
                  <tr key={s.id} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="py-2.5 px-3 text-gray-600">
                      {new Date(s.saleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">
                      {s.deliveryMonth.length === 7
                        ? new Date(s.deliveryMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                        : s.deliveryMonth}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: CROP_COLORS[s.cropType] + '22', color: CROP_COLORS[s.cropType] }}>
                        {CROP_LABELS[s.cropType]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-700 font-medium">{s.destination || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{fmtBu(s.bushelsSold)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">${s.pricePerBushel.toFixed(3)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-green-700">{fmt(s.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ReportCard>
  );
}

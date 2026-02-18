import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { FieldPerformanceSummary, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportFieldROIPDF } from '../../../lib/pdfExport';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { CropType } from '../../../lib/database.types';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const fmt = (v: number) =>
  v < 0
    ? `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtAcre = (v: number) => `${fmt(v)}/ac`;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      <p className={val >= 0 ? 'text-blue-700 font-medium' : 'text-red-600 font-medium'}>
        {fmtAcre(val)}
      </p>
    </div>
  );
}

interface Props {
  fieldData: FieldPerformanceSummary[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

export function FieldROI({ fieldData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || seasonData[seasonData.length - 1]?.seasonId || '');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');

  const seasonFields = fieldData.filter((f) => f.seasonId === selectedSeason && f.netProfitPerAcre !== null);
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === selectedCrop);
  const sorted = [...cropFiltered].sort((a, b) => (b.netProfitPerAcre ?? 0) - (a.netProfitPerAcre ?? 0));

  const availableCrops = [...new Set(seasonFields.map((f) => f.cropType))];
  const currentSeason = seasonData.find((s) => s.seasonId === selectedSeason);

  const profitableCount = sorted.filter((f) => (f.netProfitPerAcre ?? 0) > 0).length;
  const totalNet = sorted.reduce((s, f) => s + (f.totalNetProfit ?? 0), 0);
  const avgNet = sorted.length > 0
    ? sorted.reduce((s, f) => s + (f.netProfitPerAcre ?? 0), 0) / sorted.length
    : 0;

  const chartData = sorted.map((f) => ({
    name: f.fieldName.length > 14 ? f.fieldName.slice(0, 14) + '…' : f.fieldName,
    fullName: f.fieldName,
    profit: Math.round(f.netProfitPerAcre ?? 0),
    isProfit: (f.netProfitPerAcre ?? 0) >= 0,
  }));

  const handleExportCSV = () => {
    const headers = ['Field', 'Crop', 'Acres', 'Revenue/Ac', 'Cost/Ac', 'Net Profit/Ac', 'Total Net Profit'];
    const rows = sorted.map((f) => [
      f.fieldName,
      CROP_LABELS[f.cropType],
      f.acres.toFixed(1),
      f.revenuePerAcre !== null ? f.revenuePerAcre.toFixed(2) : 'N/A',
      f.costPerAcre.toFixed(2),
      f.netProfitPerAcre !== null ? f.netProfitPerAcre.toFixed(2) : 'N/A',
      f.totalNetProfit !== null ? f.totalNetProfit.toFixed(2) : 'N/A',
    ]);
    exportTableToCSV(`field-roi-${currentSeason?.seasonName || ''}`, headers, rows);
  };

  const handleExportPDF = () => {
    exportFieldROIPDF(fieldData, seasonData, selectedSeason, farmName);
  };

  if (fieldData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Field ROI & Net Profit" description="Net profit per acre and total return by field">
        <div className="text-center py-12 text-gray-400">No data available yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Field ROI & Net Profit"
      description="Net profit per acre and total return by field for a selected season"
      onExportCSV={sorted.length > 0 ? handleExportCSV : undefined}
      onExportPDF={sorted.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Field ROI & Net Profit" seasonName={currentSeason?.seasonName} />

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Season</label>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Crops</option>
            {availableCrops.map((c) => (
              <option key={c} value={c}>{CROP_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No revenue data available. Make sure yield data and crop prices are entered.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-blue-600 mb-1">Total Net</p>
              <p className={`text-lg font-bold ${totalNet >= 0 ? 'text-blue-900' : 'text-red-700'}`}>{fmt(totalNet)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-gray-600 mb-1">Avg Net/Acre</p>
              <p className={`text-lg font-bold ${avgNet >= 0 ? 'text-gray-900' : 'text-red-700'}`}>{fmtAcre(avgNet)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-green-600 mb-1">Profitable Fields</p>
              <p className="text-lg font-bold text-green-900">{profitableCount} / {sorted.length}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-amber-600 mb-1">Best Field</p>
              <p className="text-sm font-bold text-amber-900 truncate">{sorted[0]?.fieldName}</p>
              <p className="text-xs text-amber-700">{fmtAcre(sorted[0]?.netProfitPerAcre ?? 0)}</p>
            </div>
          </div>

          <div className="mb-8">
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 36)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine x={0} stroke="#9ca3af" />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]}
                  label={{ position: 'right', fontSize: 11, formatter: (v: number) => fmtAcre(v) }}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.isProfit ? '#2563eb' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Field</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Acres</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Revenue/Ac</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Cost/Ac</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Net/Ac</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Total Net</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const isProfit = (f.netProfitPerAcre ?? 0) >= 0;
                  return (
                    <tr key={f.fieldId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{f.fieldName}</td>
                      <td className="py-2.5 px-3 text-gray-600">{CROP_LABELS[f.cropType]}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{f.acres.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right text-green-700">
                        {f.revenuePerAcre !== null ? fmtAcre(f.revenuePerAcre) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-red-600">{fmtAcre(f.costPerAcre)}</td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${isProfit ? 'text-blue-700' : 'text-red-600'}`}>
                        <span className="flex items-center justify-end gap-1">
                          {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          {f.netProfitPerAcre !== null ? fmtAcre(f.netProfitPerAcre) : '—'}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${isProfit ? 'text-blue-700' : 'text-red-600'}`}>
                        {f.totalNetProfit !== null ? fmt(f.totalNetProfit) : <span className="text-gray-400">—</span>}
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

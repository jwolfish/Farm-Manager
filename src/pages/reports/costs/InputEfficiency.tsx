import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { FieldPerformanceSummary, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportInputEfficiencyPDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const fmt2 = (v: number) =>
  `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const ratio = payload[0]?.value ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      <p className={ratio >= 1 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
        Revenue/Cost Ratio: {fmt2(ratio)}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">
        {ratio >= 1 ? `${((ratio - 1) * 100).toFixed(0)}% above break-even` : `${((1 - ratio) * 100).toFixed(0)}% below break-even`}
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

export function InputEfficiency({ fieldData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || seasonData[seasonData.length - 1]?.seasonId || '');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');

  const currentSeason = seasonData.find((s) => s.seasonId === selectedSeason);

  const seasonFields = fieldData.filter(
    (f) => f.seasonId === selectedSeason && f.revenuePerAcre != null && f.costPerAcre > 0
  );
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === selectedCrop);
  const sorted = [...cropFiltered].sort((a, b) => {
    const ratioA = a.revenuePerAcre! / a.costPerAcre;
    const ratioB = b.revenuePerAcre! / b.costPerAcre;
    return ratioB - ratioA;
  });

  const availableCrops = [...new Set(seasonFields.map((f) => f.cropType))];

  const chartData = sorted.map((f) => {
    const ratio = f.costPerAcre > 0 ? (f.revenuePerAcre ?? 0) / f.costPerAcre : 0;
    return {
      name: f.fieldName.length > 14 ? f.fieldName.slice(0, 14) + '…' : f.fieldName,
      fullName: f.fieldName,
      ratio: Math.round(ratio * 100) / 100,
      profitable: ratio >= 1,
    };
  });

  const avgRatio = sorted.length > 0
    ? sorted.reduce((s, f) => s + (f.revenuePerAcre ?? 0) / f.costPerAcre, 0) / sorted.length
    : 0;

  const bestField = sorted[0];
  const worstField = sorted[sorted.length - 1];
  const efficientCount = sorted.filter((f) => (f.revenuePerAcre ?? 0) / f.costPerAcre >= 1).length;
  const totalRevenue = sorted.reduce((s, f) => s + (f.totalRevenue ?? 0), 0);
  const totalCost = sorted.reduce((s, f) => s + f.totalCost, 0);
  const overallRatio = totalCost > 0 ? totalRevenue / totalCost : 0;

  const handleExportCSV = () => {
    const headers = ['Field', 'Crop', 'Acres', 'Revenue/Ac', 'Cost/Ac', 'Revenue/Cost Ratio', 'Net/Ac'];
    const rows = sorted.map((f) => {
      const ratio = f.costPerAcre > 0 ? (f.revenuePerAcre ?? 0) / f.costPerAcre : 0;
      return [
        f.fieldName,
        CROP_LABELS[f.cropType],
        f.acres.toFixed(1),
        f.revenuePerAcre != null ? f.revenuePerAcre.toFixed(2) : 'N/A',
        f.costPerAcre.toFixed(2),
        ratio.toFixed(3),
        f.netProfitPerAcre != null ? f.netProfitPerAcre.toFixed(2) : 'N/A',
      ];
    });
    exportTableToCSV(`input-efficiency-${currentSeason?.seasonName || ''}`, headers, rows);
  };

  const handleExportPDF = () => {
    exportInputEfficiencyPDF(fieldData, seasonData, selectedSeason, selectedCrop, farmName);
  };

  if (fieldData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Input Efficiency Ratio" description="Revenue generated per dollar of input cost">
        <div className="text-center py-12 text-gray-400">No data available yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Input Efficiency Ratio"
      description="Revenue generated per dollar of input cost by field — 1.0x means break-even"
      onExportCSV={sorted.length > 0 ? handleExportCSV : undefined}
      onExportPDF={sorted.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Input Efficiency Ratio" seasonName={currentSeason?.seasonName} />

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Season</label>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
          No revenue data available. Enter crop prices and yield data to see efficiency ratios.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className={`rounded-xl p-4 text-center ${overallRatio >= 1 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className={`text-xs font-medium mb-1 ${overallRatio >= 1 ? 'text-green-600' : 'text-red-600'}`}>Overall Ratio</p>
              <p className={`text-lg font-bold ${overallRatio >= 1 ? 'text-green-900' : 'text-red-700'}`}>{fmt2(overallRatio)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-gray-600 mb-1">Avg Field Ratio</p>
              <p className={`text-lg font-bold ${avgRatio >= 1 ? 'text-gray-900' : 'text-red-700'}`}>{fmt2(avgRatio)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-green-600 mb-1">Best Field</p>
              <p className="text-sm font-bold text-green-900 truncate">{bestField?.fieldName}</p>
              <p className="text-xs text-green-700">
                {bestField ? fmt2((bestField.revenuePerAcre ?? 0) / bestField.costPerAcre) : '—'}
              </p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-amber-600 mb-1">Fields Above 1.0x</p>
              <p className="text-lg font-bold text-amber-900">{efficientCount} / {sorted.length}</p>
            </div>
          </div>

          <div className="mb-8">
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 38)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} domain={[0, 'auto']} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  x={1}
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  label={{ value: 'Break-even', position: 'top', fontSize: 10, fill: '#6b7280' }}
                />
                <Bar dataKey="ratio" name="Revenue/Cost" radius={[0, 4, 4, 0]}
                  label={{ position: 'right', fontSize: 11, formatter: (v: number) => `${v.toFixed(2)}x` }}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.profitable ? '#16a34a' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 text-center mt-1">Green = above break-even (1.0x). Red = revenue does not cover costs.</p>
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
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Ratio</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Net/Ac</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const ratio = f.costPerAcre > 0 ? (f.revenuePerAcre ?? 0) / f.costPerAcre : 0;
                  const net = f.netProfitPerAcre;
                  return (
                    <tr key={f.fieldId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{f.fieldName}</td>
                      <td className="py-2.5 px-3 text-gray-600">{CROP_LABELS[f.cropType]}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{f.acres.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right text-green-700">
                        {f.revenuePerAcre != null ? `$${f.revenuePerAcre.toFixed(2)}/ac` : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-red-600">${f.costPerAcre.toFixed(2)}/ac</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${ratio >= 1 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmt2(ratio)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${
                        net == null ? 'text-gray-400' : net >= 0 ? 'text-blue-700' : 'text-red-600'
                      }`}>
                        {net != null
                          ? `${net < 0 ? '-' : ''}$${Math.abs(net).toFixed(2)}/ac`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {worstField && (worstField.revenuePerAcre ?? 0) / worstField.costPerAcre < 0.9 && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-800 mb-1">Low Efficiency Alert</p>
              <p className="text-xs text-amber-700">
                <strong>{worstField.fieldName}</strong> has a revenue/cost ratio of{' '}
                {fmt2((worstField.revenuePerAcre ?? 0) / worstField.costPerAcre)}, meaning it generated less than
                90 cents per dollar spent. Consider reviewing input costs or crop selection for this field.
              </p>
            </div>
          )}
        </>
      )}
    </ReportCard>
  );
}

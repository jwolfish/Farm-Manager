import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { FieldPerformanceSummary, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportCostPerBushelPDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const fmt2 = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const cpb = payload.find((p: any) => p.dataKey === 'costPerBushel')?.value ?? 0;
  const rev = payload.find((p: any) => p.dataKey === 'revenuePerBushel')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      <p className="text-red-600">Cost/bu: {fmt2(cpb)}</p>
      {rev != null && <p className="text-green-700">Revenue/bu: {fmt2(rev)}</p>}
    </div>
  );
}

interface Props {
  fieldData: FieldPerformanceSummary[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

export function CostPerBushel({ fieldData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || seasonData[seasonData.length - 1]?.seasonId || '');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');

  const currentSeason = seasonData.find((s) => s.seasonId === selectedSeason);

  const seasonFields = fieldData.filter(
    (f) => f.seasonId === selectedSeason && f.yieldPerAcre != null && f.yieldPerAcre > 0
  );
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === selectedCrop);
  const sorted = [...cropFiltered].sort((a, b) => {
    const cpbA = a.costPerAcre / (a.yieldPerAcre!);
    const cpbB = b.costPerAcre / (b.yieldPerAcre!);
    return cpbA - cpbB;
  });

  const availableCrops = [...new Set(seasonFields.map((f) => f.cropType))];

  const chartData = sorted.map((f) => {
    const cpb = f.yieldPerAcre! > 0 ? f.costPerAcre / f.yieldPerAcre! : 0;
    const rpb = f.revenuePerAcre != null && f.yieldPerAcre! > 0 ? f.revenuePerAcre / f.yieldPerAcre! : null;
    return {
      name: f.fieldName.length > 14 ? f.fieldName.slice(0, 14) + '…' : f.fieldName,
      fullName: f.fieldName,
      costPerBushel: Math.round(cpb * 100) / 100,
      revenuePerBushel: rpb != null ? Math.round(rpb * 100) / 100 : null,
      profitable: rpb != null ? rpb > cpb : null,
    };
  });

  const totalAcresForAvg = sorted.reduce((s, f) => s + f.acres, 0);
  const avgCpb = totalAcresForAvg > 0
    ? sorted.reduce((s, f) => s + (f.costPerAcre / f.yieldPerAcre!) * f.acres, 0) / totalAcresForAvg
    : 0;

  const lowestCpb = sorted.length > 0 ? sorted[0] : null;
  const highestCpb = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const fieldsUnderRevenue = sorted.filter((f) => {
    if (f.revenuePerAcre == null) return false;
    return f.costPerAcre / f.yieldPerAcre! < f.revenuePerAcre / f.yieldPerAcre!;
  }).length;

  const handleExportCSV = () => {
    const headers = ['Field', 'Crop', 'Acres', 'Cost/Ac', 'Yield/Ac (bu)', 'Cost/Bu', 'Revenue/Bu', 'Margin/Bu'];
    const rows = sorted.map((f) => {
      const cpb = f.yieldPerAcre! > 0 ? f.costPerAcre / f.yieldPerAcre! : 0;
      const rpb = f.revenuePerAcre != null && f.yieldPerAcre! > 0 ? f.revenuePerAcre / f.yieldPerAcre! : null;
      return [
        f.fieldName,
        CROP_LABELS[f.cropType],
        f.acres.toFixed(1),
        f.costPerAcre.toFixed(2),
        (f.yieldPerAcre ?? 0).toFixed(1),
        cpb.toFixed(2),
        rpb != null ? rpb.toFixed(2) : 'N/A',
        rpb != null ? (rpb - cpb).toFixed(2) : 'N/A',
      ];
    });
    exportTableToCSV(`cost-per-bushel-${currentSeason?.seasonName || ''}`, headers, rows);
  };

  const handleExportPDF = () => {
    exportCostPerBushelPDF(fieldData, seasonData, selectedSeason, selectedCrop, farmName);
  };

  if (fieldData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Cost Per Bushel" description="Production cost efficiency per unit of yield">
        <div className="text-center py-12 text-gray-400">No data available yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Cost Per Bushel"
      description="Production cost per bushel by field, compared against realized sale price"
      onExportCSV={sorted.length > 0 ? handleExportCSV : undefined}
      onExportPDF={sorted.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Cost Per Bushel" seasonName={currentSeason?.seasonName} />

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
          No yield data available for this selection. Enter yield data on fields to see cost per bushel.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-orange-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-orange-600 mb-1">Avg Cost/Bu</p>
              <p className="text-lg font-bold text-orange-900">{fmt2(avgCpb)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-green-600 mb-1">Most Efficient</p>
              <p className="text-sm font-bold text-green-900 truncate">{lowestCpb?.fieldName}</p>
              <p className="text-xs text-green-700">
                {lowestCpb ? fmt2(lowestCpb.costPerAcre / lowestCpb.yieldPerAcre!) : '—'}/bu
              </p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-red-600 mb-1">Least Efficient</p>
              <p className="text-sm font-bold text-red-900 truncate">{highestCpb?.fieldName}</p>
              <p className="text-xs text-red-700">
                {highestCpb ? fmt2(highestCpb.costPerAcre / highestCpb.yieldPerAcre!) : '—'}/bu
              </p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-blue-600 mb-1">Profitable Fields</p>
              <p className="text-lg font-bold text-blue-900">
                {fieldsUnderRevenue} / {sorted.filter((f) => f.revenuePerAcre != null).length}
              </p>
            </div>
          </div>

          <div className="mb-8">
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 38)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 100, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  x={avgCpb}
                  stroke="#f97316"
                  strokeDasharray="4 3"
                  label={{ value: 'Avg', position: 'top', fontSize: 10, fill: '#f97316' }}
                />
                <Bar dataKey="costPerBushel" name="Cost/Bu" radius={[0, 4, 4, 0]}
                  label={{ position: 'right', fontSize: 11, formatter: (v: number) => `$${v.toFixed(2)}` }}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.profitable === true ? '#dc2626' : entry.profitable === false ? '#dc2626' : '#dc2626'}
                      opacity={entry.profitable === true ? 0.7 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 text-center mt-1">Sorted by cost per bushel (lowest to highest). Dashed line = average.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Field</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Acres</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Yield/Ac</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Cost/Ac</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Cost/Bu</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Revenue/Bu</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Margin/Bu</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const cpb = f.yieldPerAcre! > 0 ? f.costPerAcre / f.yieldPerAcre! : 0;
                  const rpb = f.revenuePerAcre != null && f.yieldPerAcre! > 0
                    ? f.revenuePerAcre / f.yieldPerAcre!
                    : null;
                  const margin = rpb != null ? rpb - cpb : null;
                  const aboveAvg = cpb > avgCpb;
                  return (
                    <tr key={f.fieldId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{f.fieldName}</td>
                      <td className="py-2.5 px-3 text-gray-600">{CROP_LABELS[f.cropType]}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{f.acres.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{(f.yieldPerAcre ?? 0).toFixed(1)} bu</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">${f.costPerAcre.toFixed(2)}/ac</td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${aboveAvg ? 'text-red-600' : 'text-orange-700'}`}>
                        {fmt2(cpb)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-green-700">
                        {rpb != null ? fmt2(rpb) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-semibold ${
                        margin == null ? 'text-gray-400' : margin >= 0 ? 'text-blue-700' : 'text-red-600'
                      }`}>
                        {margin != null ? fmt2(margin) : '—'}
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

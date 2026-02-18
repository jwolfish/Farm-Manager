import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { FieldPerformanceSummary, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportFieldYieldRankingPDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';

const CROP_COLORS: Record<CropType, string> = {
  corn: '#f59e0b',
  soybeans: '#16a34a',
  wheat: '#d97706',
};

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_BG: Record<CropType, string> = {
  corn: 'bg-amber-50',
  soybeans: 'bg-green-50',
  wheat: 'bg-orange-50',
};

const CROP_TEXT: Record<CropType, string> = {
  corn: 'text-amber-700',
  soybeans: 'text-green-700',
  wheat: 'text-orange-700',
};

const CROP_LABEL_TEXT: Record<CropType, string> = {
  corn: 'text-amber-600',
  soybeans: 'text-green-600',
  wheat: 'text-orange-600',
};

const fmt2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="text-gray-600">
          {fmt2(p.value)} bu/ac
        </div>
      ))}
    </div>
  );
}

interface Props {
  fieldData: FieldPerformanceSummary[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

function calcAvg(fields: FieldPerformanceSummary[]): number {
  const totalBushels = fields.reduce((s, f) => s + (f.totalYield ?? 0), 0);
  const totalAcres = fields.reduce((s, f) => s + (f.yieldPerAcre !== null ? f.acres : 0), 0);
  return totalAcres > 0 ? totalBushels / totalAcres : 0;
}

export function FieldYieldRanking({ fieldData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || seasonData[seasonData.length - 1]?.seasonId || '');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');

  const seasonFields = fieldData.filter((f) => f.seasonId === selectedSeason && f.yieldPerAcre !== null);
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === selectedCrop);
  const sorted = [...cropFiltered].sort((a, b) => (b.yieldPerAcre ?? 0) - (a.yieldPerAcre ?? 0));

  const availableCrops = [...new Set(seasonFields.map((f) => f.cropType))] as CropType[];

  const cropAvgYield = new Map<CropType, number>();
  for (const crop of availableCrops) {
    const cropFields = seasonFields.filter((f) => f.cropType === crop);
    cropAvgYield.set(crop, calcAvg(cropFields));
  }

  const singleAvg = selectedCrop !== 'all' ? (cropAvgYield.get(selectedCrop as CropType) ?? 0) : 0;

  const chartData = sorted.map((f) => ({
    name: f.fieldName.length > 14 ? f.fieldName.slice(0, 14) + '…' : f.fieldName,
    fullName: f.fieldName,
    yield: Math.round((f.yieldPerAcre ?? 0) * 10) / 10,
    cropType: f.cropType,
  }));

  const handleExportCSV = () => {
    const season = seasonData.find((s) => s.seasonId === selectedSeason);
    const headers = ['Field', 'Crop', 'Acres', 'Yield (bu/ac)', 'Total Yield (bu)', 'vs Crop Avg'];
    const rows = sorted.map((f) => {
      const cropAvg = cropAvgYield.get(f.cropType) ?? 0;
      return [
        f.fieldName,
        CROP_LABELS[f.cropType],
        f.acres.toFixed(1),
        (f.yieldPerAcre ?? 0).toFixed(1),
        (f.totalYield ?? 0).toFixed(0),
        ((f.yieldPerAcre ?? 0) - cropAvg).toFixed(1),
      ];
    });
    exportTableToCSV(`field-yield-ranking-${season?.seasonName || ''}`, headers, rows);
  };

  const handleExportPDF = () => {
    exportFieldYieldRankingPDF(fieldData, seasonData, selectedSeason, farmName);
  };

  const currentSeason = seasonData.find((s) => s.seasonId === selectedSeason);

  if (fieldData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Field Yield Ranking" description="Compare yield performance across all fields">
        <div className="text-center py-12 text-gray-400">No yield data available yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Field Yield Ranking"
      description="Compare yield performance across all fields for a selected season"
      onExportCSV={sorted.length > 0 ? handleExportCSV : undefined}
      onExportPDF={sorted.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Field Yield Ranking" seasonName={currentSeason?.seasonName} />

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
        <div className="text-center py-12 text-gray-400">No yield data for this selection.</div>
      ) : (
        <>
          {selectedCrop === 'all' && availableCrops.length > 1 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Season Average by Crop</p>
              <div className="flex flex-wrap gap-3">
                {availableCrops.map((crop) => {
                  const avg = cropAvgYield.get(crop) ?? 0;
                  const count = seasonFields.filter((f) => f.cropType === crop).length;
                  return (
                    <div
                      key={crop}
                      className={`flex items-center gap-3 ${CROP_BG[crop]} rounded-xl px-4 py-3 flex-1 min-w-[140px]`}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: CROP_COLORS[crop] }}
                      />
                      <div>
                        <p className={`text-xs font-medium ${CROP_LABEL_TEXT[crop]}`}>{CROP_LABELS[crop]} Avg</p>
                        <p className={`text-base font-bold ${CROP_TEXT[crop]}`}>{fmt2(avg)} bu/ac</p>
                        <p className={`text-xs ${CROP_LABEL_TEXT[crop]} opacity-80`}>{count} field{count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-blue-600 mb-1">Top Field</p>
              <p className="text-lg font-bold text-blue-900">{sorted[0].fieldName}</p>
              <p className="text-sm text-blue-700">{fmt2(sorted[0].yieldPerAcre ?? 0)} bu/ac</p>
            </div>
            {selectedCrop !== 'all' ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-gray-600 mb-1">Season Average</p>
                <p className="text-lg font-bold text-gray-900">{fmt2(singleAvg)} bu/ac</p>
                <p className="text-sm text-gray-500">{sorted.length} fields</p>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-gray-600 mb-1">Total Fields</p>
                <p className="text-lg font-bold text-gray-900">{sorted.length}</p>
                <p className="text-sm text-gray-500">{availableCrops.length} crop type{availableCrops.length !== 1 ? 's' : ''}</p>
              </div>
            )}
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-xs font-medium text-amber-600 mb-1">Bottom Field</p>
              <p className="text-lg font-bold text-amber-900">{sorted[sorted.length - 1].fieldName}</p>
              <p className="text-sm text-amber-700">{fmt2(sorted[sorted.length - 1].yieldPerAcre ?? 0)} bu/ac</p>
            </div>
          </div>

          <div className="mb-8">
            <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 36)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} unit=" bu/ac" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="yield" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, formatter: (v: number) => `${fmt2(v)}` }}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={CROP_COLORS[entry.cropType]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Rank</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Field</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Acres</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Yield (bu/ac)</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Total Yield</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">vs Crop Avg</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const cropAvg = cropAvgYield.get(f.cropType) ?? 0;
                  const diff = (f.yieldPerAcre ?? 0) - cropAvg;
                  return (
                    <tr key={f.fieldId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          i === 0 ? 'bg-blue-100 text-blue-700' : i === sorted.length - 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{f.fieldName}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: CROP_COLORS[f.cropType] + '22', color: CROP_COLORS[f.cropType] }}>
                          {CROP_LABELS[f.cropType]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{f.acres.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{fmt2(f.yieldPerAcre ?? 0)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{(f.totalYield ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} bu</td>
                      <td className={`py-2.5 px-3 text-right font-medium ${diff >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        {diff >= 0 ? '+' : ''}{fmt2(diff)}
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

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { FieldPerformanceSummary, SeasonSummary, CostBreakdown } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportFieldCostComparisonPDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';

const COST_CATEGORY_LABELS: Record<keyof CostBreakdown, string> = {
  seed: 'Seed',
  fertilizer: 'Fertilizer',
  chemical: 'Chemical',
  tillage: 'Tillage',
  planting: 'Planting',
  harvest: 'Harvest',
  equipment: 'Equipment',
  customServices: 'Custom Services',
  labor: 'Labor',
  cropInsurance: 'Crop Insurance',
  dryingStorage: 'Drying/Storage',
  hauling: 'Hauling',
  landRent: 'Land Rent',
  propertyTax: 'Property Tax',
  other: 'Other',
};

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const BAR_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#0891b2', '#7c3aed'];

const fmt = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtAcre = (v: number) => `${fmt(v)}/ac`;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium">{fmtAcre(p.value)}</span>
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

export function FieldCostComparison({ fieldData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || seasonData[seasonData.length - 1]?.seasonId || '');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');
  const [view, setView] = useState<'total' | 'breakdown'>('total');

  const seasonFields = fieldData.filter((f) => f.seasonId === selectedSeason);
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === selectedCrop);
  const sorted = [...cropFiltered].sort((a, b) => a.costPerAcre - b.costPerAcre);

  const availableCrops = [...new Set(seasonFields.map((f) => f.cropType))];
  const currentSeason = seasonData.find((s) => s.seasonId === selectedSeason);
  const avgCost = sorted.length > 0 ? sorted.reduce((s, f) => s + f.costPerAcre, 0) / sorted.length : 0;

  const totalChartData = sorted.map((f) => ({
    name: f.fieldName.length > 14 ? f.fieldName.slice(0, 14) + '…' : f.fieldName,
    costPerAcre: Math.round(f.costPerAcre),
    cropType: f.cropType,
  }));

  const breakdownFields = sorted.slice(0, 8);
  const breakdownKeys = (Object.keys(COST_CATEGORY_LABELS) as (keyof CostBreakdown)[]).filter(
    (k) => breakdownFields.some((f) => f.costBreakdown[k] > 0)
  );
  const breakdownChartData = breakdownFields.map((f) => ({
    name: f.fieldName.length > 12 ? f.fieldName.slice(0, 12) + '…' : f.fieldName,
    ...Object.fromEntries(breakdownKeys.map((k) => [COST_CATEGORY_LABELS[k], Math.round(f.costBreakdown[k])])),
  }));

  const handleExportCSV = () => {
    const keys = Object.keys(COST_CATEGORY_LABELS) as (keyof CostBreakdown)[];
    const headers = ['Field', 'Crop', 'Acres', 'Total $/ac', ...keys.map((k) => `${COST_CATEGORY_LABELS[k]} $/ac`)];
    const rows = sorted.map((f) => [
      f.fieldName,
      CROP_LABELS[f.cropType],
      f.acres.toFixed(1),
      f.costPerAcre.toFixed(2),
      ...keys.map((k) => f.costBreakdown[k].toFixed(2)),
    ]);
    exportTableToCSV(`field-cost-comparison-${currentSeason?.seasonName || ''}`, headers, rows);
  };

  const handleExportPDF = () => {
    exportFieldCostComparisonPDF(fieldData, seasonData, selectedSeason, farmName);
  };

  if (fieldData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Field Cost Comparison" description="Side-by-side cost per acre across all fields">
        <div className="text-center py-12 text-gray-400">No cost data available yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Field Cost Comparison"
      description="Compare total and itemized costs per acre across all fields in a season"
      onExportCSV={sorted.length > 0 ? handleExportCSV : undefined}
      onExportPDF={sorted.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Field Cost Comparison" seasonName={currentSeason?.seasonName} />

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
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Chart View</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setView('total')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${view === 'total' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Total
            </button>
            <button
              onClick={() => setView('breakdown')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${view === 'breakdown' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Breakdown
            </button>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No cost data for this selection.</div>
      ) : (
        <>
          {view === 'total' && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-500">Season average:</span>
                <span className="text-sm font-semibold text-gray-900">{fmtAcre(avgCost)}</span>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(260, sorted.length * 36)}>
                <BarChart
                  data={totalChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 80, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v: number) => fmtAcre(v)} />
                  <Bar dataKey="costPerAcre" name="Cost/Acre" fill="#2563eb" radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fontSize: 11, formatter: (v: number) => fmtAcre(v) }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {view === 'breakdown' && breakdownChartData.length > 0 && (
            <div className="mb-8">
              <p className="text-xs text-gray-500 mb-3">Showing top {breakdownFields.length} fields by lowest cost</p>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={breakdownChartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  {breakdownKeys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={COST_CATEGORY_LABELS[k]}
                      stackId="a"
                      fill={BAR_COLORS[i % BAR_COLORS.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Field</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Acres</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Seed</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Fert</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Chem</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Land</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700 border-l border-gray-200">Total/Ac</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const diff = f.costPerAcre - avgCost;
                  return (
                    <tr key={f.fieldId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{f.fieldName}</td>
                      <td className="py-2.5 px-3 text-gray-600">{CROP_LABELS[f.cropType]}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{f.acres.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{fmtAcre(f.costBreakdown.seed)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{fmtAcre(f.costBreakdown.fertilizer)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{fmtAcre(f.costBreakdown.chemical)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{fmtAcre(f.costBreakdown.landRent + f.costBreakdown.propertyTax)}</td>
                      <td className="py-2.5 px-3 text-right border-l border-gray-200">
                        <span className="font-semibold text-gray-900">{fmtAcre(f.costPerAcre)}</span>
                        <span className={`ml-2 text-xs ${diff <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {diff <= 0 ? '' : '+'}{fmt(diff)}/ac
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

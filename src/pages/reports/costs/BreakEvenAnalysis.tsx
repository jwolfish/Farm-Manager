import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { FieldPerformanceSummary, SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportBreakEvenPDF } from '../../../lib/pdfExport';
import { CropType } from '../../../lib/database.types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const CROP_LABELS: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const fmt2 = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Mode = 'price' | 'yield';

function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const be = payload.find((p: any) => p.dataKey === 'breakEvenPrice')?.value ?? 0;
  const actual = payload.find((p: any) => p.dataKey === 'actualPrice')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      <p className="text-orange-700">Break-even price: {fmt2(be)}/bu</p>
      {actual != null && <p className="text-green-700">Actual price: {fmt2(actual)}/bu</p>}
      {actual != null && (
        <p className={`text-xs mt-0.5 font-medium ${actual >= be ? 'text-blue-700' : 'text-red-600'}`}>
          {actual >= be ? `+${fmt2(actual - be)}/bu margin` : `${fmt2(actual - be)}/bu below break-even`}
        </p>
      )}
    </div>
  );
}

function YieldTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const be = payload.find((p: any) => p.dataKey === 'breakEvenYield')?.value ?? 0;
  const actual = payload.find((p: any) => p.dataKey === 'actualYield')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      <p className="text-orange-700">Break-even yield: {be.toFixed(1)} bu/ac</p>
      {actual != null && <p className="text-green-700">Actual yield: {actual.toFixed(1)} bu/ac</p>}
      {actual != null && (
        <p className={`text-xs mt-0.5 font-medium ${actual >= be ? 'text-blue-700' : 'text-red-600'}`}>
          {actual >= be
            ? `+${(actual - be).toFixed(1)} bu/ac above break-even`
            : `${(actual - be).toFixed(1)} bu/ac below break-even`}
        </p>
      )}
    </div>
  );
}

interface Props {
  fieldData: FieldPerformanceSummary[];
  seasonData: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

export function BreakEvenAnalysis({ fieldData, seasonData, farmName, currentSeasonId }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(currentSeasonId || seasonData[seasonData.length - 1]?.seasonId || '');
  const [selectedCrop, setSelectedCrop] = useState<CropType | 'all'>('all');
  const [mode, setMode] = useState<Mode>('price');

  const currentSeason = seasonData.find((s) => s.seasonId === selectedSeason);

  const seasonFields = fieldData.filter(
    (f) => f.seasonId === selectedSeason && f.yieldPerAcre != null && f.yieldPerAcre > 0
  );
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === selectedCrop);

  const enriched = cropFiltered.map((f) => {
    const bePrice = f.yieldPerAcre! > 0 ? f.costPerAcre / f.yieldPerAcre! : null;
    const actualPrice = f.revenuePerAcre != null && f.yieldPerAcre! > 0 ? f.revenuePerAcre / f.yieldPerAcre! : null;
    const beYield = actualPrice != null && actualPrice > 0 ? f.costPerAcre / actualPrice : null;
    const priceMargin = bePrice != null && actualPrice != null ? actualPrice - bePrice : null;
    const yieldMargin = beYield != null ? f.yieldPerAcre! - beYield : null;
    return { ...f, bePrice, actualPrice, beYield, priceMargin, yieldMargin };
  });

  const sorted =
    mode === 'price'
      ? [...enriched].sort((a, b) => (a.priceMargin ?? 0) - (b.priceMargin ?? 0))
      : [...enriched].sort((a, b) => (a.yieldMargin ?? 0) - (b.yieldMargin ?? 0));

  const availableCrops = [...new Set(seasonFields.map((f) => f.cropType))];

  const priceChartData = sorted.map((f) => ({
    name: f.fieldName.length > 14 ? f.fieldName.slice(0, 14) + '…' : f.fieldName,
    fullName: f.fieldName,
    breakEvenPrice: f.bePrice != null ? Math.round(f.bePrice * 100) / 100 : null,
    actualPrice: f.actualPrice != null ? Math.round(f.actualPrice * 100) / 100 : null,
    margin: f.priceMargin,
    profitable: (f.priceMargin ?? 0) >= 0,
  }));

  const yieldChartData = sorted.map((f) => ({
    name: f.fieldName.length > 14 ? f.fieldName.slice(0, 14) + '…' : f.fieldName,
    fullName: f.fieldName,
    breakEvenYield: f.beYield != null ? Math.round(f.beYield * 10) / 10 : null,
    actualYield: f.yieldPerAcre != null ? Math.round(f.yieldPerAcre * 10) / 10 : null,
    margin: f.yieldMargin,
    profitable: (f.yieldMargin ?? 0) >= 0,
  }));

  const fieldsAboveBE = sorted.filter((f) =>
    mode === 'price' ? (f.priceMargin ?? 0) >= 0 : (f.yieldMargin ?? 0) >= 0
  ).length;
  const avgBEPrice = enriched.filter((f) => f.bePrice != null).reduce((s, f) => s + (f.bePrice ?? 0), 0)
    / (enriched.filter((f) => f.bePrice != null).length || 1);
  const avgBEYield = enriched.filter((f) => f.beYield != null).reduce((s, f) => s + (f.beYield ?? 0), 0)
    / (enriched.filter((f) => f.beYield != null).length || 1);

  const handleExportCSV = () => {
    const headers = ['Field', 'Crop', 'Acres', 'Cost/Ac', 'Actual Yield', 'Break-Even Price', 'Actual Price', 'Price Margin', 'Break-Even Yield', 'Yield Margin'];
    const rows = sorted.map((f) => [
      f.fieldName,
      CROP_LABELS[f.cropType],
      f.acres.toFixed(1),
      f.costPerAcre.toFixed(2),
      f.yieldPerAcre != null ? f.yieldPerAcre.toFixed(1) : 'N/A',
      f.bePrice != null ? f.bePrice.toFixed(2) : 'N/A',
      f.actualPrice != null ? f.actualPrice.toFixed(2) : 'N/A',
      f.priceMargin != null ? f.priceMargin.toFixed(2) : 'N/A',
      f.beYield != null ? f.beYield.toFixed(1) : 'N/A',
      f.yieldMargin != null ? f.yieldMargin.toFixed(1) : 'N/A',
    ]);
    exportTableToCSV(`break-even-analysis-${currentSeason?.seasonName || ''}`, headers, rows);
  };

  const handleExportPDF = () => {
    exportBreakEvenPDF(fieldData, seasonData, selectedSeason, selectedCrop, farmName);
  };

  if (fieldData.length === 0 || seasonData.length === 0) {
    return (
      <ReportCard title="Break-Even Analysis" description="Minimum price and yield required to cover input costs">
        <div className="text-center py-12 text-gray-400">No data available yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Break-Even Analysis"
      description="Minimum price and yield needed to cover input costs, compared against actual results"
      onExportCSV={sorted.length > 0 ? handleExportCSV : undefined}
      onExportPDF={sorted.length > 0 ? handleExportPDF : undefined}
    >
      <ReportHeader farmName={farmName} reportTitle="Break-Even Analysis" seasonName={currentSeason?.seasonName} />

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
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">View Mode</label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button
              onClick={() => setMode('price')}
              className={`flex-1 px-3 py-2 font-medium transition-colors ${
                mode === 'price' ? 'bg-orange-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Price
            </button>
            <button
              onClick={() => setMode('yield')}
              className={`flex-1 px-3 py-2 font-medium transition-colors border-l border-gray-300 ${
                mode === 'yield' ? 'bg-orange-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Yield
            </button>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No yield data available. Enter yield data on fields to see break-even analysis.
        </div>
      ) : (
        <>
          {mode === 'price' ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-orange-600 mb-1">Avg Break-Even Price</p>
                  <p className="text-lg font-bold text-orange-900">{fmt2(avgBEPrice)}/bu</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-green-600 mb-1">Fields Above B/E Price</p>
                  <p className="text-lg font-bold text-green-900">
                    {sorted.filter((f) => f.actualPrice != null).length > 0 ? `${fieldsAboveBE} / ${sorted.filter((f) => f.actualPrice != null).length}` : '—'}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-blue-600 mb-1">Best Price Margin</p>
                  <p className="text-sm font-bold text-blue-900 truncate">
                    {sorted.filter((f) => f.priceMargin != null).sort((a, b) => (b.priceMargin ?? 0) - (a.priceMargin ?? 0))[0]?.fieldName || '—'}
                  </p>
                  <p className="text-xs text-blue-700">
                    {sorted.filter((f) => f.priceMargin != null).sort((a, b) => (b.priceMargin ?? 0) - (a.priceMargin ?? 0))[0]?.priceMargin != null
                      ? `+${fmt2(sorted.filter((f) => f.priceMargin != null).sort((a, b) => (b.priceMargin ?? 0) - (a.priceMargin ?? 0))[0].priceMargin!)}/bu`
                      : '—'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-gray-600 mb-1">Fields Analyzed</p>
                  <p className="text-lg font-bold text-gray-900">{sorted.length}</p>
                </div>
              </div>

              <div className="mb-8">
                <ResponsiveContainer width="100%" height={Math.max(280, priceChartData.length * 38)}>
                  <BarChart
                    data={priceChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 100, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip content={<PriceTooltip />} />
                    <Bar dataKey="breakEvenPrice" name="Break-Even Price" radius={[0, 4, 4, 0]}
                      label={{ position: 'right', fontSize: 10, formatter: (v: number) => `$${v.toFixed(2)}` }}>
                      {priceChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.profitable ? '#f97316' : '#dc2626'} opacity={0.85} />
                      ))}
                    </Bar>
                    {priceChartData.some((d) => d.actualPrice != null) && (
                      <Bar dataKey="actualPrice" name="Actual Price" radius={[0, 4, 4, 0]} fill="#16a34a" opacity={0.6} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-400 text-center mt-1">Orange = break-even price needed. Green = actual realized price.</p>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-orange-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-orange-600 mb-1">Avg Break-Even Yield</p>
                  <p className="text-lg font-bold text-orange-900">{avgBEYield.toFixed(1)} bu/ac</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-green-600 mb-1">Fields Above B/E Yield</p>
                  <p className="text-lg font-bold text-green-900">
                    {sorted.filter((f) => f.beYield != null).length > 0 ? `${fieldsAboveBE} / ${sorted.filter((f) => f.beYield != null).length}` : '—'}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-blue-600 mb-1">Best Yield Margin</p>
                  <p className="text-sm font-bold text-blue-900 truncate">
                    {sorted.filter((f) => f.yieldMargin != null).sort((a, b) => (b.yieldMargin ?? 0) - (a.yieldMargin ?? 0))[0]?.fieldName || '—'}
                  </p>
                  <p className="text-xs text-blue-700">
                    {(() => {
                      const best = sorted.filter((f) => f.yieldMargin != null).sort((a, b) => (b.yieldMargin ?? 0) - (a.yieldMargin ?? 0))[0];
                      return best?.yieldMargin != null ? `+${best.yieldMargin.toFixed(1)} bu/ac` : '—';
                    })()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-xs font-medium text-gray-600 mb-1">Fields Analyzed</p>
                  <p className="text-lg font-bold text-gray-900">{sorted.length}</p>
                </div>
              </div>

              <div className="mb-8">
                <ResponsiveContainer width="100%" height={Math.max(280, yieldChartData.length * 38)}>
                  <BarChart
                    data={yieldChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 100, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} bu`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip content={<YieldTooltip />} />
                    <Bar dataKey="breakEvenYield" name="Break-Even Yield" radius={[0, 4, 4, 0]}
                      label={{ position: 'right', fontSize: 10, formatter: (v: number) => `${v.toFixed(0)} bu` }}>
                      {yieldChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.profitable ? '#f97316' : '#dc2626'} opacity={0.85} />
                      ))}
                    </Bar>
                    {yieldChartData.some((d) => d.actualYield != null) && (
                      <Bar dataKey="actualYield" name="Actual Yield" radius={[0, 4, 4, 0]} fill="#16a34a" opacity={0.6} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-400 text-center mt-1">Orange = break-even yield needed. Green = actual yield achieved.</p>
              </div>
            </>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Field</th>
                  <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Crop</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Cost/Ac</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Actual Yield</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">B/E Price</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Actual Price</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">B/E Yield</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((f, i) => {
                  const priceOk = f.priceMargin != null ? f.priceMargin >= 0 : null;
                  const yieldOk = f.yieldMargin != null ? f.yieldMargin >= 0 : null;
                  const bothOk = priceOk !== null && yieldOk !== null;
                  return (
                    <tr key={f.fieldId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{f.fieldName}</td>
                      <td className="py-2.5 px-3 text-gray-600">{CROP_LABELS[f.cropType]}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">${f.costPerAcre.toFixed(2)}/ac</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">
                        {f.yieldPerAcre != null ? `${f.yieldPerAcre.toFixed(1)} bu/ac` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-orange-700 font-medium">
                        {f.bePrice != null ? `${fmt2(f.bePrice)}/bu` : '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-medium ${priceOk === true ? 'text-green-700' : priceOk === false ? 'text-red-600' : 'text-gray-400'}`}>
                        {f.actualPrice != null ? `${fmt2(f.actualPrice)}/bu` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-orange-700 font-medium">
                        {f.beYield != null ? `${f.beYield.toFixed(1)} bu/ac` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {!bothOk ? (
                          <span className="text-gray-400">—</span>
                        ) : priceOk && yieldOk ? (
                          <span className="inline-flex items-center gap-1 text-green-700 font-semibold text-xs">
                            <TrendingUp className="w-3.5 h-3.5" /> Profitable
                          </span>
                        ) : priceOk || yieldOk ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-semibold text-xs">
                            <Minus className="w-3.5 h-3.5" /> Marginal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-xs">
                            <TrendingDown className="w-3.5 h-3.5" /> Below B/E
                          </span>
                        )}
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

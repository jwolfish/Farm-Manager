import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { SeasonSummary, CostBreakdown } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportCostBreakdownPDF } from '../../../lib/pdfExport';
import { AlertTriangle } from 'lucide-react';

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

const PIE_COLORS = [
  '#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#f97316', '#6366f1', '#14b8a6', '#f59e0b',
  '#ef4444', '#8b5cf6', '#10b981',
];

const fmt = (v: number) =>
  v < 0
    ? `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtAcre = (v: number) => `${fmt(v)}/ac`;

function aggregateCostBreakdownPerAcre(season: SeasonSummary): CostBreakdown & { totalAcres: number } {
  const result: CostBreakdown = {
    seed: 0, fertilizer: 0, chemical: 0, tillage: 0, planting: 0,
    harvest: 0, equipment: 0, customServices: 0, labor: 0,
    cropInsurance: 0, dryingStorage: 0, hauling: 0, landRent: 0,
    propertyTax: 0, other: 0,
  };
  const totalAcres = season.totalAcres;
  if (totalAcres === 0) return { ...result, totalAcres: 0 };

  for (const crop of season.cropBreakdown) {
    const w = crop.acres / totalAcres;
    for (const key of Object.keys(result) as (keyof CostBreakdown)[]) {
      result[key] += (crop.costBreakdown[key] / (crop.acres || 1)) * w * totalAcres / totalAcres;
    }
  }
  return { ...result, totalAcres };
}

function buildPieData(breakdown: CostBreakdown) {
  return (Object.keys(COST_CATEGORY_LABELS) as (keyof CostBreakdown)[])
    .map((key) => ({ name: COST_CATEGORY_LABELS[key], value: Math.round(breakdown[key] * 100) / 100 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-sm">
      <p className="font-medium text-gray-900">{d.name}</p>
      <p className="text-gray-600">{fmtAcre(d.value)}</p>
    </div>
  );
}

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

interface Props {
  data: SeasonSummary[];
  farmName?: string | null;
  currentSeasonId?: string | null;
}

export function CostBreakdownComparison({ data, farmName, currentSeasonId }: Props) {
  const activeIdx = currentSeasonId ? data.findIndex((s) => s.seasonId === currentSeasonId) : -1;
  const defaultA = currentSeasonId || data[0]?.seasonId || '';
  const defaultB = activeIdx > 0
    ? data[activeIdx - 1]?.seasonId
    : activeIdx === 0
      ? data[1]?.seasonId || data[0]?.seasonId || ''
      : data[1]?.seasonId || data[0]?.seasonId || '';
  const [seasonA, setSeasonA] = useState<string>(defaultA);
  const [seasonB, setSeasonB] = useState<string>(defaultB);

  const sA = data.find((s) => s.seasonId === seasonA);
  const sB = data.find((s) => s.seasonId === seasonB);

  const bdA = sA ? aggregateCostBreakdownPerAcre(sA) : null;
  const bdB = sB ? aggregateCostBreakdownPerAcre(sB) : null;

  const keys = Object.keys(COST_CATEGORY_LABELS) as (keyof CostBreakdown)[];

  const barData = bdA && bdB
    ? keys
        .filter((k) => (bdA[k] > 0 || bdB[k] > 0))
        .map((k) => ({
          name: COST_CATEGORY_LABELS[k],
          [sA!.seasonName]: Math.round(bdA[k] * 100) / 100,
          [sB!.seasonName]: Math.round(bdB[k] * 100) / 100,
        }))
    : [];

  const tableRows = bdA && bdB
    ? keys
        .filter((k) => bdA[k] > 0 || bdB[k] > 0)
        .map((k) => {
          const valA = bdA[k];
          const valB = bdB[k];
          const change = valB - valA;
          const pct = valA > 0 ? ((change / valA) * 100) : (valB > 0 ? 100 : 0);
          return { key: k, label: COST_CATEGORY_LABELS[k], valA, valB, change, pct };
        })
    : [];

  const bigMovers = tableRows.filter((r) => Math.abs(r.pct) >= 10 && r.valA > 0);

  const handleExportCSV = () => {
    if (!sA || !sB) return;
    const headers = ['Category', `${sA.seasonName} $/ac`, `${sB.seasonName} $/ac`, 'Change $/ac', 'Change %'];
    const rows = tableRows.map((r) => [
      r.label,
      r.valA.toFixed(2),
      r.valB.toFixed(2),
      r.change.toFixed(2),
      r.pct.toFixed(1) + '%',
    ]);
    exportTableToCSV('cost-breakdown-comparison', headers, rows);
  };

  const handleExportPDF = () => {
    exportCostBreakdownPDF(data, seasonA, seasonB, farmName);
  };

  if (data.length === 0) {
    return (
      <ReportCard title="Cost Breakdown by Category" description="Compare cost categories between two seasons">
        <div className="text-center py-12 text-gray-400">No data available yet.</div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Cost Breakdown by Category"
      description="Compare cost categories side-by-side between any two seasons"
      onExportCSV={handleExportCSV}
      onExportPDF={handleExportPDF}
    >
      <ReportHeader farmName={farmName} reportTitle="Cost Breakdown by Category" />

      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Base Season</label>
          <select
            value={seasonA}
            onChange={(e) => setSeasonA(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {data.map((s) => <option key={s.seasonId} value={s.seasonId}>{s.seasonName}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Compare To</label>
          <select
            value={seasonB}
            onChange={(e) => setSeasonB(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {data.map((s) => <option key={s.seasonId} value={s.seasonId}>{s.seasonName}</option>)}
          </select>
        </div>
      </div>

      {bigMovers.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">Notable Cost Changes</p>
              <ul className="text-sm text-amber-700 space-y-0.5">
                {bigMovers.map((r) => (
                  <li key={r.key}>
                    <strong>{r.label}</strong>{' '}
                    {r.change > 0 ? 'increased' : 'decreased'} by {Math.abs(r.pct).toFixed(0)}%
                    ({r.change > 0 ? '+' : ''}{fmtAcre(r.change)})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {barData.length > 0 && sA && sB && (
        <div className="mb-8">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={barData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => fmtAcre(v)} />
              <Legend />
              <Bar dataKey={sA.seasonName} fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar dataKey={sB.seasonName} fill="#16a34a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {bdA && bdB && sA && sB && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {[{ s: sA, bd: bdA }, { s: sB, bd: bdB }].map(({ s, bd }) => {
            const pieData = buildPieData(bd);
            return (
              <div key={s.seasonId} className="flex flex-col">
                <p className="text-sm font-semibold text-gray-700 mb-2 text-center">{s.seasonName}</p>
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      outerRadius={120}
                      dataKey="value"
                      labelLine={false}
                      label={renderCustomLabel}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                    <Legend verticalAlign="bottom" layout="horizontal" formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}

      {tableRows.length > 0 && sA && sB && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Category</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-700">{sA.seasonName}</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-700">{sB.seasonName}</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-700">Change</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-700">% Change</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => {
                const isIncrease = r.change > 0;
                const isBigMover = Math.abs(r.pct) >= 10 && r.valA > 0;
                return (
                  <tr key={r.key} className={`${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'} ${isBigMover ? 'ring-1 ring-inset ring-amber-200' : ''}`}>
                    <td className="py-2.5 px-3 font-medium text-gray-900">
                      {r.label}
                      {isBigMover && <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" />}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{fmtAcre(r.valA)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{fmtAcre(r.valB)}</td>
                    <td className={`py-2.5 px-3 text-right font-medium ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>
                      {r.change > 0 ? '+' : ''}{fmtAcre(r.change)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-medium ${isIncrease ? 'text-red-600' : 'text-green-600'}`}>
                      {r.pct > 0 ? '+' : ''}{r.pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ReportCard>
  );
}

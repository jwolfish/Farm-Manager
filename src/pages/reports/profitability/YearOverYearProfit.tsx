import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { SeasonSummary } from '../../../lib/reportTypes';
import { ReportCard } from '../../../components/reports/ReportCard';
import { ReportHeader } from '../../../components/reports/ReportHeader';
import { exportTableToCSV } from '../../../lib/exportUtils';
import { exportYearOverYearPDF } from '../../../lib/pdfExport';

const fmt = (v: number) =>
  v < 0
    ? `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtAcre = (v: number) => `${fmt(v)}/ac`;

interface Props {
  data: SeasonSummary[];
  farmName?: string | null;
}

interface ChartDatum {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: p.fill }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium text-gray-900">{fmtAcre(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function YearOverYearProfit({ data, farmName }: Props) {
  const chartData: ChartDatum[] = data.map((s) => ({
    name: s.seasonName,
    revenue: s.totalAcres > 0 ? Math.round(s.totalRevenue / s.totalAcres) : 0,
    cost: s.totalAcres > 0 ? Math.round(s.totalCost / s.totalAcres) : 0,
    profit: s.totalAcres > 0 ? Math.round(s.totalNetProfit / s.totalAcres) : 0,
  }));

  const handleExportCSV = () => {
    const headers = ['Season', 'Total Acres', 'Revenue/Acre', 'Cost/Acre', 'Net Profit/Acre', 'Total Revenue', 'Total Cost', 'Total Net Profit'];
    const rows = data.map((s) => [
      s.seasonName,
      s.totalAcres,
      s.totalAcres > 0 ? (s.totalRevenue / s.totalAcres).toFixed(2) : '0',
      s.totalAcres > 0 ? (s.totalCost / s.totalAcres).toFixed(2) : '0',
      s.totalAcres > 0 ? (s.totalNetProfit / s.totalAcres).toFixed(2) : '0',
      s.totalRevenue.toFixed(2),
      s.totalCost.toFixed(2),
      s.totalNetProfit.toFixed(2),
    ]);
    exportTableToCSV('year-over-year-profit', headers, rows);
  };

  const handleExportPDF = () => {
    exportYearOverYearPDF(data, farmName);
  };

  if (data.length === 0) {
    return (
      <ReportCard title="Year-Over-Year Profit Summary" description="Revenue, cost, and net profit per acre across all seasons">
        <div className="text-center py-12 text-gray-400">
          No season data available yet. Add fields and cost records to see profitability trends.
        </div>
      </ReportCard>
    );
  }

  return (
    <ReportCard
      title="Year-Over-Year Profit Summary"
      description="Revenue, cost, and net profit per acre across all seasons"
      onExportCSV={handleExportCSV}
      onExportPDF={handleExportPDF}
    >
      <div>
        <ReportHeader farmName={farmName} reportTitle="Year-Over-Year Profit Summary" />

        <div className="mb-8">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Bar dataKey="revenue" name="Revenue/Acre" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" name="Cost/Acre" fill="#dc2626" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Net Profit/Acre" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-3 font-semibold text-gray-700">Season</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">Acres</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">Revenue/Ac</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">Cost/Ac</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">Net Profit/Ac</th>
                <th className="text-right py-3 px-3 font-semibold text-gray-700">Total Net</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s, i) => {
                const revAcre = s.totalAcres > 0 ? s.totalRevenue / s.totalAcres : 0;
                const costAcre = s.totalAcres > 0 ? s.totalCost / s.totalAcres : 0;
                const profitAcre = s.totalAcres > 0 ? s.totalNetProfit / s.totalAcres : 0;
                const isProfit = s.totalNetProfit >= 0;
                return (
                  <tr key={s.seasonId} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="py-3 px-3 font-medium text-gray-900">{s.seasonName}</td>
                    <td className="py-3 px-3 text-right text-gray-600">{s.totalAcres.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-green-700 font-medium">{fmtAcre(revAcre)}</td>
                    <td className="py-3 px-3 text-right text-red-600 font-medium">{fmtAcre(costAcre)}</td>
                    <td className={`py-3 px-3 text-right font-semibold ${isProfit ? 'text-blue-700' : 'text-red-700'}`}>
                      {fmtAcre(profitAcre)}
                    </td>
                    <td className={`py-3 px-3 text-right font-semibold ${isProfit ? 'text-blue-700' : 'text-red-700'}`}>
                      {fmt(s.totalNetProfit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data.some((s) => s.cropBreakdown.length > 0) && (
          <div className="mt-8">
            <h4 className="font-semibold text-gray-800 mb-4">Crop Breakdown by Season</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Season</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Crop</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Acres</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Revenue/Ac</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Cost/Ac</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Profit/Ac</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flatMap((s) =>
                    s.cropBreakdown.map((c, ci) => {
                      const isProfit = c.netProfitPerAcre >= 0;
                      const cropLabel = c.cropType.charAt(0).toUpperCase() + c.cropType.slice(1);
                      return (
                        <tr key={`${s.seasonId}-${c.cropType}`} className={ci % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="py-2 px-3 text-gray-600">{s.seasonName}</td>
                          <td className="py-2 px-3 font-medium text-gray-900">{cropLabel}</td>
                          <td className="py-2 px-3 text-right text-gray-600">{c.acres.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-green-700">{fmtAcre(c.revenuePerAcre)}</td>
                          <td className="py-2 px-3 text-right text-red-600">{fmtAcre(c.costPerAcre)}</td>
                          <td className={`py-2 px-3 text-right font-semibold ${isProfit ? 'text-blue-700' : 'text-red-700'}`}>
                            {fmtAcre(c.netProfitPerAcre)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ReportCard>
  );
}

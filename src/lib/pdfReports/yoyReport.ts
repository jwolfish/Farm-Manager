import { SeasonSummary } from '../reportTypes';
import { fmt, fmtAcre } from './pdfFormatters';
import { esc } from '../htmlEscape';
import { COLORS } from './pdfFormatters';
import { getPDFStyles } from './pdfStyles';
import { buildBarChartSVG } from './pdfCharts';

export function exportYearOverYearPDF(data: SeasonSummary[], farmName?: string | null) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const totalRevenue = data.reduce((s, d) => s + d.totalRevenue, 0);
  const totalCost = data.reduce((s, d) => s + d.totalCost, 0);
  const totalProfit = data.reduce((s, d) => s + d.totalNetProfit, 0);

  const barData = data.map((s) => ({
    label: s.seasonName,
    values: [
      { value: s.totalAcres > 0 ? Math.round(s.totalRevenue / s.totalAcres) : 0, color: COLORS.revenue, name: 'Revenue/Ac' },
      { value: s.totalAcres > 0 ? Math.round(s.totalCost / s.totalAcres) : 0, color: COLORS.cost, name: 'Cost/Ac' },
      { value: s.totalAcres > 0 ? Math.round(s.totalNetProfit / s.totalAcres) : 0, color: COLORS.profit, name: 'Net Profit/Ac' },
    ],
  }));

  const chartSVG = buildBarChartSVG(barData, 760, 300);

  const tableRows = data.map((s) => {
    const revAcre = s.totalAcres > 0 ? s.totalRevenue / s.totalAcres : 0;
    const costAcre = s.totalAcres > 0 ? s.totalCost / s.totalAcres : 0;
    const profitAcre = s.totalAcres > 0 ? s.totalNetProfit / s.totalAcres : 0;
    const isProfit = s.totalNetProfit >= 0;
    return `
      <tr>
        <td class="bold">${esc(s.seasonName)}</td>
        <td class="num">${s.totalAcres.toLocaleString()}</td>
        <td class="num green">${fmtAcre(revAcre)}</td>
        <td class="num red">${fmtAcre(costAcre)}</td>
        <td class="num ${isProfit ? 'blue' : 'red-neg'}">${fmtAcre(profitAcre)}</td>
        <td class="num">${fmt(s.totalRevenue)}</td>
        <td class="num">${fmt(s.totalCost)}</td>
        <td class="num ${isProfit ? 'blue' : 'red-neg'}">${fmt(s.totalNetProfit)}</td>
      </tr>
    `;
  }).join('');

  const cropRows = data.flatMap((s) =>
    s.cropBreakdown.map((c) => {
      const isProfit = c.netProfitPerAcre >= 0;
      const cropLabel = c.cropType.charAt(0).toUpperCase() + c.cropType.slice(1);
      return `
        <tr>
          <td>${esc(s.seasonName)}</td>
          <td class="bold">${cropLabel}</td>
          <td class="num">${c.acres.toLocaleString()}</td>
          <td class="num green">${fmtAcre(c.revenuePerAcre)}</td>
          <td class="num red">${fmtAcre(c.costPerAcre)}</td>
          <td class="num ${isProfit ? 'blue' : 'red-neg'}">${fmtAcre(c.netProfitPerAcre)}</td>
        </tr>
      `;
    })
  ).join('');

  const hasCropBreakdown = data.some((s) => s.cropBreakdown.length > 0);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Year-Over-Year Profit Summary${farmName ? ' — ' + esc(farmName) : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div class="report-header-left">
      <div class="logo-mark">
        <div class="dot">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a10 10 0 0 1 10 10"/>
            <path d="M12 2v20"/>
            <path d="M2 12h20"/>
          </svg>
        </div>
        <span class="app-name">Farm Tracker</span>
      </div>
      ${farmName ? `<div class="farm-name">${esc(farmName)}</div>` : ''}
      <h1>Year-Over-Year Profit Summary</h1>
    </div>
    <div class="report-header-right">
      <div class="generated">Generated ${now}</div>
      <div class="generated">${data.length} Season${data.length !== 1 ? 's' : ''} Analyzed</div>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Total Revenue</div>
      <div class="value green">${fmt(totalRevenue)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Cost</div>
      <div class="value red">${fmt(totalCost)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Net Profit</div>
      <div class="value ${totalProfit >= 0 ? 'blue' : 'red'}">${fmt(totalProfit)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Revenue, Cost &amp; Profit Per Acre by Season</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Season Summary</div>
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th class="num">Acres</th>
          <th class="num">Revenue/Ac</th>
          <th class="num">Cost/Ac</th>
          <th class="num">Net Profit/Ac</th>
          <th class="num">Total Revenue</th>
          <th class="num">Total Cost</th>
          <th class="num">Total Net Profit</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  ${hasCropBreakdown ? `
  <div class="section">
    <div class="section-title">Crop Breakdown by Season</div>
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Crop</th>
          <th class="num">Acres</th>
          <th class="num">Revenue/Ac</th>
          <th class="num">Cost/Ac</th>
          <th class="num">Profit/Ac</th>
        </tr>
      </thead>
      <tbody>${cropRows}</tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Year-Over-Year Profit Summary &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  if (newWin) {
    newWin.addEventListener('load', () => {
      newWin.print();
      URL.revokeObjectURL(url);
    });
  }
}

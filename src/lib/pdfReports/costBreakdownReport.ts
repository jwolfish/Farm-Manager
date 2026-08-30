import { SeasonSummary, CostBreakdown } from '../reportTypes';
import { fmtAcre, openPDF, COLORS, COST_CATEGORY_LABELS } from './pdfFormatters';
import { esc } from '../htmlEscape';
import { getPDFStyles } from './pdfStyles';
import { buildBarChartSVG, buildPieChartSVG } from './pdfCharts';

function aggregateCostBreakdownPerAcre(season: SeasonSummary): CostBreakdown {
  const result: CostBreakdown = {
    seed: 0, fertilizer: 0, chemical: 0, tillage: 0, planting: 0,
    harvest: 0, equipment: 0, customServices: 0, labor: 0,
    cropInsurance: 0, dryingStorage: 0, hauling: 0, landRent: 0,
    propertyTax: 0, other: 0,
  };
  const totalAcres = season.totalAcres;
  if (totalAcres === 0) return result;
  for (const crop of season.cropBreakdown) {
    const w = crop.acres / totalAcres;
    for (const key of Object.keys(result) as (keyof CostBreakdown)[]) {
      result[key] += (crop.costBreakdown[key] / (crop.acres || 1)) * w;
    }
  }
  return result;
}

export function exportCostBreakdownPDF(
  data: SeasonSummary[],
  seasonAId: string,
  seasonBId: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const sA = data.find((s) => s.seasonId === seasonAId);
  const sB = data.find((s) => s.seasonId === seasonBId);
  if (!sA || !sB) return;

  const bdA = aggregateCostBreakdownPerAcre(sA);
  const bdB = aggregateCostBreakdownPerAcre(sB);
  const keys = Object.keys(COST_CATEGORY_LABELS) as (keyof CostBreakdown)[];

  const activeKeys = keys.filter((k) => bdA[k] > 0 || bdB[k] > 0);

  const tableRows = activeKeys.map((k) => {
    const valA = bdA[k];
    const valB = bdB[k];
    const change = valB - valA;
    const pct = valA > 0 ? ((change / valA) * 100) : (valB > 0 ? 100 : 0);
    const isBig = Math.abs(pct) >= 10 && valA > 0;
    const changeClass = change > 0 ? 'red' : 'green';
    return `
      <tr class="${isBig ? 'highlight-row' : ''}">
        <td class="bold">${COST_CATEGORY_LABELS[k]}</td>
        <td class="num">${fmtAcre(valA)}</td>
        <td class="num">${fmtAcre(valB)}</td>
        <td class="num ${changeClass}">${change > 0 ? '+' : ''}${fmtAcre(change)}</td>
        <td class="num ${changeClass}">${pct > 0 ? '+' : ''}${pct.toFixed(1)}%</td>
      </tr>
    `;
  }).join('');

  const bigMovers = activeKeys
    .map((k) => {
      const valA = bdA[k];
      const valB = bdB[k];
      const change = valB - valA;
      const pct = valA > 0 ? ((change / valA) * 100) : 0;
      return { k, valA, change, pct };
    })
    .filter((r) => Math.abs(r.pct) >= 10 && r.valA > 0);

  const barData = activeKeys.map((k) => ({
    label: COST_CATEGORY_LABELS[k],
    values: [
      { value: Math.round(bdA[k] * 100) / 100, color: COLORS.seasonA, name: sA.seasonName },
      { value: Math.round(bdB[k] * 100) / 100, color: COLORS.seasonB, name: sB.seasonName },
    ],
  }));

  const chartSVG = buildBarChartSVG(barData, 760, 340);

  const pieDataA = activeKeys
    .map((k) => ({ name: COST_CATEGORY_LABELS[k], value: Math.round(bdA[k] * 100) / 100 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const pieDataB = activeKeys
    .map((k) => ({ name: COST_CATEGORY_LABELS[k], value: Math.round(bdB[k] * 100) / 100 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const pieA = buildPieChartSVG(pieDataA, 340, sA.seasonName);
  const pieB = buildPieChartSVG(pieDataB, 340, sB.seasonName);

  const totalA = activeKeys.reduce((s, k) => s + bdA[k], 0);
  const totalB = activeKeys.reduce((s, k) => s + bdB[k], 0);
  const totalChange = totalB - totalA;

  const alertSection = bigMovers.length > 0 ? `
    <div class="alert-box">
      <h4>Notable Cost Changes (&ge;10% movement)</h4>
      <ul>
        ${bigMovers.map((r) => `
          <li><strong>${COST_CATEGORY_LABELS[r.k]}</strong> ${r.change > 0 ? 'increased' : 'decreased'} by ${Math.abs(r.pct).toFixed(0)}% (${r.change > 0 ? '+' : ''}${fmtAcre(r.change)})</li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Cost Breakdown Comparison${farmName ? ' — ' + esc(farmName) : ''}</title>
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
      <h1>Cost Breakdown Comparison</h1>
    </div>
    <div class="report-header-right">
      <div class="generated">Generated ${now}</div>
      <div class="generated">Comparing ${esc(sA.seasonName)} vs ${esc(sB.seasonName)}</div>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">${esc(sA.seasonName)} Total Cost/Ac</div>
      <div class="value red">${fmtAcre(totalA)}</div>
    </div>
    <div class="stat-card">
      <div class="label">${esc(sB.seasonName)} Total Cost/Ac</div>
      <div class="value red">${fmtAcre(totalB)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Net Change</div>
      <div class="value ${totalChange >= 0 ? 'red' : 'green'}">${totalChange > 0 ? '+' : ''}${fmtAcre(totalChange)}</div>
    </div>
  </div>

  ${alertSection}

  <div class="section">
    <div class="section-title">Cost Category Comparison — ${esc(sA.seasonName)} vs ${esc(sB.seasonName)}</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Cost Distribution</div>
    <div class="pie-row">
      ${pieA}
      ${pieB}
    </div>
  </div>

  <div class="section page-break">
    <div class="section-title">Detailed Cost Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th class="num">${esc(sA.seasonName)}</th>
          <th class="num">${esc(sB.seasonName)}</th>
          <th class="num">Change</th>
          <th class="num">% Change</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Cost Breakdown Comparison &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

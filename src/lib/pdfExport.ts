import { SeasonSummary, CostBreakdown, FieldPerformanceSummary, SaleRecord } from './reportTypes';
import { CropType } from './database.types';

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

const COLORS = {
  revenue: '#16a34a',
  cost: '#dc2626',
  profit: '#2563eb',
  seasonA: '#2563eb',
  seasonB: '#16a34a',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
};

const PIE_COLORS = [
  '#16a34a', '#2563eb', '#d97706', '#dc2626', '#0891b2',
  '#db2777', '#65a30d', '#f97316', '#14b8a6', '#f59e0b',
  '#ef4444', '#10b981', '#84cc16', '#06b6d4', '#f43f5e',
];

function fmt(v: number): string {
  if (v < 0) return `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtAcre(v: number): string {
  return `${fmt(v)}/ac`;
}

function fmtFull(v: number): string {
  if (v < 0) return `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildBarChartSVG(
  data: { label: string; values: { value: number; color: string; name: string }[] }[],
  width: number,
  height: number
): string {
  const paddingLeft = 70;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 60;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const allValues = data.flatMap((d) => d.values.map((v) => v.value));
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(0, ...allValues);
  const range = maxVal - minVal || 1;
  const yScale = (v: number) => chartH - ((v - minVal) / range) * chartH;
  const zeroY = yScale(0);

  const numGroups = data.length;
  const numBars = data[0]?.values.length || 1;
  const groupWidth = chartW / numGroups;
  const barPadding = 4;
  const barWidth = Math.min(30, (groupWidth - barPadding * (numBars + 1)) / numBars);

  const yTicks = 5;
  const tickStep = range / yTicks;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">`;

  svg += `<rect width="${width}" height="${height}" fill="white"/>`;

  for (let i = 0; i <= yTicks; i++) {
    const val = minVal + tickStep * i;
    const y = paddingTop + yScale(val);
    svg += `<line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartW}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>`;
    const label = val >= 1000 || val <= -1000 ? `$${Math.round(val / 100) / 10}k` : `$${Math.round(val)}`;
    svg += `<text x="${paddingLeft - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="${COLORS.textMuted}">${label}</text>`;
  }

  if (minVal < 0 && maxVal > 0) {
    svg += `<line x1="${paddingLeft}" y1="${paddingTop + zeroY}" x2="${paddingLeft + chartW}" y2="${paddingTop + zeroY}" stroke="#9ca3af" stroke-width="1.5"/>`;
  }

  data.forEach((group, gi) => {
    const groupX = paddingLeft + gi * groupWidth;
    const totalBarW = numBars * barWidth + (numBars - 1) * barPadding;
    const startX = groupX + (groupWidth - totalBarW) / 2;

    group.values.forEach((bar, bi) => {
      const x = startX + bi * (barWidth + barPadding);
      const barTop = bar.value >= 0 ? paddingTop + yScale(bar.value) : paddingTop + zeroY;
      const barH = Math.abs(yScale(bar.value) - zeroY);
      svg += `<rect x="${x}" y="${barTop}" width="${barWidth}" height="${Math.max(barH, 2)}" fill="${bar.color}" rx="2"/>`;
    });

    const labelX = groupX + groupWidth / 2;
    const labelY = paddingTop + chartH + 16;
    const words = group.label.split(' ');
    if (words.length > 1 && group.label.length > 10) {
      svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10" fill="${COLORS.textMuted}">${words[0]}</text>`;
      svg += `<text x="${labelX}" y="${labelY + 12}" text-anchor="middle" font-size="10" fill="${COLORS.textMuted}">${words.slice(1).join(' ')}</text>`;
    } else {
      svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10" fill="${COLORS.textMuted}">${group.label}</text>`;
    }
  });

  svg += `<line x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${paddingTop + chartH}" stroke="${COLORS.border}" stroke-width="1"/>`;

  if (data[0]?.values) {
    const legendY = paddingTop + chartH + 42;
    const legendItems = data[0].values;
    const totalLegendW = legendItems.reduce((acc) => acc + 80, 0);
    const legendStartX = paddingLeft + (chartW - totalLegendW) / 2;
    legendItems.forEach((item, i) => {
      const lx = legendStartX + i * 90;
      svg += `<rect x="${lx}" y="${legendY - 8}" width="10" height="10" fill="${item.color}" rx="2"/>`;
      svg += `<text x="${lx + 14}" y="${legendY}" font-size="10" fill="${COLORS.textMuted}">${item.name}</text>`;
    });
  }

  svg += `</svg>`;
  return svg;
}

function buildPieChartSVG(
  data: { name: string; value: number }[],
  size: number,
  title: string
): string {
  const cx = size / 2;
  const cy = size / 2 - 20;
  const r = size / 2 - 60;
  const total = data.reduce((s, d) => s + d.value, 0);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 40}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">`;
  svg += `<rect width="${size}" height="${size + 40}" fill="white"/>`;
  svg += `<text x="${cx}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="${COLORS.text}">${title}</text>`;

  if (total === 0) {
    svg += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="11" fill="${COLORS.textMuted}">No data</text>`;
    svg += `</svg>`;
    return svg;
  }

  let angle = -Math.PI / 2;
  data.forEach((item, i) => {
    const slice = (item.value / total) * 2 * Math.PI;
    const endAngle = angle + slice;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = slice > Math.PI ? 1 : 0;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    svg += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" stroke="white" stroke-width="1.5"/>`;

    if (slice > 0.15) {
      const midAngle = angle + slice / 2;
      const lx = cx + r * 0.65 * Math.cos(midAngle);
      const ly = cy + r * 0.65 * Math.sin(midAngle);
      const pct = Math.round((item.value / total) * 100);
      svg += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="white">${pct}%</text>`;
    }

    angle = endAngle;
  });

  const cols = 2;
  const legendItemH = 16;
  const legendStartY = cy + r + 20;
  data.slice(0, 8).forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const lx = (size / 2) - 80 + col * 90;
    const ly = legendStartY + row * legendItemH;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    svg += `<rect x="${lx}" y="${ly - 8}" width="8" height="8" fill="${color}" rx="1"/>`;
    const label = item.name.length > 12 ? item.name.slice(0, 11) + '…' : item.name;
    svg += `<text x="${lx + 11}" y="${ly}" font-size="9" fill="${COLORS.textMuted}">${label}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

function getPDFStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #111827;
      background: white;
      font-size: 13px;
      line-height: 1.5;
    }
    .page {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 48px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 32px;
    }
    .report-header-left h1 {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 2px;
    }
    .report-header-left .farm-name {
      font-size: 14px;
      color: #16a34a;
      font-weight: 600;
    }
    .report-header-right {
      text-align: right;
    }
    .report-header-right .generated {
      font-size: 11px;
      color: #9ca3af;
    }
    .logo-mark {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .logo-mark .dot {
      width: 28px;
      height: 28px;
      background: #16a34a;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-mark .app-name {
      font-size: 13px;
      font-weight: 700;
      color: #374151;
    }
    .section {
      margin-bottom: 36px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .chart-wrap {
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    thead tr {
      background: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
    }
    thead th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    thead th.num { text-align: right; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody td {
      padding: 9px 12px;
      color: #374151;
    }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.green { color: #15803d; font-weight: 600; }
    tbody td.red { color: #dc2626; font-weight: 600; }
    tbody td.blue { color: #1d4ed8; font-weight: 700; }
    tbody td.red-neg { color: #dc2626; font-weight: 700; }
    tbody td.bold { font-weight: 600; color: #111827; }
    .highlight-row { background: #fffbeb !important; }
    .alert-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .alert-box h4 {
      font-size: 12px;
      font-weight: 700;
      color: #92400e;
      margin-bottom: 6px;
    }
    .alert-box ul {
      list-style: disc;
      padding-left: 16px;
    }
    .alert-box li {
      font-size: 11px;
      color: #b45309;
      line-height: 1.6;
    }
    .pie-row {
      display: flex;
      gap: 16px;
      justify-content: center;
      margin-bottom: 20px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 14px 16px;
    }
    .stat-card .label {
      font-size: 10px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
    }
    .stat-card .value {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
    }
    .stat-card .value.green { color: #15803d; }
    .stat-card .value.red { color: #dc2626; }
    .stat-card .value.blue { color: #1d4ed8; }
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer p { font-size: 10px; color: #9ca3af; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 20px 24px; }
      .page-break { page-break-before: always; }
    }
  `;
}

export function exportYearOverYearPDF(data: SeasonSummary[], farmName?: string | null) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const mostRecentSeason = data[data.length - 1];
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
        <td class="bold">${s.seasonName}</td>
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
          <td>${s.seasonName}</td>
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
  <title>Year-Over-Year Profit Summary${farmName ? ' — ' + farmName : ''}</title>
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
      ${farmName ? `<div class="farm-name">${farmName}</div>` : ''}
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
  <title>Cost Breakdown Comparison${farmName ? ' — ' + farmName : ''}</title>
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
      ${farmName ? `<div class="farm-name">${farmName}</div>` : ''}
      <h1>Cost Breakdown Comparison</h1>
    </div>
    <div class="report-header-right">
      <div class="generated">Generated ${now}</div>
      <div class="generated">Comparing ${sA.seasonName} vs ${sB.seasonName}</div>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">${sA.seasonName} Total Cost/Ac</div>
      <div class="value red">${fmtAcre(totalA)}</div>
    </div>
    <div class="stat-card">
      <div class="label">${sB.seasonName} Total Cost/Ac</div>
      <div class="value red">${fmtAcre(totalB)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Net Change</div>
      <div class="value ${totalChange >= 0 ? 'red' : 'green'}">${totalChange > 0 ? '+' : ''}${fmtAcre(totalChange)}</div>
    </div>
  </div>

  ${alertSection}

  <div class="section">
    <div class="section-title">Cost Category Comparison — ${sA.seasonName} vs ${sB.seasonName}</div>
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
          <th class="num">${sA.seasonName}</th>
          <th class="num">${sB.seasonName}</th>
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

function openPDF(html: string): void {
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

const CROP_LABELS_PDF: Record<CropType, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

const CROP_COLORS_PDF: Record<CropType, string> = {
  corn: '#f59e0b',
  soybeans: '#16a34a',
  wheat: '#d97706',
};

function fmtBu(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' bu';
}

function pdfHeader(title: string, farmName: string | null | undefined, subtitle: string, now: string): string {
  return `
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
      ${farmName ? `<div class="farm-name">${farmName}</div>` : ''}
      <h1>${title}</h1>
    </div>
    <div class="report-header-right">
      <div class="generated">Generated ${now}</div>
      <div class="generated">${subtitle}</div>
    </div>
  </div>`;
}

function buildHorizontalBarSVG(
  data: { label: string; value: number; color: string }[],
  width: number,
  height: number,
  unit: string
): string {
  const paddingLeft = 110;
  const paddingRight = 60;
  const paddingTop = 10;
  const paddingBottom = 10;
  const chartW = width - paddingLeft - paddingRight;
  const barHeight = Math.min(22, (height - paddingTop - paddingBottom) / data.length - 4);
  const rowH = (height - paddingTop - paddingBottom) / data.length;

  const maxVal = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">`;
  svg += `<rect width="${width}" height="${height}" fill="white"/>`;

  data.forEach((d, i) => {
    const y = paddingTop + i * rowH + (rowH - barHeight) / 2;
    const barW = Math.max(2, (Math.abs(d.value) / maxVal) * chartW);
    svg += `<rect x="${paddingLeft}" y="${y}" width="${barW}" height="${barHeight}" fill="${d.color}" rx="2"/>`;
    const label = d.label.length > 16 ? d.label.slice(0, 15) + '…' : d.label;
    svg += `<text x="${paddingLeft - 6}" y="${y + barHeight / 2 + 4}" text-anchor="end" font-size="10" fill="#6b7280">${label}</text>`;
    const valLabel = unit === '$' ? fmt(d.value) : `${d.value.toFixed(1)} ${unit}`;
    svg += `<text x="${paddingLeft + barW + 5}" y="${y + barHeight / 2 + 4}" font-size="10" fill="#374151">${valLabel}</text>`;
  });

  svg += `</svg>`;
  return svg;
}

export function exportFieldYieldRankingPDF(
  fieldData: FieldPerformanceSummary[],
  seasonData: SeasonSummary[],
  seasonId: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const season = seasonData.find((s) => s.seasonId === seasonId);
  const seasonFields = fieldData.filter((f) => f.seasonId === seasonId && f.yieldPerAcre !== null);
  const sorted = [...seasonFields].sort((a, b) => (b.yieldPerAcre ?? 0) - (a.yieldPerAcre ?? 0));

  if (sorted.length === 0) return;

  const cropAvgMap = new Map<CropType, number>();
  const availableCrops = [...new Set(seasonFields.map((f) => f.cropType))] as CropType[];
  for (const crop of availableCrops) {
    const cf = seasonFields.filter((f) => f.cropType === crop);
    const totalBu = cf.reduce((s, f) => s + (f.totalYield ?? 0), 0);
    const totalAc = cf.reduce((s, f) => s + (f.yieldPerAcre !== null ? f.acres : 0), 0);
    cropAvgMap.set(crop, totalAc > 0 ? totalBu / totalAc : 0);
  }

  const barData = sorted.map((f) => ({
    label: f.fieldName,
    value: Math.round((f.yieldPerAcre ?? 0) * 10) / 10,
    color: CROP_COLORS_PDF[f.cropType],
  }));

  const chartH = Math.max(200, sorted.length * 30);
  const chartSVG = buildHorizontalBarSVG(barData, 760, chartH, 'bu/ac');

  const topField = sorted[0];
  const bottomField = sorted[sorted.length - 1];
  const overallAvg = sorted.reduce((s, f) => s + (f.yieldPerAcre ?? 0), 0) / sorted.length;

  const tableRows = sorted.map((f, i) => {
    const cropAvg = cropAvgMap.get(f.cropType) ?? 0;
    const diff = (f.yieldPerAcre ?? 0) - cropAvg;
    return `
      <tr>
        <td class="bold">${i + 1}</td>
        <td class="bold">${f.fieldName}</td>
        <td>${CROP_LABELS_PDF[f.cropType]}</td>
        <td class="num">${f.acres.toFixed(1)}</td>
        <td class="num bold">${(f.yieldPerAcre ?? 0).toFixed(1)}</td>
        <td class="num">${(f.totalYield ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} bu</td>
        <td class="num ${diff >= 0 ? 'blue' : 'red'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Field Yield Ranking${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Field Yield Ranking', farmName, season?.seasonName ?? '', now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Top Field</div>
      <div class="value blue" style="font-size:16px">${topField.fieldName}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px">${(topField.yieldPerAcre ?? 0).toFixed(1)} bu/ac</div>
    </div>
    <div class="stat-card">
      <div class="label">Season Average</div>
      <div class="value">${overallAvg.toFixed(1)} bu/ac</div>
    </div>
    <div class="stat-card">
      <div class="label">Bottom Field</div>
      <div class="value" style="font-size:16px;color:#d97706">${bottomField.fieldName}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px">${(bottomField.yieldPerAcre ?? 0).toFixed(1)} bu/ac</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Yield Per Acre by Field</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Field Yield Rankings</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Field</th>
          <th>Crop</th>
          <th class="num">Acres</th>
          <th class="num">Yield (bu/ac)</th>
          <th class="num">Total Yield</th>
          <th class="num">vs Crop Avg</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Field Yield Ranking &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportFieldCostComparisonPDF(
  fieldData: FieldPerformanceSummary[],
  seasonData: SeasonSummary[],
  seasonId: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const season = seasonData.find((s) => s.seasonId === seasonId);
  const seasonFields = fieldData.filter((f) => f.seasonId === seasonId);
  const sorted = [...seasonFields].sort((a, b) => a.costPerAcre - b.costPerAcre);

  if (sorted.length === 0) return;

  const avgCost = sorted.reduce((s, f) => s + f.costPerAcre, 0) / sorted.length;

  const barData = sorted.map((f) => ({
    label: f.fieldName,
    value: Math.round(f.costPerAcre),
    color: f.costPerAcre <= avgCost ? '#16a34a' : '#dc2626',
  }));

  const chartH = Math.max(200, sorted.length * 30);
  const chartSVG = buildHorizontalBarSVG(barData, 760, chartH, '$');

  const lowestField = sorted[0];
  const highestField = sorted[sorted.length - 1];

  const tableRows = sorted.map((f) => {
    const diff = f.costPerAcre - avgCost;
    return `
      <tr>
        <td class="bold">${f.fieldName}</td>
        <td>${CROP_LABELS_PDF[f.cropType]}</td>
        <td class="num">${f.acres.toFixed(1)}</td>
        <td class="num">${fmtAcre(f.costBreakdown.seed)}</td>
        <td class="num">${fmtAcre(f.costBreakdown.fertilizer)}</td>
        <td class="num">${fmtAcre(f.costBreakdown.chemical)}</td>
        <td class="num">${fmtAcre(f.costBreakdown.landRent + f.costBreakdown.propertyTax)}</td>
        <td class="num bold">${fmtAcre(f.costPerAcre)}</td>
        <td class="num ${diff <= 0 ? 'green' : 'red'}">${diff > 0 ? '+' : ''}${fmtAcre(diff)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Field Cost Comparison${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Field Cost Comparison', farmName, season?.seasonName ?? '', now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Lowest Cost Field</div>
      <div class="value green" style="font-size:16px">${lowestField.fieldName}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px">${fmtAcre(lowestField.costPerAcre)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Season Average</div>
      <div class="value">${fmtAcre(avgCost)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Highest Cost Field</div>
      <div class="value red" style="font-size:16px">${highestField.fieldName}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px">${fmtAcre(highestField.costPerAcre)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cost Per Acre by Field (green = below avg, red = above avg)</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Field Cost Breakdown</div>
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Crop</th>
          <th class="num">Acres</th>
          <th class="num">Seed</th>
          <th class="num">Fert</th>
          <th class="num">Chem</th>
          <th class="num">Land</th>
          <th class="num">Total/Ac</th>
          <th class="num">vs Avg</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Field Cost Comparison &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportFieldROIPDF(
  fieldData: FieldPerformanceSummary[],
  seasonData: SeasonSummary[],
  seasonId: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const season = seasonData.find((s) => s.seasonId === seasonId);
  const seasonFields = fieldData.filter((f) => f.seasonId === seasonId && f.netProfitPerAcre !== null);
  const sorted = [...seasonFields].sort((a, b) => (b.netProfitPerAcre ?? 0) - (a.netProfitPerAcre ?? 0));

  if (sorted.length === 0) return;

  const profitableCount = sorted.filter((f) => (f.netProfitPerAcre ?? 0) > 0).length;
  const totalNet = sorted.reduce((s, f) => s + (f.totalNetProfit ?? 0), 0);
  const avgNet = sorted.reduce((s, f) => s + (f.netProfitPerAcre ?? 0), 0) / sorted.length;

  const barData = sorted.map((f) => ({
    label: f.fieldName,
    value: Math.round(f.netProfitPerAcre ?? 0),
    color: (f.netProfitPerAcre ?? 0) >= 0 ? '#2563eb' : '#dc2626',
  }));

  const chartH = Math.max(200, sorted.length * 30);
  const chartSVG = buildHorizontalBarSVG(barData, 760, chartH, '$');

  const tableRows = sorted.map((f) => {
    const isProfit = (f.netProfitPerAcre ?? 0) >= 0;
    return `
      <tr>
        <td class="bold">${f.fieldName}</td>
        <td>${CROP_LABELS_PDF[f.cropType]}</td>
        <td class="num">${f.acres.toFixed(1)}</td>
        <td class="num green">${f.revenuePerAcre !== null ? fmtAcre(f.revenuePerAcre) : '—'}</td>
        <td class="num red">${fmtAcre(f.costPerAcre)}</td>
        <td class="num ${isProfit ? 'blue' : 'red-neg'}">${f.netProfitPerAcre !== null ? fmtAcre(f.netProfitPerAcre) : '—'}</td>
        <td class="num ${isProfit ? 'blue' : 'red-neg'}">${f.totalNetProfit !== null ? fmt(f.totalNetProfit) : '—'}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Field ROI &amp; Net Profit${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Field ROI &amp; Net Profit', farmName, season?.seasonName ?? '', now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Total Net Profit</div>
      <div class="value ${totalNet >= 0 ? 'blue' : 'red'}">${fmt(totalNet)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Avg Net/Acre</div>
      <div class="value ${avgNet >= 0 ? 'blue' : 'red'}">${fmtAcre(avgNet)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Profitable Fields</div>
      <div class="value green">${profitableCount} / ${sorted.length}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Net Profit Per Acre by Field</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Field ROI Detail</div>
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Crop</th>
          <th class="num">Acres</th>
          <th class="num">Revenue/Ac</th>
          <th class="num">Cost/Ac</th>
          <th class="num">Net/Ac</th>
          <th class="num">Total Net</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Field ROI &amp; Net Profit &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportSalesByMonthPDF(
  salesData: SaleRecord[],
  seasonData: SeasonSummary[],
  seasonId: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const season = seasonData.find((s) => s.seasonId === seasonId);
  const seasonSales = salesData.filter((s) => s.seasonId === seasonId);

  if (seasonSales.length === 0) return;

  const totalBushels = seasonSales.reduce((s, r) => s + r.bushelsSold, 0);
  const totalRevenue = seasonSales.reduce((s, r) => s + r.totalRevenue, 0);
  const avgPrice = totalBushels > 0 ? totalRevenue / totalBushels : 0;

  const monthMap = new Map<string, { bushels: number; revenue: number }>();
  for (const s of seasonSales) {
    if (!monthMap.has(s.deliveryMonth)) monthMap.set(s.deliveryMonth, { bushels: 0, revenue: 0 });
    const e = monthMap.get(s.deliveryMonth)!;
    e.bushels += s.bushelsSold;
    e.revenue += s.totalRevenue;
  }
  const monthKeys = [...monthMap.keys()].sort();

  const barData = monthKeys.map((m) => {
    const e = monthMap.get(m)!;
    const label = m.length === 7
      ? new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : m;
    return { label, value: Math.round(e.bushels), color: '#0891b2' };
  });

  const chartSVG = buildBarChartSVG(
    barData.map((d) => ({ label: d.label, values: [{ value: d.value, color: d.color, name: 'Bushels' }] })),
    760, 260
  );

  const sorted = [...seasonSales].sort((a, b) => a.saleDate.localeCompare(b.saleDate));
  const tableRows = sorted.map((s) => {
    const dateLabel = new Date(s.saleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const monthLabel = s.deliveryMonth.length === 7
      ? new Date(s.deliveryMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : s.deliveryMonth;
    return `
      <tr>
        <td>${dateLabel}</td>
        <td>${monthLabel}</td>
        <td>${CROP_LABELS_PDF[s.cropType]}</td>
        <td>${s.destination || '—'}</td>
        <td class="num">${fmtBu(s.bushelsSold)}</td>
        <td class="num">$${s.pricePerBushel.toFixed(3)}</td>
        <td class="num green bold">${fmt(s.totalRevenue)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Sales by Delivery Month${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Sales by Delivery Month', farmName, season?.seasonName ?? '', now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Total Bushels</div>
      <div class="value blue">${fmtBu(totalBushels)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Revenue</div>
      <div class="value green">${fmt(totalRevenue)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Avg Price</div>
      <div class="value">$${avgPrice.toFixed(3)}/bu</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Bushels Sold by Delivery Month</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Sale Records</div>
    <table>
      <thead>
        <tr>
          <th>Sale Date</th>
          <th>Delivery</th>
          <th>Crop</th>
          <th>Destination</th>
          <th class="num">Bushels</th>
          <th class="num">Price/bu</th>
          <th class="num">Revenue</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Sales by Delivery Month &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportPricingPerformancePDF(
  salesData: SaleRecord[],
  seasonData: SeasonSummary[],
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (salesData.length === 0) return;

  const byCrop = new Map<CropType, SaleRecord[]>();
  for (const s of salesData) {
    if (!byCrop.has(s.cropType)) byCrop.set(s.cropType, []);
    byCrop.get(s.cropType)!.push(s);
  }

  const statsRows = [...byCrop.entries()].map(([crop, cropSales]) => {
    const prices = cropSales.map((s) => s.pricePerBushel);
    const totalBu = cropSales.reduce((s, r) => s + r.bushelsSold, 0);
    const weightedSum = cropSales.reduce((s, r) => s + r.pricePerBushel * r.bushelsSold, 0);
    const weightedAvg = totalBu > 0 ? weightedSum / totalBu : 0;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const spread = maxPrice - minPrice;
    const spreadPct = weightedAvg > 0 ? (spread / weightedAvg) * 100 : 0;
    return `
      <tr>
        <td class="bold">${CROP_LABELS_PDF[crop]}</td>
        <td class="num">${cropSales.length}</td>
        <td class="num bold">$${weightedAvg.toFixed(3)}/bu</td>
        <td class="num green">$${maxPrice.toFixed(3)}</td>
        <td class="num red">$${minPrice.toFixed(3)}</td>
        <td class="num">$${spread.toFixed(3)} (${spreadPct.toFixed(1)}%)</td>
        <td class="num">${fmtBu(totalBu)}</td>
      </tr>`;
  }).join('');

  const sorted = [...salesData].sort((a, b) => a.saleDate.localeCompare(b.saleDate));

  const allWeightedAvgs = new Map<CropType, number>();
  for (const [crop, cropSales] of byCrop) {
    const totalBu = cropSales.reduce((s, r) => s + r.bushelsSold, 0);
    const weightedSum = cropSales.reduce((s, r) => s + r.pricePerBushel * r.bushelsSold, 0);
    allWeightedAvgs.set(crop, totalBu > 0 ? weightedSum / totalBu : 0);
  }

  const detailRows = sorted.map((s) => {
    const avg = allWeightedAvgs.get(s.cropType) ?? 0;
    const diff = s.pricePerBushel - avg;
    const dateLabel = new Date(s.saleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <tr>
        <td>${s.seasonName}</td>
        <td>${CROP_LABELS_PDF[s.cropType]}</td>
        <td>${dateLabel}</td>
        <td>${s.destination || '—'}</td>
        <td class="num">${fmtBu(s.bushelsSold)}</td>
        <td class="num bold">$${s.pricePerBushel.toFixed(3)}</td>
        <td class="num ${diff >= 0 ? 'green' : 'red'}">${diff >= 0 ? '+' : ''}${diff.toFixed(3)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Pricing Performance${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Pricing Performance', farmName, `${salesData.length} total sale${salesData.length !== 1 ? 's' : ''}`, now)}

  <div class="section">
    <div class="section-title">Price Summary by Crop</div>
    <table>
      <thead>
        <tr>
          <th>Crop</th>
          <th class="num"># Sales</th>
          <th class="num">Weighted Avg</th>
          <th class="num">Best Price</th>
          <th class="num">Worst Price</th>
          <th class="num">Spread</th>
          <th class="num">Total Bushels</th>
        </tr>
      </thead>
      <tbody>${statsRows}</tbody>
    </table>
  </div>

  <div class="section page-break">
    <div class="section-title">All Sales — Price vs Weighted Average</div>
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Crop</th>
          <th>Date</th>
          <th>Destination</th>
          <th class="num">Bushels</th>
          <th class="num">Price/bu</th>
          <th class="num">vs Avg</th>
        </tr>
      </thead>
      <tbody>${detailRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Pricing Performance &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportBuyerBreakdownPDF(
  salesData: SaleRecord[],
  seasonData: SeasonSummary[],
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (salesData.length === 0) return;

  const buyerMap = new Map<string, { destination: string; totalBushels: number; totalRevenue: number; salesCount: number; crops: Set<CropType> }>();
  for (const s of salesData) {
    const dest = s.destination || 'Unknown';
    if (!buyerMap.has(dest)) buyerMap.set(dest, { destination: dest, totalBushels: 0, totalRevenue: 0, salesCount: 0, crops: new Set() });
    const e = buyerMap.get(dest)!;
    e.totalBushels += s.bushelsSold;
    e.totalRevenue += s.totalRevenue;
    e.salesCount += 1;
    e.crops.add(s.cropType);
  }

  const buyers = [...buyerMap.values()].sort((a, b) => b.totalBushels - a.totalBushels);
  const totalBu = buyers.reduce((s, b) => s + b.totalBushels, 0);
  const totalRev = buyers.reduce((s, b) => s + b.totalRevenue, 0);

  const pieData = buyers.map((b) => ({ name: b.destination, value: b.totalBushels }));
  const pieSVG = buildPieChartSVG(pieData, 400, 'Volume by Buyer');

  const barData = buyers.slice(0, 10).map((b) => ({
    label: b.destination.length > 18 ? b.destination.slice(0, 17) + '…' : b.destination,
    value: Math.round(b.totalBushels),
    color: '#2563eb',
  }));
  const barChartSVG = buildHorizontalBarSVG(barData, 760, Math.max(180, buyers.slice(0, 10).length * 30), 'bu');

  const tableRows = buyers.map((b) => {
    const pct = totalBu > 0 ? (b.totalBushels / totalBu) * 100 : 0;
    const avgPrice = b.totalBushels > 0 ? b.totalRevenue / b.totalBushels : 0;
    return `
      <tr>
        <td class="bold">${b.destination}</td>
        <td style="font-size:10px">${[...b.crops].map((c) => CROP_LABELS_PDF[c]).join(', ')}</td>
        <td class="num">${b.salesCount}</td>
        <td class="num">${fmtBu(b.totalBushels)}</td>
        <td class="num">${pct.toFixed(1)}%</td>
        <td class="num green bold">${fmt(b.totalRevenue)}</td>
        <td class="num">$${avgPrice.toFixed(3)}/bu</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Buyer &amp; Destination Breakdown${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Buyer &amp; Destination Breakdown', farmName, `${buyers.length} buyer${buyers.length !== 1 ? 's' : ''}`, now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Total Buyers</div>
      <div class="value blue">${buyers.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Bushels</div>
      <div class="value">${fmtBu(totalBu)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Revenue</div>
      <div class="value green">${fmt(totalRev)}</div>
    </div>
  </div>

  <div style="display:flex;gap:20px;margin-bottom:24px;align-items:flex-start">
    <div style="flex:1">${pieSVG}</div>
    <div style="flex:2">
      <div class="section-title" style="margin-bottom:8px">Top Buyers by Volume</div>
      ${barChartSVG}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Buyer Detail</div>
    <table>
      <thead>
        <tr>
          <th>Destination</th>
          <th>Crops</th>
          <th class="num">Sales</th>
          <th class="num">Bushels</th>
          <th class="num">% of Total</th>
          <th class="num">Revenue</th>
          <th class="num">Avg Price</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Buyer &amp; Destination Breakdown &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportCostPerBushelPDF(
  fieldData: FieldPerformanceSummary[],
  seasonData: SeasonSummary[],
  selectedSeasonId: string,
  selectedCrop: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const season = seasonData.find((s) => s.seasonId === selectedSeasonId);

  const seasonFields = fieldData.filter(
    (f) => f.seasonId === selectedSeasonId && f.yieldPerAcre != null && f.yieldPerAcre > 0
  );
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === (selectedCrop as CropType));
  const sorted = [...cropFiltered].sort((a, b) => {
    return a.costPerAcre / a.yieldPerAcre! - b.costPerAcre / b.yieldPerAcre!;
  });

  if (sorted.length === 0) return;

  const totalAcresForAvg = sorted.reduce((s, f) => s + f.acres, 0);
  const avgCpb = totalAcresForAvg > 0
    ? sorted.reduce((s, f) => s + (f.costPerAcre / f.yieldPerAcre!) * f.acres, 0) / totalAcresForAvg
    : 0;

  const barData = sorted.map((f) => {
    const cpb = f.costPerAcre / f.yieldPerAcre!;
    return {
      label: f.fieldName.length > 16 ? f.fieldName.slice(0, 15) + '…' : f.fieldName,
      value: Math.round(cpb * 100) / 100,
      color: cpb > avgCpb ? COLORS.cost : '#f97316',
    };
  });

  const chartSVG = buildHorizontalBarSVG(barData, 760, Math.max(200, sorted.length * 28 + 60), '$');

  const tableRows = sorted.map((f) => {
    const cpb = f.costPerAcre / f.yieldPerAcre!;
    const rpb = f.revenuePerAcre != null ? f.revenuePerAcre / f.yieldPerAcre! : null;
    const margin = rpb != null ? rpb - cpb : null;
    const isAboveAvg = cpb > avgCpb;
    return `<tr>
      <td class="bold">${f.fieldName}</td>
      <td>${CROP_LABELS_PDF[f.cropType]}</td>
      <td class="num">${f.acres.toFixed(1)}</td>
      <td class="num">${f.yieldPerAcre!.toFixed(1)} bu</td>
      <td class="num">$${f.costPerAcre.toFixed(2)}/ac</td>
      <td class="num" style="color:${isAboveAvg ? '#dc2626' : '#ea580c'};font-weight:600">$${cpb.toFixed(2)}</td>
      <td class="num green">${rpb != null ? `$${rpb.toFixed(2)}` : '—'}</td>
      <td class="num ${margin == null ? '' : margin >= 0 ? 'blue' : 'red'}">${margin != null ? `$${margin >= 0 ? '' : '-'}${Math.abs(margin).toFixed(2)}` : '—'}</td>
    </tr>`;
  }).join('');

  const lowestCpb = sorted[0];
  const fieldsUnderRevenue = sorted.filter((f) => {
    if (f.revenuePerAcre == null) return false;
    return f.costPerAcre / f.yieldPerAcre! < f.revenuePerAcre / f.yieldPerAcre!;
  }).length;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Cost Per Bushel${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Cost Per Bushel', farmName, `${season?.seasonName || ''} · ${sorted.length} Field${sorted.length !== 1 ? 's' : ''}`, now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Avg Cost / Bushel</div>
      <div class="value" style="color:#ea580c">$${avgCpb.toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Most Efficient Field</div>
      <div class="value green" style="font-size:16px">${lowestCpb.fieldName}</div>
    </div>
    <div class="stat-card">
      <div class="label">Profitable Fields</div>
      <div class="value blue">${fieldsUnderRevenue} / ${sorted.filter((f) => f.revenuePerAcre != null).length}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cost Per Bushel by Field</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Field Detail</div>
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Crop</th>
          <th class="num">Acres</th>
          <th class="num">Yield/Ac</th>
          <th class="num">Cost/Ac</th>
          <th class="num">Cost/Bu</th>
          <th class="num">Revenue/Bu</th>
          <th class="num">Margin/Bu</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Cost Per Bushel &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportInputEfficiencyPDF(
  fieldData: FieldPerformanceSummary[],
  seasonData: SeasonSummary[],
  selectedSeasonId: string,
  selectedCrop: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const season = seasonData.find((s) => s.seasonId === selectedSeasonId);

  const seasonFields = fieldData.filter(
    (f) => f.seasonId === selectedSeasonId && f.revenuePerAcre != null && f.costPerAcre > 0
  );
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === (selectedCrop as CropType));
  const sorted = [...cropFiltered].sort((a, b) => {
    return (b.revenuePerAcre! / b.costPerAcre) - (a.revenuePerAcre! / a.costPerAcre);
  });

  if (sorted.length === 0) return;

  const totalRevenue = sorted.reduce((s, f) => s + (f.totalRevenue ?? 0), 0);
  const totalCost = sorted.reduce((s, f) => s + f.totalCost, 0);
  const overallRatio = totalCost > 0 ? totalRevenue / totalCost : 0;
  const avgRatio = sorted.reduce((s, f) => s + (f.revenuePerAcre ?? 0) / f.costPerAcre, 0) / sorted.length;
  const efficientCount = sorted.filter((f) => (f.revenuePerAcre ?? 0) / f.costPerAcre >= 1).length;

  const barData = sorted.map((f) => {
    const ratio = (f.revenuePerAcre ?? 0) / f.costPerAcre;
    return {
      label: f.fieldName.length > 16 ? f.fieldName.slice(0, 15) + '…' : f.fieldName,
      value: Math.round(ratio * 100) / 100,
      color: ratio >= 1 ? COLORS.revenue : COLORS.cost,
    };
  });

  const chartSVG = buildHorizontalBarSVG(barData, 760, Math.max(200, sorted.length * 28 + 60), 'x');

  const tableRows = sorted.map((f) => {
    const ratio = (f.revenuePerAcre ?? 0) / f.costPerAcre;
    const isEfficient = ratio >= 1;
    return `<tr>
      <td class="bold">${f.fieldName}</td>
      <td>${CROP_LABELS_PDF[f.cropType]}</td>
      <td class="num">${f.acres.toFixed(1)}</td>
      <td class="num green">$${f.revenuePerAcre!.toFixed(2)}/ac</td>
      <td class="num red">$${f.costPerAcre.toFixed(2)}/ac</td>
      <td class="num" style="color:${isEfficient ? '#15803d' : '#dc2626'};font-weight:700">${ratio.toFixed(3)}x</td>
      <td class="num ${(f.netProfitPerAcre ?? 0) >= 0 ? 'blue' : 'red-neg'}">${f.netProfitPerAcre != null ? fmtAcre(f.netProfitPerAcre) : '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Input Efficiency Ratio${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Input Efficiency Ratio', farmName, `${season?.seasonName || ''} · ${sorted.length} Field${sorted.length !== 1 ? 's' : ''}`, now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Overall Ratio</div>
      <div class="value ${overallRatio >= 1 ? 'green' : 'red'}">${overallRatio.toFixed(3)}x</div>
    </div>
    <div class="stat-card">
      <div class="label">Avg Field Ratio</div>
      <div class="value ${avgRatio >= 1 ? '' : 'red'}">${avgRatio.toFixed(3)}x</div>
    </div>
    <div class="stat-card">
      <div class="label">Fields Above 1.0x</div>
      <div class="value blue">${efficientCount} / ${sorted.length}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Revenue / Cost Ratio by Field (1.0x = Break-Even)</div>
    <div class="chart-wrap">${chartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Field Detail</div>
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Crop</th>
          <th class="num">Acres</th>
          <th class="num">Revenue/Ac</th>
          <th class="num">Cost/Ac</th>
          <th class="num">Ratio</th>
          <th class="num">Net/Ac</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Input Efficiency Ratio &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

export function exportBreakEvenPDF(
  fieldData: FieldPerformanceSummary[],
  seasonData: SeasonSummary[],
  selectedSeasonId: string,
  selectedCrop: string,
  farmName?: string | null
) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const season = seasonData.find((s) => s.seasonId === selectedSeasonId);

  const seasonFields = fieldData.filter(
    (f) => f.seasonId === selectedSeasonId && f.yieldPerAcre != null && f.yieldPerAcre > 0
  );
  const cropFiltered = selectedCrop === 'all' ? seasonFields : seasonFields.filter((f) => f.cropType === (selectedCrop as CropType));

  if (cropFiltered.length === 0) return;

  const enriched = cropFiltered.map((f) => {
    const bePrice = f.yieldPerAcre! > 0 ? f.costPerAcre / f.yieldPerAcre! : null;
    const actualPrice = f.revenuePerAcre != null && f.yieldPerAcre! > 0 ? f.revenuePerAcre / f.yieldPerAcre! : null;
    const beYield = actualPrice != null && actualPrice > 0 ? f.costPerAcre / actualPrice : null;
    const priceMargin = bePrice != null && actualPrice != null ? actualPrice - bePrice : null;
    const yieldMargin = beYield != null ? f.yieldPerAcre! - beYield : null;
    return { ...f, bePrice, actualPrice, beYield, priceMargin, yieldMargin };
  });

  const avgBEPrice = enriched.filter((f) => f.bePrice != null).reduce((s, f) => s + (f.bePrice ?? 0), 0)
    / (enriched.filter((f) => f.bePrice != null).length || 1);
  const avgBEYield = enriched.filter((f) => f.beYield != null).reduce((s, f) => s + (f.beYield ?? 0), 0)
    / (enriched.filter((f) => f.beYield != null).length || 1);

  const profitable = enriched.filter((f) => (f.priceMargin ?? -1) >= 0 && (f.yieldMargin ?? -1) >= 0).length;
  const belowBE = enriched.filter((f) => (f.priceMargin ?? -1) < 0 || (f.yieldMargin ?? -1) < 0).length;

  const bePriceData = [...enriched]
    .filter((f) => f.bePrice != null)
    .sort((a, b) => (a.priceMargin ?? 0) - (b.priceMargin ?? 0))
    .map((f) => ({
      label: f.fieldName.length > 16 ? f.fieldName.slice(0, 15) + '…' : f.fieldName,
      value: Math.round((f.bePrice ?? 0) * 100) / 100,
      color: (f.priceMargin ?? 0) >= 0 ? '#f97316' : COLORS.cost,
    }));

  const bePriceChartSVG = buildHorizontalBarSVG(bePriceData, 760, Math.max(200, bePriceData.length * 28 + 60), '$');

  const tableRows = enriched.sort((a, b) => (b.priceMargin ?? 0) - (a.priceMargin ?? 0)).map((f) => {
    const priceOk = f.priceMargin != null ? f.priceMargin >= 0 : null;
    const yieldOk = f.yieldMargin != null ? f.yieldMargin >= 0 : null;
    const status = priceOk === null && yieldOk === null ? '—'
      : priceOk && yieldOk ? 'Profitable'
      : priceOk || yieldOk ? 'Marginal'
      : 'Below B/E';
    const statusClass = status === 'Profitable' ? 'blue' : status === 'Marginal' ? '' : 'red';
    return `<tr>
      <td class="bold">${f.fieldName}</td>
      <td>${CROP_LABELS_PDF[f.cropType]}</td>
      <td class="num">$${f.costPerAcre.toFixed(2)}/ac</td>
      <td class="num">${f.yieldPerAcre!.toFixed(1)} bu/ac</td>
      <td class="num" style="color:#ea580c;font-weight:600">${f.bePrice != null ? `$${f.bePrice.toFixed(2)}/bu` : '—'}</td>
      <td class="num ${priceOk === true ? 'green' : priceOk === false ? 'red' : ''}">${f.actualPrice != null ? `$${f.actualPrice.toFixed(2)}/bu` : '—'}</td>
      <td class="num" style="color:#ea580c;font-weight:600">${f.beYield != null ? `${f.beYield.toFixed(1)} bu/ac` : '—'}</td>
      <td class="num ${statusClass}" style="font-weight:600">${status}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Break-Even Analysis${farmName ? ' — ' + farmName : ''}</title>
  <style>${getPDFStyles()}</style>
</head>
<body>
<div class="page">
  ${pdfHeader('Break-Even Analysis', farmName, `${season?.seasonName || ''} · ${enriched.length} Field${enriched.length !== 1 ? 's' : ''}`, now)}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Avg Break-Even Price</div>
      <div class="value" style="color:#ea580c">$${avgBEPrice.toFixed(2)}/bu</div>
    </div>
    <div class="stat-card">
      <div class="label">Avg Break-Even Yield</div>
      <div class="value" style="color:#ea580c">${avgBEYield.toFixed(1)} bu/ac</div>
    </div>
    <div class="stat-card">
      <div class="label">Profitable / Below B/E</div>
      <div class="value"><span style="color:#1d4ed8">${profitable}</span> / <span style="color:#dc2626">${belowBE}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Break-Even Price by Field</div>
    <div class="chart-wrap">${bePriceChartSVG}</div>
  </div>

  <div class="section">
    <div class="section-title">Field Break-Even Detail</div>
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Crop</th>
          <th class="num">Cost/Ac</th>
          <th class="num">Actual Yield</th>
          <th class="num">B/E Price</th>
          <th class="num">Actual Price</th>
          <th class="num">B/E Yield</th>
          <th class="num">Status</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <p>Farm Tracker &mdash; Confidential</p>
    <p>Break-Even Analysis &mdash; ${now}</p>
  </div>
</div>
</body>
</html>`;

  openPDF(html);
}

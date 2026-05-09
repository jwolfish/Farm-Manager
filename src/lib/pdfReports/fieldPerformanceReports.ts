import { FieldPerformanceSummary, SeasonSummary } from '../reportTypes';
import { CropType } from '../database.types';
import { fmt, fmtAcre, openPDF, pdfHeader, CROP_LABELS_PDF, CROP_COLORS_PDF, COLORS } from './pdfFormatters';
import { getPDFStyles } from './pdfStyles';
import { buildHorizontalBarSVG } from './pdfCharts';

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

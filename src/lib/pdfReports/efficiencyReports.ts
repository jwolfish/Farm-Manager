import { FieldPerformanceSummary, SeasonSummary } from '../reportTypes';
import { CropType } from '../database.types';
import { fmt, fmtAcre, openPDF, pdfHeader, CROP_LABELS_PDF, COLORS } from './pdfFormatters';
import { esc } from '../htmlEscape';
import { getPDFStyles } from './pdfStyles';
import { buildHorizontalBarSVG } from './pdfCharts';

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
      <td class="bold">${esc(f.fieldName)}</td>
      <td>${CROP_LABELS_PDF[f.cropType]}</td>
      <td class="num">${f.acres.toFixed(1)}</td>
      <td class="num">${f.yieldPerAcre!.toFixed(1)} bu</td>
      <td class="num">${f.costPerAcre.toFixed(2)}/ac</td>
      <td class="num" style="color:${isAboveAvg ? '#dc2626' : '#ea580c'};font-weight:600">${cpb.toFixed(2)}</td>
      <td class="num green">${rpb != null ? `${rpb.toFixed(2)}` : '—'}</td>
      <td class="num ${margin == null ? '' : margin >= 0 ? 'blue' : 'red'}">${margin != null ? `${margin >= 0 ? '' : '-'}${Math.abs(margin).toFixed(2)}` : '—'}</td>
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
  <title>Cost Per Bushel${farmName ? ' — ' + esc(farmName) : ''}</title>
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
      <div class="value green" style="font-size:16px">${esc(lowestCpb.fieldName)}</div>
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
      <td class="bold">${esc(f.fieldName)}</td>
      <td>${CROP_LABELS_PDF[f.cropType]}</td>
      <td class="num">${f.acres.toFixed(1)}</td>
      <td class="num green">${f.revenuePerAcre!.toFixed(2)}/ac</td>
      <td class="num red">${f.costPerAcre.toFixed(2)}/ac</td>
      <td class="num" style="color:${isEfficient ? '#15803d' : '#dc2626'};font-weight:700">${ratio.toFixed(3)}x</td>
      <td class="num ${(f.netProfitPerAcre ?? 0) >= 0 ? 'blue' : 'red-neg'}">${f.netProfitPerAcre != null ? fmtAcre(f.netProfitPerAcre) : '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Input Efficiency Ratio${farmName ? ' — ' + esc(farmName) : ''}</title>
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
      <td class="bold">${esc(f.fieldName)}</td>
      <td>${CROP_LABELS_PDF[f.cropType]}</td>
      <td class="num">${f.costPerAcre.toFixed(2)}/ac</td>
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
  <title>Break-Even Analysis${farmName ? ' — ' + esc(farmName) : ''}</title>
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

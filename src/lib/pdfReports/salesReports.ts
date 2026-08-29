import { SaleRecord, SeasonSummary } from '../reportTypes';
import { CropType } from '../database.types';
import { fmt, fmtBu, openPDF, pdfHeader, CROP_LABELS_PDF } from './pdfFormatters';
import { esc } from '../htmlEscape';
import { getPDFStyles } from './pdfStyles';
import { buildBarChartSVG, buildPieChartSVG, buildHorizontalBarSVG } from './pdfCharts';

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
        <td>${esc(s.destination || '—')}</td>
        <td class="num">${fmtBu(s.bushelsSold)}</td>
        <td class="num">$${s.pricePerBushel.toFixed(3)}</td>
        <td class="num green bold">${fmt(s.totalRevenue)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Sales by Delivery Month${farmName ? ' — ' + esc(farmName) : ''}</title>
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
        <td>${esc(s.seasonName)}</td>
        <td>${CROP_LABELS_PDF[s.cropType]}</td>
        <td>${dateLabel}</td>
        <td>${esc(s.destination || '—')}</td>
        <td class="num">${fmtBu(s.bushelsSold)}</td>
        <td class="num bold">$${s.pricePerBushel.toFixed(3)}</td>
        <td class="num ${diff >= 0 ? 'green' : 'red'}">${diff >= 0 ? '+' : ''}${diff.toFixed(3)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Pricing Performance${farmName ? ' — ' + esc(farmName) : ''}</title>
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
        <td class="bold">${esc(b.destination)}</td>
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
  <title>Buyer &amp; Destination Breakdown${farmName ? ' — ' + esc(farmName) : ''}</title>
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

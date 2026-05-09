import { COLORS, PIE_COLORS } from './pdfFormatters';

export function buildBarChartSVG(
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

export function buildPieChartSVG(
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

export function buildHorizontalBarSVG(
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

function fmt(v: number): string {
  if (v < 0) return `-$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

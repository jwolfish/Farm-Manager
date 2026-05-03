import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface SeedBagPDFRow {
  fieldName: string;
  cropType: string;
  acreage: number;
  hybridName: string | null;
  seedingRate: number | null;
  bagsNeeded: number | null;
}

export interface SeedBagHybridSummary {
  hybridName: string;
  cropType: string;
  totalBags: number;
  totalAcres: number;
  fieldCount: number;
}

const CROP_RGB: Record<string, [number, number, number]> = {
  corn: [180, 120, 20],
  soybeans: [34, 120, 50],
  wheat: [180, 90, 30],
};

export function exportSeedBagRequirementsPDF(
  rows: SeedBagPDFRow[],
  hybridSummaries: SeedBagHybridSummary[],
  seasonName: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  // Header background
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageW, 52, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Seed Bag Requirements', margin, 22);

  // Season subtitle
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(seasonName, margin, 36);

  // Date top-right
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(dateStr, pageW - margin, 36, { align: 'right' });

  let cursorY = 70;

  // Seed Order Summary section
  if (hybridSummaries.length > 0) {
    doc.setTextColor(75, 85, 99);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SEED ORDER SUMMARY', margin, cursorY);
    cursorY += 10;

    const cardW = (pageW - margin * 2 - (hybridSummaries.length - 1) * 8) / Math.min(hybridSummaries.length, 4);
    const cardH = 52;
    const cols = Math.min(hybridSummaries.length, 4);

    hybridSummaries.forEach((h, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = margin + col * (cardW + 8);
      const y = cursorY + row * (cardH + 6);
      const rgb = CROP_RGB[h.cropType] ?? [100, 100, 100];

      // Card background
      doc.setFillColor(rgb[0], rgb[1], rgb[2], 0.08);
      doc.setFillColor(
        Math.round(255 - (255 - rgb[0]) * 0.12),
        Math.round(255 - (255 - rgb[1]) * 0.12),
        Math.round(255 - (255 - rgb[2]) * 0.12)
      );
      doc.roundedRect(x, y, cardW, cardH, 4, 4, 'F');

      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(h.cropType.charAt(0).toUpperCase() + h.cropType.slice(1), x + 8, y + 12);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      const hybridLines = doc.splitTextToSize(h.hybridName, cardW - 16);
      doc.text(hybridLines[0], x + 8, y + 23);

      doc.setFontSize(14);
      const bagNumWidth = doc.getTextWidth(`${h.totalBags}`);
      doc.text(`${h.totalBags}`, x + 8, y + 39);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('bags', x + 8 + bagNumWidth + 3, y + 39);

      doc.setFontSize(7);
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      doc.text(`${h.fieldCount} field${h.fieldCount !== 1 ? 's' : ''} · ${h.totalAcres.toFixed(1)} ac`, x + 8, y + 49);
    });

    const summaryRows = Math.ceil(hybridSummaries.length / cols);
    cursorY += summaryRows * (cardH + 6) + 14;
  }

  // Main table
  const totalAcres = rows.reduce((s, r) => s + r.acreage, 0);
  const totalBags = rows.reduce((s, r) => s + (r.bagsNeeded ?? 0), 0);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    head: [['Field', 'Crop', 'Acres', 'Hybrid', 'Seeding Rate', 'Bags Needed']],
    body: rows.map((r) => [
      r.fieldName,
      r.cropType.charAt(0).toUpperCase() + r.cropType.slice(1),
      r.acreage.toFixed(1),
      r.hybridName ?? 'Not assigned',
      r.seedingRate != null ? r.seedingRate.toLocaleString() : '—',
      r.bagsNeeded != null ? String(r.bagsNeeded) : '—',
    ]),
    foot: rows.length > 1
      ? [['Total', '', totalAcres.toFixed(1), '', '', String(totalBags)]]
      : undefined,
    headStyles: {
      fillColor: [17, 24, 39],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [31, 41, 55],
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { halign: 'left', cellWidth: 'auto' },
      1: { halign: 'left', cellWidth: 70 },
      2: { halign: 'right', cellWidth: 55 },
      3: { halign: 'left', cellWidth: 'auto' },
      4: { halign: 'right', cellWidth: 80 },
      5: { halign: 'right', cellWidth: 70, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Color "Not assigned" cells amber
      if (data.section === 'body' && data.column.index === 3 && data.cell.raw === 'Not assigned') {
        data.cell.styles.textColor = [180, 120, 20];
        data.cell.styles.fontStyle = 'italic';
      }
      // Color crop type cells by crop
      if (data.section === 'body' && data.column.index === 1) {
        const crop = String(data.cell.raw).toLowerCase();
        const rgb = CROP_RGB[crop];
        if (rgb) data.cell.styles.textColor = rgb;
      }
    },
    showFoot: rows.length > 1 ? 'lastPage' : 'never',
  });

  // Footer note
  const finalY = (doc as any).lastAutoTable?.finalY ?? doc.internal.pageSize.getHeight() - margin;
  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175);
  doc.text(
    'Bags are rounded up per field. Seeding rate units: seeds/ac (corn & soybeans), lbs/ac (wheat).',
    margin,
    finalY + 14
  );

  doc.save('seed-bag-requirements.pdf');
}

export interface ChemWorkOrderCard {
  programId: string;
  programName: string;
  cropType: string;
  applicationCostPerAcre: number;
  totalAcres: number;
  fields: Array<{
    fieldId: string;
    fieldName: string;
    acreage: number;
    chemicals: Array<{ chemicalName: string; ratePerAcre: number; rateUnit: string; totalDisplay: string }>;
  }>;
  chemTotals: Array<{ chemicalName: string; ratePerAcre: number; rateUnit: string; totalDisplay: string }>;
}

const CROP_LABELS_EXPORT: Record<string, string> = {
  corn: 'Corn',
  soybeans: 'Soybeans',
  wheat: 'Wheat',
};

export function exportChemicalWorkOrdersPDF(cards: ChemWorkOrderCard[], seasonName: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  let firstPage = true;

  // Group cards by crop type
  const cropGroups = new Map<string, ChemWorkOrderCard[]>();
  for (const card of cards) {
    if (!cropGroups.has(card.cropType)) cropGroups.set(card.cropType, []);
    cropGroups.get(card.cropType)!.push(card);
  }

  const CROP_FILL: Record<string, [number, number, number]> = {
    corn:     [254, 243, 199],
    soybeans: [220, 252, 231],
    wheat:    [255, 237, 213],
  };
  const CROP_TEXT: Record<string, [number, number, number]> = {
    corn:     [120, 60, 0],
    soybeans: [20, 100, 40],
    wheat:    [130, 60, 0],
  };

  for (const [cropType, cropCards] of cropGroups) {
    if (!firstPage) {
      doc.addPage();
    }
    firstPage = false;

    // Page header
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, pageW, 52, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Chemical Work Orders', margin, 22);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(seasonName, margin, 36);

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.setFontSize(8);
    doc.text(dateStr, pageW - margin, 36, { align: 'right' });

    let cursorY = 66;

    // Crop type section header
    const fillRgb = CROP_FILL[cropType] ?? [230, 230, 230];
    const textRgb = CROP_TEXT[cropType] ?? [60, 60, 60];
    doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, 22, 4, 4, 'F');
    doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(CROP_LABELS_EXPORT[cropType] ?? cropType, margin + 10, cursorY + 15);
    cursorY += 30;

    for (const card of cropCards) {
      // Check if we need a new page (rough estimate: 80pt per card)
      const estimatedHeight = 60 + card.chemTotals.length * 18 + 20;
      if (cursorY + estimatedHeight > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        cursorY = margin;
      }

      // Program name bar
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(margin, cursorY, pageW - margin * 2, 28, 3, 3, 'FD');

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(card.programName, margin + 10, cursorY + 18);

      // Acres on right
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const acresText = `${card.totalAcres.toFixed(1)} ac · ${card.fields.length} field${card.fields.length !== 1 ? 's' : ''}`;
      doc.text(acresText, pageW - margin - 10, cursorY + 18, { align: 'right' });

      cursorY += 32;

      // Field pill list
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const fieldList = card.fields.map((fe) => `${fe.fieldName} (${fe.acreage.toFixed(1)} ac)`).join('   ·   ');
      const fieldLines = doc.splitTextToSize(fieldList, pageW - margin * 2 - 20);
      doc.text(fieldLines, margin + 10, cursorY);
      cursorY += fieldLines.length * 10 + 6;

      // Chemical mix table
      autoTable(doc, {
        startY: cursorY,
        margin: { left: margin + 10, right: margin + 10 },
        head: [['Chemical', 'Rate / Acre', 'Total Needed']],
        body: card.chemTotals.map((ct) => [
          ct.chemicalName,
          `${ct.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${ct.rateUnit}`,
          ct.totalDisplay,
        ]),
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [31, 41, 55],
          cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { halign: 'left', cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 110 },
          2: { halign: 'right', cellWidth: 110, fontStyle: 'bold' },
        },
      });

      cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;

      if (card.applicationCostPerAcre > 0) {
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`Application cost: $${card.applicationCostPerAcre.toFixed(2)}/ac`, margin + 10, cursorY + 10);
        cursorY += 14;
      }

      cursorY += 12;
    }
  }

  doc.save('chemical-work-orders.pdf');
}

export interface SprayWorkOrder {
  programId: string;
  programName: string;
  cropType: string;
  applicationCostPerAcre: number;
  totalAcres: number;
  fields: Array<{
    fieldId: string;
    fieldName: string;
    acreage: number;
    chemicals: Array<{ chemicalId: string; chemicalName: string; ratePerAcre: number; rateUnit: string; totalDisplay: string }>;
  }>;
  chemTotals: Array<{ chemicalId: string; chemicalName: string; ratePerAcre: number; rateUnit: string; totalDisplay: string }>;
}

export interface CrossTotalRow {
  chemicalId: string;
  chemicalName: string;
  totalDisplay: string;
}

export function exportSprayPlannerPDF(
  workOrders: SprayWorkOrder[],
  crossTotals: CrossTotalRow[],
  seasonName: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  const CROP_FILL_SP: Record<string, [number, number, number]> = {
    corn:     [254, 243, 199],
    soybeans: [220, 252, 231],
    wheat:    [255, 237, 213],
  };
  const CROP_TEXT_SP: Record<string, [number, number, number]> = {
    corn:     [120, 60, 0],
    soybeans: [20, 100, 40],
    wheat:    [130, 60, 0],
  };

  function drawPageHeader() {
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, pageW, 52, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Spray Work Order', margin, 22);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(seasonName, margin, 36);
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.setFontSize(8);
    doc.text(dateStr, pageW - margin, 36, { align: 'right' });
  }

  drawPageHeader();
  let cursorY = 66;

  for (let wi = 0; wi < workOrders.length; wi++) {
    const wo = workOrders[wi];
    const estHeight = 100 + wo.chemTotals.length * 20;

    if (wi > 0 && cursorY + estHeight > pageH - margin) {
      doc.addPage();
      drawPageHeader();
      cursorY = 66;
    }

    const fillRgb = CROP_FILL_SP[wo.cropType] ?? [230, 230, 230];
    const textRgb = CROP_TEXT_SP[wo.cropType] ?? [60, 60, 60];

    // Program header bar
    doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, 28, 3, 3, 'F');
    doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(wo.programName, margin + 10, cursorY + 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const acresText = `${wo.totalAcres.toFixed(1)} ac · ${wo.fields.length} field${wo.fields.length !== 1 ? 's' : ''}`;
    doc.text(acresText, pageW - margin - 10, cursorY + 18, { align: 'right' });
    cursorY += 32;

    // Field list
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const fieldList = wo.fields.map((fe) => `${fe.fieldName} (${fe.acreage.toFixed(1)} ac)`).join('   ·   ');
    const fieldLines = doc.splitTextToSize(fieldList, pageW - margin * 2 - 20);
    doc.text(fieldLines, margin + 10, cursorY);
    cursorY += fieldLines.length * 10 + 6;

    // Chemical mix table
    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin + 10, right: margin + 10 },
      head: [['Chemical', 'Rate / Acre', 'Total Needed']],
      body: wo.chemTotals.map((ct) => [
        ct.chemicalName,
        `${ct.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${ct.rateUnit}`,
        ct.totalDisplay,
      ]),
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [31, 41, 55],
        cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: 'left', cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 120 },
        2: { halign: 'right', cellWidth: 120, fontStyle: 'bold' },
      },
    });

    cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;

    if (wo.applicationCostPerAcre > 0) {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Application cost: $${wo.applicationCostPerAcre.toFixed(2)}/ac`, margin + 10, cursorY + 10);
      cursorY += 14;
    }

    cursorY += 14;
  }

  // Cross-totals section
  if (crossTotals.length > 0 && workOrders.length > 1) {
    if (cursorY + 60 > pageH - margin) {
      doc.addPage();
      drawPageHeader();
      cursorY = 66;
    }

    doc.setFillColor(17, 24, 39);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, 22, 3, 3, 'F');
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('FULL SPRAY DAY — COMBINED CHEMICAL TOTALS', margin + 10, cursorY + 15);
    cursorY += 26;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin + 10, right: margin + 10 },
      head: [['Chemical', 'Total Needed']],
      body: crossTotals.map((ct) => [ct.chemicalName, ct.totalDisplay]),
      headStyles: {
        fillColor: [55, 65, 81],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [17, 24, 39],
        fontStyle: 'bold',
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 150 },
      },
    });
  }

  doc.save('spray-work-order.pdf');
}

export function exportTableToCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const escape = (val: string | number) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportElementToPrint(elementId: string, title: string) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const styles = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    ${styles}
    body { padding: 20px; font-family: sans-serif; }
    @media print { button { display: none !important; } }
  </style>
</head>
<body>
  ${el.outerHTML}
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

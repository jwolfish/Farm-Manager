import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SprayWorkOrder } from './sprayPlannerPdfExport';

const GREEN_DARK: [number, number, number] = [27, 94, 32];
const GREEN_HEADER: [number, number, number] = [46, 125, 50];
const GREEN_ROW_ALT: [number, number, number] = [232, 245, 233];
const GREEN_ROW_HEADER: [number, number, number] = [200, 230, 201];
const GRAY_LABEL: [number, number, number] = [100, 116, 139];
const DARK: [number, number, number] = [17, 24, 39];
const WHITE: [number, number, number] = [255, 255, 255];

function lineAt(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.line(x1, y, x2, y);
}

function sectionLabel(doc: jsPDF, letter: string, title: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(GREEN_DARK[0], GREEN_DARK[1], GREEN_DARK[2]);
  doc.text(`${letter}  ${title}`, x, y);
  doc.setDrawColor(GREEN_DARK[0], GREEN_DARK[1], GREEN_DARK[2]);
  doc.setLineWidth(0.6);
  doc.line(x, y + 1.5, x + 165, y + 1.5);
}

function fieldBlock(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number
) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(GRAY_LABEL[0], GRAY_LABEL[1], GRAY_LABEL[2]);
  doc.text(label, x, y);
  doc.setFontSize(9);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  if (value) {
    doc.text(value, x, y + 8);
  }
  lineAt(doc, x, y + 10, x + width);
}

// Renders field names inside the Farm/Field Name block.
// Uses a single column for ≤4 names and automatically switches to two columns
// for larger selections, fitting up to 8 names at the same block height.
// Returns the y-advance so subsequent rows shift accordingly.
const LINE_SPACING = 4;      // mm between stacked name lines
const MAX_LINES_PER_COL = 4; // lines per column before font-size step-down
const COL_GUTTER = 4;        // mm gap between the two sub-columns

function buildNameLines(doc: jsPDF, names: string[], colWidth: number): { lines: string[]; fontSize: number } {
  const tryBuild = (fs: number): string[] => {
    doc.setFontSize(fs);
    const out: string[] = [];
    for (const name of names) {
      const wrapped = doc.splitTextToSize(name, colWidth) as string[];
      out.push(...wrapped);
    }
    return out;
  };

  let lines = tryBuild(8);
  if (lines.length > MAX_LINES_PER_COL) {
    lines = tryBuild(6.5);
    return { lines, fontSize: 6.5 };
  }
  return { lines, fontSize: 8 };
}

function fieldBlockFieldNames(
  doc: jsPDF,
  label: string,
  names: string[],
  x: number,
  y: number,
  width: number
): number {
  // Draw the small grey label
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(GRAY_LABEL[0], GRAY_LABEL[1], GRAY_LABEL[2]);
  doc.text(label, x, y);

  if (names.length === 0) {
    lineAt(doc, x, y + 10, x + width);
    return 20;
  }

  // Decide layout: single column for ≤4 names, two columns otherwise
  const useDoubleCol = names.length > MAX_LINES_PER_COL;
  const colWidth = useDoubleCol ? (width - COL_GUTTER) / 2 : width;

  if (!useDoubleCol) {
    // ── Single-column path ─────────────────────────────────────────────────
    const { lines, fontSize } = buildNameLines(doc, names, colWidth);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    lines.forEach((line, i) => {
      doc.text(line, x, y + 8 + i * LINE_SPACING);
    });

    const underlineY = y + 8 + (lines.length - 1) * LINE_SPACING + 2;
    lineAt(doc, x, underlineY, x + width);
    return 20 + (lines.length - 1) * LINE_SPACING;
  }

  // ── Two-column path ──────────────────────────────────────────────────────
  // Split names evenly: left gets the first ceil(N/2), right gets the rest
  const splitAt = Math.ceil(names.length / 2);
  const leftNames = names.slice(0, splitAt);
  const rightNames = names.slice(splitAt);

  const left = buildNameLines(doc, leftNames, colWidth);
  const right = buildNameLines(doc, rightNames, colWidth);

  // Use the smaller of the two font sizes so both columns look consistent
  const fontSize = Math.min(left.fontSize, right.fontSize);

  // Re-build both columns at the unified font size if needed
  const finalLeft = fontSize < left.fontSize ? buildNameLines(doc, leftNames, colWidth).lines : left.lines;
  const finalRight = fontSize < right.fontSize ? buildNameLines(doc, rightNames, colWidth).lines : right.lines;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);

  const rightX = x + colWidth + COL_GUTTER;

  finalLeft.forEach((line, i) => {
    doc.text(line, x, y + 8 + i * LINE_SPACING);
  });
  finalRight.forEach((line, i) => {
    doc.text(line, rightX, y + 8 + i * LINE_SPACING);
  });

  // Single underline spanning the full block width, below the taller column
  const tallest = Math.max(finalLeft.length, finalRight.length);
  const underlineY = y + 8 + (tallest - 1) * LINE_SPACING + 2;
  lineAt(doc, x, underlineY, x + width);

  return 20 + (tallest - 1) * LINE_SPACING;
}

export function exportSprayLogPDF(workOrders: SprayWorkOrder[], seasonName: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pW = doc.internal.pageSize.getWidth();
  const pH = doc.internal.pageSize.getHeight();
  const ML = 14;
  const MR = 14;
  const contentW = pW - ML - MR;

  for (let wi = 0; wi < workOrders.length; wi++) {
    const wo = workOrders[wi];
    if (wi > 0) doc.addPage();

    let y = 12;

    // ── Title row ───────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(GREEN_DARK[0], GREEN_DARK[1], GREEN_DARK[2]);
    doc.text('PESTICIDE MIX & APPLICATION RECORD', ML, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(GRAY_LABEL[0], GRAY_LABEL[1], GRAY_LABEL[2]);
    const batchesLabel = 'Batches: ________';
    const batchesX = pW - MR - doc.getTextWidth(batchesLabel) - 2;
    doc.text('|', batchesX - 3, y);
    doc.text(batchesLabel, batchesX, y);

    y += 6;
    doc.setDrawColor(GREEN_DARK[0], GREEN_DARK[1], GREEN_DARK[2]);
    doc.setLineWidth(0.5);
    doc.line(ML, y, pW - MR, y);
    y += 5;

    // ── Section A ───────────────────────────────────────────────────────────
    sectionLabel(doc, 'A', 'APPLICATOR & FIELD INFORMATION', ML, y);
    y += 7;

    const colW = contentW / 5;
    const cropLabel = wo.cropType.charAt(0).toUpperCase() + wo.cropType.slice(1);

    const rowAFields: Array<[string, string, number]> = [
      ['Operator / Applicator Name', '', colW * 1.4],
      ['IL/WI Pesticide License #', '', colW * 0.8],
      ['Date of Application', '', colW * 0.8],
      ['Application Time (Start)', '', colW * 0.8],
      ['Weather / Wind Conditions', '', colW * 1.2],
    ];

    let ax = ML;
    for (const [lbl, val, w] of rowAFields) {
      fieldBlock(doc, lbl, val, ax, y, w - 3);
      ax += w;
    }
    y += 16;

    // Row A2 — Farm/Field Name uses the wrapping helper; other columns are standard.
    const fieldNameColW = colW * 1.8;
    const fieldNameX = ML + colW * 0.9;

    fieldBlock(doc, 'Customer (if applicable)', '', ML, y, colW * 0.9 - 3);
    fieldBlock(doc, 'Crop & Growth Stage', cropLabel, fieldNameX + fieldNameColW, y, colW * 0.9 - 3);
    fieldBlock(doc, 'Target Pest(s)', '', fieldNameX + fieldNameColW + colW * 0.9, y, colW * 1.4 - 3);

    const fieldNameAdvance = fieldBlockFieldNames(
      doc,
      'Farm / Field Name',
      wo.fields.map((f) => f.fieldName),
      fieldNameX,
      y,
      fieldNameColW - 3,
    );

    y += fieldNameAdvance;

    // ── Section B ───────────────────────────────────────────────────────────
    sectionLabel(doc, 'B', 'SPRAYER LOAD PARAMETERS', ML, y);
    y += 7;

    const appRateDisplay = wo.sprayVolumeGalPerAcre !== null
      ? wo.sprayVolumeGalPerAcre.toLocaleString('en-US', { maximumFractionDigits: 1 })
      : '';
    const rowBFields: Array<[string, string, number]> = [
      ['Sprayer Tank Capacity (gal)', '', colW * 1.1],
      ['Load Size (gal)', '', colW * 0.9],
      ['Application Rate (gal/acre)', appRateDisplay, colW * 0.9],
      ['Acres Per Load', '', colW * 0.9],
      ['Total Acres', wo.effectiveAcres !== wo.totalAcres
        ? `${wo.effectiveAcres.toFixed(1)} (fields: ${wo.totalAcres.toFixed(1)})`
        : wo.totalAcres.toFixed(1), colW * 1.2],
    ];

    ax = ML;
    for (const [lbl, val, w] of rowBFields) {
      fieldBlock(doc, lbl, val, ax, y, w - 3);
      ax += w;
    }
    y += 20;

    // ── Section C ───────────────────────────────────────────────────────────
    sectionLabel(doc, 'C', 'PRODUCT MIX  (FILL ONE ROW PER HERBICIDE; CALCULATE AMT/LOAD = RATE × LOAD ACRES, ADJUSTED FOR UNIT)', ML, y);
    y += 5;

    // Green header banner for table title
    doc.setFillColor(GREEN_HEADER[0], GREEN_HEADER[1], GREEN_HEADER[2]);
    doc.roundedRect(ML, y, contentW, 7, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text('HERBICIDE BLEND — PRODUCT MIX SHEET', ML + 3, y + 5);
    y += 9;

    // Show all chemicals; pad to at least 6 rows total for hand-writing extras
    const MIN_ROWS = 6;
    const productRows = wo.chemTotals.map((ct, i) => [
      String(i + 1),
      ct.chemicalName,
      ct.epaRegNumber ?? '',
      ct.ratePerAcre.toLocaleString('en-US', { maximumFractionDigits: 3 }),
      ct.rateUnit,
      ct.totalDisplay,
      ct.itemNotes ?? '',
    ]);

    // Pad with blank rows so there are always at least MIN_ROWS total
    while (productRows.length < MIN_ROWS) {
      productRows.push([String(productRows.length + 1), '', '', '', '', '', '']);
    }

    // Total spray solution row — shows configured volume or a fillable line for carrier water
    const hasSprayVol = wo.sprayVolumeGalPerAcre !== null && wo.totalSprayVolumeGal !== null;
    const sprayVolLabel = hasSprayVol
      ? `TOTAL SPRAY SOLUTION  (${wo.sprayVolumeGalPerAcre!.toLocaleString('en-US', { maximumFractionDigits: 1 })} gal/ac)`
      : 'CARRIER WATER (to fill load)';
    const sprayVolTotal = hasSprayVol
      ? `${wo.totalSprayVolumeGal!.toLocaleString('en-US', { maximumFractionDigits: 0 })} gal`
      : '';
    const sprayVolNote = hasSprayVol
      ? 'Mix order: water first, then products per label'
      : 'Mix order: water first, then products per label';
    productRows.push(['', sprayVolLabel, '', hasSprayVol ? wo.sprayVolumeGalPerAcre!.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '', hasSprayVol ? 'gal/ac' : '', sprayVolTotal, sprayVolNote]);

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['#', 'Product Trade Name', 'EPA Reg. #', 'Rate', 'Unit', 'Total Needed', 'Notes (adjuvant, timing, restrictions)']],
      body: productRows,
      headStyles: {
        fillColor: GREEN_DARK,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 13,
        textColor: DARK,
        valign: 'middle',
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        minCellHeight: 10,
      },
      alternateRowStyles: { fillColor: GREEN_ROW_ALT },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 40 },
        2: { cellWidth: 28 },
        3: { halign: 'right', cellWidth: 14 },
        4: { halign: 'center', cellWidth: 14 },
        5: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
        6: { cellWidth: 'auto' },
      },
      didParseCell(data) {
        // Total spray solution / carrier water row — darker green background
        if (data.row.index === productRows.length - 1) {
          data.cell.styles.fillColor = GREEN_ROW_HEADER;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 7.5;
        }
      },
    });

    const tableEndY = (doc as any).lastAutoTable?.finalY ?? y + 80;
    y = tableEndY + 5;

    // ── Additional notes box ─────────────────────────────────────────────────
    const notesBoxH = Math.min(28, pH - y - 35);
    if (notesBoxH > 10) {
      doc.setFillColor(GREEN_DARK[0], GREEN_DARK[1], GREEN_DARK[2]);
      doc.roundedRect(ML, y, contentW, 7, 1, 1, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
      doc.text('Additional notes / spill / re-entry interval:', ML + 3, y + 5);
      y += 7;

      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.rect(ML, y, contentW, notesBoxH);
      y += notesBoxH + 5;
    }

    // ── Signature line ───────────────────────────────────────────────────────
    const sigY = Math.max(y, pH - 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY_LABEL[0], GRAY_LABEL[1], GRAY_LABEL[2]);
    doc.text('Applicator Signature', ML, sigY);
    lineAt(doc, ML, sigY + 8, ML + 70);

    doc.text('Date Signed', ML + 90, sigY);
    lineAt(doc, ML + 90, sigY + 8, ML + 140);

    // Season watermark at bottom right
    doc.setFontSize(6.5);
    doc.setTextColor(200, 200, 200);
    doc.text(seasonName, pW - MR, sigY + 8, { align: 'right' });
  }

  doc.save('pesticide-application-record.pdf');
}

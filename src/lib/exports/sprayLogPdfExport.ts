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
    const fieldNames = wo.fields.map((f) => f.fieldName).join(', ');
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

    const rowA2Fields: Array<[string, string, number]> = [
      ['Customer (if applicable)', '', colW * 0.9],
      ['Farm / Field Name', fieldNames, colW * 1.8],
      ['Crop & Growth Stage', cropLabel, colW * 0.9],
      ['Target Pest(s)', '', colW * 1.4],
    ];

    ax = ML;
    for (const [lbl, val, w] of rowA2Fields) {
      fieldBlock(doc, lbl, val, ax, y, w - 3);
      ax += w;
    }
    y += 20;

    // ── Section B ───────────────────────────────────────────────────────────
    sectionLabel(doc, 'B', 'SPRAYER LOAD PARAMETERS', ML, y);
    y += 7;

    const rowBFields: Array<[string, string, number]> = [
      ['Sprayer Tank Capacity (gal)', '', colW * 1.1],
      ['Load Size (gal)', '', colW * 0.9],
      ['Application Rate (gal/acre)', '', colW * 0.9],
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

    // Carrier water row
    productRows.push(['', 'CARRIER WATER (to fill load)', '', '', '', '', 'Mix order: water first, then products per label']);

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
        cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
        minCellHeight: 8,
      },
      alternateRowStyles: { fillColor: GREEN_ROW_ALT },
      columnStyles: {
        0: { halign: 'center', valign: 'middle', cellWidth: 6 },
        1: { valign: 'middle', cellWidth: 40 },
        2: { valign: 'middle', cellWidth: 28 },
        3: { halign: 'right', valign: 'middle', cellWidth: 14 },
        4: { halign: 'center', valign: 'middle', cellWidth: 14 },
        5: { halign: 'right', valign: 'middle', cellWidth: 24, fontStyle: 'bold' },
        6: { valign: 'middle', cellWidth: 'auto' },
      },
      didParseCell(data) {
        // Ensure column 0 (product numbers) has vertical centering
        if (data.column.index === 0) {
          data.cell.styles.valign = 'middle';
        }
        // Carrier water row — darker green background
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

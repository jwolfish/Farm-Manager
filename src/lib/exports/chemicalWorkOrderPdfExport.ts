import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CROP_LABELS, CROP_FILL, CROP_TEXT } from './pdfConstants';

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

export function exportChemicalWorkOrdersPDF(cards: ChemWorkOrderCard[], seasonName: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  let firstPage = true;

  const cropGroups = new Map<string, ChemWorkOrderCard[]>();
  for (const card of cards) {
    if (!cropGroups.has(card.cropType)) cropGroups.set(card.cropType, []);
    cropGroups.get(card.cropType)!.push(card);
  }

  for (const [cropType, cropCards] of cropGroups) {
    if (!firstPage) doc.addPage();
    firstPage = false;

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

    const fillRgb = CROP_FILL[cropType] ?? [230, 230, 230];
    const textRgb = CROP_TEXT[cropType] ?? [60, 60, 60];
    doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, 22, 4, 4, 'F');
    doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(CROP_LABELS[cropType] ?? cropType, margin + 10, cursorY + 15);
    cursorY += 30;

    for (const card of cropCards) {
      const estimatedHeight = 60 + card.chemTotals.length * 18 + 20;
      if (cursorY + estimatedHeight > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        cursorY = margin;
      }

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(margin, cursorY, pageW - margin * 2, 28, 3, 3, 'FD');
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(card.programName, margin + 10, cursorY + 18);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const acresText = `${card.totalAcres.toFixed(1)} ac · ${card.fields.length} field${card.fields.length !== 1 ? 's' : ''}`;
      doc.text(acresText, pageW - margin - 10, cursorY + 18, { align: 'right' });
      cursorY += 32;

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const fieldList = card.fields.map((fe) => `${fe.fieldName} (${fe.acreage.toFixed(1)} ac)`).join('   ·   ');
      const fieldLines = doc.splitTextToSize(fieldList, pageW - margin * 2 - 20);
      doc.text(fieldLines, margin + 10, cursorY);
      cursorY += fieldLines.length * 10 + 6;

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

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface SprayWorkOrder {
  programId: string;
  programName: string;
  cropType: string;
  applicationCostPerAcre: number;
  chemicalCostPerAcre: number;
  totalAcres: number;
  effectiveAcres: number;
  sprayVolumeGalPerAcre: number | null;
  totalSprayVolumeGal: number | null;
  fields: Array<{
    fieldId: string;
    fieldName: string;
    acreage: number;
    chemicals: Array<{ chemicalId: string; chemicalName: string; epaRegNumber: string | null; ratePerAcre: number; rateUnit: string; totalDisplay: string; itemNotes: string | null }>;
  }>;
  chemTotals: Array<{ chemicalId: string; chemicalName: string; epaRegNumber: string | null; ratePerAcre: number; rateUnit: string; totalDisplay: string; totalValue: number; totalUnit: string; totalRaw: number; itemNotes: string | null }>;
}

export interface CrossTotalRow {
  chemicalId: string;
  chemicalName: string;
  totalDisplay: string;
}

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

export function exportSprayPlannerPDF(
  workOrders: SprayWorkOrder[],
  crossTotals: CrossTotalRow[],
  seasonName: string
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

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

    doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
    doc.roundedRect(margin, cursorY, pageW - margin * 2, 28, 3, 3, 'F');
    doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(wo.programName, margin + 10, cursorY + 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const overridden = wo.effectiveAcres !== wo.totalAcres;
    const acresText = overridden
      ? `${wo.effectiveAcres.toFixed(1)} ac (override) · ${wo.fields.length} field${wo.fields.length !== 1 ? 's' : ''}`
      : `${wo.totalAcres.toFixed(1)} ac · ${wo.fields.length} field${wo.fields.length !== 1 ? 's' : ''}`;
    doc.text(acresText, pageW - margin - 10, cursorY + 18, { align: 'right' });
    cursorY += 32;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const fieldList = wo.fields.map((fe) => `${fe.fieldName} (${fe.acreage.toFixed(1)} ac)`).join('   ·   ');
    const fieldLines = doc.splitTextToSize(fieldList, pageW - margin * 2 - 20);
    doc.text(fieldLines, margin + 10, cursorY);
    cursorY += fieldLines.length * 10 + 6;

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
        1: { halign: 'right', cellWidth: 90 },
        2: { halign: 'right', cellWidth: 90, fontStyle: 'bold' },
      },
    });

    cursorY = (doc as any).lastAutoTable?.finalY ?? cursorY;

    const totalCostPerAcre = wo.applicationCostPerAcre + wo.chemicalCostPerAcre;
    const hasFooter = totalCostPerAcre > 0 || wo.sprayVolumeGalPerAcre !== null;
    if (hasFooter) {
      cursorY += 4;
      let footerX = margin + 10;

      if (wo.sprayVolumeGalPerAcre !== null) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text(
          `Total spray volume: ${wo.totalSprayVolumeGal!.toLocaleString('en-US', { maximumFractionDigits: 0 })} gal`,
          footerX,
          cursorY + 7
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `(${wo.sprayVolumeGalPerAcre.toLocaleString('en-US', { maximumFractionDigits: 1 })} gal/ac × ${wo.effectiveAcres.toFixed(1)} ac)`,
          footerX,
          cursorY + 15
        );
        footerX = pageW - margin - 10;
      }

      if (totalCostPerAcre > 0) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text(`Total cost: $${totalCostPerAcre.toFixed(2)}/ac`, footerX, cursorY + 7, { align: wo.sprayVolumeGalPerAcre !== null ? 'right' : 'left' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`(Chem: $${wo.chemicalCostPerAcre.toFixed(2)}  +  App: $${wo.applicationCostPerAcre.toFixed(2)})`, footerX, cursorY + 15, { align: wo.sprayVolumeGalPerAcre !== null ? 'right' : 'left' });
      }

      cursorY += 22;
    }

    cursorY += 14;
  }

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
        1: { halign: 'right', cellWidth: 110 },
      },
    });
  }

  doc.save('spray-work-order.pdf');
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ShoppingLine } from '../../components/products/ShoppingListsTab';

type RGB = [number, number, number];

const CATEGORY_LABELS: Record<string, string> = {
  chemical: 'Chemical',
  fertilizer: 'Fertilizer',
  seed: 'Seed',
};

const CATEGORY_RGB: Record<string, RGB> = {
  chemical: [88, 28, 135],
  fertilizer: [15, 118, 110],
  seed: [146, 64, 14],
};

const STATUS_LABELS: Record<string, string> = {
  needed: 'Needed',
  quoted: 'Quoted',
  purchased: 'Purchased',
};

export function exportShoppingListPDF(
  lines: ShoppingLine[],
  listLabel: string,
  seasonName: string,
  farmName?: string
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;
  const category = lines[0]?.product_category ?? 'chemical';
  const catRgb = CATEGORY_RGB[category] ?? [17, 24, 39];

  // Header bar
  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageW, 64, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${CATEGORY_LABELS[category]} Shopping List`, margin, 24);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 200, 200);
  doc.text(seasonName, margin, 40);

  if (farmName) {
    doc.text(farmName, margin, 52);
  }

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(dateStr, pageW - margin, 24, { align: 'right' });
  doc.text(`Generated: ${listLabel}`, pageW - margin, 38, { align: 'right' });

  let cursorY = 82;

  // Summary section
  const totalItems = lines.length;
  const purchasedCount = lines.filter((l) => l.status === 'purchased').length;
  const quotedCount = lines.filter((l) => l.status === 'quoted').length;
  const estimatedTotal = lines.reduce((sum, l) => {
    const qty = l.adjusted_quantity ?? l.needed_quantity;
    const price = l.purchased_price_per_unit ?? l.quoted_price_per_unit ?? 0;
    return sum + qty * price;
  }, 0);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, cursorY, pageW - margin * 2, 42, 4, 4, 'F');

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');

  const colW = (pageW - margin * 2) / 4;
  const labels = ['TOTAL ITEMS', 'QUOTED', 'PURCHASED', 'EST. TOTAL COST'];
  const values = [
    String(totalItems),
    String(quotedCount),
    String(purchasedCount),
    `$${estimatedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ];

  for (let i = 0; i < 4; i++) {
    const x = margin + colW * i + 12;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(labels[i], x, cursorY + 16);

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(values[i], x, cursorY + 32);
  }

  cursorY += 56;

  // Table
  const tableHead = ['Product', 'Needed', 'Order Qty', 'Supplier', '$/Unit', 'Line Total', 'Status'];

  const tableBody = lines.map((l) => {
    const qty = l.adjusted_quantity ?? l.needed_quantity;
    const price = l.purchased_price_per_unit ?? l.quoted_price_per_unit;
    const lineTotal = price != null ? qty * price : null;
    return [
      l.product_name,
      `${l.needed_quantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${l.unit_type}`,
      `${qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${l.unit_type}`,
      l.supplier ?? '',
      price != null ? `$${price.toFixed(2)}` : '',
      lineTotal != null ? `$${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '',
      STATUS_LABELS[l.status] ?? l.status,
    ];
  });

  // Footer row
  const grandTotal = lines.reduce((sum, l) => {
    const qty = l.adjusted_quantity ?? l.needed_quantity;
    const price = l.purchased_price_per_unit ?? l.quoted_price_per_unit ?? 0;
    return sum + qty * price;
  }, 0);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    head: [tableHead],
    body: tableBody,
    foot: lines.length > 1
      ? [['Total', '', '', '', '', `$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']]
      : undefined,
    headStyles: {
      fillColor: catRgb,
      textColor: [255, 255, 255] as RGB,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 6, bottom: 6, left: 5, right: 5 },
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [31, 41, 55] as RGB,
      cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
    },
    footStyles: {
      fillColor: [243, 244, 246] as RGB,
      textColor: [17, 24, 39] as RGB,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 6, bottom: 6, left: 5, right: 5 },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] as RGB },
    columnStyles: {
      0: { halign: 'left', cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 72 },
      2: { halign: 'right', cellWidth: 72 },
      3: { halign: 'left', cellWidth: 80 },
      4: { halign: 'right', cellWidth: 52 },
      5: { halign: 'right', cellWidth: 62, fontStyle: 'bold' },
      6: { halign: 'center', cellWidth: 56 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const raw = String(data.cell.raw);
        if (raw === 'Purchased') {
          data.cell.styles.textColor = [21, 128, 61];
          data.cell.styles.fontStyle = 'bold';
        } else if (raw === 'Quoted') {
          data.cell.styles.textColor = [29, 78, 216];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [107, 114, 128];
        }
      }
    },
    showFoot: lines.length > 1 ? 'lastPage' : 'never',
  });

  // Notes area at bottom
  const finalY = (doc as any).lastAutoTable?.finalY ?? doc.internal.pageSize.getHeight() - 100;
  const notesY = finalY + 20;

  if (notesY < doc.internal.pageSize.getHeight() - 80) {
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, notesY, pageW - margin, notesY);

    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES / SUPPLIER COMMENTS', margin, notesY + 14);

    // Ruled lines for writing
    doc.setDrawColor(229, 231, 235);
    for (let i = 0; i < 4; i++) {
      const y = notesY + 30 + i * 18;
      if (y < doc.internal.pageSize.getHeight() - 40) {
        doc.line(margin, y, pageW - margin, y);
      }
    }
  }

  // Page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' }
    );
  }

  const filename = `shopping-list-${category}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

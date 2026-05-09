export function getPDFStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #111827;
      background: white;
      font-size: 13px;
      line-height: 1.5;
    }
    .page {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 48px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 32px;
    }
    .report-header-left h1 {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 2px;
    }
    .report-header-left .farm-name {
      font-size: 14px;
      color: #16a34a;
      font-weight: 600;
    }
    .report-header-right {
      text-align: right;
    }
    .report-header-right .generated {
      font-size: 11px;
      color: #9ca3af;
    }
    .logo-mark {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .logo-mark .dot {
      width: 28px;
      height: 28px;
      background: #16a34a;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-mark .app-name {
      font-size: 13px;
      font-weight: 700;
      color: #374151;
    }
    .section {
      margin-bottom: 36px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .chart-wrap {
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    thead tr {
      background: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
    }
    thead th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    thead th.num { text-align: right; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr { border-bottom: 1px solid #f3f4f6; }
    tbody td {
      padding: 9px 12px;
      color: #374151;
    }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td.green { color: #15803d; font-weight: 600; }
    tbody td.red { color: #dc2626; font-weight: 600; }
    tbody td.blue { color: #1d4ed8; font-weight: 700; }
    tbody td.red-neg { color: #dc2626; font-weight: 700; }
    tbody td.bold { font-weight: 600; color: #111827; }
    .highlight-row { background: #fffbeb !important; }
    .alert-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .alert-box h4 {
      font-size: 12px;
      font-weight: 700;
      color: #92400e;
      margin-bottom: 6px;
    }
    .alert-box ul {
      list-style: disc;
      padding-left: 16px;
    }
    .alert-box li {
      font-size: 11px;
      color: #b45309;
      line-height: 1.6;
    }
    .pie-row {
      display: flex;
      gap: 16px;
      justify-content: center;
      margin-bottom: 20px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 14px 16px;
    }
    .stat-card .label {
      font-size: 10px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
    }
    .stat-card .value {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
    }
    .stat-card .value.green { color: #15803d; }
    .stat-card .value.red { color: #dc2626; }
    .stat-card .value.blue { color: #1d4ed8; }
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer p { font-size: 10px; color: #9ca3af; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 20px 24px; }
      .page-break { page-break-before: always; }
    }
  `;
}

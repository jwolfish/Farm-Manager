/**
 * A cell whose first character is one of these is evaluated as a formula by
 * Excel and Google Sheets, so it has to be neutralised on export (WI-7).
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * A plain number: optional sign, optional thousands separators, optional
 * decimal part, optional trailing percent.
 *
 * Values matching this are numbers, not formulas — "-1234.56" and "-12.3%"
 * cannot execute anything. They must NOT be quote-prefixed, because that
 * exports them as text and Excel will then refuse to sort or sum them. That
 * regression is exactly what this guard was doing to every negative figure in
 * FieldROI, YearOverYearProfit, CostBreakdownComparison and PricingPerformance.
 *
 * Anything with an operator in it — "-1+1", "=SUM(A1)", "-2*3" — fails to match
 * and is still neutralised. Note "-$A$1" also fails to match, because a digit
 * is required after the optional sign.
 */
const PLAIN_NUMBER = /^[+-]?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?%?$/;

/**
 * Render one value as a CSV field: neutralise formulas, then quote if needed.
 * Exported for testing.
 */
export function escapeCsvValue(val: string | number): string {
  let s = String(val);

  // A real number can never be a formula, whatever it stringifies to.
  const isFormulaRisk =
    typeof val !== 'number' && FORMULA_LEAD.test(s) && !PLAIN_NUMBER.test(s);

  if (isFormulaRisk) {
    s = "'" + s;
  }

  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

/**
 * Build the full CSV body, headers included. Exported for testing.
 * Headers are escaped too — they interpolate season and farm names.
 */
export function buildCsvContent(
  headers: string[],
  rows: (string | number)[][]
): string {
  return [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((row) => row.map(escapeCsvValue).join(',')),
  ].join('\r\n');
}

export function exportTableToCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const blob = new Blob([buildCsvContent(headers, rows)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

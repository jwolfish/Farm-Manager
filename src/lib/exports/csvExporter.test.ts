import { describe, it, expect } from 'vitest';
import { escapeCsvValue, buildCsvContent } from './csvExporter';

describe('escapeCsvValue — negative numbers stay numbers', () => {
  it.each([
    '-1234.56',
    '-0.125',
    '-5',
    '-0.00',
    '-1,234.56',
    '-12.3%',
    '+5',
    '+1.5%',
  ])('leaves %s untouched', (value) => {
    expect(escapeCsvValue(value)).toBe(value.includes(',') ? `"${value}"` : value);
  });

  it('does not prefix a negative number passed as a number', () => {
    expect(escapeCsvValue(-1234.56)).toBe('-1234.56');
  });

  it('covers the exact shapes the four affected reports export', () => {
    // FieldROI, YearOverYearProfit: toFixed(2)
    expect(escapeCsvValue((-8321.4).toFixed(2))).toBe('-8321.40');
    // PricingPerformance: toFixed(3) price delta
    expect(escapeCsvValue((-0.1255).toFixed(3))).toBe('-0.126');
    // CostBreakdownComparison: toFixed(1) + '%'
    expect(escapeCsvValue((-12.34).toFixed(1) + '%')).toBe('-12.3%');
  });
});

describe('escapeCsvValue — formula injection is still blocked', () => {
  it('neutralises the payload from the WI-7 acceptance criterion', () => {
    // No comma, quote or newline in this payload, so it is prefixed but not
    // wrapped. The leading apostrophe is what makes Excel treat it as text.
    expect(escapeCsvValue("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
  });

  it('quotes as well as prefixes when the payload also contains a comma', () => {
    expect(escapeCsvValue('=HYPERLINK("http://x","click")')).toBe(
      '"\'=HYPERLINK(""http://x"",""click"")"'
    );
  });

  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['@SUM(1)', "'@SUM(1)"],
    ['-1+1', "'-1+1"],
    ['-2*3', "'-2*3"],
    ['+1-1', "'+1-1"],
    ['-$A$1', "'-$A$1"],
    ['=1', "'=1"],
    ['\tinjected', "'\tinjected"],
  ])('neutralises %s', (input, expected) => {
    expect(escapeCsvValue(input)).toBe(expected);
  });

  it('neutralises a formula that only looks numeric at the start', () => {
    // Digits then an operator — must not be mistaken for a plain number.
    expect(escapeCsvValue('-1234.56+SUM(A1)')).toBe("'-1234.56+SUM(A1)");
  });
});

describe('escapeCsvValue — quoting', () => {
  it('quotes a value containing a comma', () => {
    expect(escapeCsvValue('Doolittle, T & L')).toBe('"Doolittle, T & L"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvValue('the "north" field')).toBe('"the ""north"" field"');
  });

  it('quotes embedded newlines and carriage returns', () => {
    expect(escapeCsvValue('line one\nline two')).toBe('"line one\nline two"');
    expect(escapeCsvValue('line one\rline two')).toBe('"line one\rline two"');
  });

  it('leaves an ordinary value alone', () => {
    expect(escapeCsvValue('North 40')).toBe('North 40');
    expect(escapeCsvValue('N/A')).toBe('N/A');
    expect(escapeCsvValue('')).toBe('');
  });
});

describe('buildCsvContent', () => {
  it('escapes headers as well as rows', () => {
    // Season names reach the header row, and they are user input.
    const csv = buildCsvContent(['=cmd|x $/ac', 'Change %'], [['North 40', '-12.3%']]);
    expect(csv.split('\r\n')[0]).toBe("'=cmd|x $/ac,Change %");
  });

  it('uses CRLF line endings', () => {
    const csv = buildCsvContent(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('A,B\r\n1,2\r\n3,4');
  });

  it('round-trips a realistic profitability export unchanged', () => {
    const csv = buildCsvContent(
      ['Field', 'Net Profit $/ac', 'Total Net Profit', 'Change %'],
      [
        ['North 40', '-82.15', '-8321.40', '-12.3%'],
        ['South Creek', '141.02', '14102.00', '8.7%'],
      ]
    );

    expect(csv).toBe(
      'Field,Net Profit $/ac,Total Net Profit,Change %\r\n' +
        'North 40,-82.15,-8321.40,-12.3%\r\n' +
        'South Creek,141.02,14102.00,8.7%'
    );
    // The regression: no stray apostrophes anywhere in the numeric columns.
    expect(csv).not.toContain("'");
  });
});

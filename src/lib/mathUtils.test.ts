import { describe, it, expect } from 'vitest';
import { formatRate, parseNumberField, safeDivide } from './mathUtils';

describe('formatRate', () => {
  it('shortens a derived rate to two places', () => {
    // 2 ton of Rhizosorb over Prairie Stream 2's 70 acres, as actually stored.
    expect(formatRate(57.142857142857146)).toBe('57.14');
  });

  it('leaves a clean rate alone rather than padding it', () => {
    expect(formatRate(75)).toBe('75');
    expect(formatRate(185)).toBe('185');
    expect(formatRate(0.14)).toBe('0.14');
    expect(formatRate(2.5)).toBe('2.5');
  });

  it('never renders a real rate as zero', () => {
    // 0.004 qt/ac rounds to 0.00 at two places, and "0" reads as "none of this product on
    // this field" — a different statement entirely.
    expect(formatRate(0.004)).toBe('0.004');
    expect(formatRate(0.0001234)).toBe('0.00012');
    expect(formatRate(0.004)).not.toBe('0');
  });

  it('renders a genuine zero as zero', () => {
    expect(formatRate(0)).toBe('0');
  });

  it('handles negatives and rejects non-numbers', () => {
    expect(formatRate(-57.142857)).toBe('-57.14');
    expect(formatRate(NaN)).toBe('');
    expect(formatRate(Infinity)).toBe('');
  });
});

describe('parseNumberField', () => {
  it('reads a plain number, with thousands separators', () => {
    expect(parseNumberField('57.14')).toBe(57.14);
    expect(parseNumberField(' 1,250 ')).toBe(1250);
  });

  it('returns null for blank and for anything that is not a number', () => {
    expect(parseNumberField('')).toBeNull();
    expect(parseNumberField('   ')).toBeNull();
    expect(parseNumberField('60 lb')).toBeNull();
  });
});

describe('safeDivide', () => {
  it('divides, and falls back rather than producing Infinity', () => {
    expect(safeDivide(10, 4)).toBe(2.5);
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });
});

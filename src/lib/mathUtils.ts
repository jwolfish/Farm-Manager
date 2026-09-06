export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || !isFinite(denominator)) return fallback;
  return numerator / denominator;
}

/**
 * Parse a `NumberField` value for validation. Returns null for anything that is
 * not a finite number, so callers must decide what a blank or bad entry means
 * rather than silently getting NaN or 0.
 *
 * Lives here rather than beside the component because a file that exports both
 * a component and a helper breaks React Fast Refresh.
 */
export function parseNumberField(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format an application rate for DISPLAY only.
 *
 * A per-field rate is derived — 2 ton of Rhizosorb over 70 acres is stored as
 * 57.142857142857146 lb/ac, because §7.1 stores the rate rather than the total so it
 * survives a re-measured field. Exact is right for storage and unreadable on screen.
 *
 * Two decimal places, with trailing zeros dropped so 75 stays "75" rather than "75.00" —
 * matching how these rates read when they are typed straight into a program.
 *
 * THE GUARD IS THE POINT: a rate smaller than 0.005 would round to "0", which reads as
 * "none of this product on this field" — a different statement entirely, and exactly the
 * kind of plausible-but-wrong number this codebase keeps removing. When 2 dp would erase a
 * non-zero rate, enough significant digits are kept to show it is not zero.
 *
 * Never use this to prepare a value for storage or for arithmetic.
 */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '';
  if (rate === 0) return '0';

  const rounded = Math.round(rate * 100) / 100;
  if (rounded !== 0) return String(rounded);

  // Too small for 2 dp. Fall back to significant digits rather than claiming zero.
  return Number(rate.toPrecision(2)).toString();
}

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

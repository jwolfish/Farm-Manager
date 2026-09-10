/**
 * Harvest progress — the one place that decides what "this field is off" means, and the
 * one place that turns a season's fields into the per-crop figures the tracker shows.
 *
 * Pure, per the `appLoadState` / `renderErrorState` / `accumulateNeed` pattern, for the
 * usual reason: the screens that use it import the Supabase client somewhere up their tree
 * and cannot be booted on a machine with no credentials, so a rule left inline in them
 * could only ever be verified by reading.
 *
 * Four rules are encoded here rather than in the components, and each one is a defect this
 * project has already paid for somewhere else:
 *
 * 1. **`harvestedAt` is the ONLY test for harvested.** Not a harvest date: a date in that
 *    box says only that somebody typed a date. The 2026 wheat field carried one before this
 *    feature existed, and it could not say whether the field had been cut — as it happens it
 *    HAD been, and the app had nowhere to record that, which is exactly the point: a date
 *    typed while planning looks identical. Not a yield above zero either — all 30 of 2026's
 *    estimate rows would read as harvested. The moment two screens each decide for
 *    themselves, they disagree in October and the progress bar becomes a thing nobody trusts.
 *
 * 2. **Progress is measured in ACRES.** Twelve of thirty fields can be a fifth of the crop.
 *    The field counts are returned too, but as counts, where they are honest.
 *
 * 3. **Bushels are never summed across crops.** This module returns one row per crop and
 *    deliberately offers no season total: corn bushels and soybean bushels are different
 *    goods, and a headline "total bushels" is F-4b's tons-added-to-gallons in a new costume.
 *
 * 4. **A field with no estimate is counted and named, never read as zero.** 2027 has 32
 *    fields and no yield rows at all. Silently reporting "0 bushels to go" for them is the
 *    WI-15 lie in its quiet direction, where a missing number reads as a smaller job.
 */

import type { CropType } from './database.types';

/** The yield row as this module needs it. Nulls are the database's nulls. */
export interface HarvestYieldRow {
  /** The best number available: the estimate until the field is cut, the actual after. */
  yieldBushelsPerAcre: number | null;
  /** The planning estimate. Survives harvest untouched. */
  estimatedYieldBushelsPerAcre: number | null;
  /** Stamped by the harvest sheet and by nothing else. */
  harvestedAt: string | null;
  harvestDate: string | null;
  moisturePercentage: number | null;
}

export interface HarvestField {
  fieldId: string;
  name: string;
  cropType: CropType;
  acreage: number;
  /** Absent when the field has no `field_yields` row at all — neither estimate nor actual. */
  yieldRow?: HarvestYieldRow;
}

export interface CropHarvestProgress {
  cropType: CropType;

  fieldsHarvested: number;
  fieldsToGo: number;

  acresHarvested: number;
  acresToGo: number;
  acresTotal: number;
  /** 0–1, for the bar. 0 when the crop has no acreage rather than NaN. */
  fractionHarvested: number;

  /** Measured. Sum over harvested fields of actual × acreage. */
  bushelsHarvested: number;
  /**
   * Expected. Sum over UNHARVESTED fields that have an estimate. Fields without one are
   * excluded here and reported in `unestimated` — this figure is a floor, not a total.
   */
  bushelsToGo: number;

  /**
   * The unharvested fields carrying no estimate, so a screen can say so by name instead of
   * letting them vanish into a smaller `bushelsToGo`.
   */
  unestimated: { count: number; acres: number; fieldNames: string[] };

  /**
   * Harvested bushels minus what those same fields were estimated to make — like against
   * like, never against a season average. Null when no harvested field carried an estimate.
   */
  actualVsEstimate: number | null;

  /** Acreage-weighted actual yield over harvested fields. Null before anything is cut. */
  avgYieldHarvested: number | null;

  /**
   * Bushel-weighted moisture over the harvested fields that recorded one. Moisture is a
   * property of the grain, so it is weighted by grain, not by ground. `recordedOn` says how
   * many fields it is an average of, because an average over one field is not an average.
   */
  avgMoisture: { percentage: number; recordedOn: number } | null;
}

/**
 * Whether a field has been harvested. The single reader of `harvestedAt`; everything else
 * asks this.
 */
export function isHarvested(row: HarvestYieldRow | null | undefined): boolean {
  return stamped(row?.harvestedAt);
}

/**
 * The same test against a raw database row, which is snake_case.
 *
 * Two spellings and ONE body, deliberately. The Yields screen holds its rows in the
 * database's own shape and needs this predicate at its write path; giving it a private copy
 * would be two answers to "has this field been cut", which is exactly what rule 1 above
 * exists to prevent.
 */
export function isHarvestedRow(row: { harvested_at?: string | null } | null | undefined): boolean {
  return stamped(row?.harvested_at);
}

function stamped(value: string | null | undefined): boolean {
  return !!value;
}

/**
 * Total bushels off a field from the rate and the acreage.
 *
 * The rate is what is stored and the total is derived — the same rule the per-field
 * fertilizer rates follow, for the same reason: a field gets re-measured, and the yield
 * monitor's bu/ac is the fact that survives it while a stored total would silently become a
 * different yield.
 */
export function totalBushels(bushelsPerAcre: number | null, acreage: number): number {
  if (bushelsPerAcre === null || !Number.isFinite(bushelsPerAcre)) return 0;
  if (!Number.isFinite(acreage) || acreage <= 0) return 0;
  return bushelsPerAcre * acreage;
}

const CROP_ORDER: CropType[] = ['corn', 'soybeans', 'wheat'];

function usableNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? Number(value) : null;
}

/**
 * One row per crop that has acreage in the season, in a stable order.
 *
 * A crop with no fields is omitted rather than returned empty: an empty wheat card on a farm
 * that grew no wheat is noise on a screen read one-handed.
 */
export function summariseHarvest(fields: HarvestField[]): CropHarvestProgress[] {
  const byCrop = new Map<CropType, HarvestField[]>();
  for (const field of fields) {
    const list = byCrop.get(field.cropType);
    if (list) list.push(field);
    else byCrop.set(field.cropType, [field]);
  }

  const crops = [
    ...CROP_ORDER.filter(c => byCrop.has(c)),
    ...[...byCrop.keys()].filter(c => !CROP_ORDER.includes(c)),
  ];

  return crops.map(cropType => summariseCrop(cropType, byCrop.get(cropType) ?? []));
}

function summariseCrop(cropType: CropType, fields: HarvestField[]): CropHarvestProgress {
  let fieldsHarvested = 0;
  let acresHarvested = 0;
  let acresTotal = 0;
  let bushelsHarvested = 0;
  let bushelsToGo = 0;

  let estimateOfHarvested = 0;
  let harvestedCarriedEstimate = false;

  let moistureWeighted = 0;
  let moistureWeight = 0;
  let moistureFields = 0;

  const unestimated = { count: 0, acres: 0, fieldNames: [] as string[] };

  for (const field of fields) {
    const acreage = Number.isFinite(field.acreage) && field.acreage > 0 ? field.acreage : 0;
    acresTotal += acreage;

    const row = field.yieldRow;

    if (isHarvested(row)) {
      fieldsHarvested += 1;
      acresHarvested += acreage;

      // A harvested field with a yield of zero is a real outcome — hail, drown-out — and is
      // counted as harvested with nothing in the bin, not skipped as unentered.
      const actual = usableNumber(row?.yieldBushelsPerAcre) ?? 0;
      const bushels = totalBushels(actual, acreage);
      bushelsHarvested += bushels;

      const estimate = usableNumber(row?.estimatedYieldBushelsPerAcre);
      if (estimate !== null) {
        estimateOfHarvested += totalBushels(estimate, acreage);
        harvestedCarriedEstimate = true;
      }

      const moisture = usableNumber(row?.moisturePercentage);
      if (moisture !== null) {
        // Weighted by bushels where there are bushels, so one big field does not count the
        // same as one small one; by acreage when a field made nothing, so a zero-yield field
        // still contributes rather than being silently dropped.
        const weight = bushels > 0 ? bushels : acreage;
        moistureWeighted += moisture * weight;
        moistureWeight += weight;
        moistureFields += 1;
      }
      continue;
    }

    const estimate = usableNumber(row?.estimatedYieldBushelsPerAcre);
    if (estimate === null) {
      unestimated.count += 1;
      unestimated.acres += acreage;
      unestimated.fieldNames.push(field.name);
    } else {
      bushelsToGo += totalBushels(estimate, acreage);
    }
  }

  const acresToGo = acresTotal - acresHarvested;

  return {
    cropType,
    fieldsHarvested,
    fieldsToGo: fields.length - fieldsHarvested,
    acresHarvested,
    acresToGo,
    acresTotal,
    fractionHarvested: acresTotal > 0 ? acresHarvested / acresTotal : 0,
    bushelsHarvested,
    bushelsToGo,
    unestimated,
    actualVsEstimate: harvestedCarriedEstimate ? bushelsHarvested - estimateOfHarvested : null,
    avgYieldHarvested: acresHarvested > 0 ? bushelsHarvested / acresHarvested : null,
    avgMoisture:
      moistureWeight > 0
        ? { percentage: moistureWeighted / moistureWeight, recordedOn: moistureFields }
        : null,
  };
}

/**
 * The number the harvest sheet should offer as a starting point: the field's own estimate,
 * or nothing. Deliberately NOT a crop average — a placeholder that came from somewhere else
 * would be indistinguishable, once typed, from a number read off the monitor.
 */
export function suggestedYield(row: HarvestYieldRow | null | undefined): number | null {
  if (isHarvested(row)) return usableNumber(row?.yieldBushelsPerAcre);
  return usableNumber(row?.estimatedYieldBushelsPerAcre);
}

/**
 * Today, as the date input wants it.
 *
 * Local, not UTC. `new Date().toISOString().slice(0,10)` is a day ahead here every evening
 * after 8pm, and a harvest sheet that defaults to tomorrow's date is a sheet whose one
 * zero-tap convenience is quietly wrong on exactly the evenings it gets used.
 *
 * It lives here rather than beside the sheet because a file exporting both a component and a
 * helper breaks Fast Refresh — the same move `parseNumberField` had to make in F-4.
 */
export function localIsoDate(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

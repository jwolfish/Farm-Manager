import { supabase } from './supabase';
import { recalculateFieldTotal } from './templateLib/fieldCostOverrides';
import type { CropType } from './database.types';

/**
 * Loading and saving a single field's seed assignment — U-1.
 *
 * WHY THIS EXISTS AT ALL. `field_costs.seed_variety_id` had exactly one writer in the whole
 * codebase — `templateApplication.ts` — reachable only by re-applying a cost template
 * through the five-step wizard. Applying a template calls `deleteAllOverrides`, which since
 * 6 Sep also clears `field_fertilizer_rates`, so changing a field's seed variety destroyed
 * its per-field fertilizer prescription and every cost override, silently. That is not a
 * workflow; it is a trap. This writes the three seed columns and nothing else.
 *
 * Kept apart from the component for the usual reason: `FieldSeedEditor` must stay free of
 * the Supabase client so it can be rendered with fixtures on a machine with no credentials,
 * which is how every screen defect in this project has been found.
 *
 * Every read throws rather than returning empty. A swallowed variety read would present the
 * season as having no seed varieties, and the obvious next move — go and create one — would
 * duplicate a variety that already exists.
 */

export interface SeedVarietyOption {
  id: string;
  productName: string;
  cropType: CropType;
  pricePerUnit: number;
  unitType: string;
  standardSeedingRate: number | null;
  unitsPerBag: number | null;
}

export interface FieldSeedContext {
  fieldName: string;
  acreage: number;
  cropType: CropType;
  /**
   * False when the field has no `field_costs` row. There is then nothing to write the seed
   * columns to, and the field must be given a cost template first — the same rule the V-6
   * grid enforces for rates, and for the same reason.
   */
  hasCostRow: boolean;
  currentVarietyId: string | null;
  /**
   * The rate actually in force: the field's override where it has one, else the variety's
   * standard. Null when no variety is assigned.
   */
  effectiveSeedingRate: number | null;
  /** True when the field carries its own rate rather than tracking the variety's standard. */
  hasRateOverride: boolean;
  varieties: SeedVarietyOption[];
}

export async function loadFieldSeed(fieldId: string): Promise<FieldSeedContext> {
  const { data: field, error: fieldError } = await supabase
    .from('fields')
    .select('id, name, acreage, crop_type, season_id')
    .eq('id', fieldId)
    .maybeSingle();

  if (fieldError) throw new Error(`Could not load the field: ${fieldError.message}`);
  if (!field) throw new Error('Field not found');

  const [costRes, varietyRes] = await Promise.all([
    supabase
      .from('field_costs')
      .select('seed_variety_id, seeding_rate_override')
      .eq('field_id', fieldId)
      .maybeSingle(),
    supabase
      .from('seed_varieties')
      .select('id, product_name, crop_type, price_per_unit, unit_type, standard_seeding_rate, units_per_bag')
      .eq('season_id', field.season_id)
      .order('product_name'),
  ]);

  if (costRes.error) throw new Error(`Could not load field costs: ${costRes.error.message}`);
  if (varietyRes.error) throw new Error(`Could not load seed varieties: ${varietyRes.error.message}`);

  const varieties: SeedVarietyOption[] = (varietyRes.data ?? []).map((v) => ({
    id: v.id,
    productName: v.product_name,
    cropType: v.crop_type as CropType,
    pricePerUnit: Number(v.price_per_unit ?? 0),
    unitType: v.unit_type,
    standardSeedingRate: v.standard_seeding_rate == null ? null : Number(v.standard_seeding_rate),
    unitsPerBag: v.units_per_bag == null ? null : Number(v.units_per_bag),
  }));

  const currentVarietyId = costRes.data?.seed_variety_id ?? null;
  const rateOverride =
    costRes.data?.seeding_rate_override == null ? null : Number(costRes.data.seeding_rate_override);
  const current = varieties.find((v) => v.id === currentVarietyId) ?? null;

  return {
    fieldName: field.name,
    acreage: Number(field.acreage ?? 0),
    cropType: field.crop_type as CropType,
    hasCostRow: costRes.data != null,
    currentVarietyId,
    effectiveSeedingRate: rateOverride ?? current?.standardSeedingRate ?? null,
    hasRateOverride: rateOverride != null,
    varieties,
  };
}

export interface FieldSeedSave {
  varietyId: string;
  /** Seeds per acre, as entered. */
  seedingRate: number;
  /** Computed by `calculateSeedCostPerAcre` in the editor — see §5.2a's division of labour. */
  seedCostPerAcre: number;
  /**
   * The chosen variety's standard rate, so an entry that matches it can be stored as NULL
   * and go on tracking the variety. Pass null when the variety has no standard.
   */
  standardSeedingRate: number | null;
}

/**
 * Write the three seed columns, then re-total the field.
 *
 * `seeding_rate_override` is stored as NULL when the entered rate equals the variety's
 * standard, which is what the column means: it is an *override*, and a field that merely
 * agrees with the variety today should follow it if the variety's standard is corrected
 * later. `FieldProgramDetails` already reads `seeding_rate_override ?? standard_seeding_rate`,
 * so this is the shape the display half has always assumed.
 *
 * The total is recomputed here rather than in SQL, exactly as the fertilizer plan save does
 * (§5.2a): a missed refresh leaves the total stale, not wrong, and it self-heals on the next
 * edit or cascade.
 *
 * Deliberately does NOT touch `field_cost_overrides` or `field_fertilizer_rates`. Changing
 * which seed goes in the ground says nothing about the field's fertilizer prescription, and
 * the only existing path that changed seed destroyed both.
 */
export async function saveFieldSeed(fieldId: string, save: FieldSeedSave): Promise<void> {
  const tracksStandard =
    save.standardSeedingRate != null && save.standardSeedingRate === save.seedingRate;

  const { data, error } = await supabase
    .from('field_costs')
    .update({
      seed_variety_id: save.varietyId,
      seeding_rate_override: tracksStandard ? null : save.seedingRate,
      seed_cost_per_acre: save.seedCostPerAcre,
    })
    .eq('field_id', fieldId)
    .select('field_id');

  if (error) throw new Error(`Could not save the seed assignment: ${error.message}`);
  /*
   * An UPDATE that matches nothing is not an error in PostgREST, and it is exactly what a
   * field with no `field_costs` row produces. Reporting a successful save of nothing is the
   * WI-15 lie; the editor blocks this case, so reaching it means something else is wrong.
   */
  if (!data || data.length === 0) {
    throw new Error('This field has no cost row to save seed against. Apply a cost template first.');
  }

  await recalculateFieldTotal(fieldId);
}

/**
 * Reading and writing harvest — the Supabase half, kept out of the components so the
 * screens can be rendered on a machine with no credentials.
 *
 * Two conventions this file follows and must keep following:
 *
 * - **Reads are not filtered by `user_id`.** Every policy has been farm-scoped since
 *   Round 5, so `season_id` does the scoping and RLS decides visibility. Adding
 *   `.eq('user_id', …)` back returns nothing on a shared farm, because those rows carry the
 *   owner's id — the mistake that made six screens render empty for a collaborator.
 * - **Writes stamp the real author.** That is what preserves "who entered this" when two
 *   people are running combines.
 *
 * Every read is checked. A swallowed read here returns a shorter field list, which reads as
 * a smaller crop and a progress bar that is wrong in the flattering direction.
 */

import { supabase } from './supabase';
import type { CropType } from './database.types';
import type { HarvestField, HarvestYieldRow } from './harvestProgress';

/** A field plus the notes box, which `harvestProgress` has no use for but the sheet does. */
export interface HarvestFieldWithNotes extends HarvestField {
  notes: string;
}

export interface HarvestSeasonContext {
  fields: HarvestFieldWithNotes[];
}

interface FieldRow {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
}

interface YieldRow {
  id: string;
  field_id: string;
  yield_bushels_per_acre: number;
  estimated_yield_bushels_per_acre: number | null;
  harvested_at: string | null;
  harvest_date: string | null;
  moisture_percentage: number | null;
  notes: string | null;
}

/** What the sheet hands back. The rate is entered; the total is derived from acreage. */
export interface HarvestEntry {
  bushelsPerAcre: number;
  harvestDate: string;
  moisturePercentage: number | null;
  notes: string;
}

export async function loadHarvestSeason(seasonId: string): Promise<HarvestSeasonContext> {
  const { data: fieldRows, error: fieldsError } = await supabase
    .from('fields')
    .select('id, name, crop_type, acreage')
    .eq('season_id', seasonId)
    .order('name');

  if (fieldsError) throw new Error(`Could not load fields: ${fieldsError.message}`);

  const fields = (fieldRows ?? []) as FieldRow[];
  if (fields.length === 0) return { fields: [] };

  const { data: yieldRows, error: yieldsError } = await supabase
    .from('field_yields')
    .select(
      'id, field_id, yield_bushels_per_acre, estimated_yield_bushels_per_acre, harvested_at, harvest_date, moisture_percentage, notes'
    )
    .in(
      'field_id',
      fields.map(f => f.id)
    );

  if (yieldsError) throw new Error(`Could not load yields: ${yieldsError.message}`);

  const byField = new Map<string, YieldRow>();
  for (const row of (yieldRows ?? []) as YieldRow[]) byField.set(row.field_id, row);

  return {
    fields: fields.map(field => {
      const row = byField.get(field.id);
      return {
        fieldId: field.id,
        name: field.name,
        cropType: field.crop_type,
        acreage: Number(field.acreage),
        yieldRow: row ? toHarvestYieldRow(row) : undefined,
        notes: row?.notes ?? '',
      };
    }),
  };
}

function toHarvestYieldRow(row: YieldRow): HarvestYieldRow {
  return {
    yieldBushelsPerAcre: row.yield_bushels_per_acre === null ? null : Number(row.yield_bushels_per_acre),
    estimatedYieldBushelsPerAcre:
      row.estimated_yield_bushels_per_acre === null ? null : Number(row.estimated_yield_bushels_per_acre),
    harvestedAt: row.harvested_at,
    harvestDate: row.harvest_date,
    moisturePercentage: row.moisture_percentage === null ? null : Number(row.moisture_percentage),
  };
}

/**
 * Record a field as harvested.
 *
 * The actual lands in `yield_bushels_per_acre` — the column the dashboard's cost per bushel
 * and every report already read — and `estimated_yield_bushels_per_acre` is deliberately
 * NOT in the update payload, so the planning estimate survives untouched. That is the whole
 * design in one omission, and it is the same discipline F-4a used on the fertilizer price
 * field: omit the column rather than rewrite it at its current value.
 *
 * A field with no yield row yet gets one, with a null estimate: it was never estimated, and
 * writing the actual into the estimate column would invent a forecast after the fact.
 */
export async function saveHarvest(
  field: { fieldId: string; acreage: number },
  entry: HarvestEntry,
  userId: string
): Promise<void> {
  const payload = {
    yield_bushels_per_acre: entry.bushelsPerAcre,
    total_yield_bushels: entry.bushelsPerAcre * field.acreage,
    harvest_date: entry.harvestDate || null,
    moisture_percentage: entry.moisturePercentage,
    notes: entry.notes,
    harvested_at: new Date().toISOString(),
  };

  const { data: existing, error: readError } = await supabase
    .from('field_yields')
    .select('id')
    .eq('field_id', field.fieldId)
    .maybeSingle();

  if (readError) throw new Error(`Could not read this field's yield: ${readError.message}`);

  if (existing) {
    const { error } = await supabase.from('field_yields').update(payload).eq('id', existing.id);
    if (error) throw new Error(`Could not save the harvest: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from('field_yields')
    .insert([{ ...payload, field_id: field.fieldId, user_id: userId }]);
  if (error) throw new Error(`Could not save the harvest: ${error.message}`);
}

/**
 * Undo — the field was not harvested after all, or was entered against the wrong field.
 *
 * Clearing the stamp alone would leave the measured number sitting in the estimate's place,
 * where nothing on any screen would distinguish it from a forecast. So the estimate is put
 * back. When the field never had one, the entered number stays and simply reverts to being
 * an estimate: `yield_bushels_per_acre` is NOT NULL, and there is nothing truer to put there.
 */
export async function clearHarvest(fieldId: string, acreage: number): Promise<void> {
  const { data: row, error: readError } = await supabase
    .from('field_yields')
    .select('id, estimated_yield_bushels_per_acre, yield_bushels_per_acre')
    .eq('field_id', fieldId)
    .maybeSingle();

  if (readError) throw new Error(`Could not read this field's yield: ${readError.message}`);
  if (!row) return;

  const restored =
    row.estimated_yield_bushels_per_acre === null
      ? Number(row.yield_bushels_per_acre)
      : Number(row.estimated_yield_bushels_per_acre);

  const { error } = await supabase
    .from('field_yields')
    .update({
      harvested_at: null,
      yield_bushels_per_acre: restored,
      total_yield_bushels: restored * acreage,
      harvest_date: null,
      moisture_percentage: null,
    })
    .eq('id', row.id);

  if (error) throw new Error(`Could not undo the harvest: ${error.message}`);
}

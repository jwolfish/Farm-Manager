import { supabase } from './supabase';
import type { CropType } from './database.types';

/**
 * Create and update a field's own details — U-3.
 *
 * These six columns live on `fields` and nowhere else, so this touches no cost row, no
 * override and no rate. It is the boring half of the field editor and it is separated for
 * the usual reason: `FieldDetailsForm` must stay free of the Supabase client so it can be
 * rendered with fixtures.
 *
 * The writes were previously inline in `Fields.tsx`, where a failure was reported with
 * `alert('Error saving field. Please try again.')` and the caught error thrown away. The
 * message is carried now, because "please try again" against a permissions failure is
 * advice that cannot work — the same objection R-6 makes to advising a reload.
 */

export interface FieldDetailsValues {
  name: string;
  cropType: CropType;
  acreage: number;
  landRentPerAcre: number;
  propertyTaxPerAcre: number;
  notes: string | null;
}

export async function createField(
  seasonId: string,
  userId: string,
  values: FieldDetailsValues
): Promise<string> {
  const { data, error } = await supabase
    .from('fields')
    .insert({
      season_id: seasonId,
      // Writes stamp the real author, which is what preserves "who entered this" on a
      // shared farm. Reads are farm-scoped by RLS and must not filter on user_id.
      user_id: userId,
      name: values.name,
      crop_type: values.cropType,
      acreage: values.acreage,
      land_rent_per_acre: values.landRentPerAcre,
      property_tax_per_acre: values.propertyTaxPerAcre,
      notes: values.notes,
    })
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Could not create the field: ${error.message}`);
  if (!data) throw new Error('The field was not created.');
  return data.id;
}

export async function updateField(fieldId: string, values: FieldDetailsValues): Promise<void> {
  const { data, error } = await supabase
    .from('fields')
    .update({
      name: values.name,
      crop_type: values.cropType,
      acreage: values.acreage,
      land_rent_per_acre: values.landRentPerAcre,
      property_tax_per_acre: values.propertyTaxPerAcre,
      notes: values.notes,
    })
    .eq('id', fieldId)
    .select('id');

  if (error) throw new Error(`Could not save the field: ${error.message}`);
  // An UPDATE matching no row is not an error in PostgREST. Reporting a save of nothing is
  // the WI-15 lie, so it is refused here instead.
  if (!data || data.length === 0) {
    throw new Error('That field could not be found, or you do not have permission to change it.');
  }
}

export async function deleteField(fieldId: string): Promise<void> {
  const { error } = await supabase.from('fields').delete().eq('id', fieldId);
  if (error) throw new Error(`Could not delete the field: ${error.message}`);
}

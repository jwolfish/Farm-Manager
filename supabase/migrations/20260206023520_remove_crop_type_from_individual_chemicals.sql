/*
  # Remove crop_type from individual_chemicals

  ## Reconstructed 29 Aug 2026
  This migration was applied to the database (version `20260206023520`) but its
  file was missing from the repository, so a rebuild from `supabase/migrations/`
  would have left `individual_chemicals.crop_type` in place. Reconstructed from
  the live schema, where the column is confirmed absent.

  ## Why the column went
  `individual_chemicals` was created in `20260205170031` with
  `crop_type crop_type NOT NULL`. Chemicals are not crop-specific — the same
  product is applied across corn, soybeans and wheat — so tying a chemical to
  one crop forced duplicate rows per crop. The crop association lives on the
  program that uses the chemical instead.

  `IF EXISTS` so that replaying against a database that has already dropped the
  column is a no-op rather than an error.
*/

ALTER TABLE individual_chemicals DROP COLUMN IF EXISTS crop_type;

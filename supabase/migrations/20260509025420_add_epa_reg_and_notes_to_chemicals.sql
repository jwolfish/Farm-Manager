/*
  # Add EPA Reg # and per-product notes to chemicals

  1. Changes
    - `individual_chemicals`: adds `epa_reg_number` (text, nullable) for the EPA registration number printed on spray logs
    - `chemical_program_items`: adds `notes` (text, nullable) for per-product adjuvant, timing, and restriction notes

  2. Notes
    - Both columns are nullable so existing records are unaffected
    - No RLS changes needed; existing policies cover these columns automatically
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'individual_chemicals' AND column_name = 'epa_reg_number'
  ) THEN
    ALTER TABLE individual_chemicals ADD COLUMN epa_reg_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chemical_program_items' AND column_name = 'notes'
  ) THEN
    ALTER TABLE chemical_program_items ADD COLUMN notes text;
  END IF;
END $$;

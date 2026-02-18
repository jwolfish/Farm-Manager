/*
  # Add Field Yields Table

  ## Purpose
  Track harvest yields for each field in the current growing season to enable cost per bushel calculations, profit analysis, and yield performance metrics.

  ## New Tables
  
  ### `field_yields`
  Stores yield data for each field after harvest.
  
  - `id` (uuid, primary key) - Unique identifier for the yield record
  - `field_id` (uuid, foreign key) - References the field
  - `user_id` (uuid, foreign key) - References the user who owns this data
  - `yield_bushels_per_acre` (numeric) - Yield in bushels per acre
  - `total_yield_bushels` (numeric) - Total yield in bushels (calculated: yield_bushels_per_acre * field acreage)
  - `harvest_date` (date, nullable) - Date of harvest
  - `moisture_percentage` (numeric, nullable) - Grain moisture percentage at harvest
  - `notes` (text, nullable) - Additional notes about the harvest
  - `created_at` (timestamptz) - When this record was created
  - `updated_at` (timestamptz) - When this record was last updated

  ## Security
  
  - Enable RLS on `field_yields` table
  - Users can only view their own yield records
  - Users can only insert their own yield records
  - Users can only update their own yield records
  - Users can only delete their own yield records

  ## Important Notes
  
  1. One yield record per field - enforced by unique constraint on field_id
  2. Yield data is tied to the field, which is tied to a season
  3. Foreign key constraints ensure data integrity
  4. Timestamps track when data was entered and modified
*/

-- Create field_yields table
CREATE TABLE IF NOT EXISTS field_yields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  yield_bushels_per_acre numeric NOT NULL CHECK (yield_bushels_per_acre >= 0),
  total_yield_bushels numeric NOT NULL CHECK (total_yield_bushels >= 0),
  harvest_date date,
  moisture_percentage numeric CHECK (moisture_percentage >= 0 AND moisture_percentage <= 100),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(field_id)
);

-- Enable RLS
ALTER TABLE field_yields ENABLE ROW LEVEL SECURITY;

-- RLS Policies for field_yields
CREATE POLICY "Users can view own field yields"
  ON field_yields
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own field yields"
  ON field_yields
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own field yields"
  ON field_yields
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own field yields"
  ON field_yields
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_field_yields_user_id ON field_yields(user_id);
CREATE INDEX IF NOT EXISTS idx_field_yields_field_id ON field_yields(field_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_field_yields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_field_yields_updated_at
  BEFORE UPDATE ON field_yields
  FOR EACH ROW
  EXECUTE FUNCTION update_field_yields_updated_at();

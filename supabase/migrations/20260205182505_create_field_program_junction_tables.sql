/*
  # Create Field-Program Junction Tables

  ## Overview
  Creates junction tables to link programs to fields with calculated costs.

  ## New Tables

  ### `field_fertilizer_program_applications`
  Links fertilizer programs to specific fields with calculated per-acre cost.
  - `id` (uuid, primary key)
  - `field_id` (uuid, foreign key to fields)
  - `fertilizer_program_id` (uuid, foreign key to fertilizer_programs)
  - `cost_per_acre` (numeric) - Total cost per acre for this program on this field
  - `created_at` (timestamptz)

  ### `field_chemical_program_applications`
  Links chemical programs to specific fields with calculated per-acre cost.
  - `id` (uuid, primary key)
  - `field_id` (uuid, foreign key to fields)
  - `chemical_program_id` (uuid, foreign key to chemical_programs)
  - `cost_per_acre` (numeric) - Total cost per acre for this program on this field
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Users can only access programs for fields they own
*/

-- Field Fertilizer Program Applications
CREATE TABLE IF NOT EXISTS field_fertilizer_program_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid REFERENCES fields(id) ON DELETE CASCADE NOT NULL,
  fertilizer_program_id uuid REFERENCES fertilizer_programs(id) ON DELETE CASCADE NOT NULL,
  cost_per_acre numeric DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_fertilizer_program_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_fertilizer_program_applications' AND policyname = 'Users can view own field fertilizer program applications'
  ) THEN
    CREATE POLICY "Users can view own field fertilizer program applications"
      ON field_fertilizer_program_applications FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_fertilizer_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_fertilizer_program_applications' AND policyname = 'Users can insert own field fertilizer program applications'
  ) THEN
    CREATE POLICY "Users can insert own field fertilizer program applications"
      ON field_fertilizer_program_applications FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_fertilizer_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_fertilizer_program_applications' AND policyname = 'Users can update own field fertilizer program applications'
  ) THEN
    CREATE POLICY "Users can update own field fertilizer program applications"
      ON field_fertilizer_program_applications FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_fertilizer_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_fertilizer_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_fertilizer_program_applications' AND policyname = 'Users can delete own field fertilizer program applications'
  ) THEN
    CREATE POLICY "Users can delete own field fertilizer program applications"
      ON field_fertilizer_program_applications FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_fertilizer_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Field Chemical Program Applications
CREATE TABLE IF NOT EXISTS field_chemical_program_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid REFERENCES fields(id) ON DELETE CASCADE NOT NULL,
  chemical_program_id uuid REFERENCES chemical_programs(id) ON DELETE CASCADE NOT NULL,
  cost_per_acre numeric DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE field_chemical_program_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_chemical_program_applications' AND policyname = 'Users can view own field chemical program applications'
  ) THEN
    CREATE POLICY "Users can view own field chemical program applications"
      ON field_chemical_program_applications FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_chemical_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_chemical_program_applications' AND policyname = 'Users can insert own field chemical program applications'
  ) THEN
    CREATE POLICY "Users can insert own field chemical program applications"
      ON field_chemical_program_applications FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_chemical_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_chemical_program_applications' AND policyname = 'Users can update own field chemical program applications'
  ) THEN
    CREATE POLICY "Users can update own field chemical program applications"
      ON field_chemical_program_applications FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_chemical_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_chemical_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'field_chemical_program_applications' AND policyname = 'Users can delete own field chemical program applications'
  ) THEN
    CREATE POLICY "Users can delete own field chemical program applications"
      ON field_chemical_program_applications FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fields
          WHERE fields.id = field_chemical_program_applications.field_id
          AND fields.user_id = auth.uid()
        )
      );
  END IF;
END $$;
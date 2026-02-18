/*
  # Add Programs and Application Costs

  ## Overview
  This migration adds fertilizer programs and updates chemical programs to support application costs.

  ## Changes

  1. **Add application_cost to chemical_programs**
     - Adds `application_cost` field to track cost per acre to apply the program
     - Adds `notes` field for additional program information

  2. **Create fertilizer_programs table**
     - Similar structure to chemical_programs
     - Includes application_cost
     - Not crop-specific (fertilizers are universal)

  3. **Create fertilizer_program_items table**
     - Links fertilizer products to programs
     - Includes application_rate and application_rate_unit

  4. **Update chemical_program_items**
     - Add application_rate_unit field

  ## Security
  - Enable RLS on all new tables
  - Users can only access their own programs
*/

-- Add application_cost and notes to chemical_programs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chemical_programs' AND column_name = 'application_cost'
  ) THEN
    ALTER TABLE chemical_programs ADD COLUMN application_cost numeric DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chemical_programs' AND column_name = 'notes'
  ) THEN
    ALTER TABLE chemical_programs ADD COLUMN notes text;
  END IF;
END $$;

-- Add application_rate_unit to chemical_program_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chemical_program_items' AND column_name = 'application_rate_unit'
  ) THEN
    ALTER TABLE chemical_program_items ADD COLUMN application_rate_unit text;
  END IF;
END $$;

-- Create fertilizer_programs table
CREATE TABLE IF NOT EXISTS fertilizer_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid REFERENCES seasons(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  program_name text NOT NULL,
  application_cost numeric DEFAULT 0 NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fertilizer_programs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_programs' AND policyname = 'Users can view own fertilizer programs'
  ) THEN
    CREATE POLICY "Users can view own fertilizer programs"
      ON fertilizer_programs FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_programs' AND policyname = 'Users can insert own fertilizer programs'
  ) THEN
    CREATE POLICY "Users can insert own fertilizer programs"
      ON fertilizer_programs FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_programs' AND policyname = 'Users can update own fertilizer programs'
  ) THEN
    CREATE POLICY "Users can update own fertilizer programs"
      ON fertilizer_programs FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_programs' AND policyname = 'Users can delete own fertilizer programs'
  ) THEN
    CREATE POLICY "Users can delete own fertilizer programs"
      ON fertilizer_programs FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create fertilizer_program_items table
CREATE TABLE IF NOT EXISTS fertilizer_program_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES fertilizer_programs(id) ON DELETE CASCADE NOT NULL,
  fertilizer_product_id uuid REFERENCES fertilizer_products(id) ON DELETE CASCADE NOT NULL,
  application_rate numeric NOT NULL,
  application_rate_unit text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fertilizer_program_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_program_items' AND policyname = 'Users can view own fertilizer program items'
  ) THEN
    CREATE POLICY "Users can view own fertilizer program items"
      ON fertilizer_program_items FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fertilizer_programs
          WHERE fertilizer_programs.id = fertilizer_program_items.program_id
          AND fertilizer_programs.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_program_items' AND policyname = 'Users can insert own fertilizer program items'
  ) THEN
    CREATE POLICY "Users can insert own fertilizer program items"
      ON fertilizer_program_items FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM fertilizer_programs
          WHERE fertilizer_programs.id = fertilizer_program_items.program_id
          AND fertilizer_programs.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_program_items' AND policyname = 'Users can update own fertilizer program items'
  ) THEN
    CREATE POLICY "Users can update own fertilizer program items"
      ON fertilizer_program_items FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fertilizer_programs
          WHERE fertilizer_programs.id = fertilizer_program_items.program_id
          AND fertilizer_programs.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM fertilizer_programs
          WHERE fertilizer_programs.id = fertilizer_program_items.program_id
          AND fertilizer_programs.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'fertilizer_program_items' AND policyname = 'Users can delete own fertilizer program items'
  ) THEN
    CREATE POLICY "Users can delete own fertilizer program items"
      ON fertilizer_program_items FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM fertilizer_programs
          WHERE fertilizer_programs.id = fertilizer_program_items.program_id
          AND fertilizer_programs.user_id = auth.uid()
        )
      );
  END IF;
END $$;
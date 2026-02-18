/*
  # Add Commodity Sales Tracking

  1. New Tables
    - `commodity_sales`
      - `id` (uuid, primary key) - unique sale identifier
      - `season_id` (uuid, foreign key to seasons) - which season this sale belongs to
      - `user_id` (uuid, foreign key to auth.users) - the user who owns this sale
      - `crop_type` (crop_type enum) - corn, soybeans, or wheat
      - `sale_date` (date) - when the sale was made
      - `delivery_month` (text) - delivery period in YYYY-MM format (e.g., "2026-10" for October 2026)
      - `destination` (text) - elevator or buyer name
      - `bushels_sold` (numeric) - total bushels in this sale
      - `price_per_bushel` (numeric) - contracted price per bushel
      - `total_revenue` (numeric) - generated column: bushels_sold * price_per_bushel
      - `notes` (text, nullable) - optional notes
      - `created_at` (timestamptz) - record creation timestamp
      - `updated_at` (timestamptz) - record update timestamp

  2. Indexes
    - Composite index on (season_id, crop_type) for efficient filtering

  3. Security
    - Enable RLS on `commodity_sales` table
    - SELECT policy: authenticated users can read their own sales
    - INSERT policy: authenticated users can insert their own sales
    - UPDATE policy: authenticated users can update their own sales
    - DELETE policy: authenticated users can delete their own sales
*/

CREATE TABLE IF NOT EXISTS commodity_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  crop_type crop_type NOT NULL,
  sale_date date NOT NULL,
  delivery_month text NOT NULL,
  destination text NOT NULL DEFAULT '',
  bushels_sold numeric NOT NULL DEFAULT 0 CHECK (bushels_sold >= 0),
  price_per_bushel numeric NOT NULL DEFAULT 0 CHECK (price_per_bushel >= 0),
  total_revenue numeric GENERATED ALWAYS AS (bushels_sold * price_per_bushel) STORED,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commodity_sales_season_crop
  ON commodity_sales (season_id, crop_type);

ALTER TABLE commodity_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sales"
  ON commodity_sales
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sales"
  ON commodity_sales
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sales"
  ON commodity_sales
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sales"
  ON commodity_sales
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

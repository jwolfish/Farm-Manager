/*
  # Add Commodity Hedges Table

  ## Summary
  Creates the `commodity_hedges` table to track hedge/forward contract positions
  for commodities (corn, soybeans, wheat) within a season.

  ## New Tables

  ### commodity_hedges
  Tracks individual hedge contracts, futures positions, and forward contracts
  used to manage price risk on grain production.

  | Column | Type | Description |
  |---|---|---|
  | id | uuid | Primary key |
  | season_id | uuid | FK to seasons |
  | user_id | uuid | FK to auth.users |
  | crop_type | text | corn, soybeans, or wheat |
  | contract_date | date | Date the hedge was placed |
  | delivery_month | text | YYYY-MM delivery month of the contract |
  | contract_type | text | futures, forward_contract, options_put, htc, basis_contract |
  | broker_elevator | text | Broker, exchange, or elevator name (optional) |
  | bushels_hedged | numeric | Number of bushels covered by this contract |
  | futures_price | numeric | Futures price per bushel locked in |
  | basis | numeric | Basis component (positive = above futures, negative = below) |
  | net_price | numeric | Computed: futures_price + basis |
  | notes | text | Optional notes |
  | created_at | timestamptz | Record creation timestamp |
  | updated_at | timestamptz | Record update timestamp |

  ## Security
  - RLS enabled
  - SELECT: authenticated users can read their own hedges
  - INSERT: authenticated users can insert their own hedges
  - UPDATE: authenticated users can update their own hedges
  - DELETE: authenticated users can delete their own hedges

  ## Notes
  - net_price is stored as a computed column (futures_price + basis) to allow
    flexible querying without always recalculating
  - basis can be negative (typical in many markets)
  - contract_type uses a text field with CHECK constraint for extensibility
*/

CREATE TABLE IF NOT EXISTS commodity_hedges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_type text NOT NULL CHECK (crop_type IN ('corn', 'soybeans', 'wheat')),
  contract_date date NOT NULL,
  delivery_month text NOT NULL,
  contract_type text NOT NULL DEFAULT 'futures' CHECK (
    contract_type IN ('futures', 'forward_contract', 'options_put', 'htc', 'basis_contract')
  ),
  broker_elevator text NOT NULL DEFAULT '',
  bushels_hedged numeric NOT NULL CHECK (bushels_hedged > 0),
  futures_price numeric NOT NULL CHECK (futures_price >= 0),
  basis numeric NOT NULL DEFAULT 0,
  net_price numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE commodity_hedges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own hedges"
  ON commodity_hedges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own hedges"
  ON commodity_hedges FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own hedges"
  ON commodity_hedges FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own hedges"
  ON commodity_hedges FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_commodity_hedges_season_user
  ON commodity_hedges(season_id, user_id);

CREATE INDEX IF NOT EXISTS idx_commodity_hedges_crop_type
  ON commodity_hedges(crop_type);

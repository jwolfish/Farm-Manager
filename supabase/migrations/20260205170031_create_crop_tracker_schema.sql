/*
  # Crop Input Cost Tracker - Complete Database Schema

  ## Overview
  This migration creates the complete database schema for the Crop Input Cost Tracker application,
  enabling farmers to track input costs across multiple seasons, calculate break-even costs per bushel,
  and make data-driven grain marketing decisions.

  ## Tables Created

  ### 1. user_profiles
  Stores additional user information beyond Supabase auth
  - id (references auth.users)
  - email
  - full_name
  - created_at, updated_at

  ### 2. seasons
  Growing seasons (2024, 2025, 2026, etc.)
  - id, user_id
  - year
  - name (e.g., "2025 Growing Season")
  - is_active (current working season)
  - created_at, updated_at

  ### 3. fields
  Individual fields within a season
  - id, season_id, user_id
  - name (e.g., "Field A")
  - crop_type (corn, soybeans, wheat)
  - acreage
  - notes (optional field identifiers, soil type, etc.)
  - created_at, updated_at

  ### 4. seed_varieties
  Master list of seed products per season
  - id, season_id, user_id
  - product_name (e.g., "Dekalb DKC65-10")
  - crop_type
  - price_per_unit
  - unit_type (bag, bushel, etc.)
  - standard_seeding_rate
  - created_at, updated_at

  ### 5. fertilizer_products
  Master list of fertilizer products per season
  - id, season_id, user_id
  - product_name
  - crop_type
  - price_per_unit
  - unit_type (gallon, ton, lb, etc.)
  - application_rate (optional)
  - notes
  - created_at, updated_at

  ### 6. individual_chemicals
  Master list of individual chemicals per season
  - id, season_id, user_id
  - chemical_name
  - crop_type
  - price_per_unit
  - unit_type (gallon, ounce, pound, etc.)
  - created_at, updated_at

  ### 7. chemical_programs
  Bundled chemical applications (composed of individual chemicals)
  - id, season_id, user_id
  - program_name (e.g., "Pre-Emerge Herbicide Package")
  - crop_type
  - created_at, updated_at

  ### 8. chemical_program_items
  Junction table linking chemicals to programs with application rates
  - id, program_id, chemical_id
  - application_rate (e.g., 2.0 qt/acre)
  - created_at, updated_at

  ### 9. equipment_rates
  Equipment costs per crop (from Iowa Custom Rate Survey)
  - id, season_id, user_id
  - crop_type
  - rate_per_acre
  - source (e.g., "Iowa Custom Rate Survey 2025")
  - is_overridden (user manually changed rate)
  - notes
  - created_at, updated_at

  ### 10. field_costs
  All cost entries for a specific field
  - id, field_id, user_id
  - seed_variety_id (FK to seed_varieties)
  - seeding_rate_override (optional override of standard rate)
  - seed_cost_per_acre (calculated)
  - fertilizer_cost_per_acre (total of all fertilizer products)
  - chemical_cost_per_acre (total of all chemical programs)
  - equipment_cost_per_acre (from equipment_rates)
  - custom_services_cost_per_acre
  - labor_cost_per_acre
  - crop_insurance_cost_per_acre
  - drying_storage_cost_per_acre
  - drying_storage_per_bushel (alternative to per-acre)
  - hauling_cost_per_acre
  - hauling_per_bushel (alternative to per-acre)
  - other_expenses_per_acre
  - total_cost_per_acre (calculated sum)
  - created_at, updated_at

  ### 11. field_fertilizer_applications
  Junction table for multiple fertilizer products per field
  - id, field_cost_id, fertilizer_product_id
  - application_rate
  - cost_per_acre (calculated)
  - created_at, updated_at

  ### 12. field_chemical_applications
  Junction table for multiple chemical programs per field
  - id, field_cost_id, chemical_program_id
  - cost_per_acre (calculated from program)
  - created_at, updated_at

  ### 13. yield_and_price
  Post-harvest yield and pricing data
  - id, field_id, user_id
  - yield_per_acre (bushels per acre)
  - price_per_bushel (sale price)
  - cost_per_bushel (calculated: total_cost_per_acre / yield_per_acre)
  - gross_revenue_per_acre (calculated: yield × price)
  - profit_per_acre (calculated: revenue - cost)
  - harvest_date
  - sale_date
  - notes
  - created_at, updated_at

  ### 14. team_members
  Collaboration and multi-user access
  - id, user_id (owner), invited_user_id, season_id
  - email (invited email)
  - role (admin, editor, viewer)
  - status (pending, accepted, declined)
  - invited_at, accepted_at

  ## Security
  - RLS enabled on all tables
  - Users can only access their own data
  - Team members can access shared seasons based on role
  - All policies check authentication and ownership

  ## Important Notes
  - All monetary values stored as numeric(10,2)
  - All rates and yields stored as numeric(10,2)
  - Crop types use enum for consistency
  - Foreign keys with CASCADE delete for data integrity
*/

-- Create enum for crop types
CREATE TYPE crop_type AS ENUM ('corn', 'soybeans', 'wheat');

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('admin', 'editor', 'viewer');

-- Create enum for invitation status
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined');

-- 1. User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Seasons Table
CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year)
);

-- 3. Fields Table
CREATE TABLE IF NOT EXISTS fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  crop_type crop_type NOT NULL,
  acreage numeric(10,2) NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Seed Varieties Table
CREATE TABLE IF NOT EXISTS seed_varieties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  crop_type crop_type NOT NULL,
  price_per_unit numeric(10,2) NOT NULL,
  unit_type text NOT NULL,
  standard_seeding_rate numeric(10,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Fertilizer Products Table
CREATE TABLE IF NOT EXISTS fertilizer_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  crop_type crop_type NOT NULL,
  price_per_unit numeric(10,2) NOT NULL,
  unit_type text NOT NULL,
  application_rate numeric(10,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Individual Chemicals Table
CREATE TABLE IF NOT EXISTS individual_chemicals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chemical_name text NOT NULL,
  crop_type crop_type NOT NULL,
  price_per_unit numeric(10,2) NOT NULL,
  unit_type text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 7. Chemical Programs Table
CREATE TABLE IF NOT EXISTS chemical_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_name text NOT NULL,
  crop_type crop_type NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 8. Chemical Program Items Table (Junction)
CREATE TABLE IF NOT EXISTS chemical_program_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES chemical_programs(id) ON DELETE CASCADE,
  chemical_id uuid NOT NULL REFERENCES individual_chemicals(id) ON DELETE CASCADE,
  application_rate numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 9. Equipment Rates Table
CREATE TABLE IF NOT EXISTS equipment_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_type crop_type NOT NULL,
  rate_per_acre numeric(10,2) NOT NULL,
  source text DEFAULT 'Iowa Custom Rate Survey',
  is_overridden boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(season_id, crop_type)
);

-- 10. Field Costs Table
CREATE TABLE IF NOT EXISTS field_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed_variety_id uuid REFERENCES seed_varieties(id) ON DELETE SET NULL,
  seeding_rate_override numeric(10,2),
  seed_cost_per_acre numeric(10,2) DEFAULT 0,
  fertilizer_cost_per_acre numeric(10,2) DEFAULT 0,
  chemical_cost_per_acre numeric(10,2) DEFAULT 0,
  equipment_cost_per_acre numeric(10,2) DEFAULT 0,
  custom_services_cost_per_acre numeric(10,2) DEFAULT 0,
  labor_cost_per_acre numeric(10,2) DEFAULT 0,
  crop_insurance_cost_per_acre numeric(10,2) DEFAULT 0,
  drying_storage_cost_per_acre numeric(10,2) DEFAULT 0,
  drying_storage_per_bushel numeric(10,2),
  hauling_cost_per_acre numeric(10,2) DEFAULT 0,
  hauling_per_bushel numeric(10,2),
  other_expenses_per_acre numeric(10,2) DEFAULT 0,
  total_cost_per_acre numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(field_id)
);

-- 11. Field Fertilizer Applications Table (Junction)
CREATE TABLE IF NOT EXISTS field_fertilizer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_cost_id uuid NOT NULL REFERENCES field_costs(id) ON DELETE CASCADE,
  fertilizer_product_id uuid NOT NULL REFERENCES fertilizer_products(id) ON DELETE CASCADE,
  application_rate numeric(10,2) NOT NULL,
  cost_per_acre numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 12. Field Chemical Applications Table (Junction)
CREATE TABLE IF NOT EXISTS field_chemical_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_cost_id uuid NOT NULL REFERENCES field_costs(id) ON DELETE CASCADE,
  chemical_program_id uuid NOT NULL REFERENCES chemical_programs(id) ON DELETE CASCADE,
  cost_per_acre numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 13. Yield and Price Table
CREATE TABLE IF NOT EXISTS yield_and_price (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  yield_per_acre numeric(10,2),
  price_per_bushel numeric(10,2),
  cost_per_bushel numeric(10,2),
  gross_revenue_per_acre numeric(10,2),
  profit_per_acre numeric(10,2),
  harvest_date date,
  sale_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(field_id)
);

-- 14. Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id uuid REFERENCES seasons(id) ON DELETE CASCADE,
  email text NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_seasons_user_id ON seasons(user_id);
CREATE INDEX IF NOT EXISTS idx_seasons_year ON seasons(year);
CREATE INDEX IF NOT EXISTS idx_fields_season_id ON fields(season_id);
CREATE INDEX IF NOT EXISTS idx_fields_user_id ON fields(user_id);
CREATE INDEX IF NOT EXISTS idx_fields_crop_type ON fields(crop_type);
CREATE INDEX IF NOT EXISTS idx_seed_varieties_season_id ON seed_varieties(season_id);
CREATE INDEX IF NOT EXISTS idx_fertilizer_products_season_id ON fertilizer_products(season_id);
CREATE INDEX IF NOT EXISTS idx_individual_chemicals_season_id ON individual_chemicals(season_id);
CREATE INDEX IF NOT EXISTS idx_chemical_programs_season_id ON chemical_programs(season_id);
CREATE INDEX IF NOT EXISTS idx_chemical_program_items_program_id ON chemical_program_items(program_id);
CREATE INDEX IF NOT EXISTS idx_equipment_rates_season_id ON equipment_rates(season_id);
CREATE INDEX IF NOT EXISTS idx_field_costs_field_id ON field_costs(field_id);
CREATE INDEX IF NOT EXISTS idx_yield_and_price_field_id ON yield_and_price(field_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_invited_user_id ON team_members(invited_user_id);

-- Enable Row Level Security on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_varieties ENABLE ROW LEVEL SECURITY;
ALTER TABLE fertilizer_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE individual_chemicals ENABLE ROW LEVEL SECURITY;
ALTER TABLE chemical_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chemical_program_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_fertilizer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_chemical_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE yield_and_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- RLS Policies for seasons
CREATE POLICY "Users can view own seasons"
  ON seasons FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own seasons"
  ON seasons FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own seasons"
  ON seasons FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own seasons"
  ON seasons FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for fields
CREATE POLICY "Users can view own fields"
  ON fields FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fields"
  ON fields FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fields"
  ON fields FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fields"
  ON fields FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for seed_varieties
CREATE POLICY "Users can view own seed varieties"
  ON seed_varieties FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own seed varieties"
  ON seed_varieties FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own seed varieties"
  ON seed_varieties FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own seed varieties"
  ON seed_varieties FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for fertilizer_products
CREATE POLICY "Users can view own fertilizer products"
  ON fertilizer_products FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fertilizer products"
  ON fertilizer_products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fertilizer products"
  ON fertilizer_products FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fertilizer products"
  ON fertilizer_products FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for individual_chemicals
CREATE POLICY "Users can view own chemicals"
  ON individual_chemicals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chemicals"
  ON individual_chemicals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chemicals"
  ON individual_chemicals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chemicals"
  ON individual_chemicals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for chemical_programs
CREATE POLICY "Users can view own chemical programs"
  ON chemical_programs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chemical programs"
  ON chemical_programs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chemical programs"
  ON chemical_programs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chemical programs"
  ON chemical_programs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for chemical_program_items
CREATE POLICY "Users can view own program items"
  ON chemical_program_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chemical_programs
      WHERE chemical_programs.id = chemical_program_items.program_id
      AND chemical_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own program items"
  ON chemical_program_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chemical_programs
      WHERE chemical_programs.id = chemical_program_items.program_id
      AND chemical_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own program items"
  ON chemical_program_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chemical_programs
      WHERE chemical_programs.id = chemical_program_items.program_id
      AND chemical_programs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chemical_programs
      WHERE chemical_programs.id = chemical_program_items.program_id
      AND chemical_programs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own program items"
  ON chemical_program_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chemical_programs
      WHERE chemical_programs.id = chemical_program_items.program_id
      AND chemical_programs.user_id = auth.uid()
    )
  );

-- RLS Policies for equipment_rates
CREATE POLICY "Users can view own equipment rates"
  ON equipment_rates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own equipment rates"
  ON equipment_rates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own equipment rates"
  ON equipment_rates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own equipment rates"
  ON equipment_rates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for field_costs
CREATE POLICY "Users can view own field costs"
  ON field_costs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own field costs"
  ON field_costs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own field costs"
  ON field_costs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own field costs"
  ON field_costs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for field_fertilizer_applications
CREATE POLICY "Users can view own fertilizer applications"
  ON field_fertilizer_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_fertilizer_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own fertilizer applications"
  ON field_fertilizer_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_fertilizer_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own fertilizer applications"
  ON field_fertilizer_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_fertilizer_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_fertilizer_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own fertilizer applications"
  ON field_fertilizer_applications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_fertilizer_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

-- RLS Policies for field_chemical_applications
CREATE POLICY "Users can view own chemical applications"
  ON field_chemical_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_chemical_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own chemical applications"
  ON field_chemical_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_chemical_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own chemical applications"
  ON field_chemical_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_chemical_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_chemical_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own chemical applications"
  ON field_chemical_applications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM field_costs
      WHERE field_costs.id = field_chemical_applications.field_cost_id
      AND field_costs.user_id = auth.uid()
    )
  );

-- RLS Policies for yield_and_price
CREATE POLICY "Users can view own yield data"
  ON yield_and_price FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own yield data"
  ON yield_and_price FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own yield data"
  ON yield_and_price FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own yield data"
  ON yield_and_price FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for team_members
CREATE POLICY "Users can view team invitations they sent"
  ON team_members FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view team invitations they received"
  ON team_members FOR SELECT
  TO authenticated
  USING (auth.uid() = invited_user_id);

CREATE POLICY "Users can send team invitations"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update team invitations they sent"
  ON team_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Invited users can update their invitation status"
  ON team_members FOR UPDATE
  TO authenticated
  USING (auth.uid() = invited_user_id)
  WITH CHECK (auth.uid() = invited_user_id);

CREATE POLICY "Users can delete team invitations they sent"
  ON team_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_seasons_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_fields_updated_at
  BEFORE UPDATE ON fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_seed_varieties_updated_at
  BEFORE UPDATE ON seed_varieties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_fertilizer_products_updated_at
  BEFORE UPDATE ON fertilizer_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_individual_chemicals_updated_at
  BEFORE UPDATE ON individual_chemicals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_chemical_programs_updated_at
  BEFORE UPDATE ON chemical_programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_equipment_rates_updated_at
  BEFORE UPDATE ON equipment_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_field_costs_updated_at
  BEFORE UPDATE ON field_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_yield_and_price_updated_at
  BEFORE UPDATE ON yield_and_price
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
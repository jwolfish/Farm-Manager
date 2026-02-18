/*
  # Add units_per_bag column to seed_varieties

  ## Changes
  - Adds `units_per_bag` column to `seed_varieties` table to store:
    - Corn: 80,000 seeds per bag
    - Soybeans: 140,000 seeds per bag  
    - Wheat: 50 pounds per bag
  
  ## Purpose
  This enables proper seed cost calculations where:
  - Seed is sold by the bag
  - Seeding rates are entered in seeds/acre (corn, soybeans) or pounds/acre (wheat)
  - Cost calculation: (seeding_rate / units_per_bag) × price_per_bag
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seed_varieties' AND column_name = 'units_per_bag'
  ) THEN
    ALTER TABLE seed_varieties ADD COLUMN units_per_bag numeric(10,2);
  END IF;
END $$;
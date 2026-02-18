/*
  # Remove Unused Field Yield Columns

  1. Changes
    - Remove `price_per_bushel` column from `field_yields` table
      - This was from an earlier iteration and is no longer used
      - Prices are now stored at the season level for each crop type
    
    - Remove `gross_revenue_per_acre` column from `field_yields` table
      - This is calculated dynamically on the client side using season prices
      - No need to store this redundant calculated value
    
    - Remove `profit_per_acre` column from `field_yields` table
      - This is calculated dynamically on the client side
      - Calculated as: (yield × season_price) - field_costs
  
  2. Benefits
    - Simpler data model with single source of truth for prices (season level)
    - Eliminates redundant calculated columns
    - Reduces data inconsistency risks
*/

-- Remove unused price and calculated columns from field_yields
ALTER TABLE field_yields 
  DROP COLUMN IF EXISTS price_per_bushel,
  DROP COLUMN IF EXISTS gross_revenue_per_acre,
  DROP COLUMN IF EXISTS profit_per_acre;

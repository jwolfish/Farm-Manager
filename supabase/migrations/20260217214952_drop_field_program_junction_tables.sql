/*
  # Drop deprecated field program junction tables

  ## Summary
  Removes the two junction tables that were exclusively used by the old "Costs" module (FieldCosts page),
  which has been replaced by the Cost Templates system.

  ## Dropped Tables
  - `field_fertilizer_program_applications` — linked fields to fertilizer programs in the old bulk-assignment flow
  - `field_chemical_program_applications`   — linked fields to chemical programs in the old bulk-assignment flow

  ## Notes
  - These tables are not referenced by any other part of the application
  - The Cost Templates system (cost_templates + field_costs tables) supersedes this functionality
  - Data in these tables is no longer accessible via the application, so dropping is safe
*/

DROP TABLE IF EXISTS field_fertilizer_program_applications;
DROP TABLE IF EXISTS field_chemical_program_applications;

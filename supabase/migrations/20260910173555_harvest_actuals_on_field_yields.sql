/*
  # Harvest actuals alongside the planning estimate — H-1

  `field_yields` is one row per field (`UNIQUE(field_id)`), and its
  `yield_bushels_per_acre` has always been the planning estimate — the number the
  cost-per-bushel figure on the dashboard divides by. The harvest tracker replaces that
  estimate with a measured actual as each field comes off.

  ## Why the actual lands in the EXISTING column

  Three readers take `yield_bushels_per_acre` and ask no questions about where it came
  from: `useDashboardMetrics` (cost per bushel), `useReportData` (break-even, efficiency,
  field performance) and the Yields screen itself. Putting the actual anywhere else would
  mean teaching all three to resolve two sources and pick a winner — which is exactly the
  two-table split that has produced the same defect three times in the field-fertilizer-rate
  work (a screen reading 185 where 200 was stored; orphaned rates after a reset; the
  shopping list ordering at the program's rate while the field page costed at its own).

  So the actual overwrites the estimate in place, and the estimate moves to a column of its
  own. Cost per bushel becomes an actual figure with no change to any reader.

  ## Why the estimate has to survive

  The progress screen reports "bushels estimated to go", which is the estimate summed over
  the fields NOT yet cut. Overwriting the estimate would delete that number the moment the
  first field is entered — leaving the screen at its least useful in the middle of harvest,
  which is the only time it is open.

  ## `harvested_at` is the test for "this field is off", and nothing else is

  Not `harvest_date IS NOT NULL`: a 2026 row already carries a harvest date and was never
  cut, typed into the planning screen's optional date box. Not `yield_bushels_per_acre > 0`:
  all 30 of 2026's estimate rows would read as harvested today. Only an explicit stamp,
  written by the harvest sheet and by nothing else, distinguishes a measured field from an
  estimated one. `isHarvested()` in `src/lib/harvestProgress.ts` is the single reader of it.

  `harvest_date` (the day it was cut, entered by the user) and `harvested_at` (when the
  record was completed) are deliberately separate: one is a fact about the field, the other
  is a fact about the row.

  ## The backfill marks NOTHING harvested, including 2025

  Every one of the 62 existing rows becomes an estimate equal to its current value. 2025's 32
  rows really were actuals, but no harvest date was ever recorded for any of them, so
  inventing one would be manufacturing data that looks measured. A closed season reading
  "0 % harvested" on a screen nobody opens for it costs nothing; if 2025 should read as
  complete, that is a separate deliberate UPDATE with dates the owner supplies.

  ## Verification

  Rehearsed against the live database inside a transaction that ended by raising — 62 rows,
  7 assertions, 0 failures — then the rollback was confirmed (0 new columns, 62 rows intact)
  before this was applied for real. The two assertions that earn their keep are that
  `yield_bushels_per_acre` is byte-identical for all 62 rows afterwards, and that the
  acreage-weighted cost per bushel per crop is byte-identical to six decimal places. This
  migration is additive in effect, not merely in shape.
*/

ALTER TABLE field_yields
  ADD COLUMN IF NOT EXISTS estimated_yield_bushels_per_acre numeric
    CHECK (estimated_yield_bushels_per_acre IS NULL OR estimated_yield_bushels_per_acre >= 0),
  ADD COLUMN IF NOT EXISTS harvested_at timestamptz;

COMMENT ON COLUMN field_yields.estimated_yield_bushels_per_acre IS
  'The planning estimate. Survives harvest untouched. yield_bushels_per_acre holds the best number available — this estimate until the field is cut, the measured actual afterwards.';

COMMENT ON COLUMN field_yields.harvested_at IS
  'Set by the harvest tracker when a field is marked complete, and by nothing else. This is the ONLY test for whether a field has been harvested — harvest_date can be set on an unharvested field from the planning screen.';

UPDATE field_yields
   SET estimated_yield_bushels_per_acre = yield_bushels_per_acre
 WHERE estimated_yield_bushels_per_acre IS NULL;

CREATE INDEX IF NOT EXISTS idx_field_yields_harvested_at
  ON field_yields (harvested_at)
  WHERE harvested_at IS NOT NULL;

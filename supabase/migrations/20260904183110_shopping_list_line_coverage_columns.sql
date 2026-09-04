/*
  # Shopping-list coverage: keep the gross plan need, and record fertilizer bookings

  A shopping-list line has only ever stored the NET quantity to buy. The gross plan
  need was computed, subtracted from, and thrown away, so a list could not say
  "the plan wants 70, you hold 30, buy 40" — only "40". And because
  `neededAfterOnHand` clamps at zero, a fully-covered product loses its gross
  entirely: book 40 t against a 33 t need and the row reads 0 with nothing left to
  say whether the plan was 33 or 3. So the gross is stored, not derived.

  Fertilizer additionally had no deduction at all. Contracts are fertilizer already
  bought, and the shopping list was never told: the live 2027 list asks for 63.20 t
  of Urea against 30 t already booked.

  ## Two columns, not one

  `on_hand_at_generation` is left exactly as it is. A single `covered_quantity`
  meaning "inventory" on one row and "contract commitment" on the next is a column
  that means two things, which is the shape SEC-4's denormalized farm_id and F-3's
  fertilizer_contracts.unit_type were both removed for. A line never carries both,
  so the pair is cheap and each name is true. `product_category` already says which
  one applies, so there is no coverage_source column.

  1. New columns on `shopping_list_lines`
     - `plan_quantity` — gross plan need before any deduction, in `unit_type`
     - `contracted_at_generation` — fertilizer already bought at generation time,
       i.e. max(contracted, delivered) over that product's bookings

  2. Backfill
     Existing rows get `plan_quantity = needed_quantity + on_hand_at_generation`,
     which is exact for every row that was not clamped to zero. Coverage stays 0,
     which is honest: those lists were generated before contracts were consulted.

  ## Notes

  - No policy, grant, function or table is created or altered, so RLS already
    covers the new columns and the SEC-5 matrix does not need re-running.
  - Lines are inserted by the client rather than by an RPC, so no function changes.
  - Rehearsed in a transaction that ended by raising: 9 assertions, 0 failures,
    rollback confirmed.
*/

ALTER TABLE shopping_list_lines
  ADD COLUMN IF NOT EXISTS plan_quantity            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contracted_at_generation numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN shopping_list_lines.plan_quantity IS
  'Gross plan need at generation, before inventory or contract coverage was subtracted. In unit_type.';
COMMENT ON COLUMN shopping_list_lines.contracted_at_generation IS
  'Fertilizer already bought at generation: max(contracted, delivered) over the product''s bookings. Zero for chemical and seed, which use on_hand_at_generation.';

UPDATE shopping_list_lines
   SET plan_quantity = needed_quantity + on_hand_at_generation
 WHERE plan_quantity = 0;

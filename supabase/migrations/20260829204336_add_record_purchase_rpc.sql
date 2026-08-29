/*
  # Transactional purchase recording (WI-10)

  ## Problem
  `MarkPurchasedModal` fired a reversal insert and a purchase insert and
  **discarded both error results**, then updated the shopping-list line, then
  updated the season product price. A failure at any point left inventory or the
  line inconsistent, and the retry double-posted.

  ## Bug found while writing this
  The modal updated `seed_varieties.price_per_bag`. That column does not exist —
  the column is `price_per_unit`. The update therefore failed every time, and
  because the error was discarded, seed purchases have never updated the season
  price or produced a correct cascade. This function writes `price_per_unit`.

  ## How the reversal works
  Rather than trusting `purchased_quantity` to reconstruct what was posted
  before, this sums the ledger rows that already exist for the line and reverses
  that exact total. Editing a purchase therefore always nets to the new
  quantity, whatever state the line was in.

  ## On the quantity arguments
  `p_quantity` is what the user typed, in the line's own unit, and is stored on
  the line. `p_quantity_stock_units` is the same amount converted into the
  product's stock unit by `src/lib/unitConversions.ts`, and is what reaches the
  ledger. Conversion is not repeated here for the reason given in the WI-9
  migration: a third copy of the table is what guardrail 7 warns against.
  Defaults to `p_quantity` when the two units are the same.
*/

CREATE OR REPLACE FUNCTION public.record_purchase(
  p_line_id uuid,
  p_quantity numeric,
  p_price_per_unit numeric,
  p_quantity_stock_units numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_line       shopping_list_lines;
  v_season     uuid;
  v_list_farm  uuid;
  v_season_farm uuid;
  v_stock_qty  numeric := coalesce(p_quantity_stock_units, p_quantity);
  v_prior      numeric;
  v_on_hand    numeric;
  v_entity     uuid;
  v_cascade    jsonb := 'null'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR NOT (p_quantity > 0) THEN
    RAISE EXCEPTION 'Quantity must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_price_per_unit IS NULL OR NOT (p_price_per_unit > 0) THEN
    RAISE EXCEPTION 'Price per unit must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_stock_qty > 0) THEN
    RAISE EXCEPTION 'Converted quantity must be greater than zero' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_line FROM shopping_list_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shopping list line not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_edit_farm(v_line.farm_id) THEN
    RAISE EXCEPTION 'You do not have permission to change this shopping list'
      USING ERRCODE = '42501';
  END IF;

  SELECT sl.season_id, sl.farm_id INTO v_season, v_list_farm
    FROM shopping_lists sl WHERE sl.id = v_line.shopping_list_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shopping list not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_list_farm <> v_line.farm_id THEN
    RAISE EXCEPTION 'Shopping list line does not belong to its list''s farm'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.farm_id INTO v_season_farm FROM seasons s WHERE s.id = v_season;
  IF v_season_farm IS DISTINCT FROM v_line.farm_id THEN
    RAISE EXCEPTION 'Season does not belong to this farm' USING ERRCODE = '42501';
  END IF;

  -- ---- inventory ------------------------------------------------------
  IF v_line.master_product_id IS NOT NULL THEN
    SELECT coalesce(sum(quantity_delta), 0) INTO v_prior
      FROM inventory_ledger_entries
     WHERE source_type = 'shopping_list_line' AND source_id = p_line_id;

    IF v_prior <> 0 THEN
      INSERT INTO inventory_ledger_entries (
        farm_id, master_product_id, product_category, entry_type,
        quantity_delta, source_type, source_id, note, created_by
      ) VALUES (
        v_line.farm_id, v_line.master_product_id, v_line.product_category, 'reversal',
        -v_prior, 'shopping_list_line', p_line_id, 'Purchase edit reversal', v_uid
      );
    END IF;

    INSERT INTO inventory_ledger_entries (
      farm_id, master_product_id, product_category, entry_type,
      quantity_delta, source_type, source_id, note, created_by
    ) VALUES (
      v_line.farm_id, v_line.master_product_id, v_line.product_category, 'purchase',
      v_stock_qty, 'shopping_list_line', p_line_id,
      'Purchased from ' || coalesce(nullif(v_line.supplier, ''), 'supplier'), v_uid
    );

    SELECT on_hand_quantity INTO v_on_hand
      FROM master_products WHERE id = v_line.master_product_id;
  END IF;

  -- ---- the line -------------------------------------------------------
  UPDATE shopping_list_lines
     SET purchased_quantity        = p_quantity,
         purchased_price_per_unit  = p_price_per_unit,
         status                    = 'purchased',
         purchased_at              = now()
   WHERE id = p_line_id;

  -- ---- season product price + cascade target --------------------------
  -- Scoped by season and product, NOT by the viewer's user_id: on a shared
  -- farm the rows carry the owner's id, and filtering on the viewer broke
  -- collaboration.
  IF v_line.product_category = 'chemical' AND v_line.master_product_id IS NOT NULL THEN
    UPDATE individual_chemicals
       SET price_per_unit = p_price_per_unit
     WHERE season_id = v_season AND master_product_id = v_line.master_product_id
    RETURNING id INTO v_entity;

    IF v_entity IS NOT NULL THEN
      v_cascade := jsonb_build_object(
        'task_type', 'cascade_chemical_update', 'entity_id', v_entity,
        'entity_type', 'chemical', 'season_id', v_season);
    END IF;

  ELSIF v_line.product_category = 'seed' AND v_line.master_product_id IS NOT NULL THEN
    -- price_per_unit, not price_per_bag; see the header note.
    UPDATE seed_varieties
       SET price_per_unit = p_price_per_unit
     WHERE season_id = v_season AND master_product_id = v_line.master_product_id
    RETURNING id INTO v_entity;

    IF v_entity IS NOT NULL THEN
      v_cascade := jsonb_build_object(
        'task_type', 'cascade_product_update', 'entity_id', v_entity,
        'entity_type', 'product', 'season_id', v_season);
    END IF;

  ELSIF v_line.product_category = 'fertilizer' THEN
    UPDATE fertilizer_products
       SET price_per_unit = p_price_per_unit
     WHERE season_id = v_season AND product_name = v_line.product_name
    RETURNING id INTO v_entity;

    IF v_entity IS NOT NULL THEN
      v_cascade := jsonb_build_object(
        'task_type', 'cascade_product_update', 'entity_id', v_entity,
        'entity_type', 'product', 'season_id', v_season);
    END IF;
  END IF;

  RETURN jsonb_build_object('on_hand', v_on_hand, 'cascade', v_cascade);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_purchase(uuid, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_purchase(uuid, numeric, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_purchase(uuid, numeric, numeric, numeric) TO authenticated;

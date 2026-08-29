/*
  # Remove Test Farm and enforce product/farm consistency

  Test Farm's season was imported from T & L Doolittle Farms, and the import carried
  master_product_id across the farm boundary. 12 of 16 inventory ledger rows, 6 of 6
  work order lines and 3 of 34 shopping list lines referenced products belonging to a
  different farm. Test Farm is disposable test data, so it is removed rather than
  repaired. Triggers are then added so no future row can reference a master product
  from another farm.

  Deleting the farm cascades to its season, fields, chemicals, work orders, shopping
  lists, ledger entries and master products. The existing on-hand trigger recomputes
  affected T & L products automatically; three of them drop to 0 because their only
  positive entries came from Test Farm purchases.
*/

DELETE FROM farms WHERE id = '0d37195f-8128-44f7-ba02-849f902c578d';

-- close the PUBLIC grant missed by the previous revoke migration
REVOKE EXECUTE ON FUNCTION public.update_master_product_on_hand() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assert_ledger_product_farm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog AS $$
DECLARE v_product_farm uuid;
BEGIN
  IF NEW.master_product_id IS NULL THEN RETURN NEW; END IF;
  SELECT farm_id INTO v_product_farm FROM master_products WHERE id = NEW.master_product_id;
  IF v_product_farm IS NULL THEN
    RAISE EXCEPTION 'Master product % not found or not visible', NEW.master_product_id;
  END IF;
  IF NEW.farm_id IS DISTINCT FROM v_product_farm THEN
    RAISE EXCEPTION 'Row farm % does not match master product farm %', NEW.farm_id, v_product_farm;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.assert_work_order_line_farm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog AS $$
DECLARE v_product_farm uuid; v_order_farm uuid;
BEGIN
  IF NEW.master_product_id IS NULL THEN RETURN NEW; END IF;
  SELECT farm_id INTO v_order_farm FROM work_orders WHERE id = NEW.work_order_id;
  SELECT farm_id INTO v_product_farm FROM master_products WHERE id = NEW.master_product_id;
  IF v_product_farm IS NULL OR v_order_farm IS NULL THEN
    RAISE EXCEPTION 'Work order or master product not found';
  END IF;
  IF v_order_farm IS DISTINCT FROM v_product_farm THEN
    RAISE EXCEPTION 'Work order farm % does not match master product farm %', v_order_farm, v_product_farm;
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.assert_ledger_product_farm() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assert_work_order_line_farm() FROM PUBLIC;

DROP TRIGGER IF EXISTS ledger_product_farm_check ON inventory_ledger_entries;
CREATE TRIGGER ledger_product_farm_check
  BEFORE INSERT OR UPDATE ON inventory_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_product_farm();

DROP TRIGGER IF EXISTS shopping_list_line_farm_check ON shopping_list_lines;
CREATE TRIGGER shopping_list_line_farm_check
  BEFORE INSERT OR UPDATE ON shopping_list_lines
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_product_farm();

DROP TRIGGER IF EXISTS work_order_line_farm_check ON work_order_lines;
CREATE TRIGGER work_order_line_farm_check
  BEFORE INSERT OR UPDATE ON work_order_lines
  FOR EACH ROW EXECUTE FUNCTION assert_work_order_line_farm();

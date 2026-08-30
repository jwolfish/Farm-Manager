/*
  Liquid fertilizer density — F-1.

  6-24-6 is a liquid sold by the ton and applied through the planter in gallons.
  Mass and volume are separate classes in the conversion module on purpose (see
  guardrail 8), because bridging them needs a per-product density the module does
  not have. This column supplies it.

  Nullable by design: dry products have no density and must stay valid. A liquid
  product whose density has not been entered yet reports `needs-density` from
  convertProductUnits rather than guessing — a loud, actionable failure.
*/

ALTER TABLE public.fertilizer_products
  ADD COLUMN IF NOT EXISTS density_lb_per_gal numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fertilizer_products'::regclass
      AND conname = 'fertilizer_products_density_positive'
  ) THEN
    ALTER TABLE public.fertilizer_products
      ADD CONSTRAINT fertilizer_products_density_positive
      CHECK (density_lb_per_gal IS NULL OR density_lb_per_gal > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.fertilizer_products.density_lb_per_gal IS
  'Pounds per US gallon for liquid products. NULL for dry products. Bridges mass and volume in convertProductUnits; absent on a liquid it yields needs-density rather than a wrong number.';

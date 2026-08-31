import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/*
 * SEC-8: the wildcard origin is a fallback, not the intended configuration.
 * Set the `ALLOWED_ORIGIN` secret on this function to the deployed app origin
 * and this locks down to it. It is left permissive by default because getting
 * it wrong breaks every cascade with an opaque CORS error, and the value is
 * deployment-specific rather than something this repository can know.
 */
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  "Vary": "Origin",
};

const MAX_WARNINGS = 100;

// ---------------------------------------------------------------------------
// Unit conversion — WI-11.
//
// DUPLICATE. Deno cannot import from src/, so this must stay in step with
// src/lib/unitConversions.ts by hand until WI-27 consolidates the two into a
// shared module. Any change here must be made there too, and vice versa.
// The semantics, unit registry and base factors below are identical.
// ---------------------------------------------------------------------------

type ConversionFailureReason =
  | "unknown-unit"
  | "incompatible-class"
  | "invalid-amount"
  /** Mass<->volume, which is bridgeable, but no density was available. */
  | "needs-density";

type ConversionResult =
  | { ok: true; value: number }
  | { ok: false; reason: ConversionFailureReason; from: string; to: string };

type UnitClass = "mass" | "volume" | "bag" | "seed" | "each";

/** 1 avoirdupois ounce in nanograms. Exact: 1 lb = 453.59237 g by definition. */
const OZ_IN_NG = 28349523125;
/** 1 US fluid ounce in femtolitres. Exact: 1 US gal = 3.785411784 L by definition. */
const FL_OZ_IN_FL = 29573529562500;
/** 1 acre-inch = 43560/12 cubic feet = 6272640/231 US gallons. */
const AC_IN_IN_FL = FL_OZ_IN_FL * 128 * (6272640 / 231);

const UNITS: Record<string, { unitClass: UnitClass; factor: number }> = {
  oz: { unitClass: "mass", factor: OZ_IN_NG },
  lb: { unitClass: "mass", factor: OZ_IN_NG * 16 },
  ton: { unitClass: "mass", factor: OZ_IN_NG * 32000 },
  mg: { unitClass: "mass", factor: 1e6 },
  g: { unitClass: "mass", factor: 1e9 },
  kg: { unitClass: "mass", factor: 1e12 },
  "fl oz": { unitClass: "volume", factor: FL_OZ_IN_FL },
  pt: { unitClass: "volume", factor: FL_OZ_IN_FL * 16 },
  qt: { unitClass: "volume", factor: FL_OZ_IN_FL * 32 },
  gal: { unitClass: "volume", factor: FL_OZ_IN_FL * 128 },
  ml: { unitClass: "volume", factor: 1e12 },
  l: { unitClass: "volume", factor: 1e15 },
  "ac-in": { unitClass: "volume", factor: AC_IN_IN_FL },
  bag: { unitClass: "bag", factor: 1 },
  seed: { unitClass: "seed", factor: 1 },
  each: { unitClass: "each", factor: 1 },
};

const ALIASES: Record<string, string> = {
  oz: "oz", ozs: "oz", ounce: "oz", ounces: "oz",
  "dry ounce": "oz", "dry ounces": "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ton: "ton", tons: "ton", "short ton": "ton", "short tons": "ton",
  mg: "mg", milligram: "mg", milligrams: "mg",
  g: "g", gram: "g", grams: "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  "fl oz": "fl oz", floz: "fl oz", "fl. oz.": "fl oz", "fl. oz": "fl oz", "fl oz.": "fl oz",
  "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  "liquid ounce": "fl oz", "liquid ounces": "fl oz",
  pt: "pt", pts: "pt", pint: "pt", pints: "pt",
  qt: "qt", qts: "qt", quart: "qt", quarts: "qt",
  gal: "gal", gals: "gal", gallon: "gal", gallons: "gal",
  ml: "ml", milliliter: "ml", millilitre: "ml", milliliters: "ml", millilitres: "ml",
  l: "l", liter: "l", litre: "l", liters: "l", litres: "l",
  "ac-in": "ac-in", "ac in": "ac-in", acin: "ac-in",
  "acre-inch": "ac-in", "acre inch": "ac-in", "acre-inches": "ac-in", "acre inches": "ac-in",
  bag: "bag", bags: "bag",
  seed: "seed", seeds: "seed",
  unit: "each", units: "each", each: "each", ea: "each", count: "each",
};

function normalizeUnit(unit: string): string {
  return String(unit ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function lookupUnit(normalized: string): { unitClass: UnitClass; factor: number } | null {
  const canonical = ALIASES[normalized];
  if (canonical === undefined) return null;
  return UNITS[canonical] ?? null;
}

function convertUnits(fromUnit: string, toUnit: string, amount: number): ConversionResult {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { ok: false, reason: "invalid-amount", from, to };
  }

  // Identity needs no conversion, so it succeeds even for unrecognised units.
  if (from === to) return { ok: true, value: amount };

  const fromDef = lookupUnit(from);
  const toDef = lookupUnit(to);

  if (fromDef === null || toDef === null) {
    return { ok: false, reason: "unknown-unit", from, to };
  }
  if (fromDef.unitClass !== toDef.unitClass) {
    return { ok: false, reason: "incompatible-class", from, to };
  }

  return { ok: true, value: amount * (fromDef.factor / toDef.factor) };
}

function unitClassOf(unit: string): UnitClass | null {
  return lookupUnit(normalizeUnit(unit))?.unitClass ?? null;
}

/*
 * Product-aware conversion. Mass and volume stay separate in convertUnits above
 * because bridging them needs a per-product density; a liquid fertilizer sold by
 * the ton and applied in gallons supplies one.
 *
 * densityLbPerGal has three meaningful values and the difference between the
 * last two is deliberate:
 *   undefined  no density concept (chemical, seed) — behaves like convertUnits
 *   null       density applies but is not set — returns needs-density
 *   number     bridge through it
 */
function convertProductUnits(
  fromUnit: string,
  toUnit: string,
  amount: number,
  densityLbPerGal?: number | null,
): ConversionResult {
  const direct = convertUnits(fromUnit, toUnit, amount);
  if (direct.ok) return direct;

  if (direct.reason !== "incompatible-class") return direct;
  if (densityLbPerGal === undefined) return direct;

  const fromClass = unitClassOf(fromUnit);
  const toClass = unitClassOf(toUnit);
  const massToVolume = fromClass === "mass" && toClass === "volume";
  const volumeToMass = fromClass === "volume" && toClass === "mass";
  if (!massToVolume && !volumeToMass) return direct;

  if (
    densityLbPerGal === null ||
    !Number.isFinite(densityLbPerGal) ||
    densityLbPerGal <= 0
  ) {
    return { ok: false, reason: "needs-density", from: direct.from, to: direct.to };
  }

  if (volumeToMass) {
    const gallons = convertUnits(fromUnit, "gal", amount);
    if (!gallons.ok) return gallons;
    return convertUnits("lb", toUnit, gallons.value * densityLbPerGal);
  }

  const pounds = convertUnits(fromUnit, "lb", amount);
  if (!pounds.ok) return pounds;
  return convertUnits("gal", toUnit, pounds.value / densityLbPerGal);
}

function describeConversionFailure(
  failure: Extract<ConversionResult, { ok: false }>
): string {
  const from = failure.from || "(blank)";
  const to = failure.to || "(blank)";
  switch (failure.reason) {
    case "incompatible-class":
      return `cannot convert ${from} to ${to} — those measure different things`;
    case "unknown-unit":
      return `cannot convert ${from} to ${to} — unrecognised unit`;
    case "invalid-amount":
      return `cannot convert ${from} to ${to} — the amount is not a number`;
    case "needs-density":
      return `cannot convert ${from} to ${to} — enter a density (lb per gallon) on this product`;
  }
}

function calculateCostWithConversion(
  rate: number,
  rateUnit: string,
  price: number,
  priceUnit: string,
  densityLbPerGal?: number | null
): ConversionResult {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return {
      ok: false,
      reason: "invalid-amount",
      from: normalizeUnit(rateUnit),
      to: normalizeUnit(priceUnit),
    };
  }
  const converted = convertProductUnits(rateUnit, priceUnit, rate, densityLbPerGal);
  if (!converted.ok) return converted;
  return { ok: true, value: converted.value * price };
}

/*
 * A field cost override lives in `field_cost_overrides`, NOT in the `field_costs`
 * column it names. The column holds the value inherited from the template;
 * `override_value` holds what the user typed, and the app lays the second over the
 * first for display. Anything that TOTALS a field must lay them over the same way, or
 * the total silently reverts to the template figure while every line on screen still
 * shows the override.
 *
 * DUPLICATE of applyFieldCostOverrides in src/lib/templateLib/templateCalculations.ts.
 * Deno cannot import from src/, so the two must be changed together -- guardrail 7,
 * and this is the copy that actually runs.
 */
const PROGRAM_OVERRIDE_TARGET: Record<string, string> = {
  fertilizer_programs: "fertilizer_cost_per_acre",
  chemical_programs: "chemical_cost_per_acre",
};

function applyFieldCostOverrides(
  fieldCost: Record<string, unknown>,
  overrides: Map<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!overrides || overrides.size === 0) return { ...fieldCost };

  const resolved = { ...fieldCost };

  for (const [itemName, value] of overrides) {
    if (Array.isArray(value)) {
      const target = PROGRAM_OVERRIDE_TARGET[itemName];
      if (!target) continue;
      resolved[target] = (value as Array<{ cost_per_acre?: number }>).reduce(
        (sum, p) => sum + Number(p?.cost_per_acre || 0),
        0,
      );
      continue;
    }

    const numeric = Number(value);
    if (value === null || value === "" || !Number.isFinite(numeric)) continue;

    resolved[itemName] = numeric;
  }

  return resolved;
}

function calculateFieldTotalCost(fc: Record<string, unknown>): number {
  return (
    Number(fc.seed_cost_per_acre || 0) +
    Number(fc.fertilizer_cost_per_acre || 0) +
    Number(fc.chemical_cost_per_acre || 0) +
    Number(fc.tillage_cost_per_acre || 0) +
    Number(fc.planting_cost_per_acre || 0) +
    Number(fc.harvest_cost_per_acre || 0) +
    Number(fc.equipment_cost_per_acre || 0) +
    Number(fc.custom_services_cost_per_acre || 0) +
    Number(fc.labor_cost_per_acre || 0) +
    Number(fc.crop_insurance_cost_per_acre || 0) +
    Number(fc.drying_storage_cost_per_acre || 0) +
    Number(fc.hauling_cost_per_acre || 0) +
    Number(fc.other_expenses_per_acre || 0)
  );
}

/*
 * WI-15. Every read in this function must fail loudly.
 *
 * The pattern this replaces was `const { data } = await supabase...` followed by
 * `if (!data) return <nothing to do>`. That makes a failed query indistinguishable
 * from an empty result, so a cascade that never ran reported itself completed and
 * the caller was told the price change had propagated when it had not.
 *
 * Throwing is what we want here: every call site runs inside the handler's try,
 * which marks the task failed and records the message.
 */
function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Retry exhausted after ${maxRetries} attempts: ${msg}`, {
    cause: lastError instanceof Error ? lastError : undefined,
  });
}

class WarningBuffer {
  private warnings: string[] = [];
  private truncated = 0;

  add(msg: string): void {
    if (this.warnings.length < MAX_WARNINGS) {
      this.warnings.push(msg);
    } else {
      this.truncated++;
    }
  }

  snapshot(): string[] {
    if (this.truncated > 0) {
      return [...this.warnings, `... ${this.truncated} more warnings truncated`];
    }
    return [...this.warnings];
  }
}

async function recalculateFertilizerProgramCost(
  supabase: ReturnType<typeof createClient>,
  programId: string,
  warnings?: WarningBuffer
): Promise<{ programId: string; newCost: number; unpricedItems: string[] } | null> {
  const program = must(
    await supabase
      .from("fertilizer_programs")
      .select("id, application_cost")
      .eq("id", programId)
      .maybeSingle(),
    `load fertilizer program ${programId}`,
  );

  if (!program) return null;

  const items = must(
    await supabase
      .from("fertilizer_program_items")
      .select("id, application_rate, application_rate_unit, fertilizer_products(id, price_per_unit, unit_type, density_lb_per_gal)")
      .eq("program_id", programId),
    `load items for fertilizer program ${programId}`,
  );

  let totalCostPerAcre = 0;
  const unpricedItems: string[] = [];
  for (const item of items || []) {
    const product = (item as Record<string, unknown>).fertilizer_products as Record<string, unknown> | null;
    if (!product) continue;
    const cost = calculateCostWithConversion(
      Number(item.application_rate),
      String(item.application_rate_unit),
      Number(product.price_per_unit),
      String(product.unit_type),
      product.density_lb_per_gal == null ? null : Number(product.density_lb_per_gal)
    );
    if (!cost.ok) {
      // Contributes nothing rather than a wrong number (WI-11).
      const detail = `Product ${product.id} in program ${programId}: ${describeConversionFailure(cost)}`;
      unpricedItems.push(detail);
      warnings?.add(detail);
      continue;
    }
    totalCostPerAcre += cost.value;
  }

  const newCost = totalCostPerAcre + Number(program.application_cost || 0);
  return { programId, newCost, unpricedItems };
}

async function recalculateChemicalProgramCost(
  supabase: ReturnType<typeof createClient>,
  programId: string,
  warnings?: WarningBuffer
): Promise<{ programId: string; newCost: number; unpricedItems: string[] } | null> {
  const program = must(
    await supabase
      .from("chemical_programs")
      .select("id, application_cost")
      .eq("id", programId)
      .maybeSingle(),
    `load chemical program ${programId}`,
  );

  if (!program) return null;

  const items = must(
    await supabase
      .from("chemical_program_items")
      .select("id, application_rate, application_rate_unit, individual_chemicals(id, price_per_unit, unit_type)")
      .eq("program_id", programId),
    `load items for chemical program ${programId}`,
  );

  let totalCostPerAcre = 0;
  const unpricedItems: string[] = [];
  for (const item of items || []) {
    const chemical = (item as Record<string, unknown>).individual_chemicals as Record<string, unknown> | null;
    if (!chemical) continue;
    const cost = calculateCostWithConversion(
      Number(item.application_rate),
      String(item.application_rate_unit),
      Number(chemical.price_per_unit),
      String(chemical.unit_type)
    );
    if (!cost.ok) {
      // Contributes nothing rather than a wrong number (WI-11).
      const detail = `Chemical ${chemical.id} in program ${programId}: ${describeConversionFailure(cost)}`;
      unpricedItems.push(detail);
      warnings?.add(detail);
      continue;
    }
    totalCostPerAcre += cost.value;
  }

  const newCost = totalCostPerAcre + Number(program.application_cost || 0);
  return { programId, newCost, unpricedItems };
}

async function cascadeTemplateUpdateInSeason(
  supabase: ReturnType<typeof createClient>,
  templateId: string,
  seasonId: string,
  warnings: WarningBuffer
): Promise<{ fieldsUpdated: number; failedFieldIds: string[] }> {
  const template = must(
    await supabase
      .from("cost_templates")
      .select("*")
      .eq("id", templateId)
      .eq("season_id", seasonId)
      .maybeSingle(),
    `load template ${templateId}`,
  );

  if (!template) return { fieldsUpdated: 0, failedFieldIds: [] };

  const fieldCostRows = must(
    await supabase
      .from("field_costs")
      .select("*")
      .eq("template_id", templateId),
    `load field costs for template ${templateId}`,
  );

  if (!fieldCostRows || fieldCostRows.length === 0) {
    return { fieldsUpdated: 0, failedFieldIds: [] };
  }

  const fieldIds = fieldCostRows.map((r: Record<string, unknown>) => r.field_id as string);

  /*
   * This read is the one that must never be allowed to fail quietly.
   *
   * The previous `const { data } = ...` plus `overrideRows || []` meant a failed query
   * produced an empty override map -- no error, no warning, wrong money on every
   * affected field. The same bug was fixed on the client in e90c377; this is the copy
   * that actually runs. Guardrail 7: the two must be changed together.
   *
   * CORRECTION, 31 Aug 2026. The comment here used to claim this map was "the ONLY
   * thing stopping this cascade from overwriting a field's manually-overridden costs."
   * That was wrong, and being wrong about it hid a live defect for six months.
   *
   * An override does NOT live in the field_costs column it names. It lives in
   * field_cost_overrides.override_value, and getResolvedFieldCosts lays it over the
   * field_costs row for display. The cascade therefore cannot overwrite an override at
   * all -- it is in a different table. What the cascade CAN do, and did, is recompute
   * total_cost_per_acre from the raw columns, so the total quietly reverted to the pure
   * template figure while every line item on screen still showed the override.
   *
   * That is why override_value is now selected: skipping a column is not enough, the
   * total has to be resolved. Nine real fields were wrong -- six understated by ~$24/ac,
   * three overstated by $10-$20/ac.
   */
  const overrideRows = must(
    await supabase
      .from("field_cost_overrides")
      .select("field_id, cost_item_name, override_value")
      .in("field_id", fieldIds),
    `load field cost overrides for template ${templateId}`,
  );

  // The VALUE is kept, not just the presence of a row -- a Set was enough to decide
  // which columns to skip writing, but not enough to total the field correctly.
  const overridesByField = new Map<string, Map<string, unknown>>();
  for (const o of overrideRows || []) {
    const row = o as Record<string, unknown>;
    const fid = row.field_id as string;
    const name = row.cost_item_name as string;
    if (!overridesByField.has(fid)) overridesByField.set(fid, new Map());
    overridesByField.get(fid)!.set(name, row.override_value);
  }

  const fertilizerTemplateCost = Array.isArray(template.fertilizer_programs)
    ? (template.fertilizer_programs as Array<{ cost_per_acre?: number }>).reduce((s, p) => s + (p.cost_per_acre || 0), 0)
    : 0;
  const chemicalTemplateCost = Array.isArray(template.chemical_programs)
    ? (template.chemical_programs as Array<{ cost_per_acre?: number }>).reduce((s, p) => s + (p.cost_per_acre || 0), 0)
    : 0;

  const costFields = [
    "tillage_cost_per_acre", "planting_cost_per_acre", "harvest_cost_per_acre",
    "equipment_cost_per_acre", "custom_services_cost_per_acre", "labor_cost_per_acre",
    "crop_insurance_cost_per_acre", "drying_storage_cost_per_acre", "hauling_cost_per_acre",
    "other_expenses_per_acre",
  ];

  let fieldsUpdated = 0;
  const failedFieldIds: string[] = [];

  await Promise.all(fieldCostRows.map(async (currentFieldCost: Record<string, unknown>) => {
    const fieldId = currentFieldCost.field_id as string;
    try {
      const overrideMap = overridesByField.get(fieldId) ?? new Map<string, unknown>();
      const updates: Record<string, unknown> = {};

      if (!overrideMap.has("fertilizer_programs")) {
        updates.fertilizer_cost_per_acre = fertilizerTemplateCost;
      }
      if (!overrideMap.has("chemical_programs")) {
        updates.chemical_cost_per_acre = chemicalTemplateCost;
      }
      for (const field of costFields) {
        if (!overrideMap.has(field)) {
          updates[field] = (template as Record<string, unknown>)[field] || 0;
        }
      }

      // Resolved, not raw. See applyFieldCostOverrides above and its twin in
      // src/lib/templateLib/templateCalculations.ts (guardrail 7).
      updates.total_cost_per_acre = calculateFieldTotalCost(
        applyFieldCostOverrides({ ...currentFieldCost, ...updates }, overrideMap),
      );

      const { error: updateError } = await supabase
        .from("field_costs")
        .update(updates)
        .eq("field_id", fieldId);

      if (updateError) throw updateError;
      fieldsUpdated++;
    } catch (err) {
      failedFieldIds.push(fieldId);
      warnings.add(`Failed to update field ${fieldId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }));

  return { fieldsUpdated, failedFieldIds };
}

async function cascadeProgramUpdateInSeason(
  supabase: ReturnType<typeof createClient>,
  programId: string,
  programType: "fertilizer" | "chemical",
  seasonId: string,
  warnings: WarningBuffer
): Promise<{ templatesUpdated: number; fieldsUpdated: number }> {
  const programField = programType === "fertilizer" ? "fertilizer_programs" : "chemical_programs";
  let templatesUpdated = 0;
  let fieldsUpdated = 0;

  const templates = must(
    await supabase
      .from("cost_templates")
      .select(`id, ${programField}, season_id`)
      .eq("season_id", seasonId),
    `load templates for season ${seasonId}`,
  );

  if (!templates) return { templatesUpdated: 0, fieldsUpdated: 0 };

  const recalcResult = programType === "fertilizer"
    ? await recalculateFertilizerProgramCost(supabase, programId, warnings)
    : await recalculateChemicalProgramCost(supabase, programId, warnings);

  if (!recalcResult) return { templatesUpdated: 0, fieldsUpdated: 0 };

  for (const template of templates) {
    const programs = template[programField] as Array<{ program_id: string; cost_per_acre?: number }> | null;
    if (!Array.isArray(programs)) continue;
    const programRef = programs.find(p => p.program_id === programId);
    if (!programRef) continue;

    programRef.cost_per_acre = recalcResult.newCost;

    const { error } = await supabase
      .from("cost_templates")
      .update({ [programField]: programs })
      .eq("id", template.id);

    if (!error) {
      templatesUpdated++;
      const result = await cascadeTemplateUpdateInSeason(supabase, template.id as string, seasonId, warnings);
      fieldsUpdated += result.fieldsUpdated;
    }
  }

  return { templatesUpdated, fieldsUpdated };
}

type CascadeStats = { programsUpdated: number; templatesUpdated: number; fieldsUpdated: number; failedFieldIds: string[] };

async function runCascadeProductUpdate(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  seasonId: string,
  warnings: WarningBuffer
): Promise<CascadeStats> {
  const programs = must(
    await supabase
      .from("fertilizer_programs")
      .select("id, season_id, fertilizer_program_items!inner(fertilizer_product_id)")
      .eq("fertilizer_program_items.fertilizer_product_id", entityId)
      .eq("season_id", seasonId),
    `load fertilizer programs using product ${entityId}`,
  );

  let programsUpdated = 0;
  let templatesUpdated = 0;
  let fieldsUpdated = 0;
  const failedFieldIds: string[] = [];

  for (const program of programs || []) {
    // WI-15 asked whether the discarded result of a standalone recalculate call
    // should be persisted or removed. Removed: cascadeProgramUpdateInSeason
    // recalculates internally and writes the result into the templates, so the
    // separate call was two wasted queries per program and its return value was
    // thrown away. There is no stored cost column on *_programs to persist it to.
    const r = await withRetry(() => cascadeProgramUpdateInSeason(supabase, program.id as string, "fertilizer", seasonId, warnings));
    programsUpdated++;
    templatesUpdated += r.templatesUpdated;
    fieldsUpdated += r.fieldsUpdated;
  }

  return { programsUpdated, templatesUpdated, fieldsUpdated, failedFieldIds };
}

async function runCascadeChemicalUpdate(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  seasonId: string,
  warnings: WarningBuffer
): Promise<CascadeStats> {
  const programs = must(
    await supabase
      .from("chemical_programs")
      .select("id, season_id, chemical_program_items!inner(chemical_id)")
      .eq("chemical_program_items.chemical_id", entityId)
      .eq("season_id", seasonId),
    `load chemical programs using chemical ${entityId}`,
  );

  let programsUpdated = 0;
  let templatesUpdated = 0;
  let fieldsUpdated = 0;
  const failedFieldIds: string[] = [];

  for (const program of programs || []) {
    // See the fertilizer path above: the standalone recalculate call was redundant.
    const r = await withRetry(() => cascadeProgramUpdateInSeason(supabase, program.id as string, "chemical", seasonId, warnings));
    programsUpdated++;
    templatesUpdated += r.templatesUpdated;
    fieldsUpdated += r.fieldsUpdated;
  }

  return { programsUpdated, templatesUpdated, fieldsUpdated, failedFieldIds };
}

async function runCascadeProgramUpdate(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  programType: "fertilizer" | "chemical",
  seasonId: string,
  warnings: WarningBuffer
): Promise<CascadeStats> {
  const r = await withRetry(() => cascadeProgramUpdateInSeason(supabase, entityId, programType, seasonId, warnings));
  return { programsUpdated: 1, templatesUpdated: r.templatesUpdated, fieldsUpdated: r.fieldsUpdated, failedFieldIds: [] };
}

async function runCascadeTemplateUpdate(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  seasonId: string,
  warnings: WarningBuffer
): Promise<CascadeStats> {
  const result = await withRetry(() => cascadeTemplateUpdateInSeason(supabase, entityId, seasonId, warnings));
  return { programsUpdated: 0, templatesUpdated: 1, fieldsUpdated: result.fieldsUpdated, failedFieldIds: result.failedFieldIds };
}

/**
 * SEC-3: confirm the task's entity actually lives in the season the task names.
 *
 * Authorization has already established that the caller may edit the season's
 * farm; this is the containment check on top of it. Without it a caller could
 * pair a season they legitimately own with another farm's template or product
 * id and have the service-role client rewrite that farm's costs.
 *
 * Task types this function does not cascade have nothing to protect, so they
 * pass. `recalculate_all_costs` is declared in the client's TaskType union but
 * is never queued and has no branch here.
 */
async function entityBelongsToSeason(
  supabase: ReturnType<typeof createClient>,
  taskType: string,
  entityId: string,
  seasonId: string,
  programType: "fertilizer" | "chemical"
): Promise<boolean> {
  const inSeason = async (table: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("id", entityId)
      .eq("season_id", seasonId)
      .maybeSingle();
    return !error && !!data;
  };

  switch (taskType) {
    case "cascade_template_update":
      return await inSeason("cost_templates");
    case "cascade_chemical_update":
      return await inSeason("individual_chemicals");
    case "cascade_program_update":
      return await inSeason(programType === "chemical" ? "chemical_programs" : "fertilizer_programs");
    case "cascade_product_update":
      // record_purchase queues this for fertilizer products and seed varieties alike.
      return (await inSeason("fertilizer_products")) || (await inSeason("seed_varieties"));
    default:
      return true;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { taskId } = await req.json();

    if (!taskId) {
      return new Response(JSON.stringify({ error: "taskId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("cascade_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (taskError || !task) {
      return new Response(JSON.stringify({ error: "Task not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const seasonId = task.season_id as string;
    const taskType = task.task_type as string;
    const entityId = task.entity_id as string;
    const programType = (task.program_type as "fertilizer" | "chemical" | null) ?? "fertilizer";

    // ---- SEC-3 ------------------------------------------------------------
    // The task row is user-writable, so season_id and entity_id cannot be
    // trusted just because the row belongs to the caller. Everything below this
    // point runs with the service-role client, which bypasses RLS, so the
    // authorization has to happen here.
    //
    // The season is resolved with the USER-scoped client on purpose: RLS decides
    // whether the caller can see it at all. `can_edit_farm` then decides whether
    // they may change it. A trigger on cascade_tasks enforces the same rule at
    // insert time, so this is belt and braces rather than the only control.
    const denyAccess = async (reason: string) => {
      await supabaseAdmin.from("cascade_tasks").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: reason,
      }).eq("id", taskId);

      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    const { data: season, error: seasonError } = await supabaseUser
      .from("seasons")
      .select("id, farm_id")
      .eq("id", seasonId)
      .maybeSingle();

    if (seasonError || !season || !season.farm_id) {
      return await denyAccess("Season is not accessible to the caller");
    }

    const { data: mayEdit, error: mayEditError } = await supabaseUser
      .rpc("can_edit_farm", { p_farm_id: season.farm_id });

    if (mayEditError || mayEdit !== true) {
      return await denyAccess("Caller is not an owner or editor of this farm");
    }

    // The entity must live in the season the task names, or a caller could pair
    // their own season with another farm's template id.
    if (entityId && !(await entityBelongsToSeason(supabaseAdmin, taskType, entityId, seasonId, programType))) {
      return await denyAccess("Entity does not belong to this season");
    }
    // ---- end SEC-3 --------------------------------------------------------

    /*
     * WI-15: claim the task, do not merely announce it.
     *
     * This was an unconditional `update({status: "running"})`, so a duplicate
     * invocation -- a retry, a double-click, two open tabs -- happily started a
     * second cascade running concurrently over the same rows. Making the write
     * conditional on the task still being `pending` means exactly one caller wins;
     * the losers find zero rows updated and return without doing the work twice.
     *
     * `started_at` has existed on this table all along and was never written.
     */
    const claimed = must(
      await supabaseAdmin
        .from("cascade_tasks")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("status", "pending")
        .select("id"),
      `claim task ${taskId}`,
    );

    if (!claimed || claimed.length === 0) {
      // Another invocation already has it. Not an error, but not our work either.
      return new Response(
        JSON.stringify({ success: true, taskId, status: "already-claimed", cascaded: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const warnings = new WarningBuffer();
    let stats: CascadeStats = { programsUpdated: 0, templatesUpdated: 0, fieldsUpdated: 0, failedFieldIds: [] };

    try {
      if (taskType === "cascade_product_update") {
        stats = await runCascadeProductUpdate(supabaseAdmin, entityId, seasonId, warnings);
      } else if (taskType === "cascade_chemical_update") {
        stats = await runCascadeChemicalUpdate(supabaseAdmin, entityId, seasonId, warnings);
      } else if (taskType === "cascade_program_update") {
        stats = await runCascadeProgramUpdate(supabaseAdmin, entityId, programType, seasonId, warnings);
      } else if (taskType === "cascade_template_update") {
        stats = await runCascadeTemplateUpdate(supabaseAdmin, entityId, seasonId, warnings);
      }

      /*
       * Deliberately NOT wrapped in must(). This read only recovers prior
       * result_data so it can be merged forward; the cascade itself has already
       * succeeded by this point, and failing it here would report a completed
       * cascade as failed -- the very inversion WI-15 exists to remove. Record the
       * failure as a warning instead, so the loss of prior data is visible.
       */
      const currentTaskRes = await supabaseAdmin
        .from("cascade_tasks")
        .select("result_data")
        .eq("id", taskId)
        .maybeSingle();

      if (currentTaskRes.error) {
        warnings.add(`Could not read prior result_data for task ${taskId}: ${currentTaskRes.error.message}`);
      }

      const currentData = (currentTaskRes.data?.result_data as Record<string, unknown>) || {};
      const hasFailures = stats.failedFieldIds.length > 0;
      const finalStatus = hasFailures ? "partial" : "completed";

      await supabaseAdmin.from("cascade_tasks").update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        result_data: {
          ...currentData,
          programsUpdated: stats.programsUpdated,
          templatesUpdated: stats.templatesUpdated,
          fieldsUpdated: stats.fieldsUpdated,
          failedFieldIds: stats.failedFieldIds,
          warnings: warnings.snapshot(),
        },
      }).eq("id", taskId);

    } catch (execError) {
      /*
       * WI-15: the caller must hear about this.
       *
       * The task row was already being marked `failed` here, but the function then
       * fell through to an unconditional `{success: true}` with a 200. So the one
       * place in the system that knew the cascade had failed told the client it had
       * succeeded, and the client had no reason to look at the task row.
       */
      const errorMsg = execError instanceof Error ? execError.message : String(execError);
      await supabaseAdmin.from("cascade_tasks").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
        result_data: { warnings: warnings.snapshot() },
      }).eq("id", taskId);

      return new Response(
        JSON.stringify({ success: false, taskId, status: "failed", error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reached only when the cascade ran to completion. `partial` means some fields
    // failed to update and their ids are on the task row.
    const hadFailures = stats.failedFieldIds.length > 0;
    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        status: hadFailures ? "partial" : "completed",
        cascaded: true,
        programsUpdated: stats.programsUpdated,
        templatesUpdated: stats.templatesUpdated,
        fieldsUpdated: stats.fieldsUpdated,
        failedFieldIds: stats.failedFieldIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

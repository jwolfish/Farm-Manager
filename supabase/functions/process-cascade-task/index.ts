import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

type ConversionFailureReason = "unknown-unit" | "incompatible-class" | "invalid-amount";

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
  }
}

function calculateCostWithConversion(
  rate: number,
  rateUnit: string,
  price: number,
  priceUnit: string
): ConversionResult {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return {
      ok: false,
      reason: "invalid-amount",
      from: normalizeUnit(rateUnit),
      to: normalizeUnit(priceUnit),
    };
  }
  const converted = convertUnits(rateUnit, priceUnit, rate);
  if (!converted.ok) return converted;
  return { ok: true, value: converted.value * price };
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
  const { data: program } = await supabase
    .from("fertilizer_programs")
    .select("id, application_cost")
    .eq("id", programId)
    .maybeSingle();

  if (!program) return null;

  const { data: items } = await supabase
    .from("fertilizer_program_items")
    .select("id, application_rate, application_rate_unit, fertilizer_products(id, price_per_unit, unit_type)")
    .eq("program_id", programId);

  let totalCostPerAcre = 0;
  const unpricedItems: string[] = [];
  for (const item of items || []) {
    const product = (item as Record<string, unknown>).fertilizer_products as Record<string, unknown> | null;
    if (!product) continue;
    const cost = calculateCostWithConversion(
      Number(item.application_rate),
      String(item.application_rate_unit),
      Number(product.price_per_unit),
      String(product.unit_type)
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
  const { data: program } = await supabase
    .from("chemical_programs")
    .select("id, application_cost")
    .eq("id", programId)
    .maybeSingle();

  if (!program) return null;

  const { data: items } = await supabase
    .from("chemical_program_items")
    .select("id, application_rate, application_rate_unit, individual_chemicals(id, price_per_unit, unit_type)")
    .eq("program_id", programId);

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
  const { data: template } = await supabase
    .from("cost_templates")
    .select("*")
    .eq("id", templateId)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (!template) return { fieldsUpdated: 0, failedFieldIds: [] };

  const { data: fieldCostRows } = await supabase
    .from("field_costs")
    .select("*")
    .eq("template_id", templateId);

  if (!fieldCostRows || fieldCostRows.length === 0) {
    return { fieldsUpdated: 0, failedFieldIds: [] };
  }

  const fieldIds = fieldCostRows.map((r: Record<string, unknown>) => r.field_id as string);

  const { data: overrideRows } = await supabase
    .from("field_cost_overrides")
    .select("field_id, cost_item_name")
    .in("field_id", fieldIds);

  const overridesByField = new Map<string, Set<string>>();
  for (const o of overrideRows || []) {
    const fid = (o as Record<string, unknown>).field_id as string;
    const name = (o as Record<string, unknown>).cost_item_name as string;
    if (!overridesByField.has(fid)) overridesByField.set(fid, new Set());
    overridesByField.get(fid)!.add(name);
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
      const overrideMap = overridesByField.get(fieldId) ?? new Set<string>();
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

      updates.total_cost_per_acre = calculateFieldTotalCost({ ...currentFieldCost, ...updates });

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

  const { data: templates } = await supabase
    .from("cost_templates")
    .select(`id, ${programField}, season_id`)
    .eq("season_id", seasonId);

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
  const { data: programs } = await supabase
    .from("fertilizer_programs")
    .select("id, season_id, fertilizer_program_items!inner(fertilizer_product_id)")
    .eq("fertilizer_program_items.fertilizer_product_id", entityId)
    .eq("season_id", seasonId);

  let programsUpdated = 0;
  let templatesUpdated = 0;
  let fieldsUpdated = 0;
  const failedFieldIds: string[] = [];

  for (const program of programs || []) {
    await withRetry(() => recalculateFertilizerProgramCost(supabase, program.id as string, warnings));
    programsUpdated++;
    const r = await withRetry(() => cascadeProgramUpdateInSeason(supabase, program.id as string, "fertilizer", seasonId, warnings));
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
  const { data: programs } = await supabase
    .from("chemical_programs")
    .select("id, season_id, chemical_program_items!inner(chemical_id)")
    .eq("chemical_program_items.chemical_id", entityId)
    .eq("season_id", seasonId);

  let programsUpdated = 0;
  let templatesUpdated = 0;
  let fieldsUpdated = 0;
  const failedFieldIds: string[] = [];

  for (const program of programs || []) {
    await withRetry(() => recalculateChemicalProgramCost(supabase, program.id as string, warnings));
    programsUpdated++;
    const r = await withRetry(() => cascadeProgramUpdateInSeason(supabase, program.id as string, "chemical", seasonId, warnings));
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

    await supabaseAdmin
      .from("cascade_tasks")
      .update({ status: "running" })
      .eq("id", taskId);

    const seasonId = task.season_id as string;
    const taskType = task.task_type as string;
    const entityId = task.entity_id as string;
    const programType = (task.program_type as "fertilizer" | "chemical" | null) ?? "fertilizer";

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

      const { data: currentTask } = await supabaseAdmin
        .from("cascade_tasks")
        .select("result_data")
        .eq("id", taskId)
        .maybeSingle();

      const currentData = (currentTask?.result_data as Record<string, unknown>) || {};
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
      const errorMsg = execError instanceof Error ? execError.message : String(execError);
      await supabaseAdmin.from("cascade_tasks").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
        result_data: { warnings: warnings.snapshot() },
      }).eq("id", taskId);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

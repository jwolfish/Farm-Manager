import { supabase } from './supabase';
import { recalculateFieldTotal } from './templateLib/fieldCostOverrides';
import {
  buildPlanPrograms,
  enabledProgramIds,
  type FertilizerProductMeta,
  type FieldRate,
  type PlanEditorProgram,
  type PlanSavePayload,
  type SeasonProgram,
} from './fieldFertilizerRates';

/**
 * Loading and saving for the per-field fertilizer plan — V-5.
 *
 * Kept apart from `fieldFertilizerRates.ts`, which stays free of the Supabase client so its
 * arithmetic can be unit-tested and its editor rendered in a browser without credentials.
 *
 * Every read throws rather than returning empty. A swallowed read here would present a
 * field as having no custom rates when it has them, and the owner would then save the
 * program's rates over their own — the same class of quiet wrong that `|| []` on the
 * override read cost this project six months.
 */

export interface FieldPlanContext {
  fieldName: string;
  acreage: number;
  programs: PlanEditorProgram[];
  /** A typed fertilizer_cost_per_acre override, if the field has one — defect 4. */
  numericOverride: number | null;
}

export async function loadFieldPlan(fieldId: string): Promise<FieldPlanContext> {
  const { data: field, error: fieldError } = await supabase
    .from('fields')
    .select('id, name, acreage, season_id')
    .eq('id', fieldId)
    .maybeSingle();

  if (fieldError) throw new Error(`Could not load the field: ${fieldError.message}`);
  if (!field) throw new Error('Field not found');

  const seasonId = field.season_id;

  const [costRes, overrideRes, programRes, productRes, rateRes] = await Promise.all([
    supabase.from('field_costs').select('template_id').eq('field_id', fieldId).maybeSingle(),
    supabase
      .from('field_cost_overrides')
      .select('cost_item_name, override_value')
      .eq('field_id', fieldId)
      .in('cost_item_name', ['fertilizer_programs', 'fertilizer_cost_per_acre']),
    supabase
      .from('fertilizer_programs')
      .select(`id, program_name, application_cost,
               fertilizer_program_items ( fertilizer_product_id, application_rate, application_rate_unit )`)
      .eq('season_id', seasonId),
    supabase
      .from('fertilizer_products')
      .select('id, product_name, unit_type, price_per_unit, density_lb_per_gal')
      .eq('season_id', seasonId),
    supabase
      .from('field_fertilizer_rates')
      .select('field_id, program_id, fertilizer_product_id, application_rate, application_rate_unit')
      .eq('field_id', fieldId),
  ]);

  if (costRes.error) throw new Error(`Could not load field costs: ${costRes.error.message}`);
  if (overrideRes.error) throw new Error(`Could not load field overrides: ${overrideRes.error.message}`);
  if (programRes.error) throw new Error(`Could not load fertilizer programs: ${programRes.error.message}`);
  if (productRes.error) throw new Error(`Could not load fertilizer products: ${productRes.error.message}`);
  if (rateRes.error) throw new Error(`Could not load this field's rates: ${rateRes.error.message}`);

  const products = new Map<string, FertilizerProductMeta>(
    (productRes.data ?? []).map((p) => [
      p.id,
      {
        productId: p.id,
        productName: p.product_name,
        unitType: p.unit_type,
        pricePerUnit: Number(p.price_per_unit ?? 0),
        density: p.density_lb_per_gal == null ? null : Number(p.density_lb_per_gal),
      },
    ])
  );

  const seasonPrograms: SeasonProgram[] = (programRes.data ?? []).map((p) => ({
    programId: p.id,
    programName: p.program_name,
    applicationCost: Number(p.application_cost ?? 0),
    items: (Array.isArray(p.fertilizer_program_items) ? p.fertilizer_program_items : []).map(
      (i: { fertilizer_product_id: string; application_rate: number; application_rate_unit: string }) => ({
        productId: i.fertilizer_product_id,
        rate: Number(i.application_rate),
        rateUnit: i.application_rate_unit,
      })
    ),
  }));

  const fieldRates: FieldRate[] = (rateRes.data ?? []).map((r) => ({
    fieldId: r.field_id,
    programId: r.program_id,
    productId: r.fertilizer_product_id,
    rate: Number(r.application_rate),
    rateUnit: r.application_rate_unit,
  }));

  const overrideRows = overrideRes.data ?? [];
  const programOverride = overrideRows.find((o) => o.cost_item_name === 'fertilizer_programs');
  const numericRow = overrideRows.find((o) => o.cost_item_name === 'fertilizer_cost_per_acre');
  const numericOverride =
    numericRow && Number.isFinite(Number(numericRow.override_value))
      ? Number(numericRow.override_value)
      : null;

  /*
   * The field's effective program list: its own override array if it has one, otherwise the
   * template's. That precedence now lives in `enabledProgramIds` so this and the V-6 grid
   * cannot drift apart — the RPC seeds from the same rule in SQL, which it must, but there
   * is no reason for the two TypeScript readers to spell it out twice.
   *
   * The template is only fetched when there is no override, because when there is one the
   * template's list is not the answer.
   */
  let templatePrograms: unknown = null;
  if (!Array.isArray(programOverride?.override_value) && costRes.data?.template_id) {
    const { data: template, error: templateError } = await supabase
      .from('cost_templates')
      .select('fertilizer_programs')
      .eq('id', costRes.data.template_id)
      .maybeSingle();
    if (templateError) throw new Error(`Could not load the template: ${templateError.message}`);
    templatePrograms = template?.fertilizer_programs ?? null;
  }
  const enabled = enabledProgramIds(programOverride?.override_value, templatePrograms);

  return {
    fieldName: field.name,
    acreage: Number(field.acreage ?? 0),
    numericOverride,
    programs: buildPlanPrograms(fieldId, seasonPrograms, fieldRates, products, enabled),
  };
}

/**
 * Save the whole plan: one RPC per program, then re-total the field.
 *
 * The RPC is per program because that is the unit the override array is edited in. Saving
 * every program on the screen — not only the changed ones — keeps the call idempotent and
 * means a pass switched off is actually removed rather than merely left alone.
 *
 * The total is recomputed here rather than in SQL (§5.2a): it is a flat sum, but it already
 * exists in two places and a third in a third language is what F-3 refused. The cost of
 * that is a crash window in which the total is stale — self-healing on the next edit or
 * cascade, and not the systematic 31 Aug defect.
 */
export async function saveFieldPlan(
  fieldId: string,
  payload: readonly PlanSavePayload[]
): Promise<void> {
  for (const program of payload) {
    const body = program.enabled
      ? {
          field_id: fieldId,
          program_id: program.programId,
          applies: true,
          program_cost_per_acre: program.costPerAcre,
          rates: program.rates.map((r) => ({
            product_id: r.productId,
            rate: r.rate,
            unit: r.unit,
            sort_order: r.sortOrder,
          })),
        }
      : { field_id: fieldId, program_id: program.programId, applies: false };

    const { error } = await supabase.rpc('save_field_fertilizer_rates', { p_payload: body });
    if (error) {
      throw new Error(`Could not save ${program.programId}: ${error.message}`);
    }
  }

  await recalculateFieldTotal(fieldId);
}

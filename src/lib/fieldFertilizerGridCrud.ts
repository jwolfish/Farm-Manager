import { supabase } from './supabase';
import { recalculateFieldTotal } from './templateLib/fieldCostOverrides';
import {
  enabledProgramIds,
  type FertilizerProductMeta,
  type FieldRate,
  type SeasonProgram,
} from './fieldFertilizerRates';
import type { GridFieldInput, GridSavePayload } from './fieldFertilizerGrid';

/**
 * Loading and saving for the bulk rate grid — V-6.
 *
 * Separate from `fieldFertilizerGrid.ts`, which stays free of the Supabase client so the
 * grid's arithmetic is unit-tested and the component is renderable in a browser without
 * credentials. Same split as V-5, for the same reason: every fertilizer step before F-4b
 * shipped with "not opened in a browser" against it because the components reached the
 * client at module load.
 *
 * Every read throws. A swallowed read here would show a season's worth of fields as
 * inheriting when they are not, and the owner would then save the program's rates over
 * their own soil-test numbers — a swallowed contract read cost this project six months once
 * already.
 */

export interface RateGridContext {
  seasonId: string;
  /** What to call this season on screen — the year, when the row has one. */
  seasonLabel: string;
  programs: SeasonProgram[];
  products: Map<string, FertilizerProductMeta>;
  /** Every field in the season, with its per-program applies flag resolved per program. */
  fields: Array<Omit<GridFieldInput, 'applies'> & { enabledProgramIds: Set<string> }>;
  /** Every per-field rate row in this season, for every program. */
  rates: FieldRate[];
}

export async function loadRateGridContext(seasonId: string): Promise<RateGridContext> {
  const [fieldRes, seasonRes] = await Promise.all([
    supabase.from('fields').select('id, name, acreage').eq('season_id', seasonId).order('name'),
    supabase.from('seasons').select('year').eq('id', seasonId).maybeSingle(),
  ]);

  if (fieldRes.error) throw new Error(`Could not load fields: ${fieldRes.error.message}`);
  if (seasonRes.error) throw new Error(`Could not load the season: ${seasonRes.error.message}`);

  const fieldRows = fieldRes.data;
  const seasonLabel = seasonRes.data?.year ? `${seasonRes.data.year} season` : 'This season';
  const fieldIds = (fieldRows ?? []).map((f) => f.id);

  if (fieldIds.length === 0) {
    return { seasonId, seasonLabel, programs: [], products: new Map(), fields: [], rates: [] };
  }

  /*
   * Every field-scoped read is bounded by `fieldIds` rather than fetched wholesale and
   * filtered in JavaScript. That is PERF-2 / WI-23, which the shopping list was doing the
   * wrong way for exactly this shape of query.
   */
  const [costRes, overrideRes, programRes, productRes, rateRes] = await Promise.all([
    supabase.from('field_costs').select('field_id, template_id').in('field_id', fieldIds),
    supabase
      .from('field_cost_overrides')
      .select('field_id, override_value')
      .in('field_id', fieldIds)
      .eq('cost_item_name', 'fertilizer_programs'),
    supabase
      .from('fertilizer_programs')
      .select(`id, program_name, application_cost,
               fertilizer_program_items ( fertilizer_product_id, application_rate, application_rate_unit )`)
      .eq('season_id', seasonId)
      .order('program_name'),
    supabase
      .from('fertilizer_products')
      .select('id, product_name, unit_type, price_per_unit, density_lb_per_gal')
      .eq('season_id', seasonId),
    supabase
      .from('field_fertilizer_rates')
      .select('field_id, program_id, fertilizer_product_id, application_rate, application_rate_unit')
      .in('field_id', fieldIds),
  ]);

  if (costRes.error) throw new Error(`Could not load field costs: ${costRes.error.message}`);
  if (overrideRes.error) throw new Error(`Could not load field overrides: ${overrideRes.error.message}`);
  if (programRes.error) throw new Error(`Could not load fertilizer programs: ${programRes.error.message}`);
  if (productRes.error) throw new Error(`Could not load fertilizer products: ${productRes.error.message}`);
  if (rateRes.error) throw new Error(`Could not load per-field rates: ${rateRes.error.message}`);

  const costByField = new Map((costRes.data ?? []).map((c) => [c.field_id, c.template_id]));
  const overrideByField = new Map(
    (overrideRes.data ?? []).map((o) => [o.field_id, o.override_value as unknown])
  );

  // Only the templates actually referenced, and only once each.
  const templateIds = [...new Set([...costByField.values()].filter((id): id is string => !!id))];
  const templatePrograms = new Map<string, unknown>();
  if (templateIds.length > 0) {
    const { data, error } = await supabase
      .from('cost_templates')
      .select('id, fertilizer_programs')
      .in('id', templateIds);
    if (error) throw new Error(`Could not load cost templates: ${error.message}`);
    for (const t of data ?? []) templatePrograms.set(t.id, t.fertilizer_programs);
  }

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

  const programs: SeasonProgram[] = (programRes.data ?? []).map((p) => ({
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

  const rates: FieldRate[] = (rateRes.data ?? []).map((r) => ({
    fieldId: r.field_id,
    programId: r.program_id,
    productId: r.fertilizer_product_id,
    rate: Number(r.application_rate),
    rateUnit: r.application_rate_unit,
  }));

  const fields = (fieldRows ?? []).map((f) => ({
    fieldId: f.id,
    fieldName: f.name,
    acreage: Number(f.acreage ?? 0),
    hasCostRow: costByField.has(f.id),
    enabledProgramIds: enabledProgramIds(
      overrideByField.get(f.id),
      templatePrograms.get(costByField.get(f.id) ?? '') ?? null
    ),
  }));

  return { seasonId, seasonLabel, programs, products, fields, rates };
}

/** The grid's field list for one program — the applies flag resolved for that pass. */
export function fieldsForProgram(
  context: RateGridContext,
  programId: string
): GridFieldInput[] {
  return context.fields.map((f) => ({
    fieldId: f.fieldId,
    fieldName: f.fieldName,
    acreage: f.acreage,
    hasCostRow: f.hasCostRow,
    applies: f.enabledProgramIds.has(programId),
  }));
}

export interface GridSaveResult {
  fieldsWritten: number;
  /** Fields whose rates landed but whose stored total could not be refreshed. */
  staleTotals: string[];
}

/**
 * Commit a grid edit: every changed field in ONE transaction, then re-total each of them.
 *
 * The single RPC is the point. Looping `save_field_fertilizer_rates` over 17 fields would
 * mean a save that can stop half way, and §10.7 requires the CSV import — which commits
 * through this same path — to be all-or-nothing.
 *
 * The re-totalling that follows is deliberately NOT in the transaction, and is the V-4
 * trade-off widened from one field to a batch: the cost needs the unit table and the
 * density bridge, so computing it in SQL would be a third copy in a third language (§5.2a).
 * A total that misses its refresh is STALE, not wrong, and self-heals on the next edit or
 * cascade — so a failure there is reported rather than raised, because raising would say
 * the save failed when the rates are safely committed.
 */
export async function saveRateGrid(payload: readonly GridSavePayload[]): Promise<GridSaveResult> {
  if (payload.length === 0) return { fieldsWritten: 0, staleTotals: [] };

  const saves = payload.map((p) => ({
    field_id: p.fieldId,
    program_id: p.programId,
    ...(p.enabled
      ? {
          applies: true,
          program_cost_per_acre: p.costPerAcre,
          rates: p.rates.map((r) => ({
            product_id: r.productId,
            rate: r.rate,
            unit: r.unit,
            sort_order: r.sortOrder,
          })),
        }
      : { applies: false }),
  }));

  const { error } = await supabase.rpc('save_field_fertilizer_rates_bulk', {
    p_payload: { saves },
  });
  if (error) throw new Error(`Nothing was saved: ${error.message}`);

  const staleTotals: string[] = [];
  for (const p of payload) {
    try {
      await recalculateFieldTotal(p.fieldId);
    } catch {
      staleTotals.push(p.fieldName);
    }
  }

  return { fieldsWritten: payload.length, staleTotals };
}

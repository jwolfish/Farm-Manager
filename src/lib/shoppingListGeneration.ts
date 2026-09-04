import { supabase } from './supabase';
import { accumulateNeed, neededAfterOnHand, NeedContribution } from './shoppingListMath';
import { loadFertilizerCoverage } from './fertilizerCoverage';

export interface ShoppingLineInput {
  masterProductId: string | null;
  productName: string;
  productCategory: 'chemical' | 'fertilizer' | 'seed';
  /**
   * Gross plan need, before any deduction. Stored rather than derived: the net
   * clamps at zero, so `plan - covered` cannot be recovered from a line whose
   * coverage exceeded its need.
   */
  planQuantity: number;
  /** Plan need minus whatever is already covered, never below zero. */
  neededQuantity: number;
  /** Stock in the shed — chemical and seed only. */
  onHandAtGeneration: number;
  /**
   * Fertilizer already bought — booked, delivered, or both. Zero for chemical
   * and seed, which are covered by `onHandAtGeneration` instead. A line never
   * carries both, and the two are kept apart so neither name has to lie.
   */
  contractedAtGeneration: number;
  unitType: string;
  /**
   * Non-empty when some contribution to this line could not be converted into
   * the line's unit (WI-12). The quantity is then an undercount and must be
   * shown to the user as unreliable rather than treated as a purchase figure.
   */
  issues: string[];
}

interface ProgramRef {
  program_id: string;
  cost_per_acre: number;
}

export async function generateChemicalLines(
  seasonId: string,
  farmId: string
): Promise<ShoppingLineInput[]> {
  const [fieldsRes, overridesRes] = await Promise.all([
    supabase
      .from('fields')
      .select('id, acreage, field_costs(template_id)')
      .eq('season_id', seasonId),
    supabase
      .from('field_cost_overrides')
      .select('field_id, cost_item_name, override_value')
      .eq('cost_item_name', 'chemical_programs'),
  ]);

  const fields = fieldsRes.data ?? [];
  if (fields.length === 0) return [];

  const fieldIds = fields.map((f: any) => f.id);
  const overridesFiltered = (overridesRes.data ?? []).filter((o: any) =>
    fieldIds.includes(o.field_id)
  );
  const overrideMap = new Map<string, ProgramRef[]>();
  for (const o of overridesFiltered) {
    overrideMap.set(o.field_id, o.override_value as ProgramRef[]);
  }

  const templateIds = [
    ...new Set(
      fields
        .map((f: any) => {
          const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
          return fc?.template_id as string | null;
        })
        .filter(Boolean) as string[]
    ),
  ];

  let templateMap = new Map<string, ProgramRef[]>();
  if (templateIds.length > 0) {
    const { data } = await supabase
      .from('cost_templates')
      .select('id, chemical_programs')
      .in('id', templateIds);
    for (const t of data ?? []) {
      templateMap.set(t.id, (t.chemical_programs as ProgramRef[]) ?? []);
    }
  }

  const allProgramIds = new Set<string>();
  for (const f of fields as any[]) {
    const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
    const templateId: string | null = fc?.template_id ?? null;
    const refs = overrideMap.get(f.id) ?? (templateId ? (templateMap.get(templateId) ?? []) : []);
    for (const r of refs) allProgramIds.add(r.program_id);
  }

  if (allProgramIds.size === 0) return [];

  const { data: programs } = await supabase
    .from('chemical_programs')
    .select(`
      id,
      chemical_program_items (
        application_rate, application_rate_unit,
        individual_chemicals ( id, chemical_name, unit_type, master_product_id )
      )
    `)
    .in('id', [...allProgramIds]);

  const programMap = new Map<string, any>();
  for (const p of programs ?? []) programMap.set(p.id, p);

  // Collect every contribution per chemical first (WI-12). The canonical unit
  // is not known until the linked master product has been read, so nothing is
  // summed here — each contribution keeps its own rate unit and is converted
  // on the way into the total below.
  const chemMeta = new Map<
    string,
    { chemId: string; name: string; masterProductId: string | null }
  >();
  const chemContributions = new Map<string, NeedContribution[]>();

  for (const f of fields as any[]) {
    const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
    const templateId: string | null = fc?.template_id ?? null;
    const refs = overrideMap.get(f.id) ?? (templateId ? (templateMap.get(templateId) ?? []) : []);
    const acreage = Number(f.acreage);

    for (const ref of refs) {
      const program = programMap.get(ref.program_id);
      if (!program) continue;
      const items = Array.isArray(program.chemical_program_items) ? program.chemical_program_items : [];
      for (const item of items) {
        const chem = Array.isArray(item.individual_chemicals)
          ? item.individual_chemicals[0]
          : item.individual_chemicals;
        if (!chem) continue;
        const rate = Number(item.application_rate);
        const rateUnit: string = item.application_rate_unit ?? chem.unit_type ?? '';

        if (!chemMeta.has(chem.id)) {
          chemMeta.set(chem.id, {
            chemId: chem.id,
            name: chem.chemical_name,
            masterProductId: chem.master_product_id ?? null,
          });
          chemContributions.set(chem.id, []);
        }
        chemContributions.get(chem.id)!.push({ rate, rateUnit, acreage });
      }
    }
  }

  // Fetch on-hand quantities for linked master products
  const masterIds = [...chemMeta.values()]
    .map((c) => c.masterProductId)
    .filter(Boolean) as string[];

  const onHandMap = new Map<string, { quantity: number; unitType: string }>();
  if (masterIds.length > 0) {
    const { data: masters } = await supabase
      .from('master_products')
      .select('id, on_hand_quantity, unit_type')
      .in('id', masterIds);
    for (const m of masters ?? []) {
      onHandMap.set(m.id, { quantity: Number(m.on_hand_quantity ?? 0), unitType: m.unit_type });
    }
  }

  const lines: ShoppingLineInput[] = [];
  for (const meta of chemMeta.values()) {
    let onHand = 0;
    let canonicalUnit: string | null = null;
    if (meta.masterProductId) {
      const master = onHandMap.get(meta.masterProductId);
      if (master) {
        onHand = master.quantity;
        canonicalUnit = master.unitType;
      }
    }

    const accumulated = accumulateNeed(chemContributions.get(meta.chemId) ?? [], canonicalUnit);

    lines.push({
      masterProductId: meta.masterProductId,
      productName: meta.name,
      productCategory: 'chemical',
      planQuantity: accumulated.total,
      neededQuantity: neededAfterOnHand(accumulated.total, onHand),
      onHandAtGeneration: onHand,
      contractedAtGeneration: 0,
      unitType: accumulated.unit,
      issues: accumulated.issues,
    });
  }

  return lines;
}

/** Plan need for one fertilizer product, in that product's own unit. */
export interface FertilizerNeed {
  productId: string;
  productName: string;
  unit: string;
  total: number;
  /** Contributions that could not be converted; `total` is an undercount. */
  issues: string[];
}

/**
 * Programs x acreage, rolled up per fertilizer product.
 *
 * Extracted from `generateFertilizerLines` for F-4: the Fertilizer Contracts tab
 * shows this same number beside what has actually been contracted, and the two
 * must not be able to disagree. The shopping list is now a second consumer of
 * this rather than the only implementation.
 */
export async function computeFertilizerNeedByProduct(
  seasonId: string
): Promise<FertilizerNeed[]> {
  const [fieldsRes, overridesRes] = await Promise.all([
    supabase
      .from('fields')
      .select('id, acreage, field_costs(template_id)')
      .eq('season_id', seasonId),
    supabase
      .from('field_cost_overrides')
      .select('field_id, cost_item_name, override_value')
      .eq('cost_item_name', 'fertilizer_programs'),
  ]);

  const fields = fieldsRes.data ?? [];
  if (fields.length === 0) return [];

  const fieldIds = fields.map((f: any) => f.id);
  const overridesFiltered = (overridesRes.data ?? []).filter((o: any) =>
    fieldIds.includes(o.field_id)
  );
  const overrideMap = new Map<string, ProgramRef[]>();
  for (const o of overridesFiltered) {
    overrideMap.set(o.field_id, o.override_value as ProgramRef[]);
  }

  const templateIds = [
    ...new Set(
      fields
        .map((f: any) => {
          const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
          return fc?.template_id as string | null;
        })
        .filter(Boolean) as string[]
    ),
  ];

  let templateMap = new Map<string, ProgramRef[]>();
  if (templateIds.length > 0) {
    const { data } = await supabase
      .from('cost_templates')
      .select('id, fertilizer_programs')
      .in('id', templateIds);
    for (const t of data ?? []) {
      templateMap.set(t.id, (t.fertilizer_programs as ProgramRef[]) ?? []);
    }
  }

  const allProgramIds = new Set<string>();
  for (const f of fields as any[]) {
    const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
    const templateId: string | null = fc?.template_id ?? null;
    const refs = overrideMap.get(f.id) ?? (templateId ? (templateMap.get(templateId) ?? []) : []);
    for (const r of refs) allProgramIds.add(r.program_id);
  }

  if (allProgramIds.size === 0) return [];

  const { data: programs } = await supabase
    .from('fertilizer_programs')
    .select(`
      id,
      fertilizer_program_items (
        application_rate, application_rate_unit,
        fertilizer_products ( id, product_name, unit_type, density_lb_per_gal )
      )
    `)
    .in('id', [...allProgramIds]);

  const programMap = new Map<string, any>();
  for (const p of programs ?? []) programMap.set(p.id, p);

  // Collect contributions per fertilizer product, converting on the way in to
  // the product's own unit rather than summing mixed rate units (WI-12).
  const fertMeta = new Map<
    string,
    { prodId: string; name: string; priceUnit: string; density: number | null }
  >();
  const fertContributions = new Map<string, NeedContribution[]>();

  for (const f of fields as any[]) {
    const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
    const templateId: string | null = fc?.template_id ?? null;
    const refs = overrideMap.get(f.id) ?? (templateId ? (templateMap.get(templateId) ?? []) : []);
    const acreage = Number(f.acreage);

    for (const ref of refs) {
      const program = programMap.get(ref.program_id);
      if (!program) continue;
      const items = Array.isArray(program.fertilizer_program_items) ? program.fertilizer_program_items : [];
      for (const item of items) {
        const prod = Array.isArray(item.fertilizer_products)
          ? item.fertilizer_products[0]
          : item.fertilizer_products;
        if (!prod) continue;
        const rate = Number(item.application_rate);
        const rateUnit: string = item.application_rate_unit ?? prod.unit_type ?? '';

        if (!fertMeta.has(prod.id)) {
          fertMeta.set(prod.id, {
            prodId: prod.id,
            name: prod.product_name,
            priceUnit: prod.unit_type ?? rateUnit,
            density: prod.density_lb_per_gal ?? null,
          });
          fertContributions.set(prod.id, []);
        }
        fertContributions.get(prod.id)!.push({ rate, rateUnit, acreage });
      }
    }
  }

  const needs: FertilizerNeed[] = [];
  for (const meta of fertMeta.values()) {
    const accumulated = accumulateNeed(
      fertContributions.get(meta.prodId) ?? [],
      meta.priceUnit,
      meta.density
    );
    needs.push({
      productId: meta.prodId,
      productName: meta.name,
      unit: accumulated.unit,
      total: accumulated.total,
      issues: accumulated.issues,
    });
  }

  return needs;
}

/**
 * Fertilizer still has no on-hand tracking, by design — it goes on the ground
 * rather than into the shed, so there is no shed balance to subtract.
 *
 * What it does have, since F-2 … F-6, is a commitment at the plant. A contract is
 * fertilizer already bought, and until this change nothing told the shopping list:
 * the 2027 list asked a supplier to quote 63.20 t of Urea against 30 t already
 * booked. So the deduction is not on-hand; it is coverage, and it comes from the
 * contracts.
 *
 * The clamp is `neededAfterOnHand` rather than a second `Math.max(0, …)` written
 * here. The two categories may differ in where coverage comes from; they must not
 * differ in arithmetic.
 */
export async function generateFertilizerLines(
  seasonId: string,
  _farmId: string
): Promise<ShoppingLineInput[]> {
  const [needs, coverage] = await Promise.all([
    computeFertilizerNeedByProduct(seasonId),
    loadFertilizerCoverage(seasonId),
  ]);

  return needs.map((need) => {
    const cover = coverage.get(need.productId);
    const covered = cover?.covered ?? 0;

    return {
      masterProductId: null,
      productName: need.productName,
      productCategory: 'fertilizer' as const,
      planQuantity: need.total,
      neededQuantity: neededAfterOnHand(need.total, covered),
      onHandAtGeneration: 0,
      contractedAtGeneration: covered,
      unitType: need.unit,
      // A load line excluded for an unconvertible unit makes coverage an
      // undercount and therefore this line's buy quantity an overcount. Safe
      // direction, but it still has to be said.
      issues: [...need.issues, ...(cover?.issues ?? [])],
    };
  });
}

export async function generateSeedLines(
  seasonId: string,
  farmId: string
): Promise<ShoppingLineInput[]> {
  const { data: fields } = await supabase
    .from('fields')
    .select(`
      id, acreage,
      field_costs (
        seed_variety_id,
        seeding_rate_override,
        seed_varieties (
          id, product_name, standard_seeding_rate, units_per_bag, unit_type, master_product_id
        )
      )
    `)
    .eq('season_id', seasonId);

  if (!fields || fields.length === 0) return [];

  // Accumulate bags per seed variety
  const seedAccum = new Map<
    string,
    { varId: string; name: string; masterProductId: string | null; totalBags: number; unitType: string }
  >();

  for (const f of fields as any[]) {
    const fc = Array.isArray(f.field_costs) ? f.field_costs[0] : f.field_costs;
    if (!fc?.seed_variety_id) continue;
    const sv = Array.isArray(fc.seed_varieties) ? fc.seed_varieties[0] : fc.seed_varieties;
    if (!sv) continue;

    const seedingRate: number | null =
      fc.seeding_rate_override != null
        ? Number(fc.seeding_rate_override)
        : sv.standard_seeding_rate != null
        ? Number(sv.standard_seeding_rate)
        : null;
    const unitsPerBag: number | null = sv.units_per_bag != null ? Number(sv.units_per_bag) : null;
    const acreage = Number(f.acreage);

    if (seedingRate == null || unitsPerBag == null || unitsPerBag <= 0) continue;

    const bagsNeeded = Math.ceil((acreage * seedingRate) / unitsPerBag);
    const existing = seedAccum.get(sv.id);
    if (existing) {
      existing.totalBags += bagsNeeded;
    } else {
      seedAccum.set(sv.id, {
        varId: sv.id,
        name: sv.product_name,
        masterProductId: sv.master_product_id ?? null,
        totalBags: bagsNeeded,
        unitType: 'bags',
      });
    }
  }

  // Fetch on-hand for linked master products
  const masterIds = [...seedAccum.values()]
    .map((s) => s.masterProductId)
    .filter(Boolean) as string[];

  const onHandMap = new Map<string, number>();
  if (masterIds.length > 0) {
    const { data: masters } = await supabase
      .from('master_products')
      .select('id, on_hand_quantity')
      .in('id', masterIds);
    for (const m of masters ?? []) {
      onHandMap.set(m.id, Number(m.on_hand_quantity ?? 0));
    }
  }

  const lines: ShoppingLineInput[] = [];
  for (const acc of seedAccum.values()) {
    const onHand = acc.masterProductId ? (onHandMap.get(acc.masterProductId) ?? 0) : 0;
    // Seed is counted in whole bags throughout, so there is no unit to convert.
    lines.push({
      masterProductId: acc.masterProductId,
      productName: acc.name,
      productCategory: 'seed',
      planQuantity: acc.totalBags,
      neededQuantity: neededAfterOnHand(acc.totalBags, onHand),
      onHandAtGeneration: onHand,
      contractedAtGeneration: 0,
      unitType: acc.unitType,
      issues: [],
    });
  }

  return lines;
}

export interface FlaggedShoppingLine {
  productName: string;
  issues: string[];
}

export interface ShoppingListCreated {
  listId: string;
  lineCount: number;
  /**
   * Lines whose quantity is an undercount because at least one contributing
   * program used a unit that could not be converted into the line's unit.
   * The caller must show these to the user (WI-12).
   */
  flaggedLines: FlaggedShoppingLine[];
}

export async function createShoppingList(
  farmId: string,
  seasonId: string,
  category: 'chemical' | 'fertilizer' | 'seed'
): Promise<ShoppingListCreated | { error: string }> {
  // Generate lines based on category
  let lines: ShoppingLineInput[];
  if (category === 'chemical') {
    lines = await generateChemicalLines(seasonId, farmId);
  } else if (category === 'fertilizer') {
    lines = await generateFertilizerLines(seasonId, farmId);
  } else {
    lines = await generateSeedLines(seasonId, farmId);
  }

  if (lines.length === 0) {
    return { error: `No ${category} requirements found for this season's crop plan.` };
  }

  const categoryLabels = { chemical: 'Chemical', fertilizer: 'Fertilizer', seed: 'Seed' };
  const now = new Date();
  const label = `${categoryLabels[category]} Shopping List - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const { data: list, error: listErr } = await supabase
    .from('shopping_lists')
    .insert({ farm_id: farmId, season_id: seasonId, product_category: category, label })
    .select('id')
    .single();

  if (listErr || !list) {
    return { error: 'Failed to create shopping list.' };
  }

  const lineRows = lines.map((l) => ({
    shopping_list_id: list.id,
    farm_id: farmId,
    master_product_id: l.masterProductId,
    product_name: l.productName,
    product_category: l.productCategory,
    plan_quantity: l.planQuantity,
    needed_quantity: l.neededQuantity,
    on_hand_at_generation: l.onHandAtGeneration,
    contracted_at_generation: l.contractedAtGeneration,
    adjusted_quantity: l.neededQuantity,
    unit_type: l.unitType,
    status: 'needed',
  }));

  const { error: linesErr } = await supabase.from('shopping_list_lines').insert(lineRows);
  if (linesErr) {
    return { error: 'Failed to save shopping list lines.' };
  }

  const flaggedLines: FlaggedShoppingLine[] = lines
    .filter((l) => l.issues.length > 0)
    .map((l) => ({ productName: l.productName, issues: l.issues }));

  return { listId: list.id, lineCount: lines.length, flaggedLines };
}

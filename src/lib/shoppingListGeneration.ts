import { supabase } from './supabase';
import { convertUnits } from './unitConversions';

export interface ShoppingLineInput {
  masterProductId: string | null;
  productName: string;
  productCategory: 'chemical' | 'fertilizer' | 'seed';
  neededQuantity: number;
  onHandAtGeneration: number;
  unitType: string;
}

interface ProgramRef {
  program_id: string;
  cost_per_acre: number;
}

export async function generateChemicalLines(
  seasonId: string,
  effectiveUserId: string,
  farmId: string
): Promise<ShoppingLineInput[]> {
  const [fieldsRes, overridesRes] = await Promise.all([
    supabase
      .from('fields')
      .select('id, acreage, field_costs(template_id)')
      .eq('season_id', seasonId)
      .eq('user_id', effectiveUserId),
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

  // Accumulate total needed per chemical (keyed by individual_chemical.id)
  const chemAccum = new Map<
    string,
    { chemId: string; name: string; masterProductId: string | null; totalRaw: number; rateUnit: string }
  >();

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
        const total = rate * acreage;
        const existing = chemAccum.get(chem.id);
        if (existing) {
          existing.totalRaw += total;
        } else {
          chemAccum.set(chem.id, {
            chemId: chem.id,
            name: chem.chemical_name,
            masterProductId: chem.master_product_id ?? null,
            totalRaw: total,
            rateUnit,
          });
        }
      }
    }
  }

  // Fetch on-hand quantities for linked master products
  const masterIds = [...chemAccum.values()]
    .map((c) => c.masterProductId)
    .filter(Boolean) as string[];

  let onHandMap = new Map<string, { quantity: number; unitType: string }>();
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
  for (const acc of chemAccum.values()) {
    let onHand = 0;
    let lineUnit = acc.rateUnit;
    if (acc.masterProductId) {
      const master = onHandMap.get(acc.masterProductId);
      if (master) {
        onHand = master.quantity;
        lineUnit = master.unitType;
      }
    }
    // Convert totalRaw to lineUnit if different
    const totalInLineUnit = convertUnits(acc.rateUnit, lineUnit, acc.totalRaw);
    const needed = Math.max(0, totalInLineUnit - onHand);

    lines.push({
      masterProductId: acc.masterProductId,
      productName: acc.name,
      productCategory: 'chemical',
      neededQuantity: needed,
      onHandAtGeneration: onHand,
      unitType: lineUnit,
    });
  }

  return lines;
}

export async function generateFertilizerLines(
  seasonId: string,
  effectiveUserId: string,
  farmId: string
): Promise<ShoppingLineInput[]> {
  const [fieldsRes, overridesRes] = await Promise.all([
    supabase
      .from('fields')
      .select('id, acreage, field_costs(template_id)')
      .eq('season_id', seasonId)
      .eq('user_id', effectiveUserId),
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
        fertilizer_products ( id, product_name, unit_type )
      )
    `)
    .in('id', [...allProgramIds]);

  const programMap = new Map<string, any>();
  for (const p of programs ?? []) programMap.set(p.id, p);

  // Accumulate total needed per fertilizer product
  const fertAccum = new Map<
    string,
    { prodId: string; name: string; totalRaw: number; rateUnit: string }
  >();

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
        const total = rate * acreage;
        const existing = fertAccum.get(prod.id);
        if (existing) {
          existing.totalRaw += total;
        } else {
          fertAccum.set(prod.id, {
            prodId: prod.id,
            name: prod.product_name,
            totalRaw: total,
            rateUnit,
          });
        }
      }
    }
  }

  // Fertilizer has no on-hand tracking in this release
  const lines: ShoppingLineInput[] = [];
  for (const acc of fertAccum.values()) {
    lines.push({
      masterProductId: null,
      productName: acc.name,
      productCategory: 'fertilizer',
      neededQuantity: acc.totalRaw,
      onHandAtGeneration: 0,
      unitType: acc.rateUnit,
    });
  }

  return lines;
}

export async function generateSeedLines(
  seasonId: string,
  effectiveUserId: string,
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
    .eq('season_id', seasonId)
    .eq('user_id', effectiveUserId);

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

  let onHandMap = new Map<string, number>();
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
    const needed = Math.max(0, acc.totalBags - onHand);
    lines.push({
      masterProductId: acc.masterProductId,
      productName: acc.name,
      productCategory: 'seed',
      neededQuantity: needed,
      onHandAtGeneration: onHand,
      unitType: acc.unitType,
    });
  }

  return lines;
}

export async function createShoppingList(
  farmId: string,
  seasonId: string,
  category: 'chemical' | 'fertilizer' | 'seed',
  effectiveUserId: string
): Promise<{ listId: string; lineCount: number } | { error: string }> {
  // Generate lines based on category
  let lines: ShoppingLineInput[];
  if (category === 'chemical') {
    lines = await generateChemicalLines(seasonId, effectiveUserId, farmId);
  } else if (category === 'fertilizer') {
    lines = await generateFertilizerLines(seasonId, effectiveUserId, farmId);
  } else {
    lines = await generateSeedLines(seasonId, effectiveUserId, farmId);
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
    needed_quantity: l.neededQuantity,
    on_hand_at_generation: l.onHandAtGeneration,
    adjusted_quantity: l.neededQuantity,
    unit_type: l.unitType,
    status: 'needed',
  }));

  const { error: linesErr } = await supabase.from('shopping_list_lines').insert(lineRows);
  if (linesErr) {
    return { error: 'Failed to save shopping list lines.' };
  }

  return { listId: list.id, lineCount: lines.length };
}

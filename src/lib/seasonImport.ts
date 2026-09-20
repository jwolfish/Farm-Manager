import { supabase } from './supabase';
import type { CropType, Database } from './database.types';
import {
  resolveTemplateProgramRefs,
  indexProgramsByName,
  type ProgramRef,
} from './costTemplateImport';

export interface Field {
  id: string;
  name: string;
  crop_type: CropType;
  acreage: number;
  land_rent_per_acre: number;
  property_tax_per_acre: number;
  notes: string | null;
}

export interface SeedVariety {
  id: string;
  product_name: string;
  crop_type: CropType;
  price_per_unit: number;
  unit_type: string;
  standard_seeding_rate: number | null;
  units_per_bag: number | null;
  master_product_id: string | null;
}

export interface FertilizerProduct {
  id: string;
  product_name: string;
  price_per_unit: number;
  unit_type: string;
  application_rate: number | null;
  application_rate_unit: string | null;
  notes: string | null;
  master_product_id: string | null;
  /** lb per US gallon, liquids only. Carried forward so it is entered once. */
  density_lb_per_gal: number | null;
}

export interface IndividualChemical {
  id: string;
  chemical_name: string;
  price_per_unit: number;
  unit_type: string;
  default_application_rate: number | null;
  default_application_rate_unit: string | null;
  master_product_id: string | null;
}

export interface FertilizerProgram {
  id: string;
  program_name: string;
  application_cost: number;
  notes: string | null;
  fertilizer_program_items: Array<{
    id: string;
    fertilizer_product_id: string;
    application_rate: number;
    application_rate_unit: string;
  }>;
}

export interface ChemicalProgram {
  id: string;
  program_name: string;
  crop_type: CropType;
  application_cost: number;
  notes: string | null;
  chemical_program_items: Array<{
    id: string;
    chemical_id: string;
    application_rate: number;
    application_rate_unit: string;
  }>;
}

/**
 * Taken from the generated schema rather than hand-written. A hand-maintained interface
 * declaring a nullable cost column non-null is one of the errors the harvest round had to
 * fix; there is no reason to create another.
 */
export type CostTemplate = Database['public']['Tables']['cost_templates']['Row'];

type CostTemplateInsert = Database['public']['Tables']['cost_templates']['Insert'];

export interface PriceUpdate {
  oldPrice: number;
  newPrice: number;
}

export async function loadSeasonData(seasonId: string, userId: string) {
  const [fieldsResult, seedsResult, fertilizersResult, chemicalsResult, fertProgramsResult, chemProgramsResult, templatesResult] =
    await Promise.all([
      supabase.from('fields').select('*').eq('season_id', seasonId).order('name'),
      supabase
        .from('seed_varieties')
        .select('*')
        .eq('season_id', seasonId)
        .order('product_name'),
      supabase
        .from('fertilizer_products')
        .select('*')
        .eq('season_id', seasonId)
        .order('product_name'),
      supabase
        .from('individual_chemicals')
        .select('*')
        .eq('season_id', seasonId)
        .order('chemical_name'),
      supabase
        .from('fertilizer_programs')
        .select(
          `
          *,
          fertilizer_program_items (
            id,
            fertilizer_product_id,
            application_rate,
            application_rate_unit
          )
        `
        )
        .eq('season_id', seasonId)
        .order('program_name'),
      supabase
        .from('chemical_programs')
        .select(
          `
          *,
          chemical_program_items (
            id,
            chemical_id,
            application_rate,
            application_rate_unit
          )
        `
        )
        .eq('season_id', seasonId)
        .order('program_name'),
      supabase
        .from('cost_templates')
        .select('*')
        .eq('season_id', seasonId)
        .order('name'),
    ]);

  return {
    fields: (fieldsResult.data || []) as Field[],
    seeds: (seedsResult.data || []) as SeedVariety[],
    fertilizers: (fertilizersResult.data || []) as FertilizerProduct[],
    chemicals: (chemicalsResult.data || []) as IndividualChemical[],
    fertilizerPrograms: (fertProgramsResult.data || []) as FertilizerProgram[],
    chemicalPrograms: (chemProgramsResult.data || []) as ChemicalProgram[],
    costTemplates: (templatesResult.data || []) as CostTemplate[],
  };
}

/**
 * What the destination season already holds, so a copied template can re-point at a
 * program that is there instead of dragging in a duplicate.
 *
 * Read by the wizard up front to preview each template's resolution, and again by
 * `importSeasonData` after any selected programs have been written — the second read is
 * the one that decides, because by then a program imported in the same run is simply a
 * program the destination has.
 *
 * Every read throws. A swallowed error here would report "nothing matches", which sends
 * the import down the import-a-duplicate path — the quiet wrong answer.
 */
export async function loadDestinationPrograms(seasonId: string) {
  /*
   * Ordered oldest first, which decides the one case that would otherwise be arbitrary:
   * if this import has just created a program whose name the season already had, the
   * older row wins and the template re-points at what was already there rather than at
   * the duplicate created seconds ago. `indexProgramsByName` keeps the first of a name.
   */
  const [fertResult, chemResult, templatesResult] = await Promise.all([
    supabase.from('fertilizer_programs').select('id, program_name').eq('season_id', seasonId).order('created_at'),
    supabase.from('chemical_programs').select('id, program_name').eq('season_id', seasonId).order('created_at'),
    supabase.from('cost_templates').select('id, name').eq('season_id', seasonId).order('name'),
  ]);

  if (fertResult.error) throw fertResult.error;
  if (chemResult.error) throw chemResult.error;
  if (templatesResult.error) throw templatesResult.error;

  return {
    fertilizerPrograms: fertResult.data || [],
    chemicalPrograms: chemResult.data || [],
    templateNames: (templatesResult.data || []).map((t) => t.name),
  };
}

export async function importSeasonData(
  newSeasonId: string,
  userId: string,
  selectedItems: {
    fields: string[];
    seeds: string[];
    fertilizers: string[];
    chemicals: string[];
    fertilizerPrograms: string[];
    chemicalPrograms: string[];
    costTemplates: string[];
  },
  sourceData: {
    fields: Field[];
    seeds: SeedVariety[];
    fertilizers: FertilizerProduct[];
    chemicals: IndividualChemical[];
    fertilizerPrograms: FertilizerProgram[];
    chemicalPrograms: ChemicalProgram[];
    costTemplates: CostTemplate[];
  },
  priceUpdates: {
    fields: Record<string, { land_rent_per_acre: number; property_tax_per_acre: number }>;
    seeds: Record<string, number>;
    fertilizers: Record<string, number>;
    chemicals: Record<string, number>;
    fertilizerPrograms: Record<string, number>;
    chemicalPrograms: Record<string, number>;
  },
  cropTypeUpdates: {
    fields: Record<string, string>;
    seeds: Record<string, string>;
    chemicalPrograms: Record<string, string>;
  }
) {
  const productIdMap: Record<string, string> = {};
  const skippedItems: string[] = [];

  const { data: destSeason } = await supabase
    .from('seasons').select('farm_id').eq('id', newSeasonId).maybeSingle();
  const destFarmId = destSeason?.farm_id ?? null;

  const masterProductRemap = new Map<string, string>();
  const allMasterIds = new Set<string>();
  for (const seed of sourceData.seeds) {
    if (selectedItems.seeds.includes(seed.id) && seed.master_product_id) allMasterIds.add(seed.master_product_id);
  }
  for (const fert of sourceData.fertilizers) {
    if (selectedItems.fertilizers.includes(fert.id) && fert.master_product_id) allMasterIds.add(fert.master_product_id);
  }
  for (const chem of sourceData.chemicals) {
    if (selectedItems.chemicals.includes(chem.id) && chem.master_product_id) allMasterIds.add(chem.master_product_id);
  }

  if (allMasterIds.size > 0 && destFarmId) {
    const { data: masterRows, error: masterErr } = await supabase
      .from('master_products')
      .select('id, farm_id, product_category, canonical_name, unit_type')
      .in('id', [...allMasterIds]);

    if (masterErr) {
      console.error('Failed to fetch master_products for remapping:', masterErr);
    } else if (masterRows) {
      for (const row of masterRows) {
        if (row.farm_id === destFarmId) continue;
        const { data: upserted, error: upsertErr } = await supabase
          .from('master_products')
          .upsert(
            {
              farm_id: destFarmId,
              product_category: row.product_category,
              canonical_name: row.canonical_name,
              unit_type: row.unit_type,
              on_hand_quantity: 0,
            },
            { onConflict: 'farm_id,product_category,canonical_name' }
          )
          .select('id')
          .single();
        if (upsertErr) {
          console.error(`Failed to upsert master_product for ${row.canonical_name}:`, upsertErr);
        } else if (upserted) {
          masterProductRemap.set(row.id, upserted.id);
        }
      }
    }
  } else if (allMasterIds.size > 0 && !destFarmId) {
    console.error('Could not resolve destination farm_id; master_product_id values will not be remapped');
  }

  if (selectedItems.fields.length > 0) {
    const fieldsToImport = sourceData.fields
      .filter((f) => selectedItems.fields.includes(f.id))
      .map((field) => {
        const updates = priceUpdates.fields[field.id] || {
          land_rent_per_acre: field.land_rent_per_acre,
          property_tax_per_acre: field.property_tax_per_acre,
        };
        return {
          season_id: newSeasonId,
          user_id: userId,
          name: field.name,
          crop_type: (cropTypeUpdates.fields[field.id] || field.crop_type) as CropType,
          acreage: field.acreage,
          land_rent_per_acre: updates.land_rent_per_acre,
          property_tax_per_acre: updates.property_tax_per_acre,
          notes: field.notes,
        };
      });

    const { error } = await supabase.from('fields').insert(fieldsToImport);
    if (error) throw error;
  }

  if (selectedItems.seeds.length > 0) {
    const seedsToImport = sourceData.seeds
      .filter((s) => selectedItems.seeds.includes(s.id))
      .map((seed) => ({
        season_id: newSeasonId,
        user_id: userId,
        product_name: seed.product_name,
        crop_type: (cropTypeUpdates.seeds[seed.id] || seed.crop_type) as CropType,
        price_per_unit: priceUpdates.seeds[seed.id] ?? seed.price_per_unit,
        unit_type: seed.unit_type,
        standard_seeding_rate: seed.standard_seeding_rate,
        units_per_bag: seed.units_per_bag,
        master_product_id: masterProductRemap.get(seed.master_product_id ?? '') ?? seed.master_product_id,
      }));

    const { error } = await supabase.from('seed_varieties').insert(seedsToImport);
    if (error) throw error;
  }

  if (selectedItems.fertilizers.length > 0) {
    const fertilizersToImport = sourceData.fertilizers
      .filter((f) => selectedItems.fertilizers.includes(f.id))
      .map((fert) => ({
        season_id: newSeasonId,
        user_id: userId,
        product_name: fert.product_name,
        price_per_unit: priceUpdates.fertilizers[fert.id] ?? fert.price_per_unit,
        unit_type: fert.unit_type,
        application_rate: fert.application_rate,
        application_rate_unit: fert.application_rate_unit,
        notes: fert.notes,
        density_lb_per_gal: fert.density_lb_per_gal,
        master_product_id: masterProductRemap.get(fert.master_product_id ?? '') ?? fert.master_product_id,
      }));

    const { data: insertedFertilizers, error } = await supabase
      .from('fertilizer_products')
      .insert(fertilizersToImport)
      .select();
    if (error) throw error;

    if (insertedFertilizers) {
      sourceData.fertilizers.forEach((oldFert, index) => {
        if (selectedItems.fertilizers.includes(oldFert.id)) {
          const newFert = insertedFertilizers.find((f) => f.product_name === oldFert.product_name);
          if (newFert) {
            productIdMap[oldFert.id] = newFert.id;
          }
        }
      });
    }
  }

  if (selectedItems.chemicals.length > 0) {
    const chemicalsToImport = sourceData.chemicals
      .filter((c) => selectedItems.chemicals.includes(c.id))
      .map((chem) => ({
        season_id: newSeasonId,
        user_id: userId,
        chemical_name: chem.chemical_name,
        price_per_unit: priceUpdates.chemicals[chem.id] ?? chem.price_per_unit,
        unit_type: chem.unit_type,
        default_application_rate: chem.default_application_rate,
        default_application_rate_unit: chem.default_application_rate_unit,
        master_product_id: masterProductRemap.get(chem.master_product_id ?? '') ?? chem.master_product_id,
      }));

    const { data: insertedChemicals, error } = await supabase
      .from('individual_chemicals')
      .insert(chemicalsToImport)
      .select();
    if (error) throw error;

    if (insertedChemicals) {
      sourceData.chemicals.forEach((oldChem) => {
        if (selectedItems.chemicals.includes(oldChem.id)) {
          const newChem = insertedChemicals.find((c) => c.chemical_name === oldChem.chemical_name);
          if (newChem) {
            productIdMap[oldChem.id] = newChem.id;
          }
        }
      });
    }
  }

  if (selectedItems.fertilizerPrograms.length > 0) {
    const fertProgramsToInsert = selectedItems.fertilizerPrograms
      .map((programId) => {
        const program = sourceData.fertilizerPrograms.find((p) => p.id === programId);
        if (!program) return null;
        return {
          _sourceId: programId,
          season_id: newSeasonId,
          user_id: userId,
          program_name: program.program_name,
          application_cost: priceUpdates.fertilizerPrograms[programId] ?? program.application_cost,
          notes: program.notes,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (fertProgramsToInsert.length > 0) {
      const insertPayloads = fertProgramsToInsert.map(({ _sourceId: _, ...rest }) => rest);
      const { data: insertedFertPrograms, error: fertProgramsError } = await supabase
        .from('fertilizer_programs')
        .insert(insertPayloads)
        .select();

      if (fertProgramsError) throw fertProgramsError;

      const fertProgramIdMap: Record<string, string> = {};
      if (insertedFertPrograms) {
        insertedFertPrograms.forEach((newProg, index) => {
          fertProgramIdMap[fertProgramsToInsert[index]._sourceId] = newProg.id;
        });
      }

      const allFertItems: Array<{
        program_id: string;
        fertilizer_product_id: string;
        application_rate: number;
        application_rate_unit: string;
      }> = [];

      for (const programId of selectedItems.fertilizerPrograms) {
        const program = sourceData.fertilizerPrograms.find((p) => p.id === programId);
        const newProgramId = fertProgramIdMap[programId];
        if (!program || !newProgramId) continue;

        for (const item of program.fertilizer_program_items) {
          const newProductId = productIdMap[item.fertilizer_product_id];
          if (!newProductId) {
            skippedItems.push(`product ID ${item.fertilizer_product_id} in fertilizer program "${program.program_name}"`);
            continue;
          }
          allFertItems.push({
            program_id: newProgramId,
            fertilizer_product_id: newProductId,
            application_rate: item.application_rate,
            application_rate_unit: item.application_rate_unit,
          });
        }
      }

      if (allFertItems.length > 0) {
        const { error: itemsError } = await supabase.from('fertilizer_program_items').insert(allFertItems);
        if (itemsError) throw itemsError;
      }
    }
  }

  if (selectedItems.chemicalPrograms.length > 0) {
    const chemProgramsToInsert = selectedItems.chemicalPrograms
      .map((programId) => {
        const program = sourceData.chemicalPrograms.find((p) => p.id === programId);
        if (!program) return null;
        return {
          _sourceId: programId,
          season_id: newSeasonId,
          user_id: userId,
          program_name: program.program_name,
          crop_type: (cropTypeUpdates.chemicalPrograms[programId] || program.crop_type) as CropType,
          application_cost: priceUpdates.chemicalPrograms[programId] ?? program.application_cost,
          notes: program.notes,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (chemProgramsToInsert.length > 0) {
      const insertPayloads = chemProgramsToInsert.map(({ _sourceId: _, ...rest }) => rest);
      const { data: insertedChemPrograms, error: chemProgramsError } = await supabase
        .from('chemical_programs')
        .insert(insertPayloads)
        .select();

      if (chemProgramsError) throw chemProgramsError;

      const chemProgramIdMap: Record<string, string> = {};
      if (insertedChemPrograms) {
        insertedChemPrograms.forEach((newProg, index) => {
          chemProgramIdMap[chemProgramsToInsert[index]._sourceId] = newProg.id;
        });
      }

      const allChemItems: Array<{
        program_id: string;
        chemical_id: string;
        application_rate: number;
        application_rate_unit: string;
      }> = [];

      for (const programId of selectedItems.chemicalPrograms) {
        const program = sourceData.chemicalPrograms.find((p) => p.id === programId);
        const newProgramId = chemProgramIdMap[programId];
        if (!program || !newProgramId) continue;

        for (const item of program.chemical_program_items) {
          const newChemicalId = productIdMap[item.chemical_id];
          if (!newChemicalId) {
            skippedItems.push(`chemical ID ${item.chemical_id} in chemical program "${program.program_name}"`);
            continue;
          }
          allChemItems.push({
            program_id: newProgramId,
            chemical_id: newChemicalId,
            application_rate: item.application_rate,
            application_rate_unit: item.application_rate_unit,
          });
        }
      }

      if (allChemItems.length > 0) {
        const { error: itemsError } = await supabase.from('chemical_program_items').insert(allChemItems);
        if (itemsError) throw itemsError;
      }
    }
  }

  /*
   * Cost templates LAST, and deliberately so: the destination is read after every program
   * above has been written, so "a program that came with this import" and "a program the
   * destination already had" are the same thing by the time a template looks for one.
   * That single rule is what makes both reasons for copying work — into an empty farm
   * everything resolves to the freshly imported programs, and into a farm already set up
   * everything resolves to what is there, with no duplicates created either way.
   *
   * See `costTemplateImport.ts` for why a template's program ids can never be copied
   * across verbatim.
   */
  if (selectedItems.costTemplates.length > 0) {
    /*
     * Loaded on demand, not at module scope. `App.tsx` imports `SeasonImportWizard`
     * eagerly for the new-season flow, so anything this file imports statically lands in
     * the first paint — and `programCosts` drags in the whole unit-conversion table for
     * ~17 kB raw / 4.4 kB gzip. Measured: static costs every visitor those bytes, this
     * costs them only to someone actually copying a cost template.
     */
    const { recalculateFertilizerProgramCost, recalculateChemicalProgramCost } = await import(
      './templateLib/programCosts'
    );

    const destination = await loadDestinationPrograms(newSeasonId);

    const fertIndex = indexProgramsByName(destination.fertilizerPrograms);
    const chemIndex = indexProgramsByName(destination.chemicalPrograms);
    for (const name of [...fertIndex.ambiguous, ...chemIndex.ambiguous]) {
      skippedItems.push(
        `two programs in the destination season are both named "${name}" — templates were pointed at the first of them`
      );
    }

    const sourceFertNames = new Map(sourceData.fertilizerPrograms.map((p) => [p.id, p.program_name]));
    const sourceChemNames = new Map(sourceData.chemicalPrograms.map((p) => [p.id, p.program_name]));
    const existingTemplateNames = new Set(destination.templateNames);

    const templatesToInsert: CostTemplateInsert[] = [];

    for (const templateId of selectedItems.costTemplates) {
      const template = sourceData.costTemplates.find((t) => t.id === templateId);
      if (!template) continue;

      const fert = resolveTemplateProgramRefs(template.fertilizer_programs, sourceFertNames, fertIndex.byName);
      const chem = resolveTemplateProgramRefs(template.chemical_programs, sourceChemNames, chemIndex.byName);

      for (const name of fert.unresolved) {
        skippedItems.push(`fertilizer program "${name}" in cost template "${template.name}"`);
      }
      for (const name of chem.unresolved) {
        skippedItems.push(`chemical program "${name}" in cost template "${template.name}"`);
      }

      /*
       * Each resolved program is re-costed against the DESTINATION season rather than
       * carrying the source's snapshot, because the same program can cost different money
       * on a farm whose prices differ. This is the one implementation of that arithmetic
       * (`recalculate*ProgramCost`); a second one here would be guardrail 7 all over again.
       */
      const fertRefs: ProgramRef[] = [];
      for (const { programId, name } of fert.resolved) {
        const result = await recalculateFertilizerProgramCost(programId, newSeasonId);
        if (!result) {
          skippedItems.push(`fertilizer program "${name}" in cost template "${template.name}" could not be costed`);
          continue;
        }
        if (result.unpricedItems.length > 0) {
          skippedItems.push(
            `cost template "${template.name}": fertilizer program "${name}" is an undercount — ${result.unpricedItems.join('; ')}`
          );
        }
        fertRefs.push({ program_id: programId, cost_per_acre: result.newCost });
      }

      const chemRefs: ProgramRef[] = [];
      for (const { programId, name } of chem.resolved) {
        const result = await recalculateChemicalProgramCost(programId, newSeasonId);
        if (!result) {
          skippedItems.push(`chemical program "${name}" in cost template "${template.name}" could not be costed`);
          continue;
        }
        if (result.unpricedItems.length > 0) {
          skippedItems.push(
            `cost template "${template.name}": chemical program "${name}" is an undercount — ${result.unpricedItems.join('; ')}`
          );
        }
        chemRefs.push({ program_id: programId, cost_per_acre: result.newCost });
      }

      if (existingTemplateNames.has(template.name)) {
        skippedItems.push(
          `a cost template named "${template.name}" already existed here — a second one was created, so delete whichever you do not want`
        );
      }

      /*
       * Listed column by column rather than spread, so the identity of the source row
       * (`id`, `season_id`, `user_id`, the timestamps) cannot ride along by accident.
       * A cost column added to this table later must be added here too.
       */
      templatesToInsert.push({
        season_id: newSeasonId,
        user_id: userId,
        name: template.name,
        description: template.description,
        tillage_cost_per_acre: template.tillage_cost_per_acre,
        planting_cost_per_acre: template.planting_cost_per_acre,
        harvest_cost_per_acre: template.harvest_cost_per_acre,
        equipment_cost_per_acre: template.equipment_cost_per_acre,
        custom_services_cost_per_acre: template.custom_services_cost_per_acre,
        labor_cost_per_acre: template.labor_cost_per_acre,
        crop_insurance_cost_per_acre: template.crop_insurance_cost_per_acre,
        drying_storage_cost_per_acre: template.drying_storage_cost_per_acre,
        hauling_cost_per_acre: template.hauling_cost_per_acre,
        other_expenses_per_acre: template.other_expenses_per_acre,
        fertilizer_programs: fertRefs,
        chemical_programs: chemRefs,
      });
    }

    if (templatesToInsert.length > 0) {
      const { error } = await supabase.from('cost_templates').insert(templatesToInsert);
      if (error) throw error;
    }
  }

  return { success: true, skippedItems };
}

export function validateImport(
  selectedItems: {
    fields: string[];
    seeds: string[];
    fertilizers: string[];
    chemicals: string[];
    fertilizerPrograms: string[];
    chemicalPrograms: string[];
    costTemplates: string[];
  },
  sourceData: {
    fields: Field[];
    seeds: SeedVariety[];
    fertilizers: FertilizerProduct[];
    chemicals: IndividualChemical[];
    fertilizerPrograms: FertilizerProgram[];
    chemicalPrograms: ChemicalProgram[];
    costTemplates: CostTemplate[];
  },
  /**
   * Program names already in the destination season. A template whose programs are all
   * there needs nothing imported; one whose programs are neither there nor selected would
   * arrive with a hole in its cost, so that is refused rather than warned about — the
   * same rule this function already applies to a program missing its products.
   */
  destinationProgramNames?: { fertilizer: readonly string[]; chemical: readonly string[] }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const selectedFertPrograms = sourceData.fertilizerPrograms.filter((p) =>
    selectedItems.fertilizerPrograms.includes(p.id)
  );
  for (const program of selectedFertPrograms) {
    const missingProducts = program.fertilizer_program_items.filter(
      (item) => !selectedItems.fertilizers.includes(item.fertilizer_product_id)
    );
    if (missingProducts.length > 0) {
      errors.push(
        `Fertilizer program "${program.program_name}" requires ${missingProducts.length} product(s) that are not selected`
      );
    }
  }

  const selectedChemPrograms = sourceData.chemicalPrograms.filter((p) =>
    selectedItems.chemicalPrograms.includes(p.id)
  );
  for (const program of selectedChemPrograms) {
    const missingChemicals = program.chemical_program_items.filter(
      (item) => !selectedItems.chemicals.includes(item.chemical_id)
    );
    if (missingChemicals.length > 0) {
      errors.push(
        `Chemical program "${program.program_name}" requires ${missingChemicals.length} chemical(s) that are not selected`
      );
    }
  }

  const selectedTemplates = sourceData.costTemplates.filter((t) => selectedItems.costTemplates.includes(t.id));
  if (selectedTemplates.length > 0) {
    const normalise = (n: string) => n.trim().toLowerCase();
    const available = (
      kind: 'fertilizer' | 'chemical',
      sourcePrograms: readonly { id: string; program_name: string }[],
      selectedIds: readonly string[]
    ) => {
      const names = new Set<string>();
      // Selected for import in this run...
      for (const p of sourcePrograms) {
        if (selectedIds.includes(p.id)) names.add(normalise(p.program_name));
      }
      // ...or already sitting in the destination.
      for (const n of destinationProgramNames?.[kind] ?? []) names.add(normalise(n));
      return names;
    };

    const fertAvailable = available('fertilizer', sourceData.fertilizerPrograms, selectedItems.fertilizerPrograms);
    const chemAvailable = available('chemical', sourceData.chemicalPrograms, selectedItems.chemicalPrograms);
    const fertNameById = new Map(sourceData.fertilizerPrograms.map((p) => [p.id, p.program_name]));
    const chemNameById = new Map(sourceData.chemicalPrograms.map((p) => [p.id, p.program_name]));

    for (const template of selectedTemplates) {
      const missing = new Set<string>();

      const check = (raw: unknown, nameById: Map<string, string>, availableNames: Set<string>) => {
        if (!Array.isArray(raw)) return;
        for (const entry of raw) {
          const id =
            entry && typeof entry === 'object' && typeof (entry as { program_id?: unknown }).program_id === 'string'
              ? (entry as { program_id: string }).program_id
              : null;
          if (!id) continue;
          const name = nameById.get(id);
          if (name === undefined) continue;
          if (!availableNames.has(normalise(name))) missing.add(name);
        }
      };

      check(template.fertilizer_programs, fertNameById, fertAvailable);
      check(template.chemical_programs, chemNameById, chemAvailable);

      if (missing.size > 0) {
        errors.push(
          `Cost template "${template.name}" uses ${[...missing].map((n) => `"${n}"`).join(', ')}, ` +
            `which ${missing.size === 1 ? 'is' : 'are'} not in the destination season. ` +
            `Select ${missing.size === 1 ? 'that program' : 'those programs'} for import as well, or create ${missing.size === 1 ? 'it' : 'them'} first.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

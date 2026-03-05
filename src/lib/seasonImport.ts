import { supabase } from './supabase';
import type { CropType } from './database.types';

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
}

export interface FertilizerProduct {
  id: string;
  product_name: string;
  price_per_unit: number;
  unit_type: string;
  application_rate: number | null;
  application_rate_unit: string | null;
  notes: string | null;
}

export interface IndividualChemical {
  id: string;
  chemical_name: string;
  price_per_unit: number;
  unit_type: string;
  default_application_rate: number | null;
  default_application_rate_unit: string | null;
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

export interface PriceUpdate {
  oldPrice: number;
  newPrice: number;
}

export async function loadSeasonData(seasonId: string, userId: string) {
  const [fieldsResult, seedsResult, fertilizersResult, chemicalsResult, fertProgramsResult, chemProgramsResult] =
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
    ]);

  return {
    fields: (fieldsResult.data || []) as Field[],
    seeds: (seedsResult.data || []) as SeedVariety[],
    fertilizers: (fertilizersResult.data || []) as FertilizerProduct[],
    chemicals: (chemicalsResult.data || []) as IndividualChemical[],
    fertilizerPrograms: (fertProgramsResult.data || []) as FertilizerProgram[],
    chemicalPrograms: (chemProgramsResult.data || []) as ChemicalProgram[],
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
  },
  sourceData: {
    fields: Field[];
    seeds: SeedVariety[];
    fertilizers: FertilizerProduct[];
    chemicals: IndividualChemical[];
    fertilizerPrograms: FertilizerProgram[];
    chemicalPrograms: ChemicalProgram[];
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
    chemicals: Record<string, string>;
    chemicalPrograms: Record<string, string>;
  }
) {
  const productIdMap: Record<string, string> = {};
  const skippedItems: string[] = [];

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
    for (const programId of selectedItems.fertilizerPrograms) {
      const program = sourceData.fertilizerPrograms.find((p) => p.id === programId);
      if (!program) continue;

      const { data: newProgram, error: programError } = await supabase
        .from('fertilizer_programs')
        .insert({
          season_id: newSeasonId,
          user_id: userId,
          program_name: program.program_name,
          application_cost: priceUpdates.fertilizerPrograms[programId] ?? program.application_cost,
          notes: program.notes,
        })
        .select()
        .single();

      if (programError) throw programError;

      if (program.fertilizer_program_items.length > 0) {
        const itemsToImport = program.fertilizer_program_items
          .map((item) => {
            const newProductId = productIdMap[item.fertilizer_product_id];
            if (!newProductId) {
              skippedItems.push(`product ID ${item.fertilizer_product_id} in fertilizer program "${program.program_name}"`);
              return null;
            }

            return {
              program_id: newProgram.id,
              fertilizer_product_id: newProductId,
              application_rate: item.application_rate,
              application_rate_unit: item.application_rate_unit,
            };
          })
          .filter((item) => item !== null);

        if (itemsToImport.length > 0) {
          const { error: itemsError } = await supabase.from('fertilizer_program_items').insert(itemsToImport);
          if (itemsError) throw itemsError;
        }
      }
    }
  }

  if (selectedItems.chemicalPrograms.length > 0) {
    for (const programId of selectedItems.chemicalPrograms) {
      const program = sourceData.chemicalPrograms.find((p) => p.id === programId);
      if (!program) continue;

      const { data: newProgram, error: programError } = await supabase
        .from('chemical_programs')
        .insert({
          season_id: newSeasonId,
          user_id: userId,
          program_name: program.program_name,
          crop_type: (cropTypeUpdates.chemicalPrograms[programId] || program.crop_type) as CropType,
          application_cost: priceUpdates.chemicalPrograms[programId] ?? program.application_cost,
          notes: program.notes,
        })
        .select()
        .single();

      if (programError) throw programError;

      if (program.chemical_program_items.length > 0) {
        const itemsToImport = program.chemical_program_items
          .map((item) => {
            const newChemicalId = productIdMap[item.chemical_id];
            if (!newChemicalId) {
              skippedItems.push(`chemical ID ${item.chemical_id} in chemical program "${program.program_name}"`);
              return null;
            }

            return {
              program_id: newProgram.id,
              chemical_id: newChemicalId,
              application_rate: item.application_rate,
              application_rate_unit: item.application_rate_unit,
            };
          })
          .filter((item) => item !== null);

        if (itemsToImport.length > 0) {
          const { error: itemsError } = await supabase.from('chemical_program_items').insert(itemsToImport);
          if (itemsError) throw itemsError;
        }
      }
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
  },
  sourceData: {
    fields: Field[];
    seeds: SeedVariety[];
    fertilizers: FertilizerProduct[];
    chemicals: IndividualChemical[];
    fertilizerPrograms: FertilizerProgram[];
    chemicalPrograms: ChemicalProgram[];
  }
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

  return { valid: errors.length === 0, errors };
}

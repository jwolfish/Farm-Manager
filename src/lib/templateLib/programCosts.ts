import { supabase } from '../supabase';
import { calculateCostWithConversion, describeConversionFailure } from '../unitConversions';
import { logCascadeWarning } from '../transactionUtils';

export interface RecalculateProgramResult {
  programId: string;
  oldCost: number;
  newCost: number;
  changed: boolean;
  /**
   * Items whose rate unit could not be converted into the unit the product is
   * priced in (WI-11). They contribute nothing to `newCost`, so a non-empty
   * list means the program cost is an undercount rather than a total.
   */
  unpricedItems: string[];
}

export async function recalculateFertilizerProgramCost(
  programId: string,
  seasonId: string,
  taskId?: string,
  previousCost?: number
): Promise<RecalculateProgramResult | null> {
  try {
    const { data: program, error: programError } = await supabase
      .from('fertilizer_programs')
      .select('id, application_cost, season_id')
      .eq('id', programId)
      .maybeSingle();

    if (programError || !program) {
      console.error('Program not found:', programId);
      return null;
    }

    if (program.season_id !== seasonId && taskId) {
      await logCascadeWarning(
        taskId,
        `Program ${programId} is from different season (${program.season_id} vs ${seasonId})`
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from('fertilizer_program_items')
      .select(`
        id,
        application_rate,
        application_rate_unit,
        fertilizer_products (
          id,
          price_per_unit,
          unit_type,
          season_id
        )
      `)
      .eq('program_id', programId);

    if (itemsError) {
      console.error('Error fetching program items:', itemsError);
      return null;
    }

    let totalCostPerAcre = 0;
    const unpricedItems: string[] = [];

    for (const item of items || []) {
      const product = (item as any).fertilizer_products;
      if (!product) continue;

      if (product.season_id !== seasonId && taskId) {
        await logCascadeWarning(taskId, `Product ${product.id} in program ${programId} is from different season`);
      }

      const cost = calculateCostWithConversion(
        item.application_rate,
        item.application_rate_unit,
        product.price_per_unit,
        product.unit_type
      );

      if (!cost.ok) {
        const detail = `Product ${product.id} in program ${programId}: ${describeConversionFailure(cost)}`;
        unpricedItems.push(detail);
        if (taskId) await logCascadeWarning(taskId, detail);
        continue;
      }

      totalCostPerAcre += cost.value;
    }

    const totalWithApplication = totalCostPerAcre + (program.application_cost || 0);
    const storedCost = previousCost ?? totalWithApplication;
    const changed = Math.abs(totalWithApplication - storedCost) > 0.01;

    return { programId, oldCost: storedCost, newCost: totalWithApplication, changed, unpricedItems };
  } catch (err) {
    console.error('Error recalculating fertilizer program cost:', err);
    return null;
  }
}

export async function recalculateChemicalProgramCost(
  programId: string,
  seasonId: string,
  taskId?: string,
  previousCost?: number
): Promise<RecalculateProgramResult | null> {
  try {
    const { data: program, error: programError } = await supabase
      .from('chemical_programs')
      .select('id, application_cost, season_id')
      .eq('id', programId)
      .maybeSingle();

    if (programError || !program) {
      console.error('Program not found:', programId);
      return null;
    }

    if (program.season_id !== seasonId && taskId) {
      await logCascadeWarning(
        taskId,
        `Program ${programId} is from different season (${program.season_id} vs ${seasonId})`
      );
    }

    const { data: items, error: itemsError } = await supabase
      .from('chemical_program_items')
      .select(`
        id,
        application_rate,
        application_rate_unit,
        individual_chemicals (
          id,
          price_per_unit,
          unit_type,
          season_id
        )
      `)
      .eq('program_id', programId);

    if (itemsError) {
      console.error('Error fetching program items:', itemsError);
      return null;
    }

    let totalCostPerAcre = 0;
    const unpricedItems: string[] = [];

    for (const item of items || []) {
      const chemical = (item as any).individual_chemicals;
      if (!chemical) continue;

      if (chemical.season_id !== seasonId && taskId) {
        await logCascadeWarning(taskId, `Chemical ${chemical.id} in program ${programId} is from different season`);
      }

      const cost = calculateCostWithConversion(
        item.application_rate,
        item.application_rate_unit,
        chemical.price_per_unit,
        chemical.unit_type
      );

      if (!cost.ok) {
        const detail = `Chemical ${chemical.id} in program ${programId}: ${describeConversionFailure(cost)}`;
        unpricedItems.push(detail);
        if (taskId) await logCascadeWarning(taskId, detail);
        continue;
      }

      totalCostPerAcre += cost.value;
    }

    const totalWithApplication = totalCostPerAcre + (program.application_cost || 0);
    const storedCost = previousCost ?? totalWithApplication;
    const changed = Math.abs(totalWithApplication - storedCost) > 0.01;

    return { programId, oldCost: storedCost, newCost: totalWithApplication, changed, unpricedItems };
  } catch (err) {
    console.error('Error recalculating chemical program cost:', err);
    return null;
  }
}

import { supabase } from './supabase';
import { queueCascadeTask, type TaskType, type CascadeTaskData } from './backgroundTasks';
import { computeFertilizerNeedByProduct, type FertilizerNeed } from './shoppingListGeneration';
import type { ContractRow, LoadLineRow } from './fertilizerContractMath';

/**
 * Data access for fertilizer contract tracking — F-4.
 *
 * Every write goes through an RPC, so validation, authorization and the blended
 * price recompute happen in one transaction. Nothing here filters reads by
 * `user_id`: RLS is farm-scoped, and adding a user filter is what made six
 * screens render empty for a collaborator (see the Conventions note in
 * CLAUDE.md).
 */

export interface FertilizerProduct {
  id: string;
  product_name: string;
  unit_type: string;
  price_per_unit: number;
  density_lb_per_gal: number | null;
}

export interface Contract extends ContractRow {
  supplier: string | null;
  bookedOn: string | null;
  notes: string | null;
  productId: string;
}

export interface LoadLine extends LoadLineRow {
  id: string;
  productId: string;
  computedQuantity: number | null;
  notes: string | null;
}

export interface Load {
  id: string;
  deliveredOn: string;
  ticketNumber: string | null;
  loadType: string | null;
  supplier: string | null;
  deliveryFee: number;
  notes: string | null;
  lines: LoadLine[];
}

export interface ContractData {
  products: FertilizerProduct[];
  contracts: Contract[];
  loads: Load[];
  needs: FertilizerNeed[];
}

/** A write either succeeded or has a message worth showing the user. */
export type WriteResult =
  | { ok: true; cascadeQueued: boolean }
  | { ok: false; message: string };

interface CascadeTarget {
  task_type: TaskType;
  entity_id: string;
  entity_type: CascadeTaskData['entityType'];
  season_id: string;
}

export async function loadContractData(seasonId: string): Promise<ContractData> {
  const [productsRes, contractsRes, loadsRes, needs] = await Promise.all([
    supabase
      .from('fertilizer_products')
      .select('id, product_name, unit_type, price_per_unit, density_lb_per_gal')
      .eq('season_id', seasonId)
      .order('product_name'),
    supabase
      .from('fertilizer_contracts')
      .select('id, fertilizer_product_id, kind, label, contracted_quantity, price_per_unit, supplier, booked_on, notes')
      .eq('season_id', seasonId)
      .order('booked_on', { nullsFirst: false }),
    supabase
      .from('fertilizer_loads')
      .select(`
        id, delivered_on, ticket_number, load_type, supplier, delivery_fee, notes,
        fertilizer_load_lines ( id, fertilizer_product_id, contract_id, quantity, computed_quantity, unit_type, notes )
      `)
      .eq('season_id', seasonId)
      .order('delivered_on', { ascending: false }),
    computeFertilizerNeedByProduct(seasonId),
  ]);

  // A failed read must not read as "nothing here" — that is the WI-15 lesson.
  if (productsRes.error) throw new Error(`Could not load fertilizer products: ${productsRes.error.message}`);
  if (contractsRes.error) throw new Error(`Could not load contracts: ${contractsRes.error.message}`);
  if (loadsRes.error) throw new Error(`Could not load deliveries: ${loadsRes.error.message}`);

  return {
    products: (productsRes.data ?? []).map((p) => ({
      id: p.id,
      product_name: p.product_name,
      unit_type: p.unit_type,
      price_per_unit: Number(p.price_per_unit),
      density_lb_per_gal: p.density_lb_per_gal === null ? null : Number(p.density_lb_per_gal),
    })),
    contracts: (contractsRes.data ?? []).map((c) => ({
      id: c.id,
      productId: c.fertilizer_product_id,
      kind: c.kind as 'contract' | 'spot',
      label: c.label,
      contractedQuantity: Number(c.contracted_quantity),
      pricePerUnit: c.price_per_unit === null ? null : Number(c.price_per_unit),
      supplier: c.supplier,
      bookedOn: c.booked_on,
      notes: c.notes,
    })),
    loads: (loadsRes.data ?? []).map((l) => ({
      id: l.id,
      deliveredOn: l.delivered_on,
      ticketNumber: l.ticket_number,
      loadType: l.load_type,
      supplier: l.supplier,
      deliveryFee: Number(l.delivery_fee ?? 0),
      notes: l.notes,
      lines: (l.fertilizer_load_lines ?? []).map((line: Record<string, unknown>) => ({
        id: line.id as string,
        productId: line.fertilizer_product_id as string,
        contractId: (line.contract_id as string | null) ?? null,
        quantity: Number(line.quantity),
        computedQuantity: line.computed_quantity === null ? null : Number(line.computed_quantity),
        unitType: line.unit_type as string,
        notes: (line.notes as string | null) ?? null,
      })),
    })),
    needs,
  };
}

/**
 * The cascade is queued only after the write has committed, and a failure to
 * queue it never reports the write as failed — the money is already saved.
 */
async function queueIfNeeded(cascade: CascadeTarget | null, userId: string): Promise<boolean> {
  if (!cascade) return false;
  try {
    await queueCascadeTask(
      userId,
      cascade.season_id,
      cascade.task_type,
      cascade.entity_id,
      cascade.entity_type
    );
    return true;
  } catch (err) {
    console.error('Contract saved, but queueing the cost cascade failed:', err);
    return false;
  }
}

export interface ContractInput {
  id?: string;
  seasonId: string;
  fertilizerProductId: string;
  kind: 'contract' | 'spot';
  label: string;
  contractedQuantity: number;
  pricePerUnit: number | null;
  supplier: string;
  bookedOn: string;
  notes: string;
}

export async function saveContract(input: ContractInput, userId: string): Promise<WriteResult> {
  const { data, error } = await supabase.rpc('save_fertilizer_contract', {
    p_payload: {
      id: input.id ?? null,
      season_id: input.seasonId,
      fertilizer_product_id: input.fertilizerProductId,
      kind: input.kind,
      label: input.label,
      contracted_quantity: input.contractedQuantity,
      price_per_unit: input.pricePerUnit,
      supplier: input.supplier,
      booked_on: input.bookedOn,
      notes: input.notes,
    },
  });

  if (error) return { ok: false, message: error.message || 'Could not save the booking.' };

  const cascade = (data as { cascade: CascadeTarget | null } | null)?.cascade ?? null;
  return { ok: true, cascadeQueued: await queueIfNeeded(cascade, userId) };
}

export async function deleteContract(id: string, userId: string): Promise<WriteResult> {
  const { data, error } = await supabase.rpc('delete_fertilizer_contract', { p_id: id });

  if (error) {
    // The commonest failure is the ON DELETE RESTRICT, and the raw Postgres text
    // for it is useless to a farmer.
    const message = /violates foreign key|still referenced/i.test(error.message)
      ? 'This booking has loads recorded against it. Reassign or delete those loads first.'
      : error.message || 'Could not delete the booking.';
    return { ok: false, message };
  }

  const cascade = (data as { cascade: CascadeTarget | null } | null)?.cascade ?? null;
  return { ok: true, cascadeQueued: await queueIfNeeded(cascade, userId) };
}

export interface LoadLineInput {
  fertilizerProductId: string;
  contractId: string | null;
  quantity: number;
  unitType: string;
  computedQuantity: number | null;
}

export interface LoadInput {
  id?: string;
  seasonId: string;
  deliveredOn: string;
  ticketNumber: string;
  loadType: string;
  supplier: string;
  deliveryFee: number;
  notes: string;
  lines: LoadLineInput[];
}

export async function saveLoad(input: LoadInput): Promise<WriteResult> {
  const { error } = await supabase.rpc('save_fertilizer_load', {
    p_payload: {
      id: input.id ?? null,
      season_id: input.seasonId,
      delivered_on: input.deliveredOn,
      ticket_number: input.ticketNumber,
      load_type: input.loadType,
      supplier: input.supplier,
      delivery_fee: input.deliveryFee,
      notes: input.notes,
      lines: input.lines.map((l) => ({
        fertilizer_product_id: l.fertilizerProductId,
        contract_id: l.contractId,
        quantity: l.quantity,
        unit_type: l.unitType,
        computed_quantity: l.computedQuantity,
      })),
    },
  });

  if (error) return { ok: false, message: error.message || 'Could not save the load.' };
  return { ok: true, cascadeQueued: false };
}

export async function deleteLoad(id: string): Promise<WriteResult> {
  const { error } = await supabase.from('fertilizer_loads').delete().eq('id', id);
  if (error) return { ok: false, message: error.message || 'Could not delete the load.' };
  return { ok: true, cascadeQueued: false };
}

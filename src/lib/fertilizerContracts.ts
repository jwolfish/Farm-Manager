import { supabase } from './supabase';
import { queueCascadeTask, type TaskType, type CascadeTaskData } from './backgroundTasks';
import { computeFertilizerNeedByProduct, type FertilizerNeed } from './shoppingListGeneration';
import type { ContractRow, LoadLineRow } from './fertilizerContractMath';
import type { PlanField, PlanProgram, PlanProgramItem } from './fertilizerPlanMath';

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
 * Fields and fertilizer programs for the plan calculator — F-6.
 *
 * Reads only. Every error is thrown rather than swallowed: a failed read that
 * returns an empty selection would present as "this season has no fields",
 * which is the WI-15 lie this codebase keeps removing.
 */
export async function loadPlanInputs(seasonId: string): Promise<{
  fields: PlanField[];
  programs: PlanProgram[];
}> {
  const [fieldsRes, programsRes] = await Promise.all([
    supabase
      .from('fields')
      .select('id, name, acreage')
      .eq('season_id', seasonId)
      .order('name'),
    supabase
      .from('fertilizer_programs')
      .select(`
        id, program_name,
        fertilizer_program_items (
          application_rate, application_rate_unit,
          fertilizer_products ( id, product_name, unit_type, density_lb_per_gal )
        )
      `)
      .eq('season_id', seasonId)
      .order('program_name'),
  ]);

  if (fieldsRes.error) throw new Error(`Could not load fields: ${fieldsRes.error.message}`);
  if (programsRes.error) {
    throw new Error(`Could not load fertilizer programs: ${programsRes.error.message}`);
  }

  const fields: PlanField[] = (fieldsRes.data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    acreage: Number(f.acreage),
  }));

  const programs: PlanProgram[] = (programsRes.data ?? []).map((p) => {
    const rawItems = (p.fertilizer_program_items ?? []) as Array<Record<string, unknown>>;
    const items: PlanProgramItem[] = [];
    for (const item of rawItems) {
      // PostgREST returns an embedded to-one either as an object or, depending
      // on how it resolves the relationship, as a one-element array.
      const embedded = item.fertilizer_products;
      const product = (Array.isArray(embedded) ? embedded[0] : embedded) as
        | Record<string, unknown>
        | null
        | undefined;
      if (!product) continue;
      items.push({
        productId: product.id as string,
        productName: product.product_name as string,
        productUnit: product.unit_type as string,
        density:
          product.density_lb_per_gal === null || product.density_lb_per_gal === undefined
            ? null
            : Number(product.density_lb_per_gal),
        rate: Number(item.application_rate),
        rateUnit: (item.application_rate_unit as string | null) ?? '',
      });
    }
    return { id: p.id, name: p.program_name, items };
  });

  return { fields, programs };
}

/**
 * The cascade is queued only after the write has committed, and a failure to
 * queue it never reports the write as failed — the money is already saved.
 */
async function queueIfNeeded(
  cascades: CascadeTarget | CascadeTarget[] | null,
  userId: string
): Promise<boolean> {
  const list = cascades === null ? [] : Array.isArray(cascades) ? cascades : [cascades];
  if (list.length === 0) return false;
  let queued = false;
  for (const cascade of list) {
    try {
      await queueCascadeTask(
        userId,
        cascade.season_id,
        cascade.task_type,
        cascade.entity_id,
        cascade.entity_type
      );
      queued = true;
    } catch (err) {
      console.error('Saved, but queueing the cost cascade failed:', err);
    }
  }
  return queued;
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

/**
 * A spot buy created from the ticket itself — F-4a.
 *
 * `contractedQuantity` is in the PRODUCT's unit, not the line's: a contract is
 * denominated in its product's own unit (F-3), so the caller converts before
 * handing it over. The conversion stays here in TypeScript rather than moving
 * into SQL, which is the whole reason F-3 dropped `fertilizer_contracts.
 * unit_type` in the first place.
 */
export interface NewContractInput {
  label: string;
  pricePerUnit: number | null;
  contractedQuantity: number;
}

export interface LoadLineInput {
  fertilizerProductId: string;
  contractId: string | null;
  quantity: number;
  unitType: string;
  computedQuantity: number | null;
  /** Honoured only when `contractId` is null — an explicit booking always wins. */
  newContract?: NewContractInput | null;
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

/**
 * A ticket is a header plus lines plus, since F-4a, any spot buys entered on it
 * — all in one RPC, one transaction. Two calls would leave a spot buy that had
 * already moved the product price and fired a cascade if the load then failed,
 * and a retry would book the same tons twice.
 *
 * A delivery on its own still moves no money. A spot buy does, so the RPC
 * returns one cascade target per product whose blended price actually changed.
 */
export async function saveLoad(input: LoadInput, userId: string): Promise<WriteResult> {
  const { data, error } = await supabase.rpc('save_fertilizer_load', {
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
        new_contract: l.newContract
          ? {
              label: l.newContract.label,
              price_per_unit: l.newContract.pricePerUnit,
              contracted_quantity: l.newContract.contractedQuantity,
            }
          : null,
      })),
    },
  });

  if (error) return { ok: false, message: error.message || 'Could not save the load.' };

  const cascades = (data as { cascades?: CascadeTarget[] } | null)?.cascades ?? [];
  return { ok: true, cascadeQueued: await queueIfNeeded(cascades, userId) };
}

export async function deleteLoad(id: string): Promise<WriteResult> {
  const { error } = await supabase.from('fertilizer_loads').delete().eq('id', id);
  if (error) return { ok: false, message: error.message || 'Could not delete the load.' };
  return { ok: true, cascadeQueued: false };
}

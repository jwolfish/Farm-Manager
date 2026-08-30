import { supabase } from './supabase';
import { buildInventoryQuantities } from './inventoryMath';
import type { WorkOrderStatus } from './database.types';

/**
 * Outcome of applying or unapplying a work order. `message` is written for the
 * user, not the log — it names the offending line and both units when a
 * conversion is what blocked the operation (WI-11).
 */
export type WorkOrderApplyResult = { ok: true } | { ok: false; message: string };

export interface SavedWorkOrder {
  id: string;
  farm_id: string;
  season_id: string;
  program_id: string | null;
  program_name: string;
  crop_type: string;
  status: WorkOrderStatus;
  total_acreage: number;
  spray_volume_gal_per_acre: number | null;
  applied_at: string | null;
  unapplied_at: string | null;
  created_by: string;
  created_at: string | null;
  updated_at: string | null;
  fields: SavedWorkOrderField[];
  lines: SavedWorkOrderLine[];
}

export interface SavedWorkOrderField {
  id: string;
  work_order_id: string;
  field_id: string | null;
  field_name: string;
  acreage: number;
}

export interface SavedWorkOrderLine {
  id: string;
  work_order_id: string;
  master_product_id: string | null;
  chemical_name: string;
  rate_per_acre: number;
  rate_unit: string;
  total_needed: number;
  price_per_unit: number | null;
  price_unit: string | null;
  sort_order: number;
}

export interface WorkOrderSavePayload {
  farmId: string;
  seasonId: string;
  programId: string | null;
  programName: string;
  cropType: string;
  totalAcreage: number;
  sprayVolumeGalPerAcre: number | null;
  fields: Array<{
    fieldId: string;
    fieldName: string;
    acreage: number;
  }>;
  lines: Array<{
    masterProductId: string | null;
    chemicalName: string;
    ratePerAcre: number;
    rateUnit: string;
    totalNeeded: number;
    pricePerUnit: number | null;
    priceUnit: string | null;
    sortOrder: number;
  }>;
}

export type WorkOrderSaveResult =
  | { ok: true; workOrderId: string }
  | { ok: false; message: string };

/**
 * Save a work order. Header, fields and lines land in one transaction (WI-13),
 * so a failure part-way can no longer leave an order with no chemicals while
 * the UI reports success. `created_by` is set from the authenticated caller
 * inside the database, not from the payload.
 */
export async function saveWorkOrder(payload: WorkOrderSavePayload): Promise<WorkOrderSaveResult> {
  const { data, error } = await supabase.rpc('save_work_order', {
    p_payload: {
      farm_id: payload.farmId,
      season_id: payload.seasonId,
      program_id: payload.programId,
      program_name: payload.programName,
      crop_type: payload.cropType,
      total_acreage: payload.totalAcreage,
      spray_volume_gal_per_acre: payload.sprayVolumeGalPerAcre,
      fields: payload.fields.map((f) => ({
        field_id: f.fieldId,
        field_name: f.fieldName,
        acreage: f.acreage,
      })),
      lines: payload.lines.map((l) => ({
        master_product_id: l.masterProductId,
        chemical_name: l.chemicalName,
        rate_per_acre: l.ratePerAcre,
        rate_unit: l.rateUnit,
        total_needed: l.totalNeeded,
        price_per_unit: l.pricePerUnit,
        price_unit: l.priceUnit,
        sort_order: l.sortOrder,
      })),
    },
  });

  if (error || !data) {
    return {
      ok: false,
      message: describeRpcFailure(error, 'Could not save this work order. Nothing was saved.'),
    };
  }

  return { ok: true, workOrderId: data as unknown as string };
}

export async function loadWorkOrders(farmId: string, seasonId: string): Promise<SavedWorkOrder[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      work_order_fields ( id, work_order_id, field_id, field_name, acreage ),
      work_order_lines ( id, work_order_id, master_product_id, chemical_name, rate_per_acre, rate_unit, total_needed, price_per_unit, price_unit, sort_order )
    `)
    .eq('farm_id', farmId)
    .eq('season_id', seasonId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load work orders:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    farm_id: row.farm_id,
    season_id: row.season_id,
    program_id: row.program_id,
    program_name: row.program_name,
    crop_type: row.crop_type,
    status: row.status,
    total_acreage: Number(row.total_acreage),
    spray_volume_gal_per_acre: row.spray_volume_gal_per_acre != null ? Number(row.spray_volume_gal_per_acre) : null,
    applied_at: row.applied_at,
    unapplied_at: row.unapplied_at,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    fields: (row.work_order_fields ?? []).map((f: any) => ({
      id: f.id,
      work_order_id: f.work_order_id,
      field_id: f.field_id,
      field_name: f.field_name,
      acreage: Number(f.acreage),
    })),
    lines: (row.work_order_lines ?? [])
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l: any) => ({
        id: l.id,
        work_order_id: l.work_order_id,
        master_product_id: l.master_product_id,
        chemical_name: l.chemical_name,
        rate_per_acre: Number(l.rate_per_acre),
        rate_unit: l.rate_unit,
        total_needed: Number(l.total_needed),
        price_per_unit: l.price_per_unit != null ? Number(l.price_per_unit) : null,
        price_unit: l.price_unit,
        sort_order: l.sort_order ?? 0,
      })),
  }));
}

export async function deleteWorkOrder(workOrderId: string): Promise<boolean> {
  const { error } = await supabase
    .from('work_orders')
    .delete()
    .eq('id', workOrderId);

  if (error) {
    console.error('Failed to delete work order:', error);
    return false;
  }
  return true;
}

/**
 * Turn the work order's lines into the quantities the RPC expects, expressed
 * in each product's own stock unit. Refuses the whole operation if any line
 * cannot be converted (WI-11).
 */
async function quantitiesForLines(
  lines: SavedWorkOrderLine[]
): Promise<
  | { ok: true; payload: Array<{ master_product_id: string; quantity: number; chemical_name: string }> }
  | { ok: false; message: string }
> {
  const linked = lines.filter((l) => l.master_product_id != null);
  if (linked.length === 0) {
    return {
      ok: false,
      message: 'None of the chemicals on this work order are linked to inventory, so there is nothing to record.',
    };
  }

  const { data: products, error: productsErr } = await supabase
    .from('master_products')
    .select('id, unit_type')
    .in('id', linked.map((l) => l.master_product_id!));

  if (productsErr) {
    console.error('Failed to read inventory products:', productsErr);
    return { ok: false, message: 'Could not read the inventory products. Nothing was changed.' };
  }

  const unitMap = new Map<string, string>();
  for (const p of products ?? []) unitMap.set(p.id, p.unit_type);

  const built = buildInventoryQuantities(
    linked.map((l) => ({
      chemicalName: l.chemical_name,
      masterProductId: l.master_product_id!,
      rateUnit: l.rate_unit,
      totalNeeded: l.total_needed,
    })),
    unitMap
  );

  if (!built.ok) {
    return { ok: false, message: built.problems.join('; ') };
  }

  return {
    ok: true,
    payload: built.quantities.map((q) => ({
      master_product_id: q.masterProductId,
      quantity: q.quantity,
      chemical_name: q.chemicalName,
    })),
  };
}

/** Turn a Postgres error from the apply/unapply RPCs into something readable. */
function describeRpcFailure(
  error: { code?: string; message?: string } | null,
  fallback: string
): string {
  if (!error) return fallback;
  switch (error.code) {
    // object_not_in_prerequisite_state — wrong current status.
    case '55000':
    // insufficient_privilege, invalid_parameter_value, no_data_found.
    case '42501':
    case '22023':
    case 'P0002':
      return error.message ?? fallback;
    default:
      console.error('Work order RPC failed:', error);
      return fallback;
  }
}

/**
 * Apply a work order. The database does the status guard, the ledger writes and
 * the status update in one transaction (WI-9), so a double-click, a lost
 * response or two collaborators acting at once cannot double-deduct inventory.
 */
export async function applyWorkOrder(
  workOrderId: string,
  lines: SavedWorkOrderLine[]
): Promise<WorkOrderApplyResult> {
  const quantities = await quantitiesForLines(lines);
  if (!quantities.ok) {
    return { ok: false, message: `Cannot apply this work order — ${quantities.message}. Nothing was changed.` };
  }

  const { error } = await supabase.rpc('apply_work_order', {
    p_work_order_id: workOrderId,
    p_quantities: quantities.payload,
  });

  if (error) {
    return {
      ok: false,
      message: describeRpcFailure(error, 'Could not apply this work order. Nothing was changed.'),
    };
  }

  return { ok: true };
}

/** Mirror of {@link applyWorkOrder}; writes reversing entries and restores stock. */
export async function unapplyWorkOrder(
  workOrderId: string,
  lines: SavedWorkOrderLine[]
): Promise<WorkOrderApplyResult> {
  const quantities = await quantitiesForLines(lines);
  if (!quantities.ok) {
    return { ok: false, message: `Cannot unapply this work order — ${quantities.message}. Nothing was changed.` };
  }

  const { error } = await supabase.rpc('unapply_work_order', {
    p_work_order_id: workOrderId,
    p_quantities: quantities.payload,
  });

  if (error) {
    return {
      ok: false,
      message: describeRpcFailure(error, 'Could not unapply this work order. Nothing was changed.'),
    };
  }

  return { ok: true };
}

export async function graduateAdHocChemical(
  farmId: string,
  seasonId: string,
  userId: string,
  chemicalName: string,
  unitType: string,
  ratePerAcre: number,
  rateUnit: string
): Promise<{ masterProductId: string; chemicalId: string } | null> {
  const { data: mp, error: mpErr } = await supabase
    .from('master_products')
    .insert({
      farm_id: farmId,
      product_category: 'chemical' as const,
      canonical_name: chemicalName,
      unit_type: unitType,
      on_hand_quantity: 0,
    })
    .select('id')
    .single();

  if (mpErr || !mp) {
    if (mpErr?.code === '23505') {
      const { data: existing } = await supabase
        .from('master_products')
        .select('id')
        .eq('farm_id', farmId)
        .eq('product_category', 'chemical')
        .eq('canonical_name', chemicalName)
        .maybeSingle();
      if (existing) {
        const chemResult = await createSeasonChemical(existing.id, farmId, seasonId, userId, chemicalName, unitType, ratePerAcre, rateUnit);
        return chemResult ? { masterProductId: existing.id, chemicalId: chemResult } : null;
      }
    }
    console.error('Failed to create master product:', mpErr);
    return null;
  }

  const chemResult = await createSeasonChemical(mp.id, farmId, seasonId, userId, chemicalName, unitType, ratePerAcre, rateUnit);
  return chemResult ? { masterProductId: mp.id, chemicalId: chemResult } : null;
}

async function createSeasonChemical(
  masterProductId: string,
  farmId: string,
  seasonId: string,
  userId: string,
  chemicalName: string,
  unitType: string,
  ratePerAcre: number,
  rateUnit: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('individual_chemicals')
    .select('id')
    .eq('season_id', seasonId)
    .eq('chemical_name', chemicalName)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: chem, error: chemErr } = await supabase
    .from('individual_chemicals')
    .insert({
      season_id: seasonId,
      user_id: userId,
      chemical_name: chemicalName,
      price_per_unit: 0,
      unit_type: unitType,
      default_application_rate: ratePerAcre,
      default_application_rate_unit: rateUnit,
      master_product_id: masterProductId,
    })
    .select('id')
    .single();

  if (chemErr || !chem) {
    console.error('Failed to create season chemical:', chemErr);
    return null;
  }
  return chem.id;
}

export async function fetchInventoryForChemicals(
  farmId: string,
  productIds: string[],
  chemicalNames?: string[]
): Promise<Map<string, { masterProductId: string; onHand: number; unitType: string }>> {
  if (productIds.length === 0 && (!chemicalNames || chemicalNames.length === 0)) return new Map();

  const map = new Map<string, { masterProductId: string; onHand: number; unitType: string }>();

  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from('master_products')
      .select('id, canonical_name, on_hand_quantity, unit_type')
      .in('id', productIds);
    if (error) console.error('fetchInventoryForChemicals (by id):', error.message);
    if (data) {
      for (const row of data) {
        const entry = { masterProductId: row.id, onHand: Number(row.on_hand_quantity ?? 0), unitType: row.unit_type };
        map.set(row.id, entry);
        map.set(row.canonical_name, entry);
      }
    }
  }

  if (chemicalNames && chemicalNames.length > 0) {
    const missingNames = chemicalNames.filter((n) => !map.has(n));
    if (missingNames.length > 0) {
      const { data, error } = await supabase
        .from('master_products')
        .select('id, canonical_name, on_hand_quantity, unit_type')
        .eq('farm_id', farmId)
        .in('canonical_name', missingNames);
      if (error) console.error('fetchInventoryForChemicals (by name):', error.message);
      if (data) {
        for (const row of data) {
          const entry = { masterProductId: row.id, onHand: Number(row.on_hand_quantity ?? 0), unitType: row.unit_type };
          map.set(row.id, entry);
          map.set(row.canonical_name, entry);
        }
      }
    }
  }

  return map;
}

export async function searchFarmChemicals(
  farmId: string,
  query: string
): Promise<Array<{ id: string; name: string; unitType: string }>> {
  let req = supabase
    .from('master_products')
    .select('id, canonical_name, unit_type')
    .eq('farm_id', farmId)
    .eq('product_category', 'chemical')
    .order('canonical_name')
    .limit(20);

  if (query.trim()) {
    req = req.ilike('canonical_name', `%${query.trim()}%`);
  }

  const { data, error } = await req;
  if (error || !data) return [];

  return data.map((r) => ({ id: r.id, name: r.canonical_name, unitType: r.unit_type }));
}
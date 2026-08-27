import { supabase } from './supabase';
import type { WorkOrderStatus } from './database.types';

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
  createdBy: string;
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

export async function saveWorkOrder(payload: WorkOrderSavePayload): Promise<string | null> {
  const { data: wo, error: woErr } = await supabase
    .from('work_orders')
    .insert({
      farm_id: payload.farmId,
      season_id: payload.seasonId,
      program_id: payload.programId,
      program_name: payload.programName,
      crop_type: payload.cropType,
      status: 'draft' as WorkOrderStatus,
      total_acreage: payload.totalAcreage,
      spray_volume_gal_per_acre: payload.sprayVolumeGalPerAcre,
      created_by: payload.createdBy,
    })
    .select('id')
    .single();

  if (woErr || !wo) {
    console.error('Failed to save work order:', woErr);
    return null;
  }

  const workOrderId = wo.id;

  if (payload.fields.length > 0) {
    const { error: fieldsErr } = await supabase
      .from('work_order_fields')
      .insert(
        payload.fields.map((f) => ({
          work_order_id: workOrderId,
          field_id: f.fieldId,
          field_name: f.fieldName,
          acreage: f.acreage,
        }))
      );
    if (fieldsErr) console.error('Failed to save work order fields:', fieldsErr);
  }

  if (payload.lines.length > 0) {
    const { error: linesErr } = await supabase
      .from('work_order_lines')
      .insert(
        payload.lines.map((l) => ({
          work_order_id: workOrderId,
          master_product_id: l.masterProductId,
          chemical_name: l.chemicalName,
          rate_per_acre: l.ratePerAcre,
          rate_unit: l.rateUnit,
          total_needed: l.totalNeeded,
          price_per_unit: l.pricePerUnit,
          price_unit: l.priceUnit,
          sort_order: l.sortOrder,
        }))
      );
    if (linesErr) console.error('Failed to save work order lines:', linesErr);
  }

  return workOrderId;
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

export async function applyWorkOrder(
  workOrderId: string,
  farmId: string,
  userId: string,
  lines: SavedWorkOrderLine[]
): Promise<boolean> {
  const linesToApply = lines.filter((l) => l.master_product_id != null);
  if (linesToApply.length === 0) return false;

  const ledgerEntries = linesToApply.map((l) => ({
    farm_id: farmId,
    master_product_id: l.master_product_id!,
    product_category: 'chemical' as const,
    entry_type: 'consumption' as const,
    quantity_delta: -Math.abs(l.total_needed),
    source_type: 'work_order' as const,
    source_id: workOrderId,
    note: `Applied from work order: ${l.chemical_name}`,
    created_by: userId,
  }));

  const { error: ledgerErr } = await supabase
    .from('inventory_ledger_entries')
    .insert(ledgerEntries);

  if (ledgerErr) {
    console.error('Failed to write consumption ledger entries:', ledgerErr);
    return false;
  }

  const { error: statusErr } = await supabase
    .from('work_orders')
    .update({ status: 'applied' as WorkOrderStatus, applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', workOrderId);

  if (statusErr) {
    console.error('Failed to update work order status:', statusErr);
    return false;
  }

  return true;
}

export async function unapplyWorkOrder(
  workOrderId: string,
  farmId: string,
  userId: string,
  lines: SavedWorkOrderLine[]
): Promise<boolean> {
  const linesToReverse = lines.filter((l) => l.master_product_id != null);
  if (linesToReverse.length === 0) return false;

  const reversalEntries = linesToReverse.map((l) => ({
    farm_id: farmId,
    master_product_id: l.master_product_id!,
    product_category: 'chemical' as const,
    entry_type: 'reversal' as const,
    quantity_delta: Math.abs(l.total_needed),
    source_type: 'work_order' as const,
    source_id: workOrderId,
    note: `Reversed from work order: ${l.chemical_name}`,
    created_by: userId,
  }));

  const { error: ledgerErr } = await supabase
    .from('inventory_ledger_entries')
    .insert(reversalEntries);

  if (ledgerErr) {
    console.error('Failed to write reversal ledger entries:', ledgerErr);
    return false;
  }

  const { error: statusErr } = await supabase
    .from('work_orders')
    .update({ status: 'unapplied' as WorkOrderStatus, unapplied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', workOrderId);

  if (statusErr) {
    console.error('Failed to update work order status:', statusErr);
    return false;
  }

  return true;
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
    .eq('user_id', userId)
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
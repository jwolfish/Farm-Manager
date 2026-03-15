import { supabase } from './supabase';
import type { Database } from './database.types';

type FarmRow = Database['public']['Tables']['farms']['Row'];

export interface Farm {
  id: string;
  farmName: string;
  createdAt: string;
  isActive: boolean;
}

function rowToFarm(row: FarmRow): Farm {
  return {
    id: row.id,
    farmName: row.farm_name,
    createdAt: row.created_at ?? '',
    isActive: row.is_active ?? true,
  };
}

export async function fetchOwnedFarms(userId: string): Promise<Farm[]> {
  const { data, error } = await supabase
    .from('farms')
    .select('id, farm_name, created_at, is_active')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching farms:', error);
    return [];
  }

  return (data || []).map(rowToFarm);
}

export async function createFarm(userId: string, farmName: string): Promise<{ farm: Farm | null; error: string | null }> {
  const { data, error } = await supabase
    .from('farms')
    .insert({ owner_user_id: userId, farm_name: farmName.trim() })
    .select('id, farm_name, created_at, is_active')
    .single();

  if (error) {
    console.error('Error creating farm:', error);
    return { farm: null, error: 'Failed to create farm. Please try again.' };
  }

  return { farm: rowToFarm(data), error: null };
}

export async function updateFarmName(farmId: string, farmName: string, ownerUserId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('farms')
    .update({ farm_name: farmName.trim() })
    .eq('id', farmId)
    .eq('owner_user_id', ownerUserId);

  if (error) {
    console.error('Error updating farm name:', error);
    return { error: 'Failed to update farm name.' };
  }

  return { error: null };
}

export async function deleteFarm(farmId: string, ownerUserId: string): Promise<{ error: string | null }> {
  const { count } = await supabase
    .from('seasons')
    .select('id', { count: 'exact', head: true })
    .eq('farm_id', farmId);

  if (count && count > 0) {
    return { error: 'Cannot delete a farm that has seasons. Delete all seasons first.' };
  }

  const { error } = await supabase
    .from('farms')
    .delete()
    .eq('id', farmId)
    .eq('owner_user_id', ownerUserId);

  if (error) {
    console.error('Error deleting farm:', error);
    return { error: 'Failed to delete farm.' };
  }

  return { error: null };
}

export async function ensureDefaultFarm(userId: string, farmName: string): Promise<Farm | null> {
  const existing = await fetchOwnedFarms(userId);
  if (existing.length > 0) return existing[0];

  const { farm } = await createFarm(userId, farmName || 'My Farm');
  return farm;
}

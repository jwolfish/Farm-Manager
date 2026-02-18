import { supabase } from './supabase';

export interface Farm {
  id: string;
  farmName: string;
  createdAt: string;
  isActive: boolean;
}

export async function fetchOwnedFarms(userId: string): Promise<Farm[]> {
  const { data, error } = await (supabase as any)
    .from('farms')
    .select('id, farm_name, created_at, is_active')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching farms:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    farmName: row.farm_name,
    createdAt: row.created_at,
    isActive: row.is_active,
  }));
}

export async function createFarm(userId: string, farmName: string): Promise<{ farm: Farm | null; error: string | null }> {
  const { data, error } = await (supabase as any)
    .from('farms')
    .insert({ owner_user_id: userId, farm_name: farmName.trim() })
    .select('id, farm_name, created_at, is_active')
    .single();

  if (error) {
    console.error('Error creating farm:', error);
    return { farm: null, error: 'Failed to create farm. Please try again.' };
  }

  return {
    farm: {
      id: data.id,
      farmName: data.farm_name,
      createdAt: data.created_at,
      isActive: data.is_active,
    },
    error: null,
  };
}

export async function updateFarmName(farmId: string, farmName: string): Promise<{ error: string | null }> {
  const { error } = await (supabase as any)
    .from('farms')
    .update({ farm_name: farmName.trim() })
    .eq('id', farmId);

  if (error) {
    console.error('Error updating farm name:', error);
    return { error: 'Failed to update farm name.' };
  }

  return { error: null };
}

export async function deleteFarm(farmId: string): Promise<{ error: string | null }> {
  const { count } = await (supabase as any)
    .from('seasons')
    .select('id', { count: 'exact', head: true })
    .eq('farm_id', farmId);

  if (count && count > 0) {
    return { error: 'Cannot delete a farm that has seasons. Delete all seasons first.' };
  }

  const { error } = await (supabase as any)
    .from('farms')
    .delete()
    .eq('id', farmId);

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

import { supabase } from './supabase';

export type TaskType =
  | 'cascade_product_update'
  | 'cascade_chemical_update'
  | 'cascade_program_update'
  | 'cascade_template_update'
  | 'recalculate_all_costs';

export interface CascadeTaskData {
  entityId: string;
  entityType: 'product' | 'chemical' | 'program' | 'template';
  seasonId: string;
  seasonName?: string;
}

export interface TaskProgress {
  programsUpdated: number;
  templatesUpdated: number;
  fieldsUpdated: number;
  warnings: string[];
}

export async function createCascadeTask(
  userId: string,
  seasonId: string,
  taskType: TaskType,
  entityId?: string,
  entityType?: string,
  programType?: 'fertilizer' | 'chemical'
): Promise<string | null> {
  try {
    const { data: season } = await supabase
      .from('seasons')
      .select('name, year')
      .eq('id', seasonId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('cascade_tasks')
      .insert({
        user_id: userId,
        season_id: seasonId,
        task_type: taskType,
        status: 'pending',
        entity_id: entityId,
        entity_type: entityType,
        program_type: programType ?? null,
        result_data: {
          seasonName: season ? `${season.name} (${season.year})` : 'Unknown Season',
          programsUpdated: 0,
          templatesUpdated: 0,
          fieldsUpdated: 0,
          warnings: []
        }
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create cascade task:', error);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error('Error creating cascade task:', err);
    return null;
  }
}

export async function queueCascadeTask(
  userId: string,
  seasonId: string,
  taskType: TaskType,
  entityId: string,
  entityType: 'product' | 'chemical' | 'program' | 'template',
  programType?: 'fertilizer' | 'chemical'
): Promise<void> {
  const taskId = await createCascadeTask(userId, seasonId, taskType, entityId, entityType, programType);

  if (!taskId) {
    console.error('Failed to create cascade task record');
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-cascade-task`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ taskId }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Edge function returned ${response.status}: ${errorText}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to invoke cascade task edge function:', errorMsg);

    await supabase
      .from('cascade_tasks')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: `Failed to start update: ${errorMsg}`
      })
      .eq('id', taskId);
  }
}

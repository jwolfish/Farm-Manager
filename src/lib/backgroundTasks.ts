import { supabase } from './supabase';
import { executeInTransaction, TransactionContext, TransactionResult } from './transactionUtils';

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

let notificationCallback: ((message: string, type: 'info' | 'success' | 'error', taskId?: string) => void) | null = null;

export function setNotificationCallback(
  callback: (message: string, type: 'info' | 'success' | 'error', taskId?: string) => void
) {
  notificationCallback = callback;
}

function notify(message: string, type: 'info' | 'success' | 'error', taskId?: string) {
  if (notificationCallback) {
    notificationCallback(message, type, taskId);
  }
}

export async function createCascadeTask(
  userId: string,
  seasonId: string,
  taskType: TaskType,
  entityId?: string,
  entityType?: string
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

export async function updateTaskProgress(
  taskId: string,
  progress: Partial<TaskProgress>
): Promise<void> {
  try {
    const { data: task } = await supabase
      .from('cascade_tasks')
      .select('result_data')
      .eq('id', taskId)
      .maybeSingle();

    if (task) {
      const currentData = (task.result_data as any) || {};
      await supabase
        .from('cascade_tasks')
        .update({
          result_data: {
            ...currentData,
            programsUpdated: progress.programsUpdated ?? currentData.programsUpdated ?? 0,
            templatesUpdated: progress.templatesUpdated ?? currentData.templatesUpdated ?? 0,
            fieldsUpdated: progress.fieldsUpdated ?? currentData.fieldsUpdated ?? 0,
            warnings: progress.warnings ?? currentData.warnings ?? []
          }
        })
        .eq('id', taskId);
    }
  } catch (err) {
    console.error('Failed to update task progress:', err);
  }
}

export async function completeTask(
  taskId: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase
      .from('cascade_tasks')
      .update({
        status: success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMessage
      })
      .eq('id', taskId);

    if (success) {
      const { data: task } = await supabase
        .from('cascade_tasks')
        .select('result_data')
        .eq('id', taskId)
        .maybeSingle();

      if (task) {
        const result = task.result_data as any;
        const seasonName = result.seasonName || 'Unknown Season';
        const stats = [
          result.programsUpdated > 0 ? `${result.programsUpdated} programs` : null,
          result.templatesUpdated > 0 ? `${result.templatesUpdated} templates` : null,
          result.fieldsUpdated > 0 ? `${result.fieldsUpdated} fields` : null
        ].filter(Boolean).join(', ');

        notify(
          `Updated ${stats} in ${seasonName}`,
          'success',
          taskId
        );
      }
    } else {
      notify(
        `Update failed: ${errorMessage || 'Unknown error'}`,
        'error',
        taskId
      );
    }
  } catch (err) {
    console.error('Failed to complete task:', err);
  }
}

export async function executeCascadeTask<T>(
  context: TransactionContext,
  operation: (ctx: TransactionContext) => Promise<TransactionResult<T>>
): Promise<void> {
  if (!context.taskId) {
    console.error('No task ID provided for cascade execution');
    return;
  }

  try {
    await supabase
      .from('cascade_tasks')
      .update({ status: 'running' })
      .eq('id', context.taskId);

    const result = await executeInTransaction(context, operation);

    await completeTask(context.taskId, result.success, result.error);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await completeTask(context.taskId, false, errorMsg);
  }
}

export async function queueCascadeTask(
  userId: string,
  seasonId: string,
  taskType: TaskType,
  entityId: string,
  entityType: 'product' | 'chemical' | 'program' | 'template',
  operation: (ctx: TransactionContext) => Promise<TransactionResult<any>>
): Promise<void> {
  const taskId = await createCascadeTask(userId, seasonId, taskType, entityId, entityType);

  if (!taskId) {
    notify('Failed to create update task', 'error');
    return;
  }

  const { data: season } = await supabase
    .from('seasons')
    .select('name, year')
    .eq('id', seasonId)
    .maybeSingle();

  const seasonName = season ? `${season.name} (${season.year})` : 'Unknown Season';

  notify(`Updating related costs in ${seasonName}...`, 'info', taskId);

  setTimeout(async () => {
    await executeCascadeTask(
      { seasonId, userId, taskId },
      operation
    );
  }, 100);
}

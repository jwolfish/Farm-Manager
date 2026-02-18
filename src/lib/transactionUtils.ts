import { supabase } from './supabase';

export interface TransactionContext {
  seasonId: string;
  userId: string;
  taskId?: string;
}

export interface TransactionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

export async function validateSeasonContext(
  seasonId: string,
  userId: string
): Promise<TransactionResult<{ year: number; name: string }>> {
  try {
    const { data: season, error } = await supabase
      .from('seasons')
      .select('id, year, name, user_id')
      .eq('id', seasonId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { success: false, error: `Failed to validate season: ${error.message}` };
    }

    if (!season) {
      return { success: false, error: 'Season not found or access denied' };
    }

    return { success: true, data: { year: season.year, name: season.name } };
  } catch (err) {
    return { success: false, error: `Season validation error: ${err}` };
  }
}

export async function executeInTransaction<T>(
  context: TransactionContext,
  operation: (ctx: TransactionContext) => Promise<TransactionResult<T>>
): Promise<TransactionResult<T>> {
  const seasonValidation = await validateSeasonContext(context.seasonId, context.userId);

  if (!seasonValidation.success) {
    return { success: false, error: seasonValidation.error };
  }

  try {
    const result = await operation(context);

    if (!result.success && context.taskId) {
      await supabase
        .from('cascade_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: result.error || 'Unknown error'
        })
        .eq('id', context.taskId);
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (context.taskId) {
      await supabase
        .from('cascade_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg
        })
        .eq('id', context.taskId);
    }

    return { success: false, error: errorMsg };
  }
}

export async function logCascadeWarning(
  taskId: string,
  warning: string
): Promise<void> {
  try {
    const { data: task } = await supabase
      .from('cascade_tasks')
      .select('result_data')
      .eq('id', taskId)
      .maybeSingle();

    if (task) {
      const warnings = (task.result_data as any)?.warnings || [];
      warnings.push(warning);

      await supabase
        .from('cascade_tasks')
        .update({
          result_data: {
            ...(task.result_data as object || {}),
            warnings
          }
        })
        .eq('id', taskId);
    }
  } catch (err) {
    console.error('Failed to log cascade warning:', err);
  }
}

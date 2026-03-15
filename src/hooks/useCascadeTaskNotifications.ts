import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../contexts/NotificationContext';

interface CascadeTaskRow {
  id: string;
  user_id: string;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
  result_data: Record<string, unknown> | null;
  error_message: string | null;
}

export function useCascadeTaskNotifications(userId: string | null) {
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`cascade-tasks-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cascade_tasks',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const task = payload.new as CascadeTaskRow;

          if (task.status === 'running') {
            addNotification('Updating related costs...', 'info', task.id);
          } else if (task.status === 'completed') {
            const result = task.result_data || {};
            const seasonName = (result.seasonName as string) || 'Unknown Season';
            const parts = [
              (result.programsUpdated as number) > 0 ? `${result.programsUpdated} programs` : null,
              (result.templatesUpdated as number) > 0 ? `${result.templatesUpdated} templates` : null,
              (result.fieldsUpdated as number) > 0 ? `${result.fieldsUpdated} fields` : null,
            ].filter(Boolean);

            const stats = parts.length > 0 ? parts.join(', ') : 'no items';
            addNotification(`Updated ${stats} in ${seasonName}`, 'success', task.id);
          } else if (task.status === 'partial') {
            const result = task.result_data || {};
            const failedCount = ((result.failedFieldIds as string[]) || []).length;
            const seasonName = (result.seasonName as string) || 'Unknown Season';
            addNotification(
              `Update partially completed in ${seasonName} — ${failedCount} field${failedCount !== 1 ? 's' : ''} could not be updated. Check the fields page for details.`,
              'warning',
              task.id
            );
          } else if (task.status === 'failed') {
            addNotification(
              `Update failed: ${task.error_message || 'Unknown error'}`,
              'error',
              task.id
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, addNotification]);
}

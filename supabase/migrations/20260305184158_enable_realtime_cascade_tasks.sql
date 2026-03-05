/*
  # Enable Realtime on cascade_tasks table

  ## Summary
  Adds the `cascade_tasks` table to the Supabase Realtime publication so that
  the client-side `useCascadeTaskNotifications` hook can receive live updates
  when task status changes to 'completed' or 'failed'.

  ## Notes
  - Required for the Realtime postgres_changes subscription to fire
  - Safe to run multiple times due to the IF NOT EXISTS guard via DO block
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'cascade_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cascade_tasks;
  END IF;
END $$;

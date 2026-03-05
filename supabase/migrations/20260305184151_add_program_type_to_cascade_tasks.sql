/*
  # Add program_type column to cascade_tasks

  ## Summary
  Adds a `program_type` column to the `cascade_tasks` table to distinguish
  between fertilizer and chemical program cascade updates. This is required
  so the server-side Edge Function knows which program type to cascade when
  processing a `cascade_program_update` task.

  ## Changes
  - `cascade_tasks` table: new optional `program_type` column (text, nullable)
    - Valid values: 'fertilizer', 'chemical', or NULL for non-program task types

  ## Notes
  - Existing rows will have NULL for this column, which is expected and handled
    gracefully by the Edge Function
  - No default value is set intentionally to avoid masking missing data
*/

ALTER TABLE cascade_tasks
  ADD COLUMN IF NOT EXISTS program_type text;

/*
  # Add Cascade Tasks Table
  
  1. New Tables
    - `cascade_tasks`
      - `id` (uuid, primary key) - Unique task identifier
      - `user_id` (uuid) - User who initiated the task
      - `season_id` (uuid) - Season context for the task
      - `task_type` (text) - Type of cascade operation
      - `status` (text) - Task status (pending, running, completed, failed)
      - `entity_id` (uuid, nullable) - ID of entity being updated (product, program, etc)
      - `entity_type` (text, nullable) - Type of entity (product, program, template)
      - `started_at` (timestamptz) - When task started
      - `completed_at` (timestamptz, nullable) - When task completed
      - `result_data` (jsonb, nullable) - Results and statistics
      - `error_message` (text, nullable) - Error details if failed
      - `created_at` (timestamptz) - Task creation time
  
  2. Security
    - Enable RLS on `cascade_tasks` table
    - Add policy for users to read their own tasks
    - Add policy for users to create their own tasks
    - Add policy for users to update their own tasks
*/

CREATE TABLE IF NOT EXISTS cascade_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  entity_id uuid,
  entity_type text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  result_data jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cascade_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cascade tasks"
  ON cascade_tasks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own cascade tasks"
  ON cascade_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cascade tasks"
  ON cascade_tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups by user and season
CREATE INDEX IF NOT EXISTS idx_cascade_tasks_user_season 
  ON cascade_tasks(user_id, season_id, created_at DESC);
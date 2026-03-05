/*
  # Add Missing RLS Policies for Team Collaboration

  ## Summary
  Several tables were missing RLS policies that allow team members (editors and viewers)
  to access data on shared farms. This migration adds those missing policies to ensure
  collaborators can view and (where appropriate) modify data they have been given access to.

  ## Tables Modified

  ### field_cost_overrides
  - Added SELECT policy for team members viewing shared farm overrides
  - Added INSERT policy for editors on shared farms
  - Added UPDATE policy for editors on shared farms

  ### field_yields
  - Added SELECT policy for team members viewing shared farm yields
  - Added INSERT policy for editors on shared farms
  - Added UPDATE policy for editors on shared farms

  ### fertilizer_program_items
  - Added SELECT policy for team members viewing shared fertilizer program items
  - Added INSERT policy for editors managing shared fertilizer program items
  - Added UPDATE policy for editors managing shared fertilizer program items

  ## Security Notes
  - All new SELECT policies use is_team_member_of() which requires accepted team membership
  - All new write policies use is_editor_of() which requires editor or admin role with accepted status
  - DELETE operations are intentionally not granted to collaborators to protect data integrity
*/

-- field_cost_overrides: team member read access
CREATE POLICY "Team members can view shared field overrides"
  ON field_cost_overrides FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND is_team_member_of(fields.user_id)
    )
  );

-- field_cost_overrides: editor write access
CREATE POLICY "Editors can insert shared field overrides"
  ON field_cost_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND is_editor_of(fields.user_id)
    )
  );

CREATE POLICY "Editors can update shared field overrides"
  ON field_cost_overrides FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND is_editor_of(fields.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_cost_overrides.field_id
      AND is_editor_of(fields.user_id)
    )
  );

-- field_yields: team member read access
CREATE POLICY "Team members can view shared field yields"
  ON field_yields FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_yields.field_id
      AND is_team_member_of(fields.user_id)
    )
  );

-- field_yields: editor write access
CREATE POLICY "Editors can insert shared field yields"
  ON field_yields FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_yields.field_id
      AND is_editor_of(fields.user_id)
    )
  );

CREATE POLICY "Editors can update shared field yields"
  ON field_yields FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_yields.field_id
      AND is_editor_of(fields.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fields
      WHERE fields.id = field_yields.field_id
      AND is_editor_of(fields.user_id)
    )
  );

-- fertilizer_program_items: team member read access
CREATE POLICY "Team members can view shared fertilizer program items"
  ON fertilizer_program_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fertilizer_programs fp
      WHERE fp.id = fertilizer_program_items.program_id
      AND is_team_member_of(fp.user_id)
    )
  );

-- fertilizer_program_items: editor write access
CREATE POLICY "Editors can insert shared fertilizer program items"
  ON fertilizer_program_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fertilizer_programs fp
      WHERE fp.id = fertilizer_program_items.program_id
      AND is_editor_of(fp.user_id)
    )
  );

CREATE POLICY "Editors can update shared fertilizer program items"
  ON fertilizer_program_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fertilizer_programs fp
      WHERE fp.id = fertilizer_program_items.program_id
      AND is_editor_of(fp.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fertilizer_programs fp
      WHERE fp.id = fertilizer_program_items.program_id
      AND is_editor_of(fp.user_id)
    )
  );

-- farms: add SELECT policy so shared farm collaborators can read farm details
CREATE POLICY "Team members can view shared farms"
  ON farms FOR SELECT
  TO authenticated
  USING (
    is_team_member_of(owner_user_id)
  );

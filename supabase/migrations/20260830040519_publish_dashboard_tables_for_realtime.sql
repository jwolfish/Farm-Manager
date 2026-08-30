/*
  # Publish the tables the dashboard subscribes to (LOG-7 / WI-16)

  ## What was actually wrong
  `useDashboardMetrics` opens five realtime subscriptions — `fields`,
  `field_costs`, `field_yields`, `commodity_sales`, `commodity_hedges`. **None of
  those tables were in the `supabase_realtime` publication.** Only `cascade_tasks`
  was, added by `20260305184158`. Postgres therefore never emitted a change for
  any of them and the subscriptions never fired, for anybody.

  The original review recorded this as "realtime filters on the viewer's user_id,
  so collaborators get no live updates" (LOG-7). That is true but understates it:
  the filter never mattered, because there were no events to filter. Nobody has
  ever had a live-updating dashboard.

  ## Why the filter fix alone was not enough
  The companion client change drops the `user_id` filters from the `field_costs`
  and `field_yields` subscriptions. That was necessary but inert on its own —
  a filter on a table that publishes nothing changes nothing.

  Note the review's suggested fix, filtering by `effectiveUserId` instead, would
  now be wrong anyway: writes stamp the actual author, so a yield entered by a
  collaborator carries *their* id, not the owner's. Neither user id identifies
  "rows for this farm". RLS does, and Realtime applies RLS per subscriber, so the
  correct filter is no filter.

  ## Cost
  Publishing five more tables increases WAL traffic and realtime messages. At
  this scale — one farm, a few hundred rows — that is negligible. Worth
  revisiting if the app ever carries many farms with busy dashboards.
*/

DO $publish$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fields', 'field_costs', 'field_yields', 'commodity_sales', 'commodity_hedges'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'published %', t;
    END IF;
  END LOOP;
END;
$publish$;

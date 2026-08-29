/*
  SEC-5 / WI-5 — farm-scoping policy matrix
  =========================================

  The durable artefact the PRD asks for: {owner, editor, viewer, stranger}
  x {own farm, shared farm, other farm} x {select, insert, update}.

  HOW TO RUN
    Paste the whole file into the Supabase SQL editor and execute it.

  It builds its own fixtures — two auth users' worth of farms, seasons, fields
  and inventory — runs every case, and then **deliberately raises** so the whole
  transaction rolls back. The results come back as the exception message. Nothing
  is persisted; that is the point. Do not "fix" the RAISE at the end.

  Because it raises, the SQL editor will show it as an error. That is expected:
  read the message body, not the status.

  WHAT GOOD LOOKS LIKE
    Every line ends in `ok`. A line ending in `FAIL` is a real authorization
    hole. Before WI-5 landed, the whole "farm two" block failed: an editor
    invited to one farm could read and write every other farm the same owner
    had, because is_team_member_of()/is_editor_of() took only an owner id and
    ignored team_members.farm_id.
*/

DO $matrix$
DECLARE
  v_out  text := E'\n=== SEC-5 farm-scoping matrix ===\n';
  v_pass int := 0;
  v_fail int := 0;

  v_a uuid := gen_random_uuid();   -- owner of BOTH farms
  v_b uuid := gen_random_uuid();   -- editor, invited to farm one only
  v_c uuid := gen_random_uuid();   -- viewer, invited to farm one only
  v_d uuid := gen_random_uuid();   -- stranger, invited to nothing

  v_f1 uuid; v_f2 uuid;
  v_s1 uuid; v_s2 uuid;
  v_mp1 uuid; v_mp2 uuid;
  v_n int;
BEGIN
  ------------------------------------------------------------------ fixtures
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_super_admin)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.em, 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false
  FROM (VALUES (v_a,'zz-owner@example.test'), (v_b,'zz-editor@example.test'),
               (v_c,'zz-viewer@example.test'), (v_d,'zz-stranger@example.test'))
       AS u(id, em);

  INSERT INTO farms (owner_user_id, farm_name) VALUES (v_a,'ZZ Farm One') RETURNING id INTO v_f1;
  INSERT INTO farms (owner_user_id, farm_name) VALUES (v_a,'ZZ Farm Two') RETURNING id INTO v_f2;

  INSERT INTO seasons (user_id, year, name, farm_id) VALUES (v_a,2099,'ZZ S1',v_f1) RETURNING id INTO v_s1;
  INSERT INTO seasons (user_id, year, name, farm_id) VALUES (v_a,2099,'ZZ S2',v_f2) RETURNING id INTO v_s2;

  INSERT INTO fields (season_id, user_id, name, crop_type, acreage)
  VALUES (v_s1, v_a, 'ZZ Field One', 'corn', 100),
         (v_s2, v_a, 'ZZ Field Two', 'corn', 100);

  INSERT INTO master_products (farm_id, product_category, canonical_name, unit_type)
  VALUES (v_f1,'chemical','ZZ Prod One','gal') RETURNING id INTO v_mp1;
  INSERT INTO master_products (farm_id, product_category, canonical_name, unit_type)
  VALUES (v_f2,'chemical','ZZ Prod Two','gal') RETURNING id INTO v_mp2;

  -- B and C are invited to FARM ONE ONLY.
  INSERT INTO team_members (user_id, invited_user_id, farm_id, email, role, status, accepted_at)
  VALUES (v_a, v_b, v_f1, 'zz-editor@example.test', 'editor', 'accepted', now()),
         (v_a, v_c, v_f1, 'zz-viewer@example.test', 'viewer', 'accepted', now());

  ------------------------------------------------------------------ helpers
  -- Each case: become the actor, run the probe, compare to the expectation.
  -- Written inline rather than as a procedure so the whole file stays copy-pasteable.

  DECLARE
    actor   uuid;
    label   text;
    expect_f1_read  int;
    expect_f2_read  int;
    expect_f1_write boolean;
    expect_f2_write boolean;
    got_write boolean;
  BEGIN
    FOR actor, label, expect_f1_read, expect_f2_read, expect_f1_write, expect_f2_write IN
      SELECT * FROM (VALUES
        (v_a, 'owner   ', 1, 1, true,  true ),
        (v_b, 'editor  ', 1, 0, true,  false),
        (v_c, 'viewer  ', 1, 0, false, false),
        (v_d, 'stranger', 0, 0, false, false)
      ) AS t(a,l,r1,r2,w1,w2)
    LOOP
      PERFORM set_config('request.jwt.claim.sub', actor::text, true);
      SET LOCAL ROLE authenticated;

      -- reads on farm one
      SELECT count(*) INTO v_n FROM fields WHERE season_id = v_s1 AND name NOT LIKE 'ZZ probe%';
      IF v_n = expect_f1_read THEN v_pass := v_pass+1;
      ELSE v_fail := v_fail+1; v_out := v_out || format('%s F1 field read  = %s want %s  FAIL%s', label, v_n, expect_f1_read, E'\n'); END IF;

      -- reads on farm two
      SELECT count(*) INTO v_n FROM fields WHERE season_id = v_s2 AND name NOT LIKE 'ZZ probe%';
      IF v_n = expect_f2_read THEN v_pass := v_pass+1;
      ELSE v_fail := v_fail+1; v_out := v_out || format('%s F2 field read  = %s want %s  FAIL%s', label, v_n, expect_f2_read, E'\n'); END IF;

      SELECT count(*) INTO v_n FROM master_products WHERE id = v_mp2;
      IF v_n = expect_f2_read THEN v_pass := v_pass+1;
      ELSE v_fail := v_fail+1; v_out := v_out || format('%s F2 product read= %s want %s  FAIL%s', label, v_n, expect_f2_read, E'\n'); END IF;

      SELECT count(*) INTO v_n FROM seasons WHERE id = v_s2;
      IF v_n = expect_f2_read THEN v_pass := v_pass+1;
      ELSE v_fail := v_fail+1; v_out := v_out || format('%s F2 season read = %s want %s  FAIL%s', label, v_n, expect_f2_read, E'\n'); END IF;

      -- write into farm one
      BEGIN
        INSERT INTO fields (season_id, user_id, name, crop_type, acreage)
        VALUES (v_s1, v_a, 'ZZ probe', 'corn', 1);
        got_write := true;
      EXCEPTION WHEN OTHERS THEN got_write := false;
      END;
      IF got_write = expect_f1_write THEN v_pass := v_pass+1;
      ELSE v_fail := v_fail+1; v_out := v_out || format('%s F1 write       = %s want %s  FAIL%s', label, got_write, expect_f1_write, E'\n'); END IF;

      -- write into farm two
      BEGIN
        INSERT INTO fields (season_id, user_id, name, crop_type, acreage)
        VALUES (v_s2, v_a, 'ZZ probe', 'corn', 1);
        got_write := true;
      EXCEPTION WHEN OTHERS THEN got_write := false;
      END;
      IF got_write = expect_f2_write THEN v_pass := v_pass+1;
      ELSE v_fail := v_fail+1; v_out := v_out || format('%s F2 write       = %s want %s  FAIL%s', label, got_write, expect_f2_write, E'\n'); END IF;

      -- update farm two inventory
      BEGIN
        UPDATE master_products SET on_hand_quantity = 999 WHERE id = v_mp2;
        GET DIAGNOSTICS v_n = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN v_n := 0;
      END;
      IF (v_n > 0) = expect_f2_write THEN v_pass := v_pass+1;
      ELSE v_fail := v_fail+1; v_out := v_out || format('%s F2 inv update  = %s rows want %s  FAIL%s', label, v_n, expect_f2_write, E'\n'); END IF;

      RESET ROLE;
    END LOOP;
  END;

  v_out := v_out || format('%s%s passed, %s FAILED%s', E'\n', v_pass, v_fail, E'\n');
  IF v_fail = 0 THEN
    v_out := v_out || 'MATRIX GREEN' || E'\n';
  ELSE
    v_out := v_out || 'MATRIX RED - the failures above are real authorization holes' || E'\n';
  END IF;

  RAISE EXCEPTION '%', v_out;
END;
$matrix$;

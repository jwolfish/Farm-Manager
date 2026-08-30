/*
  SEC-5 / WI-5 — farm-scoping policy matrix
  =========================================

  The durable artefact the PRD asks for: {owner, editor, viewer, stranger}
  x {own farm, other farm} x {select, insert, update}, across every shape of
  table in the schema — farm-scoped, season-scoped, field-scoped, and the
  awkward ones (profiles, cascade tasks, field applications).

  HOW TO RUN
    Paste the whole file into the Supabase SQL editor and execute it.

  It builds its own fixtures — four auth users, two farms under ONE owner, and a
  season/field/cost/application/product tree under each — runs all 56
  assertions, then **deliberately raises** so the transaction rolls back. The
  results come back as the exception message. Nothing is persisted; that is the
  point. Do not "fix" the RAISE at the end.

  Because it raises, the editor shows it as an error. That is expected: read the
  message body, not the status.

  WHAT GOOD LOOKS LIKE
    "56 passed, 0 FAILED" and "MATRIX GREEN". Any line containing FAIL is a real
    authorization hole.

  HISTORY
    Before WI-5 this reported 8 failures: an editor invited to one farm could
    read and write every other farm the same owner had, because
    is_team_member_of()/is_editor_of() took only an owner id and ignored
    team_members.farm_id. Batch 1 took it to 5, batch 2 to 0, and batch 3
    dropped both helpers.

  A NOTE ON THE PROBE ROWS
    The write assertions insert rows named 'ZZ probe' or priced at 99. Every
    read assertion must exclude them, or one actor's successful write inflates
    the next actor's count and reports a failure that is not real. That bit
    twice while this was being written. If you add an assertion, exclude the
    probes.
*/

DO $matrix$
DECLARE
  v_out text := E'\n=== SEC-5 farm-scoping matrix ===\n';
  v_pass int := 0; v_fail int := 0;
  v_a uuid := gen_random_uuid();   -- owner of BOTH farms
  v_b uuid := gen_random_uuid();   -- editor, invited to farm one only
  v_c uuid := gen_random_uuid();   -- viewer, invited to farm one only
  v_d uuid := gen_random_uuid();   -- stranger, invited to nothing
  v_f1 uuid; v_f2 uuid; v_s1 uuid; v_s2 uuid; v_mp2 uuid;
  v_fld1 uuid; v_fld2 uuid; v_fc1 uuid; v_fc2 uuid; v_prog uuid; v_n int;
BEGIN
  ------------------------------------------------------------------ fixtures
  INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,
    email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin)
  SELECT u.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         u.em,'x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb,false
  FROM (VALUES (v_a,'zz-owner@example.test'),(v_b,'zz-editor@example.test'),
               (v_c,'zz-viewer@example.test'),(v_d,'zz-stranger@example.test')) AS u(id,em);
  INSERT INTO user_profiles (id,email) VALUES (v_a,'zz-owner@example.test');
  INSERT INTO farms (owner_user_id,farm_name) VALUES (v_a,'ZZ Farm One') RETURNING id INTO v_f1;
  INSERT INTO farms (owner_user_id,farm_name) VALUES (v_a,'ZZ Farm Two') RETURNING id INTO v_f2;
  INSERT INTO seasons (user_id,year,name,farm_id) VALUES (v_a,2099,'ZZ S1',v_f1) RETURNING id INTO v_s1;
  INSERT INTO seasons (user_id,year,name,farm_id) VALUES (v_a,2099,'ZZ S2',v_f2) RETURNING id INTO v_s2;
  INSERT INTO fields (season_id,user_id,name,crop_type,acreage) VALUES (v_s1,v_a,'ZZ F1','corn',100) RETURNING id INTO v_fld1;
  INSERT INTO fields (season_id,user_id,name,crop_type,acreage) VALUES (v_s2,v_a,'ZZ F2','corn',100) RETURNING id INTO v_fld2;
  INSERT INTO field_costs (field_id,user_id) VALUES (v_fld1,v_a) RETURNING id INTO v_fc1;
  INSERT INTO field_costs (field_id,user_id) VALUES (v_fld2,v_a) RETURNING id INTO v_fc2;
  INSERT INTO chemical_programs (season_id,user_id,program_name,crop_type)
  VALUES (v_s1,v_a,'ZZ Prog','corn') RETURNING id INTO v_prog;
  INSERT INTO field_chemical_applications (field_cost_id,chemical_program_id,cost_per_acre)
  VALUES (v_fc1,v_prog,10),(v_fc2,v_prog,10);
  INSERT INTO cascade_tasks (user_id,season_id,task_type) VALUES (v_a,v_s2,'cascade_product_update');
  INSERT INTO master_products (farm_id,product_category,canonical_name,unit_type)
  VALUES (v_f2,'chemical','ZZ Prod Two','gal') RETURNING id INTO v_mp2;

  -- B and C are invited to FARM ONE ONLY.
  INSERT INTO team_members (user_id,invited_user_id,farm_id,email,role,status,accepted_at)
  VALUES (v_a,v_b,v_f1,'zz-editor@example.test','editor','accepted',now()),
         (v_a,v_c,v_f1,'zz-viewer@example.test','viewer','accepted',now());

  ------------------------------------------------------------------ matrix
  DECLARE actor uuid; label text; e_r1 int; e_r2 int; e_w1 boolean; e_w2 boolean; e_prof int; got boolean;
  BEGIN
    FOR actor,label,e_r1,e_r2,e_w1,e_w2,e_prof IN SELECT * FROM (VALUES
        (v_a,'owner   ',1,1,true, true, 1),
        (v_b,'editor  ',1,0,true, false,1),
        (v_c,'viewer  ',1,0,false,false,1),
        (v_d,'stranger',0,0,false,false,0)) AS x(a,l,r1,r2,w1,w2,pr)
    LOOP
      PERFORM set_config('request.jwt.claim.sub', actor::text, true);
      SET LOCAL ROLE authenticated;

      -- ---- reads -----------------------------------------------------
      SELECT count(*) INTO v_n FROM fields WHERE season_id=v_s1 AND name NOT LIKE 'ZZ probe%';
      IF v_n=e_r1 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F1 field read      FAIL got %s want %s%s',label,v_n,e_r1,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM fields WHERE season_id=v_s2 AND name NOT LIKE 'ZZ probe%';
      IF v_n=e_r2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 field read      FAIL got %s want %s%s',label,v_n,e_r2,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM seasons WHERE id=v_s2;
      IF v_n=e_r2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 season read     FAIL got %s want %s%s',label,v_n,e_r2,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM farms WHERE id=v_f2;
      IF v_n=e_r2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 farm read       FAIL got %s want %s%s',label,v_n,e_r2,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM master_products WHERE id=v_mp2;
      IF v_n=e_r2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 product read    FAIL got %s want %s%s',label,v_n,e_r2,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM field_costs WHERE id=v_fc2;
      IF v_n=e_r2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 field cost read FAIL got %s want %s%s',label,v_n,e_r2,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM field_chemical_applications WHERE field_cost_id=v_fc2 AND cost_per_acre<>99;
      IF v_n=e_r2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 chem app read   FAIL got %s want %s%s',label,v_n,e_r2,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM cascade_tasks WHERE season_id=v_s2;
      IF v_n=e_r2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 cascade read    FAIL got %s want %s%s',label,v_n,e_r2,E'\n'); END IF;
      SELECT count(*) INTO v_n FROM user_profiles WHERE id=v_a;
      IF v_n=e_prof THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s profile read       FAIL got %s want %s%s',label,v_n,e_prof,E'\n'); END IF;

      -- ---- writes ----------------------------------------------------
      BEGIN INSERT INTO fields (season_id,user_id,name,crop_type,acreage) VALUES (v_s1,v_a,'ZZ probe','corn',1); got:=true; EXCEPTION WHEN OTHERS THEN got:=false; END;
      IF got=e_w1 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F1 field write     FAIL got %s want %s%s',label,got,e_w1,E'\n'); END IF;
      BEGIN INSERT INTO fields (season_id,user_id,name,crop_type,acreage) VALUES (v_s2,v_a,'ZZ probe','corn',1); got:=true; EXCEPTION WHEN OTHERS THEN got:=false; END;
      IF got=e_w2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 field write     FAIL got %s want %s%s',label,got,e_w2,E'\n'); END IF;
      -- an editor on F1 MUST be able to write these; before batch 3 they could not
      BEGIN INSERT INTO field_chemical_applications (field_cost_id,chemical_program_id,cost_per_acre) VALUES (v_fc1,v_prog,99); got:=true; EXCEPTION WHEN OTHERS THEN got:=false; END;
      IF got=e_w1 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F1 chem app write  FAIL got %s want %s%s',label,got,e_w1,E'\n'); END IF;
      BEGIN INSERT INTO field_chemical_applications (field_cost_id,chemical_program_id,cost_per_acre) VALUES (v_fc2,v_prog,99); got:=true; EXCEPTION WHEN OTHERS THEN got:=false; END;
      IF got=e_w2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 chem app write  FAIL got %s want %s%s',label,got,e_w2,E'\n'); END IF;
      BEGIN UPDATE master_products SET on_hand_quantity=999 WHERE id=v_mp2; GET DIAGNOSTICS v_n=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_n:=0; END;
      IF (v_n>0)=e_w2 THEN v_pass:=v_pass+1; ELSE v_fail:=v_fail+1; v_out:=v_out||format('%s F2 inv update      FAIL got %s want %s%s',label,v_n,e_w2,E'\n'); END IF;

      RESET ROLE;
    END LOOP;
  END;

  v_out := v_out || format('%s%s passed, %s FAILED%s', E'\n', v_pass, v_fail, E'\n');
  IF v_fail = 0 THEN
    v_out := v_out || 'MATRIX GREEN - SEC-5 CLOSED' || E'\n';
  ELSE
    v_out := v_out || 'MATRIX RED - the failures above are real authorization holes' || E'\n';
  END IF;

  RAISE EXCEPTION '%', v_out;
END;
$matrix$;

-- Owner-only integration tests. Every fixture and helper is rolled back.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE estimate_delete_test_results(name text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.expect_protected(e uuid, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    DELETE FROM public.estimates WHERE id=e;
    RAISE EXCEPTION 'FAIL: % was deleted', label;
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.estimates WHERE id=e) THEN RAISE EXCEPTION 'FAIL: missing estimate'; END IF;
  INSERT INTO estimate_delete_test_results VALUES(label);
END $$;
DO $test$
DECLARE e uuid := gen_random_uuid(); l uuid := gen_random_uuid(); j uuid := gen_random_uuid();
  line uuid := gen_random_uuid(); u uuid; col text; st text;
BEGIN
  SELECT id INTO STRICT u FROM public.users LIMIT 1;
  INSERT INTO public.leads(id,title) VALUES(l,'__estimate_delete_safeguard_test__');
  INSERT INTO public.jobs(id,job_number,name,client_name,site_address,status,created_by)
    VALUES(j,'__guard_'||j,'__estimate_delete_safeguard_test__','SYNTHETIC','SYNTHETIC','archived',u);
  INSERT INTO public.estimates(id,job_name,lead_id,public_token) VALUES(e,'__estimate_delete_safeguard_test__',l,NULL);
  INSERT INTO public.estimate_lines(id,estimate_id,lead_id,description) VALUES(line,e,l,'synthetic test');
  INSERT INTO public.chat_messages(estimate_id,role,content) VALUES(e,'assistant','synthetic');
  PERFORM pg_temp.expect_protected(e,'conversation history'); DELETE FROM public.chat_messages WHERE estimate_id=e;
  INSERT INTO public.estimate_proposal_sessions(estimate_id,expires_at) VALUES(e,now()-interval '1 day');
  PERFORM pg_temp.expect_protected(e,'expired proposal session'); DELETE FROM public.estimate_proposal_sessions WHERE estimate_id=e;
  INSERT INTO public.estimate_line_proposals(estimate_id,batch_id,description,status) VALUES(e,gen_random_uuid(),'synthetic','pending');
  PERFORM pg_temp.expect_protected(e,'line review history'); DELETE FROM public.estimate_line_proposals WHERE estimate_id=e;
  FOREACH st IN ARRAY ARRAY['completed','failed'] LOOP
    INSERT INTO public.fixer_requests(id,estimate_id,user_id,message,status,finished_at) VALUES(gen_random_uuid(),e,u,'synthetic',st,now());
    PERFORM pg_temp.expect_protected(e,'Fixer '||st); DELETE FROM public.fixer_requests WHERE estimate_id=e;
  END LOOP;
  INSERT INTO public.budget_lines(job_id,created_by,cost_code,category,description,notes)
    VALUES(j,u,'TEST','test','synthetic','Imported from estimate '||e||' suffix');
  IF NOT EXISTS(SELECT 1 FROM public.budget_lines WHERE job_id=j AND imported_estimate_id=e) THEN RAISE EXCEPTION 'FAIL: import provenance'; END IF;
  PERFORM pg_temp.expect_protected(e,'budget import'); DELETE FROM public.budget_lines WHERE job_id=j;
  INSERT INTO public.allowances(job_id,title,estimate_line_id) VALUES(j,'synthetic',line);
  PERFORM pg_temp.expect_protected(e,'linked allowance'); DELETE FROM public.allowances WHERE job_id=j;
  FOREACH st IN ARRAY ARRAY['sent','approved','rejected','voided'] LOOP
    UPDATE public.estimates SET status=st WHERE id=e;
    PERFORM pg_temp.expect_protected(e,'status '||st);
  END LOOP;
  UPDATE public.estimates SET status='draft',is_locked=true WHERE id=e;
  PERFORM pg_temp.expect_protected(e,'locked draft');
  UPDATE public.estimates SET is_locked=false WHERE id=e;
  FOREACH col IN ARRAY ARRAY['client_name','client_signature','client_response_note'] LOOP
    EXECUTE format('UPDATE public.estimates SET %I=%L WHERE id=%L',col,'',e);
    PERFORM pg_temp.expect_protected(e,'response '||col);
    EXECUTE format('UPDATE public.estimates SET %I=NULL WHERE id=%L',col,e);
  END LOOP;
  FOREACH col IN ARRAY ARRAY['client_approved_at','client_rejected_at'] LOOP
    EXECUTE format('UPDATE public.estimates SET %I=now() WHERE id=%L',col,e);
    PERFORM pg_temp.expect_protected(e,'response '||col);
    EXECUTE format('UPDATE public.estimates SET %I=NULL WHERE id=%L',col,e);
  END LOOP;
  DELETE FROM public.estimates WHERE id=e;
  IF EXISTS(SELECT 1 FROM public.estimates WHERE id=e) OR EXISTS(SELECT 1 FROM public.estimate_lines WHERE id=line) THEN RAISE EXCEPTION 'FAIL: pristine draft cascade'; END IF;
  INSERT INTO estimate_delete_test_results VALUES('pristine draft and owned lines deleted');
END $test$;
SELECT count(*) AS passed, array_agg(name ORDER BY name) AS tests FROM estimate_delete_test_results;
ROLLBACK;

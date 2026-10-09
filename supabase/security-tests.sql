-- Run as postgres in SQL Editor. Everything below is rolled back, including fake users.
begin;
do $$
declare
  alice uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  budget jsonb; result jsonb; code text;
  data jsonb := '{"version":1,"start":"2026-10-09","balance":0,"events":[]}'::jsonb;
begin
  if has_table_privilege('anon','public.kontur_budgets','select') or
    has_table_privilege('authenticated','public.kontur_budgets','select') or
    has_table_privilege('authenticated','public.kontur_members','insert') or
    has_function_privilege('anon','public.kontur_read()','execute') then
    raise exception 'TEST FAILED: unexpected table or anonymous RPC permission';
  end if;
  if exists(select 1 from pg_class where oid in ('public.kontur_budgets'::regclass,
    'public.kontur_members'::regclass,'public.kontur_invites'::regclass) and not relrowsecurity)
    then raise exception 'TEST FAILED: RLS disabled'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.kontur_read(); raise exception 'TEST FAILED: anonymous read accepted';
    exception when insufficient_privilege then null; end;
  -- UUID-only test users have no email, password or personal information.
  insert into auth.users(id) values(alice),(bob),(outsider);
  perform set_config('request.jwt.claim.sub',alice::text,true);
  budget := public.kontur_create(data); code := public.kontur_invite();
  if has_function_privilege('authenticated','public.kontur_authored(jsonb,jsonb)','execute')
    then raise exception 'TEST FAILED: direct authorship helper access'; end if;
  result := public.kontur_authored(jsonb_set(data,'{events}',
    '[{"id":"test-event","name":"Test","type":"expense","cents":100,"date":"2026-10-09","author":"forged_user"}]'::jsonb), null);
  if result->'events'->0->>'author' <> 'participant' then raise exception 'TEST FAILED: spoofed new author'; end if;
  result := public.kontur_authored(jsonb_set(result,'{events,0,author}','"forged_user"'),
    jsonb_set(result,'{events,0,author}','"original_user"'));
  if result->'events'->0->>'author' <> 'original_user' then raise exception 'TEST FAILED: original author replaced'; end if;
  result := public.kontur_authored(result, jsonb_set(data,'{events}', (result->'events') #- '{0,author}'));
  if result->'events'->0 ? 'author' then raise exception 'TEST FAILED: legacy author invented'; end if;
  if budget->>'revision' <> '1' or length(code) <> 64 then raise exception 'TEST FAILED: create or invite'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if public.kontur_read() is not null then raise exception 'TEST FAILED: outsider can read'; end if;
  begin perform public.kontur_save(1,data); raise exception 'TEST FAILED: outsider can save';
    exception when insufficient_privilege then null; end;
  begin perform public.kontur_join('''; DROP TABLE kontur_budgets; --'); raise exception 'TEST FAILED: injection invite accepted';
    exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',bob::text,true);
  result := public.kontur_join(code);
  if result->>'id' <> budget->>'id' or result->>'members' <> '2' then raise exception 'TEST FAILED: join'; end if;
  begin perform public.kontur_invite(); raise exception 'TEST FAILED: nonowner invite accepted';
    exception when insufficient_privilege then null; end;
  result := public.kontur_save(1,jsonb_set(data,'{balance}','100'::jsonb));
  if result->>'saved' <> 'true' then raise exception 'TEST FAILED: member save'; end if;
  perform set_config('request.jwt.claim.sub',alice::text,true);
  result := public.kontur_save(1,data);
  if result->>'saved' <> 'false' or result->'budget'->'data'->>'balance' <> '100'
    then raise exception 'TEST FAILED: stale revision overwrote data'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin perform public.kontur_join(code); raise exception 'TEST FAILED: third participant accepted';
    exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
  begin perform public.kontur_validate(jsonb_set(data,'{balance}','1000000000001'::jsonb));
    raise exception 'TEST FAILED: invalid budget accepted';
    exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
  if public.kontur_valid_date('2026-02-31') then raise exception 'TEST FAILED: invalid date accepted'; end if;
  raise notice 'All database security and revision tests passed';
end $$;
select 'PASS: RLS, anonymous/outsider denial, owner invite, two-member limit, injection input, validation, optimistic concurrency' as result;
rollback;

begin;
do $$
declare alice uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  result jsonb; data jsonb; original jsonb; entry_id uuid; edit_id uuid; invite text; budget_id uuid;
begin
  if has_table_privilege('authenticated','public.kontur_changes','select') or
     has_function_privilege('anon','public.kontur_history()','execute') or
     has_function_privilege('authenticated','public.kontur_record(uuid,jsonb,jsonb,uuid)','execute')
    then raise exception 'TEST FAILED: audit permissions'; end if;
  insert into auth.users(id) values(alice),(bob),(outsider);
  perform set_config('request.jwt.claim.sub',alice::text,true);
  data := '{"version":1,"start":"2026-10-09","balance":10000,"events":[]}'::jsonb;
  result := public.kontur_create(data); budget_id := (result->>'id')::uuid; invite:=public.kontur_invite();
  data:=jsonb_set(data,'{events}','[{"id":"rent","name":"Rent","type":"expense","date":"2026-10-10","cents":1000,"repeat":"monthly","required":true}]');
  result:=public.kontur_save(1,data); original:=result->'budget'->'data';
  entry_id:=(public.kontur_history()->0->>'id')::uuid;
  if public.kontur_history()->0->>'action'<>'create' then raise exception 'TEST FAILED: addition not audited'; end if;
  data:=jsonb_set(original,'{events,0,actuals}','[{"plannedDate":"2026-10-10","date":"2026-10-11","cents":800}]');
  result:=public.kontur_save(2,data); data:=result->'budget'->'data';
  edit_id:=(public.kontur_history()->0->>'id')::uuid;
  -- Older clients must not erase fact/required metadata by omitting it.
  result:=public.kontur_save(3,jsonb_set(data,'{events}',(data->'events') #- '{0,actuals}' #- '{0,required}'));
  if result->'budget'->'data'->'events'->0->'actuals' is distinct from data->'events'->0->'actuals'
    then raise exception 'TEST FAILED: older client erased fact'; end if;
  begin perform public.kontur_undo(entry_id,4); raise exception 'TEST FAILED: undo overwrote later edit';
    exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
  result:=public.kontur_undo(edit_id,3);
  if result->>'saved'<>'false' then raise exception 'TEST FAILED: stale undo accepted'; end if;
  perform set_config('request.jwt.claim.sub',bob::text,true); perform public.kontur_join(invite);
  result:=public.kontur_undo(edit_id,4);
  if result->>'saved'<>'true' or result->'budget'->'data'->'events'->0 ? 'actuals'
    then raise exception 'TEST FAILED: participant undo'; end if;
  if public.kontur_history()->0->>'undo_of'<>edit_id::text then raise exception 'TEST FAILED: undo not audited'; end if;
  result:=public.kontur_save(5,jsonb_set(original,'{events}','[]'));
  entry_id:=(public.kontur_history()->0->>'id')::uuid;
  result:=public.kontur_undo(entry_id,6);
  if result->'budget'->'data'->'events'->0->>'author'<>'participant'
    then raise exception 'TEST FAILED: delete undo lost author'; end if;
  begin perform public.kontur_validate(jsonb_set(data,'{events,0,actuals,0,plannedDate}','"2026-10-12"'));
    raise exception 'TEST FAILED: nonoccurrence fact accepted';
    exception when raise_exception then if SQLERRM like 'TEST FAILED:%' then raise; end if; end;
  if not public.kontur_occurs('{"date":"2026-01-31","repeat":"monthly"}', '2026-02-28')
    then raise exception 'TEST FAILED: short-month occurrence'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin perform public.kontur_history(); raise exception 'TEST FAILED: outsider history';
    exception when insufficient_privilege then null; end;
  begin perform public.kontur_undo(entry_id,7); raise exception 'TEST FAILED: outsider undo';
    exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.kontur_history(); raise exception 'TEST FAILED: anonymous history';
    exception when insufficient_privilege then null; end;
  raise notice 'All history, fact and undo security tests passed';
end $$;
select 'PASS: audit permissions, history, protected facts, stale/conflicting undo, participant undo, author preservation, recurring fact validation' as result;
rollback;

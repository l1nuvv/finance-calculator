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

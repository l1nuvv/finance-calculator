-- Kontur 2.0. Only authenticated, explicitly authorized RPCs can access budget data.
begin;
create table if not exists public.kontur_budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.kontur_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  budget_id uuid not null references public.kontur_budgets(id) on delete cascade
);
create index if not exists kontur_members_budget_idx on public.kontur_members(budget_id);
create table if not exists public.kontur_invites (
  budget_id uuid primary key references public.kontur_budgets(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null
);
alter table public.kontur_budgets enable row level security;
alter table public.kontur_members enable row level security;
alter table public.kontur_invites enable row level security;
revoke all on public.kontur_budgets, public.kontur_members, public.kontur_invites from anon, authenticated;
create table if not exists public.kontur_changes (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  budget_id uuid not null references public.kontur_budgets(id) on delete cascade,
  event_id text,
  action text not null check(action in ('create','update','delete','snapshot')),
  actor text not null,
  before_data jsonb,
  after_data jsonb,
  undo_of uuid references public.kontur_changes(id),
  created_at timestamptz not null default now()
);
create index if not exists kontur_changes_budget_seq_idx on public.kontur_changes(budget_id,seq desc);
alter table public.kontur_changes enable row level security;
revoke all on public.kontur_changes from anon, authenticated;

create or replace function public.kontur_occurs(e jsonb, d date) returns boolean
language plpgsql immutable set search_path = '' as $$
declare anchor date := (e->>'date')::date; last_day int; kind text := coalesce(e->>'repeat','once');
begin
  if d < anchor or (e ? 'end' and d > (e->>'end')::date) then return false; end if;
  if kind = 'once' then return d = anchor; end if;
  if kind = 'weekly' then return (d-anchor) % 7 = 0; end if;
  if kind = 'biweekly' then return (d-anchor) % 14 = 0; end if;
  last_day := extract(day from (date_trunc('month',d) + interval '1 month - 1 day'))::int;
  if kind = 'monthly' then return extract(day from d)::int = least(extract(day from anchor)::int,last_day); end if;
  if kind = 'twice' then return exists(select 1 from jsonb_array_elements(coalesce(e->'days','[10,25]'::jsonb)) n
    where least(n::text::int,last_day) = extract(day from d)::int); end if;
  return false;
end $$;

create or replace function public.kontur_valid_date(p_value text) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  return p_value is not null and p_value ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$'
    and to_char(p_value::date, 'YYYY-MM-DD') = p_value;
exception when others then return false;
end $$;

create or replace function public.kontur_validate(p_data jsonb) returns void
language plpgsql set search_path = '' as $$
declare e jsonb; n jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 2000000
    or p_data->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_data->'start') is distinct from 'string' or not public.kontur_valid_date(p_data->>'start')
    or jsonb_typeof(p_data->'balance') is distinct from 'number' or coalesce(p_data->>'balance','') !~ '^-?[0-9]+$'
    or jsonb_typeof(p_data->'events') is distinct from 'array' then raise exception 'Неверный формат бюджета'; end if;
  if abs((p_data->>'balance')::numeric) > 1000000000000 or jsonb_array_length(p_data->'events') > 5000
    then raise exception 'Превышен лимит бюджета'; end if;
  for e in select value from jsonb_array_elements(p_data->'events') loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'id') is distinct from 'string'
      or length(btrim(e->>'id')) not between 1 and 100
      or jsonb_typeof(e->'name') is distinct from 'string' or length(btrim(e->>'name')) not between 1 and 150
      or coalesce(e->>'type','') not in ('income','expense','borrow','repay','transfer')
      or jsonb_typeof(e->'cents') is distinct from 'number' or coalesce(e->>'cents','') !~ '^[0-9]+$'
      or (e->>'cents')::numeric > 1000000000000
      or jsonb_typeof(e->'date') is distinct from 'string' or not public.kontur_valid_date(e->>'date')
      or coalesce(e->>'repeat','once') not in ('once','weekly','biweekly','monthly','twice')
      or coalesce(e->>'confidence','confirmed') not in ('expected','confirmed','actual')
      then raise exception 'Некорректная операция'; end if;
    if e ? 'end' and (jsonb_typeof(e->'end') <> 'string' or not public.kontur_valid_date(e->>'end')
      or e->>'end' < e->>'date') then raise exception 'Неверная дата окончания'; end if;
    if e ? 'category' and (jsonb_typeof(e->'category') <> 'string' or length(e->>'category') > 40)
      then raise exception 'Неверная категория'; end if;
    if e ? 'paid' and jsonb_typeof(e->'paid') <> 'boolean' then raise exception 'Неверный статус оплаты'; end if;
    if e ? 'author' and (jsonb_typeof(e->'author') <> 'string' or e->>'author' !~ '^[a-z0-9_-]{3,32}$')
      then raise exception 'Неверный автор операции'; end if;
    if (e ? 'required' and jsonb_typeof(e->'required') <> 'boolean') or
      (e ? 'salary' and jsonb_typeof(e->'salary') <> 'boolean') then raise exception 'Неверный признак платежа'; end if;
    if e ? 'days' then
      if jsonb_typeof(e->'days') <> 'array' then raise exception 'Неверные дни'; end if;
      if jsonb_array_length(e->'days') not between 1 and 31 then raise exception 'Неверные дни'; end if;
      for n in select value from jsonb_array_elements(e->'days') loop
        if jsonb_typeof(n) <> 'number' or n::text !~ '^[0-9]+$' or n::text::int not between 1 and 31
          then raise exception 'Неверный день'; end if;
      end loop;
    end if;
    if e ? 'actuals' then
      if jsonb_typeof(e->'actuals') <> 'array' or jsonb_array_length(e->'actuals') > 730
        then raise exception 'Неверный список фактических платежей'; end if;
      for n in select value from jsonb_array_elements(e->'actuals') loop
        if jsonb_typeof(n) <> 'object' or not public.kontur_valid_date(n->>'date')
          or not public.kontur_valid_date(n->>'plannedDate')
          or jsonb_typeof(n->'cents') is distinct from 'number' or coalesce(n->>'cents','') !~ '^[0-9]+$'
          or (n->>'cents')::numeric > 1000000000000 then raise exception 'Неверный фактический платёж'; end if;
        if not public.kontur_occurs(e,(n->>'plannedDate')::date) then raise exception 'Дата факта не соответствует повторению'; end if;
      end loop;
      if exists(select 1 from jsonb_array_elements(e->'actuals') f group by f->>'plannedDate' having count(*) > 1)
        then raise exception 'Повтор фактического платежа'; end if;
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_data->'events') x group by x->>'id' having count(*) > 1)
    then raise exception 'Повторяющийся ID операции'; end if;
end $$;

-- Authorship comes from the authenticated account, never from client input.
-- Existing operations retain their original author, including unknown legacy authors.
create or replace function public.kontur_authored(p_data jsonb, p_previous jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; login text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select lower(split_part(email, '@', 1)) into login from auth.users where id = auth.uid();
  if login is null or login !~ '^[a-z0-9_-]{3,32}$' then login := 'participant'; end if;
  select coalesce(jsonb_agg(
    (e.value - 'author') || coalesce((select jsonb_object_agg(k,old.value->k)
      from unnest(array['actuals','required','salary']) k where old.value ? k and not e.value ? k),'{}'::jsonb) || case
      when old.value is null then jsonb_build_object('author', login)
      when old.value ? 'author' then jsonb_build_object('author', old.value->'author')
      else '{}'::jsonb end order by e.ordinality), '[]'::jsonb)
  into result from jsonb_array_elements(p_data->'events') with ordinality e(value, ordinality)
  left join jsonb_array_elements(coalesce(p_previous->'events', '[]'::jsonb)) old(value)
    on old.value->>'id' = e.value->>'id';
  return jsonb_set(p_data, '{events}', result);
end $$;

create or replace function public.kontur_read() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select jsonb_build_object('id', b.id, 'data', b.data, 'revision', b.revision, 'updated_at', b.updated_at,
    'owner', b.owner_id = auth.uid(), 'members', (select count(*) from public.kontur_members mm where mm.budget_id = b.id))
  into result from public.kontur_budgets b join public.kontur_members m on m.budget_id = b.id where m.user_id = auth.uid();
  return result;
end $$;

create or replace function public.kontur_record(p_budget uuid, p_before jsonb, p_after jsonb, p_undo uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare login text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select lower(split_part(email,'@',1)) into login from auth.users where id=auth.uid();
  if login is null or login !~ '^[a-z0-9_-]{3,32}$' then login := 'participant'; end if;
  insert into public.kontur_changes(budget_id,event_id,action,actor,before_data,after_data,undo_of)
  select p_budget,coalesce(a.value->>'id',b.value->>'id'),
    case when a.value is null then 'create' when b.value is null then 'delete' else 'update' end,
    login,a.value,b.value,p_undo
  from jsonb_array_elements(coalesce(p_before->'events','[]'::jsonb)) a(value)
  full join jsonb_array_elements(p_after->'events') b(value) on a.value->>'id'=b.value->>'id'
  where a.value is distinct from b.value;
  if p_before is not null and (p_before->'start' is distinct from p_after->'start' or p_before->'balance' is distinct from p_after->'balance') then
    insert into public.kontur_changes(budget_id,action,actor,before_data,after_data,undo_of)
    values(p_budget,'snapshot',login,jsonb_build_object('start',p_before->'start','balance',p_before->'balance'),
      jsonb_build_object('start',p_after->'start','balance',p_after->'balance'),p_undo);
  end if;
end $$;

create or replace function public.kontur_history() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare budget uuid; result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select budget_id into budget from public.kontur_members where user_id=auth.uid();
  if budget is null then raise insufficient_privilege; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'event_id',c.event_id,'action',c.action,'actor',c.actor,
    'before',c.before_data,'after',c.after_data,'undo_of',c.undo_of,'created_at',c.created_at) order by c.seq desc),'[]'::jsonb)
  into result from (select * from public.kontur_changes where budget_id=budget order by seq desc limit 100) c;
  return result;
end $$;

create or replace function public.kontur_undo(p_history uuid, p_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare budget uuid; change public.kontur_changes%rowtype; row_data public.kontur_budgets%rowtype; next_data jsonb; current_event jsonb; events jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select budget_id into budget from public.kontur_members where user_id=auth.uid();
  if budget is null then raise insufficient_privilege; end if;
  select * into change from public.kontur_changes where id=p_history and budget_id=budget;
  if not found then raise insufficient_privilege; end if;
  select * into row_data from public.kontur_budgets where id=budget for update;
  if row_data.revision is distinct from p_revision then return jsonb_build_object('saved',false,'budget',public.kontur_read()); end if;
  if change.event_id is null then
    if jsonb_build_object('start',row_data.data->'start','balance',row_data.data->'balance') is distinct from change.after_data
      then raise exception 'Остаток или дата уже изменились. Отмена остановлена'; end if;
    next_data := row_data.data || change.before_data;
  else
    select value into current_event from jsonb_array_elements(row_data.data->'events') where value->>'id'=change.event_id;
    if current_event is distinct from change.after_data then raise exception 'Операция уже изменилась. Отмена остановлена'; end if;
    select coalesce(jsonb_agg(value),'[]'::jsonb) into events from jsonb_array_elements(row_data.data->'events') where value->>'id'<>change.event_id;
    if change.before_data is not null then events := events || jsonb_build_array(change.before_data); end if;
    next_data := jsonb_set(row_data.data,'{events}',events);
  end if;
  perform public.kontur_validate(next_data);
  update public.kontur_budgets set data=next_data,revision=revision+1,updated_at=now() where id=budget;
  perform public.kontur_record(budget,row_data.data,next_data,p_history);
  return jsonb_build_object('saved',true,'budget',public.kontur_read());
end $$;

create or replace function public.kontur_create(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare budget uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  perform public.kontur_validate(p_data);
  if exists(select 1 from public.kontur_members where user_id = auth.uid()) then raise exception 'Вы уже подключены к бюджету'; end if;
  insert into public.kontur_budgets(owner_id, data) values(auth.uid(), public.kontur_authored(p_data, null)) returning id into budget;
  insert into public.kontur_members(user_id,budget_id) values(auth.uid(),budget);
  perform public.kontur_record(budget,null,(public.kontur_read())->'data');
  return public.kontur_read();
end $$;

create or replace function public.kontur_save(p_revision bigint, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare budget uuid; affected int; previous jsonb; next_data jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select budget_id into budget from public.kontur_members where user_id = auth.uid();
  if budget is null then raise insufficient_privilege; end if;
  perform public.kontur_validate(p_data);
  select data into previous from public.kontur_budgets where id=budget for update;
  next_data := public.kontur_authored(p_data,previous);
  perform public.kontur_validate(next_data);
  update public.kontur_budgets set data = next_data, revision = revision + 1, updated_at = now()
    where id = budget and revision = p_revision;
  get diagnostics affected = row_count;
  if affected = 1 then
    select data into next_data from public.kontur_budgets where id=budget;
    perform public.kontur_record(budget,previous,next_data);
  end if;
  return jsonb_build_object('saved', affected = 1, 'budget', public.kontur_read());
end $$;

create or replace function public.kontur_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare budget uuid; code text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select b.id into budget from public.kontur_budgets b join public.kontur_members m on m.budget_id = b.id
    where m.user_id = auth.uid() and b.owner_id = auth.uid() for update of b;
  if budget is null then raise insufficient_privilege; end if;
  if (select count(*) from public.kontur_members where budget_id = budget) >= 2 then raise exception 'В бюджете уже два участника'; end if;
  code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.kontur_invites(budget_id,code_hash,expires_at)
    values(budget,encode(sha256(convert_to(code,'UTF8')),'hex'),now()+interval '7 days')
    on conflict(budget_id) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at;
  return code;
end $$;

create or replace function public.kontur_join(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare budget uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_code is null or p_code !~ '^[a-f0-9]{64}$' then raise exception 'Неверное приглашение'; end if;
  if exists(select 1 from public.kontur_members where user_id = auth.uid()) then raise exception 'Вы уже подключены к бюджету'; end if;
  select b.id into budget from public.kontur_budgets b join public.kontur_invites i on i.budget_id = b.id
    where i.code_hash = encode(sha256(convert_to(p_code,'UTF8')),'hex') and i.expires_at > now() for update of b;
  if budget is null then raise exception 'Приглашение недействительно или уже использовано'; end if;
  -- Recheck after acquiring the budget lock: only one invite and two members may be used.
  if not exists(select 1 from public.kontur_invites where budget_id = budget and
    code_hash = encode(sha256(convert_to(p_code,'UTF8')),'hex') and expires_at > now())
    or (select count(*) from public.kontur_members where budget_id = budget) >= 2
    then raise exception 'Приглашение уже использовано'; end if;
  insert into public.kontur_members(user_id,budget_id) values(auth.uid(),budget);
  delete from public.kontur_invites where budget_id = budget;
  return public.kontur_read();
end $$;

revoke all on function public.kontur_record(uuid,jsonb,jsonb,uuid), public.kontur_history(), public.kontur_undo(uuid,bigint), public.kontur_occurs(jsonb,date), public.kontur_authored(jsonb,jsonb), public.kontur_valid_date(text), public.kontur_validate(jsonb), public.kontur_read(),
  public.kontur_create(jsonb), public.kontur_save(bigint,jsonb), public.kontur_invite(), public.kontur_join(text)
  from public, anon, authenticated;
grant execute on function public.kontur_read(), public.kontur_create(jsonb), public.kontur_save(bigint,jsonb),
  public.kontur_invite(), public.kontur_join(text), public.kontur_history(), public.kontur_undo(uuid,bigint) to authenticated;
commit;

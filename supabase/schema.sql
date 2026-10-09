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
    if e ? 'days' then
      if jsonb_typeof(e->'days') <> 'array' then raise exception 'Неверные дни'; end if;
      if jsonb_array_length(e->'days') not between 1 and 31 then raise exception 'Неверные дни'; end if;
      for n in select value from jsonb_array_elements(e->'days') loop
        if jsonb_typeof(n) <> 'number' or n::text !~ '^[0-9]+$' or n::text::int not between 1 and 31
          then raise exception 'Неверный день'; end if;
      end loop;
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
    (e.value - 'author') || case
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

create or replace function public.kontur_create(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare budget uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  perform public.kontur_validate(p_data);
  if exists(select 1 from public.kontur_members where user_id = auth.uid()) then raise exception 'Вы уже подключены к бюджету'; end if;
  insert into public.kontur_budgets(owner_id, data) values(auth.uid(), public.kontur_authored(p_data, null)) returning id into budget;
  insert into public.kontur_members(user_id,budget_id) values(auth.uid(),budget);
  return public.kontur_read();
end $$;

create or replace function public.kontur_save(p_revision bigint, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare budget uuid; affected int;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select budget_id into budget from public.kontur_members where user_id = auth.uid();
  if budget is null then raise insufficient_privilege; end if;
  perform public.kontur_validate(p_data);
  update public.kontur_budgets set data = public.kontur_authored(p_data, data), revision = revision + 1, updated_at = now()
    where id = budget and revision = p_revision;
  get diagnostics affected = row_count;
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

revoke all on function public.kontur_authored(jsonb,jsonb), public.kontur_valid_date(text), public.kontur_validate(jsonb), public.kontur_read(),
  public.kontur_create(jsonb), public.kontur_save(bigint,jsonb), public.kontur_invite(), public.kontur_join(text)
  from public, anon, authenticated;
grant execute on function public.kontur_read(), public.kontur_create(jsonb), public.kontur_save(bigint,jsonb),
  public.kontur_invite(), public.kontur_join(text) to authenticated;
commit;

-- Accès parents privés. Aucune identité réelle, clé ou invitation dans ce fichier.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
-- Nécessaire à l'évaluation des politiques ; aucune table privée n'est accordée.
grant usage on schema private to authenticated;

create table private.fluence_teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table private.fluence_teachers enable row level security;
revoke all on private.fluence_teachers from public, anon, authenticated, service_role;

create function private.fluence_is_teacher() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.fluence_teachers t
    where t.user_id = (select auth.uid()) and t.enabled
  );
$$;
revoke all on function private.fluence_is_teacher() from public, anon, authenticated, service_role;
grant execute on function private.fluence_is_teacher() to authenticated;

create function public.fluence_teacher_enabled() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.fluence_is_teacher(); $$;
revoke all on function public.fluence_teacher_enabled() from public, anon, authenticated, service_role;
grant execute on function public.fluence_teacher_enabled() to authenticated;

create table public.fluence_accesses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  child_ref text not null check (child_ref ~ '^[A-Za-z0-9_-]{1,80}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, owner)
);
create index fluence_accesses_owner_idx on public.fluence_accesses(owner, created_at);

-- Validation aussi au niveau SQL : l'API serveur ne peut stocker une identité
-- de classe, un owner, un résultat de classe ou des champs arbitraires.
create function private.fluence_valid_payload(p jsonb) returns boolean
language plpgsql stable set search_path = ''
as $$
declare b jsonb; f jsonb; n numeric; vus integer[] := '{}'; instant timestamptz;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 32768
     or (p - array['format','version','texte','bilan']) <> '{}'::jsonb
     or not (p ?& array['format','version','texte','bilan'])
     or p->>'format' is distinct from 'fluence/bilan-maison' or p->'version' is distinct from '1'::jsonb
     or jsonb_typeof(p->'texte') <> 'string' or p->>'texte' !~ '^[0-9a-f]{8}$'
     or jsonb_typeof(p->'bilan') <> 'object' then return false; end if;
  b := p->'bilan';
  if (b - array['id','origine','prenom','ep','titre','date','secondes','dernier','fautes','lus','erreurs','mclm']) <> '{}'::jsonb
     or not (b ?& array['id','origine','prenom','ep','titre','date','secondes','dernier','fautes','lus','erreurs','mclm'])
     or jsonb_typeof(b->'id') <> 'string' or b->>'id' !~ '^[A-Za-z0-9_-]{8,80}$'
     or b->>'origine' is distinct from 'maison'
     or jsonb_typeof(b->'prenom') <> 'string' or char_length(b->>'prenom') not between 1 and 80
     or btrim(b->>'prenom') = '' or b->>'prenom' ~ '[<>[:cntrl:]]'
     or jsonb_typeof(b->'titre') <> 'string' or char_length(b->>'titre') not between 1 and 200
     or btrim(b->>'titre') = '' or b->>'titre' ~ '[<>[:cntrl:]]'
     or jsonb_typeof(b->'ep') <> 'string' or b->>'ep' !~ '^[ET][1-9][0-9]{0,2}$'
     or jsonb_typeof(b->'date') <> 'string'
     or b->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$'
     or jsonb_typeof(b->'secondes') <> 'number' or (b->>'secondes')::numeric not between 1 and 60
     or jsonb_typeof(b->'dernier') <> 'number' or (b->>'dernier')::numeric not between 0 and 5000
     or trunc((b->>'dernier')::numeric) <> (b->>'dernier')::numeric
     or jsonb_typeof(b->'lus') <> 'number' or (b->>'lus')::numeric not between 1 and 1000
     or trunc((b->>'lus')::numeric) <> (b->>'lus')::numeric
     or (b->>'lus')::numeric > (b->>'dernier')::numeric + 1
     or jsonb_typeof(b->'erreurs') <> 'number' or (b->>'erreurs')::numeric not between 0 and (b->>'lus')::numeric
     or trunc((b->>'erreurs')::numeric) <> (b->>'erreurs')::numeric
     or jsonb_typeof(b->'mclm') <> 'number'
     or (b->>'mclm')::numeric <> round(((b->>'lus')::numeric - (b->>'erreurs')::numeric) * 60 / (b->>'secondes')::numeric)
     or jsonb_typeof(b->'fautes') <> 'array' or jsonb_array_length(b->'fautes') > 1000
     or jsonb_array_length(b->'fautes') <> (b->>'erreurs')::numeric then return false; end if;
  instant := (b->>'date')::timestamptz;
  if instant < timestamptz '2000-01-01 00:00:00+00' or instant > now() + interval '1 day' then return false; end if;
  for f in select value from jsonb_array_elements(b->'fautes') loop
    if jsonb_typeof(f) <> 'number' then return false; end if;
    n := f::text::numeric;
    if n <> trunc(n) or n < 0 or n > (b->>'dernier')::numeric or n::integer = any(vus) then return false; end if;
    vus := array_append(vus, n::integer);
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function private.fluence_valid_payload(jsonb) from public, anon, authenticated, service_role;

create table public.fluence_results (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  access_id uuid not null,
  client_id text not null check (client_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  payload jsonb not null check (private.fluence_valid_payload(payload)),
  received_at timestamptz not null default now(),
  foreign key (access_id, owner) references public.fluence_accesses(id, owner) on delete cascade,
  unique (access_id, client_id),
  check (client_id = payload->'bilan'->>'id')
);
create index fluence_results_owner_idx on public.fluence_results(owner, received_at, id);
create index fluence_results_quota_idx on public.fluence_results(access_id, received_at);

alter table public.fluence_accesses enable row level security;
alter table public.fluence_results enable row level security;
revoke all on public.fluence_accesses, public.fluence_results from public, anon, authenticated, service_role;
grant select on public.fluence_accesses to authenticated;
grant insert (id, owner, child_ref, token_hash) on public.fluence_accesses to authenticated;
grant update (revoked) on public.fluence_accesses to authenticated;
grant select on public.fluence_results to authenticated;
-- Les bilans reçus sont immuables. Leur suppression administrative se fait
-- après export, sans donner aux familles un moyen de réinitialiser le quota.
create policy fluence_access_select on public.fluence_accesses for select to authenticated
using (owner = (select auth.uid()) and (select private.fluence_is_teacher()));
create policy fluence_access_insert on public.fluence_accesses for insert to authenticated
with check (owner = (select auth.uid()) and (select private.fluence_is_teacher()));
create policy fluence_access_revoke on public.fluence_accesses for update to authenticated
using (owner = (select auth.uid()) and (select private.fluence_is_teacher()))
with check (owner = (select auth.uid()) and (select private.fluence_is_teacher()) and revoked);
create policy fluence_results_select on public.fluence_results for select to authenticated
using (owner = (select auth.uid()) and (select private.fluence_is_teacher()));

-- Point d'entrée exclusivement serveur : verrouillage de l'accès pour rendre
-- quota, idempotence et révocation atomiques, même lors d'envois simultanés.
create function public.fluence_receive_result(p_token_hash text, p_payload jsonb)
returns table(id uuid, received_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare a public.fluence_accesses%rowtype; precedent public.fluence_results%rowtype; client text; total bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise sqlstate 'PT401' using message = 'invalid_access';
  end if;
  select * into a from public.fluence_accesses x where x.token_hash = p_token_hash for update;
  if not found or a.revoked or not exists (select 1 from private.fluence_teachers t where t.user_id = a.owner and t.enabled) then
    raise sqlstate 'PT401' using message = 'invalid_access';
  end if;
  if not private.fluence_valid_payload(p_payload) then
    raise sqlstate 'PT400' using message = 'invalid_payload';
  end if;
  client := p_payload->'bilan'->>'id';
  select * into precedent from public.fluence_results r where r.access_id = a.id and r.client_id = client;
  if found then
    if precedent.payload <> p_payload then raise sqlstate 'PT409' using message = 'idempotency_conflict'; end if;
    return query select precedent.id, precedent.received_at;
    return;
  end if;
  select count(*) into total from public.fluence_results r where r.access_id = a.id and r.received_at >= now() - interval '24 hours';
  if total >= 60 then raise sqlstate 'PT429' using message = 'rate_limited'; end if;
  return query
    insert into public.fluence_results as r (owner, access_id, client_id, payload)
    values (a.owner, a.id, client, p_payload)
    returning r.id, r.received_at;
end;
$$;
revoke all on function public.fluence_receive_result(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.fluence_receive_result(text, jsonb) to service_role;

comment on table public.fluence_accesses is 'Invitations privées : référence locale opaque, seul le hash du secret parent est conservé.';
comment on table public.fluence_results is 'Bilans déclarés par les familles ; lecture réservée à l’enseignante propriétaire autorisée.';
comment on function public.fluence_receive_result(text, jsonb) is 'RPC serveur uniquement, aucun owner ni child_ref reçu du parent.';
commit;

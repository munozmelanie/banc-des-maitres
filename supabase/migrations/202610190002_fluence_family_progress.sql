-- Projection privée des progrès. Aucun nom, email ou secret familial ici.
begin;

create table private.fluence_progress_children (
  owner uuid not null references auth.users(id) on delete cascade,
  child_ref text not null check (child_ref ~ '^[A-Za-z0-9_-]{1,80}$'),
  objectif_manuel integer check (objectif_manuel between 0 and 60000),
  maj bigint not null default -1 check (maj between -1 and 9000000000000000),
  primary key (owner, child_ref)
);
create table private.fluence_progress_items (
  id uuid not null unique default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  child_ref text not null,
  origine text not null check (origine in ('classe','maison')),
  source_id text,
  payload jsonb not null,
  primary key (owner, local_id),
  foreign key (owner, child_ref) references private.fluence_progress_children(owner, child_ref) on delete cascade,
  check ((origine='maison' and source_id is not null) or (origine='classe' and source_id is null))
);
create index fluence_progress_child_idx on private.fluence_progress_items(owner,child_ref);
create index fluence_progress_source_idx on private.fluence_progress_items(owner,child_ref,source_id) where origine='maison';
-- Un ancien tombstone de classe n'a plus de référence élève : l'identité locale
-- est donc supprimée pour son propriétaire, même avant sa première projection.
create table private.fluence_progress_deleted (
  owner uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  primary key (owner,local_id)
);
create table private.fluence_progress_home_deleted (
  owner uuid not null references auth.users(id) on delete cascade,
  child_ref text not null,
  source_id text not null,
  primary key (owner,child_ref,source_id)
);
create table private.fluence_progress_read_limits (
  access_id uuid primary key references public.fluence_accesses(id) on delete cascade,
  minute timestamptz not null,
  compteur integer not null
);
alter table private.fluence_progress_read_limits enable row level security;
revoke all on private.fluence_progress_read_limits from public,anon,authenticated,service_role;
alter table private.fluence_progress_children enable row level security;
alter table private.fluence_progress_items enable row level security;
alter table private.fluence_progress_deleted enable row level security;
alter table private.fluence_progress_home_deleted enable row level security;
revoke all on private.fluence_progress_children,private.fluence_progress_items,private.fluence_progress_deleted,private.fluence_progress_home_deleted from public,anon,authenticated,service_role;

create function private.fluence_valid_projection(p jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare f jsonb; n numeric; vus integer[] := '{}'; instant timestamptz;
begin
  if p is null or jsonb_typeof(p)<>'object'
    or not(p ?& array['id','child_ref','origine','ep','date','mclm','lus','erreurs','secondes'])
    or (p-array['id','child_ref','origine','source_id','ep','date','mclm','lus','erreurs','secondes','dernier','fautes'])<>'{}'::jsonb
    or jsonb_typeof(p->'id')<>'string' or p->>'id' !~ '^[A-Za-z0-9:_.%+-]{1,240}$'
    or jsonb_typeof(p->'child_ref')<>'string' or p->>'child_ref' !~ '^[A-Za-z0-9_-]{1,80}$'
    or p->>'origine' not in ('classe','maison') or p->>'origine' is null
    or (p->>'origine'='classe' and p ? 'source_id')
    or (p->>'origine'='maison' and (not(p ? 'source_id') or jsonb_typeof(p->'source_id')<>'string' or p->>'source_id' !~ '^[A-Za-z0-9_-]{8,80}$'))
    or jsonb_typeof(p->'ep')<>'string' or p->>'ep' !~ '^[ET][1-9][0-9]{0,2}$'
    or jsonb_typeof(p->'date')<>'string' or p->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$'
    or jsonb_typeof(p->'mclm')<>'number' or (p->>'mclm')::numeric not between 0 and 60000
    or trunc((p->>'mclm')::numeric)<>(p->>'mclm')::numeric
    or jsonb_typeof(p->'lus')<>'number' or (p->>'lus')::numeric not between 0 and 1000
    or trunc((p->>'lus')::numeric)<>(p->>'lus')::numeric
    or jsonb_typeof(p->'erreurs')<>'number' or (p->>'erreurs')::numeric not between 0 and (p->>'lus')::numeric
    or trunc((p->>'erreurs')::numeric)<>(p->>'erreurs')::numeric
    or jsonb_typeof(p->'secondes')<>'number' or (p->>'secondes')::numeric not between 0 and 60 then return false; end if;
  instant:=(p->>'date')::timestamptz;
  if instant<timestamptz '2000-01-01 00:00:00+00' or instant>now()+interval '1 day' then return false; end if;
  if p ? 'dernier' then
    if jsonb_typeof(p->'dernier')<>'number' or (p->>'dernier')::numeric not between 0 and 5000
      or trunc((p->>'dernier')::numeric)<>(p->>'dernier')::numeric or (p->>'lus')::numeric>(p->>'dernier')::numeric+1 then return false; end if;
  end if;
  if p ? 'fautes' then
    if jsonb_typeof(p->'fautes')<>'array' or jsonb_array_length(p->'fautes')>1000
      or jsonb_array_length(p->'fautes')<>(p->>'erreurs')::integer then return false; end if;
    for f in select value from jsonb_array_elements(p->'fautes') loop
      if jsonb_typeof(f)<>'number' then return false; end if;
      n:=f::text::numeric;
      if n<>trunc(n) or n<0 or n>5000 or (p ? 'dernier' and n>(p->>'dernier')::integer) or n::integer=any(vus) then return false; end if;
      vus:=array_append(vus,n::integer);
    end loop;
  end if;
  return true;
exception when others then return false;
end;
$$;
revoke all on function private.fluence_valid_projection(jsonb) from public,anon,authenticated,service_role;

create function public.fluence_sync_progress(p_eleves jsonb,p_lectures jsonb,p_suppressions jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare proprietaire uuid := auth.uid(); x jsonb; preced private.fluence_progress_items%rowtype;
begin
  if proprietaire is null or not private.fluence_is_teacher() then raise sqlstate 'PT401' using message='invalid_access'; end if;
  if p_eleves is null or p_lectures is null or p_suppressions is null
    or jsonb_typeof(p_eleves)<>'array' or jsonb_typeof(p_lectures)<>'array' or jsonb_typeof(p_suppressions)<>'array'
    or octet_length(jsonb_build_object('p_eleves',p_eleves,'p_lectures',p_lectures,'p_suppressions',p_suppressions)::text)>32768 then
    raise sqlstate 'PT400' using message='invalid_payload'; end if;
  if jsonb_array_length(p_eleves)>200 or jsonb_array_length(p_lectures)>200 or jsonb_array_length(p_suppressions)>200 then raise sqlstate 'PT400' using message='invalid_payload'; end if;
  -- Sérialiser les lots du même compte sans bloquer les autres enseignantes.
  perform 1 from private.fluence_teachers where user_id=proprietaire and enabled for update;
  if not found then raise sqlstate 'PT401' using message='invalid_access'; end if;
  for x in select value from jsonb_array_elements(p_eleves) loop
    if jsonb_typeof(x)<>'object' or not(x ?& array['child_ref','objectif_manuel','maj']) or (x-array['child_ref','objectif_manuel','maj'])<>'{}'::jsonb
      or jsonb_typeof(x->'child_ref')<>'string' or x->>'child_ref' !~ '^[A-Za-z0-9_-]{1,80}$'
      or jsonb_typeof(x->'maj')<>'number' or (x->>'maj')::numeric not between 0 and 9000000000000000 or trunc((x->>'maj')::numeric)<>(x->>'maj')::numeric
      or (x->'objectif_manuel'<>'null'::jsonb and (jsonb_typeof(x->'objectif_manuel')<>'number' or (x->>'objectif_manuel')::numeric not between 0 and 60000 or trunc((x->>'objectif_manuel')::numeric)<>(x->>'objectif_manuel')::numeric)) then
      raise sqlstate 'PT400' using message='invalid_payload'; end if;
    insert into private.fluence_progress_children as c(owner,child_ref,objectif_manuel,maj)
      values(proprietaire,x->>'child_ref',(x->>'objectif_manuel')::integer,(x->>'maj')::bigint)
      on conflict(owner,child_ref) do update set objectif_manuel=excluded.objectif_manuel,maj=excluded.maj where excluded.maj>c.maj;
  end loop;
  for x in select value from jsonb_array_elements(p_suppressions) loop
    if jsonb_typeof(x)<>'object' or not(x ? 'id') or jsonb_typeof(x->'id')<>'string' or x->>'id' !~ '^[A-Za-z0-9:_.%+-]{1,240}$'
      or (x-array['id','child_ref','source_id'])<>'{}'::jsonb or (x ? 'child_ref')<>(x ? 'source_id') then raise sqlstate 'PT400' using message='invalid_payload'; end if;
    if x ? 'source_id' then
      if jsonb_typeof(x->'child_ref')<>'string' or x->>'child_ref' !~ '^[A-Za-z0-9_-]{1,80}$'
        or jsonb_typeof(x->'source_id')<>'string' or x->>'source_id' !~ '^[A-Za-z0-9_-]{8,80}$' then raise sqlstate 'PT400' using message='invalid_payload'; end if;
      insert into private.fluence_progress_home_deleted(owner,child_ref,source_id) values(proprietaire,x->>'child_ref',x->>'source_id') on conflict do nothing;
    end if;
    insert into private.fluence_progress_deleted(owner,local_id) values(proprietaire,x->>'id') on conflict do nothing;
  end loop;
  for x in select value from jsonb_array_elements(p_lectures) loop
    if not private.fluence_valid_projection(x) then raise sqlstate 'PT400' using message='invalid_payload'; end if;
    insert into private.fluence_progress_children(owner,child_ref) values(proprietaire,x->>'child_ref') on conflict do nothing;
    select * into preced from private.fluence_progress_items where owner=proprietaire and local_id=x->>'id';
    if found then
      if preced.payload<>x then raise sqlstate 'PT409' using message='idempotency_conflict'; end if;
    else
      insert into private.fluence_progress_items(owner,local_id,child_ref,origine,source_id,payload)
        values(proprietaire,x->>'id',x->>'child_ref',x->>'origine',x->>'source_id',x);
    end if;
  end loop;
  return jsonb_build_object('ok',true);
exception when invalid_text_representation or numeric_value_out_of_range then raise sqlstate 'PT400' using message='invalid_payload';
end;
$$;
revoke all on function public.fluence_sync_progress(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fluence_sync_progress(jsonb,jsonb,jsonb) to authenticated;

-- Liste fermée des champs retournables, sans identifiant local de classe.
create function private.fluence_visible_progress(p_owner uuid,p_child text)
returns table(id uuid,instant timestamptz,item jsonb,cle_tri text)
language sql stable security definer set search_path = '' as $$
  with brutes as (
    select i.id, i.origine||':'||coalesce(i.source_id,i.local_id) as cle,1 as priorite,i.payload as p,i.local_id as tri
    from private.fluence_progress_items i
    where i.owner=p_owner and i.child_ref=p_child
      and not exists(select 1 from private.fluence_progress_deleted d where d.owner=i.owner and d.local_id=i.local_id)
      and not exists(select 1 from private.fluence_progress_home_deleted d where d.owner=i.owner and d.child_ref=i.child_ref and d.source_id=i.source_id)
    union all
    select r.id,'maison:'||r.client_id,0,r.payload->'bilan','maison:'||p_child||':'||r.client_id
    from public.fluence_results r join public.fluence_accesses a on a.id=r.access_id and a.owner=r.owner
    where a.owner=p_owner and a.child_ref=p_child
      and not exists(select 1 from private.fluence_progress_home_deleted d where d.owner=p_owner and d.child_ref=p_child and d.source_id=r.client_id)
      and not exists(select 1 from private.fluence_progress_items i join private.fluence_progress_deleted d on d.owner=i.owner and d.local_id=i.local_id
        where i.owner=p_owner and i.child_ref=p_child and i.origine='maison' and i.source_id=r.client_id)
  ), uniques as (select distinct on (cle) * from brutes order by cle,priorite,id)
  select u.id,(p->>'date')::timestamptz,jsonb_strip_nulls(jsonb_build_object(
    'id',u.id,'origine',p->>'origine','ep',p->>'ep','date',p->>'date',
    'mclm',(p->>'mclm')::integer,'lus',(p->>'lus')::integer,'erreurs',(p->>'erreurs')::integer,'secondes',(p->>'secondes')::numeric,
    'dernier',p->'dernier','fautes',p->'fautes')),u.tri
  -- Catalogue publié : ajouter ici les futurs épisodes en même temps que le
  -- contenu de l'application. Les brutes hors catalogue restent conservées.
  from uniques u where p->>'ep' ~ '^(E[1-7]|T[1-6])$';
$$;
revoke all on function private.fluence_visible_progress(uuid,text) from public,anon,authenticated,service_role;

create function public.fluence_read_progress(p_token_hash text,p_cursor text default null,p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare usages integer; a public.fluence_accesses%rowtype; cible integer; mode text; debut numeric; lectures jsonb; suivant text; curseur_date timestamptz; curseur_id uuid; dernier record; total integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise sqlstate 'PT401' using message='invalid_access'; end if;
  select * into a from public.fluence_accesses x where x.token_hash=p_token_hash;
  if not found or a.revoked or not exists(select 1 from private.fluence_teachers t where t.user_id=a.owner and t.enabled) then raise sqlstate 'PT401' using message='invalid_access'; end if;
  if p_limit is null or p_limit not between 1 and 200 or (p_cursor is not null and (length(p_cursor)>100 or p_cursor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z\|[0-9a-f-]{36}$')) then raise sqlstate 'PT400' using message='invalid_payload'; end if;
  if p_cursor is not null then
    begin curseur_date:=split_part(p_cursor,'|',1)::timestamptz;curseur_id:=split_part(p_cursor,'|',2)::uuid;
    exception when others then raise sqlstate 'PT400' using message='invalid_payload'; end;
  end if;
  insert into private.fluence_progress_read_limits as l(access_id,minute,compteur)
    values(a.id,date_trunc('minute',now()),1)
    on conflict(access_id) do update set minute=excluded.minute,compteur=case when l.minute=excluded.minute then l.compteur+1 else 1 end
    returning compteur into usages;
  if usages>120 then raise sqlstate 'PT429' using message='rate_limited'; end if;
  select c.objectif_manuel into cible from private.fluence_progress_children c where c.owner=a.owner and c.child_ref=a.child_ref;
  if cible is not null then mode:='manuel';
  else
    select (r.item->>'mclm')::numeric into debut from private.fluence_visible_progress(a.owner,a.child_ref) r order by r.instant,r.cle_tri collate "C" limit 1;
    if found then cible:=debut+greatest(5,ceil(debut/10));mode:='automatique';else mode:='attente';end if;
  end if;
  with page as (select r.* from private.fluence_visible_progress(a.owner,a.child_ref) r
    where p_cursor is null or (r.instant,r.id)>(curseur_date,curseur_id) order by r.instant,r.id limit p_limit)
  select coalesce(jsonb_agg(item order by instant,id),'[]'::jsonb),count(*) into lectures,total from page;
  suivant:=null;
  if total=p_limit then
    select r.* into dernier from private.fluence_visible_progress(a.owner,a.child_ref) r
      where p_cursor is null or (r.instant,r.id)>(curseur_date,curseur_id) order by r.instant,r.id offset p_limit-1 limit 1;
    if exists(select 1 from private.fluence_visible_progress(a.owner,a.child_ref) r where (r.instant,r.id)>(dernier.instant,dernier.id)) then
      suivant:=to_char(dernier.instant at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')||'|'||dernier.id::text;
    end if;
  end if;
  return jsonb_build_object('version',1,'objectif',jsonb_build_object('valeur',cible,'mode',mode),'lectures',lectures,'suivant',suivant);
end;
$$;
revoke all on function public.fluence_read_progress(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.fluence_read_progress(text,text,integer) to service_role;

comment on function public.fluence_sync_progress(jsonb,jsonb,jsonb) is 'Projection additive par l’enseignante propriétaire ; suppressions explicites définitives, aucune identité élève retournée.';
comment on function public.fluence_read_progress(text,text,integer) is 'Lecture familiale via secret hashé actif uniquement, un seul enfant, champs minimaux, pagination bornée.';
commit;

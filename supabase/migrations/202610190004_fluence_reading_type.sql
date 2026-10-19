-- Type de lecture facultatif, enregistré lors du départ et jamais rétroattribué.
-- Aucune réécriture des historiques, aucun changement de calcul ou de droits.
-- Edge ne livre ce champ qu'aux clients avecTypeLecture:true (anciens clients stricts).
begin;

create or replace function private.fluence_valid_payload(p jsonb) returns boolean
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
  if (b - array['id','origine','prenom','ep','titre','date','secondes','dernier','fautes','lus','erreurs','mclm','typeLecture']) <> '{}'::jsonb
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
  if b ? 'typeLecture' and (jsonb_typeof(b->'typeLecture')<>'string' or b->>'typeLecture' not in ('entrainement','defi')) then return false; end if;
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

create or replace function private.fluence_valid_projection(p jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare f jsonb; n numeric; vus integer[] := '{}'; instant timestamptz;
begin
  if p is null or jsonb_typeof(p)<>'object'
    or not(p ?& array['id','child_ref','origine','ep','date','mclm','lus','erreurs','secondes'])
    or (p-array['id','child_ref','origine','source_id','ep','date','mclm','lus','erreurs','secondes','dernier','fautes','typeLecture'])<>'{}'::jsonb
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
  if p ? 'typeLecture' and (jsonb_typeof(p->'typeLecture')<>'string' or p->>'typeLecture' not in ('entrainement','defi')) then return false; end if;
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

create or replace function public.fluence_sync_progress(p_eleves jsonb,p_lectures jsonb,p_suppressions jsonb) returns jsonb
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
      if preced.payload<>x then
        -- Réémission par un ancien client : garder le type déjà enregistré.
        if preced.payload ? 'typeLecture' and not(x ? 'typeLecture') and (preced.payload-'typeLecture')=x then
          null;
        -- Un ancien import a pu perdre le champ. Seul le bilan brut du même
        -- enfant/source peut prouver un enrichissement, sans changer de mesure.
        elsif not(preced.payload ? 'typeLecture') and x ? 'typeLecture' and (x-'typeLecture')=preced.payload and x->>'origine'='maison'
          and exists(select 1 from public.fluence_results r join public.fluence_accesses a on a.id=r.access_id and a.owner=r.owner
            where r.owner=proprietaire and a.child_ref=x->>'child_ref' and r.client_id=x->>'source_id'
              and r.payload#>'{bilan,typeLecture}'=x->'typeLecture'
              and (r.payload#>>'{bilan,date}')::timestamptz=(x->>'date')::timestamptz
              and ((r.payload->'bilan')-array['id','origine','prenom','titre','date','fautes','typeLecture'])=(x-array['id','child_ref','origine','source_id','date','fautes','typeLecture'])
              and array(select jsonb_array_elements_text(r.payload#>'{bilan,fautes}')::integer order by 1)=array(select jsonb_array_elements_text(x->'fautes')::integer order by 1)) then
          update private.fluence_progress_items set payload=x where owner=proprietaire and local_id=x->>'id';
        else raise sqlstate 'PT409' using message='idempotency_conflict'; end if;
      end if;
    else
      insert into private.fluence_progress_items(owner,local_id,child_ref,origine,source_id,payload)
        values(proprietaire,x->>'id',x->>'child_ref',x->>'origine',x->>'source_id',x);
    end if;
  end loop;
  return jsonb_build_object('ok',true);
exception when invalid_text_representation or numeric_value_out_of_range then raise sqlstate 'PT400' using message='invalid_payload';
end;
$$;

create or replace function private.fluence_visible_progress(p_owner uuid,p_child text)
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
    'dernier',p->'dernier','fautes',p->'fautes','typeLecture',p->'typeLecture')),u.tri
  -- Catalogue publié : ajouter ici les futurs épisodes en même temps que le
  -- contenu de l'application. Les brutes hors catalogue restent conservées.
  from uniques u where p->>'ep' ~ '^(E[1-7]|T[1-6])$';
$$;

revoke all on function private.fluence_valid_payload(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fluence_valid_projection(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.fluence_visible_progress(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.fluence_sync_progress(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fluence_sync_progress(jsonb,jsonb,jsonb) to authenticated;
commit;

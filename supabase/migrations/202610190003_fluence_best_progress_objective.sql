-- L’objectif automatique suit le meilleur score actif classe + maison.
-- Aucun résultat, objectif manuel ou droit d’accès n’est modifié.
-- Les tombstones continuent de retirer une lecture du calcul.
begin;

create or replace function public.fluence_read_progress(p_token_hash text,p_cursor text default null,p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare usages integer; a public.fluence_accesses%rowtype; cible integer; mode text; meilleur numeric; lectures jsonb; suivant text; curseur_date timestamptz; curseur_id uuid; dernier record; total integer;
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
    select (r.item->>'mclm')::numeric into meilleur from private.fluence_visible_progress(a.owner,a.child_ref) r order by (r.item->>'mclm')::numeric desc,r.instant,r.cle_tri collate "C" limit 1;
    if found then cible:=meilleur+greatest(5,ceil(meilleur/10));mode:='automatique';else mode:='attente';end if;
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

comment on function public.fluence_read_progress(text,text,integer) is 'Lecture familiale privée, objectif manuel prioritaire sinon meilleur score actif + max(5, ceil(score/10)), pagination bornée.';
commit;

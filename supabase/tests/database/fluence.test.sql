-- Données entièrement fictives ; chaque exécution est annulée.
begin;
create extension if not exists pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
 ('11111111-1111-4111-8111-111111111111','teacher-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','teacher-b@example.invalid'),
 ('33333333-3333-4333-8333-333333333333','parent@example.invalid'),
 ('44444444-4444-4444-8444-444444444444','disabled@example.invalid');
insert into private.fluence_teachers(user_id, enabled) values
 ('11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222222',true),
 ('44444444-4444-4444-8444-444444444444',false);
insert into public.fluence_accesses(id, owner, child_ref, token_hash) values
 ('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','test-child-a',repeat('a',64)),
 ('bbbbbbbb-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','test-child-b',repeat('b',64)),
 ('cccccccc-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','test-quota',repeat('c',64)),
 ('dddddddd-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444','test-disabled',repeat('d',64));
create function pg_temp.paquet(client text) returns jsonb language sql stable as $$
 select jsonb_build_object('format','fluence/bilan-maison','version',1,'texte','1234abcd','bilan',jsonb_build_object(
 'id',client,'origine','maison','prenom','Test Parent','ep','T1','titre','Texte fictif',
 'date',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'secondes',60,'dernier',39,'fautes',jsonb_build_array(3),'lus',40,'erreurs',1,'mclm',39));
$$;
select * from public.fluence_receive_result(repeat('a',64),pg_temp.paquet('synthetic-a-01'));
select * from public.fluence_receive_result(repeat('b',64),pg_temp.paquet('synthetic-b-01'));

select ok((select relrowsecurity from pg_class where oid='public.fluence_accesses'::regclass),'RLS des invitations activée');
select ok((select relrowsecurity from pg_class where oid='public.fluence_results'::regclass),'RLS des bilans activée');
select ok((select relrowsecurity from pg_class where oid='private.fluence_teachers'::regclass),'allowlist protégée aussi par RLS');
select ok(not has_table_privilege('anon','public.fluence_accesses','select'),'aucun grant invitations anon');
select ok(not has_table_privilege('anon','public.fluence_results','select'),'aucun grant bilans anon');
select ok(not has_table_privilege('authenticated','private.fluence_teachers','select'),'allowlist non lisible par les clients');
select ok(not has_column_privilege('authenticated','public.fluence_accesses','owner','update'),'owner immuable côté client');
select ok(not has_column_privilege('authenticated','public.fluence_accesses','created_at','insert'),'date invitation fixée par serveur');
select ok(not has_table_privilege('authenticated','public.fluence_results','insert'),'aucune insertion directe de bilan client');
select ok(not has_table_privilege('service_role','public.fluence_results','select'),'service Edge limité à la RPC');
select ok(not has_function_privilege('anon','public.fluence_receive_result(text,jsonb)','execute'),'RPC interdite à anon');
select ok(not has_function_privilege('authenticated','public.fluence_receive_result(text,jsonb)','execute'),'RPC interdite à authenticated');
select ok(has_function_privilege('service_role','public.fluence_receive_result(text,jsonb)','execute'),'RPC accordée au serveur');

set local role anon;
select throws_ok('select * from public.fluence_accesses','42501',null,'anon ne lit aucune invitation');
select throws_ok('select * from public.fluence_results','42501',null,'anon ne lit aucun bilan');
select throws_ok('select * from private.fluence_teachers','42501',null,'anon ne lit pas l’allowlist');
select throws_ok('select public.fluence_teacher_enabled()','42501',null,'anon ne sonde pas les comptes enseignants');
select throws_ok($$select * from public.fluence_receive_result(repeat('a',64),pg_temp.paquet('parent-forged'))$$,'42501',null,'parent ne contourne pas Edge avec la RPC');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select is(public.fluence_teacher_enabled(),false,'un compte non autorisé n’est pas enseignant');
select is((select count(*) from public.fluence_accesses),0::bigint,'compte parent authentifié ne voit aucun accès');
select is((select count(*) from public.fluence_results),0::bigint,'compte parent authentifié ne voit aucun résultat');
select throws_ok($$insert into public.fluence_accesses(child_ref,token_hash) values('test-forged',repeat('e',64))$$,'42501',null,'pas de création d’invitation sans allowlist');
select throws_ok($$insert into private.fluence_teachers(user_id) values(auth.uid())$$,'42501',null,'pas d’auto inscription dans l’allowlist');
select throws_ok($$select * from public.fluence_receive_result(repeat('a',64),pg_temp.paquet('parent-forged'))$$,'42501',null,'JWT parent ne donne pas accès à la RPC serveur');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select is(public.fluence_teacher_enabled(),true,'enseignant A autorisé');
select is((select count(*) from public.fluence_accesses),2::bigint,'A ne voit que ses deux invitations');
select is((select count(*) from public.fluence_results),1::bigint,'A ne voit que son bilan');
select is((select count(*) from public.fluence_results where owner='22222222-2222-4222-8222-222222222222'),0::bigint,'A ne lit pas les bilans de B');
select lives_ok($$insert into public.fluence_accesses(id,child_ref,token_hash) values('eeeeeeee-5555-4555-8555-555555555555','test-new',repeat('e',64))$$,'A crée un accès propriétaire par défaut');
select throws_ok($$insert into public.fluence_accesses(owner,child_ref,token_hash) values('22222222-2222-4222-8222-222222222222','test-spoof',repeat('f',64))$$,'42501',null,'A ne peut attribuer un accès à B');
select throws_ok($$update public.fluence_accesses set owner='22222222-2222-4222-8222-222222222222' where token_hash=repeat('a',64)$$,'42501',null,'A ne transfère pas owner');
select throws_ok($$update public.fluence_accesses set child_ref='test-reassigned' where token_hash=repeat('a',64)$$,'42501',null,'association enfant immuable');
select throws_ok($$update public.fluence_accesses set created_at=now()-interval '1 day' where token_hash=repeat('a',64)$$,'42501',null,'date serveur immuable');
select throws_ok($$update public.fluence_accesses set token_hash=repeat('f',64) where token_hash=repeat('a',64)$$,'42501',null,'hash invitation immuable');
select results_eq($$with changed as (update public.fluence_accesses set revoked=true where owner='22222222-2222-4222-8222-222222222222' returning id) select count(*) from changed$$,array[0::bigint],'A ne révoque pas B');
select lives_ok($$update public.fluence_accesses set revoked=true where token_hash=repeat('e',64)$$,'A révoque son accès');
select throws_ok($$update public.fluence_accesses set revoked=false where token_hash=repeat('e',64)$$,'42501',null,'un accès révoqué ne se réactive pas');
select throws_ok($$insert into public.fluence_results(owner,access_id,client_id,payload) values(auth.uid(),'aaaaaaaa-1111-4111-8111-111111111111','forged-result',pg_temp.paquet('forged-result'))$$,'42501',null,'enseignant ne forge pas un résultat famille par REST');
select throws_ok($$update public.fluence_results set received_at=now()$$,'42501',null,'timestamp résultat non modifiable');
select throws_ok($$delete from public.fluence_results$$,'42501',null,'suppression locale ne réinitialise pas le quota serveur');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is(public.fluence_teacher_enabled(),true,'enseignant B autorisé');
select is((select count(*) from public.fluence_accesses),1::bigint,'B voit uniquement son invitation');
select is((select count(*) from public.fluence_results),1::bigint,'B voit uniquement son résultat');
select is((select count(*) from public.fluence_results where owner='11111111-1111-4111-8111-111111111111'),0::bigint,'B ne lit pas les bilans de A');
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select is(public.fluence_teacher_enabled(),false,'enseignant désactivé refusé');
select is((select count(*) from public.fluence_accesses),0::bigint,'enseignant désactivé ne lit plus ses accès');
select is((select count(*) from public.fluence_results),0::bigint,'enseignant désactivé ne lit plus ses bilans');
reset role;

select ok(private.fluence_valid_payload(pg_temp.paquet('valid-packet')),'paquet synthétique valide');
select ok(not private.fluence_valid_payload(pg_temp.paquet('valid-packet')||'{"owner":"forged"}'),'owner externe rejeté');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{bilan,child_ref}','"test-other"')),'child_ref externe rejeté');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{format}','null')),'format null rejeté');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{bilan,origine}','null')),'origine null rejetée');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{bilan,secondes}','0')),'durée nulle rejetée');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{bilan,mclm}','9999')),'score incohérent rejeté');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{bilan,prenom}','"<script>"')),'HTML rejeté');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{bilan,fautes}','[3,3]')),'erreurs répétées rejetées');
select ok(not private.fluence_valid_payload(jsonb_set(pg_temp.paquet('valid-packet'),'{bilan,prenom}',to_jsonb(repeat('x',81)))),'prénom borné');

set local role service_role;
select lives_ok($$select * from public.fluence_receive_result(repeat('a',64),pg_temp.paquet('synthetic-a-01'))$$,'réessai identique accepté');
select throws_ok($$select * from public.fluence_receive_result(repeat('a',64),jsonb_set(pg_temp.paquet('synthetic-a-01'),'{bilan,titre}','"Autre titre"'))$$,'PT409',null,'même identifiant avec autre contenu refusé');
select throws_ok($$select * from public.fluence_receive_result('court',pg_temp.paquet('invalid-hash'))$$,'PT401',null,'hash invalide refusé');
select throws_ok($$select * from public.fluence_receive_result(repeat('f',64),pg_temp.paquet('unknown-token'))$$,'PT401',null,'invitation inconnue refusée');
select throws_ok($$select * from public.fluence_receive_result(repeat('e',64),pg_temp.paquet('revoked-token'))$$,'PT401',null,'invitation révoquée refuse les envois');
select throws_ok($$select * from public.fluence_receive_result(repeat('d',64),pg_temp.paquet('disabled-token'))$$,'PT401',null,'enseignant désactivé bloque les invitations existantes');
select throws_ok($$select * from public.fluence_receive_result(repeat('a',64),pg_temp.paquet('invalid-payload')||'{"owner":"forged"}')$$,'PT400',null,'validation avant insertion RPC');
select lives_ok($$select * from public.fluence_receive_result(repeat('a',64),pg_temp.paquet('new-private-result'))$$,'service enregistre un nouveau bilan');
reset role;
select is((select count(*) from public.fluence_results where access_id='aaaaaaaa-1111-4111-8111-111111111111'),2::bigint,'le rejeu n’a créé aucun doublon');
select is((select owner from public.fluence_results where client_id='new-private-result'),'11111111-1111-4111-8111-111111111111'::uuid,'owner déduit de l’invitation');
select is((select access_id from public.fluence_results where client_id='new-private-result'),'aaaaaaaa-1111-4111-8111-111111111111'::uuid,'access_id déduit de l’invitation');
select throws_ok($$insert into public.fluence_results(owner,access_id,client_id,payload) values('22222222-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111','bad-owner-result',pg_temp.paquet('bad-owner-result'))$$,'23503',null,'contrainte relationnelle refuse propriétaire incohérent');

-- Le verrou FOR UPDATE de la RPC sérialise ce compteur par invitation.
do $$ begin for i in 1..60 loop perform public.fluence_receive_result(repeat('c',64),pg_temp.paquet('quota-test-'||i)); end loop; end $$;
set local role service_role;
select throws_ok($$select * from public.fluence_receive_result(repeat('c',64),pg_temp.paquet('quota-test-61'))$$,'PT429',null,'61e nouveau résultat en 24h refusé');
select lives_ok($$select * from public.fluence_receive_result(repeat('c',64),pg_temp.paquet('quota-test-1'))$$,'rejeu identique possible même au quota');
reset role;
select is((select count(*) from public.fluence_results where access_id='cccccccc-3333-4333-8333-333333333333'),60::bigint,'quota exact sans doublon');
update public.fluence_results set received_at=now()-interval '25 hours' where access_id='cccccccc-3333-4333-8333-333333333333';
set local role service_role;
select lives_ok($$select * from public.fluence_receive_result(repeat('c',64),pg_temp.paquet('quota-test-61'))$$,'quota glissant libéré après 24h');
reset role;
update public.fluence_accesses set revoked=true where token_hash=repeat('c',64);
set local role service_role;
select throws_ok($$select * from public.fluence_receive_result(repeat('c',64),pg_temp.paquet('quota-test-1'))$$,'PT401',null,'révocation bloque même un rejeu ancien');
reset role;

select * from finish();
rollback;

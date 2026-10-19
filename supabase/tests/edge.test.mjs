// Teste le handler réel sans réseau : la requête PostgreSQL est interceptée.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHandler, validePaquet } from '../functions/fluence-bilan/index.ts';
const token = 'a'.repeat(64), origin = 'https://munozmelanie.github.io';
const now = Date.UTC(2026,9,19,12,0,0);
const paquet = {format:'fluence/bilan-maison',version:1,texte:'1234abcd',bilan:{id:'test-parent-001',origine:'maison',prenom:'Test Parent',ep:'T1',titre:'Texte fictif',date:'2026-10-19T10:00:00.000Z',secondes:60,dernier:39,fautes:[3],lus:40,erreurs:1,mclm:39}};
const receipt = {id:'11111111-1111-4111-8111-111111111111',received_at:'2026-10-19T12:00:00.000Z'};
let count=0;
const check=(test, label)=>{assert.ok(test,label);count++;console.log('ok '+count+' - '+label);};
const clone=v=>JSON.parse(JSON.stringify(v));
const config={url:'https://project.example.invalid',serviceKey:'synthetic-server-only',allowedOrigins:[origin],now:()=>now};
let calls=[];
const handler=createHandler({...config,fetcher:async(url,options)=>{calls.push({url,options});return Response.json([{...receipt,prenom:'must-not-leak',payload:paquet,owner:'must-not-leak'}]);}});
function request(body={token,paquet},options={}) {
  return new Request('https://edge.example.invalid/functions/v1/fluence-bilan',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body),...options});
}
async function status(req,expected,label,h=handler){const r=await h(req);check(r.status===expected,label);return r;}
let response=await status(request(),200,'paquet valide reçu');
check(JSON.stringify(await response.json())===JSON.stringify(receipt),'réponse limitée à id/received_at, sans élève ni résultat');
check(response.headers.get('cache-control')==='no-store','réponse non mise en cache');
check(response.headers.get('access-control-allow-origin')===origin,'CORS autorise le site prévu');
const sent=JSON.parse(calls[0].options.body);
check(sent.p_token_hash===createHash('sha256').update(token,'utf8').digest('hex'),'SHA-256 calculé sur les caractères UTF8 du secret hex64');
check(!calls[0].options.body.includes(token) && Object.keys(sent).sort().join(',')==='p_payload,p_token_hash','secret jamais envoyé à PostgreSQL, aucune identité owner/child_ref');
check(calls[0].options.headers.Authorization==='Bearer synthetic-server-only','requête serveur utilise uniquement sa clé');
check(calls[0].url.endsWith('/rest/v1/rpc/fluence_receive_result'),'écriture via RPC atomique uniquement');
await status(request(undefined,{method:'GET',body:undefined}),405,'aucune route de lecture GET');
await status(request(undefined,{method:'DELETE',body:undefined}),405,'aucune route DELETE');
response=await status(request(undefined,{method:'OPTIONS',body:undefined}),204,'prévol CORS sans identifiant requis');
check(!response.headers.has('access-control-allow-credentials'),'aucun cookie parent nécessaire');
response=await status(request(undefined,{headers:{'content-type':'application/json',origin:'https://other.example.invalid'}}),403,'origine étrangère refusée');
check(!response.headers.has('access-control-allow-origin'),'origine refusée non reflétée');
await status(request(undefined,{headers:{'content-type':'text/plain',origin}}),415,'type JSON imposé');
await status(request(undefined,{body:'{' }),400,'JSON mal formé refusé');
await status(request(undefined,{headers:{'content-type':'application/json','content-length':'32769',origin}}),413,'taille annoncée bornée');
await status(request(undefined,{body:' '.repeat(32769)}),413,'taille réelle bornée même sans Content-Length');
await status(request({token:'a'.repeat(63),paquet}),401,'secret trop court refusé');
await status(request({token:'A'.repeat(64),paquet}),401,'secret non canonique refusé');
await status(request({token,paquet,owner:'forged'}),400,'owner au niveau requête refusé');
await status(request({token,paquet,child_ref:'forged'}),400,'child_ref au niveau requête refusé');
await status(request({token}),400,'paquet manquant refusé');
const before=calls.length;
for (const [field,value,label] of [
 ['origine','classe','résultat de classe refusé'],['origine',null,'origine null refusée'],
 ['id','x','identifiant trop court refusé'],['id','x'.repeat(81),'identifiant borné'],
 ['prenom','<script>','HTML refusé'],['prenom','x'.repeat(81),'prénom borné'],['prenom',' ','prénom vide refusé'],['prenom','\ud800','Unicode isolé refusé'],
 ['titre','x'.repeat(201),'titre borné'],['ep','unknown','identifiant texte refusé'],
 ['date','2026-02-31T10:00:00.000Z','date non réelle refusée'],['date','2100-01-01T00:00:00Z','date future refusée'],
 ['date','1999-01-01T00:00:00Z','date trop ancienne refusée'],
 ['secondes',0,'durée nulle refusée'],['secondes',61,'durée maximale60s'],
 ['dernier',5001,'indices bornés'],['dernier',1.5,'indices entiers'],['lus',1001,'mots lus bornés'],
 ['lus',41,'mots lus ne dépassent pas le dernier indice'],['erreurs',41,'erreurs ne dépassent pas mots lus'],
 ['fautes',[40],'erreur après dernier mot refusée'],['fautes',[3,3],'doublons erreurs refusés'],
 ['fautes',[],'nombre erreurs cohérent'],['mclm',9999,'score calculé vérifié'],['owner','forged','owner dans bilan refusé'],
 ['child_ref','forged','child_ref dans bilan refusé']
]) { const p=clone(paquet);p.bilan[field]=value;await status(request({token,paquet:p}),400,label); }
for(const p of [null,[],{...paquet,format:null},{...paquet,version:2},{...paquet,texte:'invalid'},{...paquet,owner:'forged'}]) await status(request({token,paquet:p}),400,'enveloppe paquet fermée et valide');
check(calls.length===before,'aucune requête base après échec validation');
for(const [code,http] of [['PT400',400],['PT401',401],['PT409',409],['PT429',429]]){
 const h=createHandler({...config,fetcher:async()=>Response.json({code,message:'must-not-leak',details:paquet},{status:http})});
 const r=await status(request(),http,'code SQL '+code+' correctement traduit',h);
 const json=await r.json();check(Object.keys(json).join(',')==='error'&&!JSON.stringify(json).includes('must-not-leak'),'erreur SQL ne divulgue aucun détail');
 if(http===429)check(r.headers.get('retry-after')==='86400','quota fournit délai de réessai');
}
await status(request(),503,'absence de configuration échoue fermée',createHandler({...config,serviceKey:''}));
await status(request(),503,'erreur réseau ne confirme aucun succès',createHandler({...config,fetcher:async()=>{throw new Error('private info');}}));
await status(request(),503,'erreur base non prévue masquée',createHandler({...config,fetcher:async()=>Response.json({message:'private info'},{status:500})}));
await status(request(),503,'reçu base malformé refusé',createHandler({...config,fetcher:async()=>Response.json([{id:'x'}])}));
check(validePaquet(paquet,now).bilan.mclm===39,'normalisation conserve le score vérifié');
console.log(count+' contrôles Edge réussis (aucun appel réseau réel).');

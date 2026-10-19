// Handler réel, fetch entièrement intercepté ; aucun compte ni réseau réel.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createHandler,valideProgression} from '../functions/fluence-bilan/index.ts';
const token='a'.repeat(64),origin='https://munozmelanie.github.io';
const id='11111111-1111-4111-8111-111111111111';
const cursor='2025-01-02T10:00:00.000000Z|'+id;
const row={id,origine:'classe',ep:'T1',date:'2025-01-02T10:00:00.000Z',mclm:50,lus:50,erreurs:0,secondes:60};
const page={version:1,objectif:{valeur:55,mode:'automatique'},lectures:[row],suivant:null};
const config={url:'https://project.example.invalid',serviceKey:'synthetic-server-only',allowedOrigins:[origin]};
let count=0,calls=[];
const check=(condition,label)=>{assert.ok(condition,label);console.log('ok '+(++count)+' - '+label);};
const clone=x=>JSON.parse(JSON.stringify(x));
const request=(body={token,action:'progression'})=>new Request('https://edge.example.invalid/functions/v1/fluence-bilan',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
const handler=createHandler({...config,fetcher:async(url,options)=>{calls.push({url,options});return Response.json({...page,owner:'private-owner',email:'private@example.invalid',child_ref:'private-child',lectures:[{...row,source_id:'private-source',prenom:'private-name'}]});}});
async function status(body,code,label,h=handler){const r=await h(request(body));check(r.status===code,label);return r;}
let r=await status(undefined,200,'lecture de progression acceptée');
check(JSON.stringify(await r.json())===JSON.stringify(page),'réponse reconstruite sans owner, email, enfant, source ni prénom');
check(r.headers.get('cache-control')==='no-store','progression jamais mise en cache');
check(r.headers.get('access-control-allow-origin')===origin,'CORS attendu');
check(calls[0].url.endsWith('/rest/v1/rpc/fluence_read_progress'),'route de lecture SQL dédiée');
let sent=JSON.parse(calls[0].options.body);
check(sent.p_token_hash===createHash('sha256').update(token).digest('hex'),'hash UTF8 du secret envoyé à SQL');
check(!calls[0].options.body.includes(token)&&Object.keys(sent).sort().join(',')==='p_cursor,p_limit,p_token_hash','SQL ne reçoit ni secret brut ni identité choisie');
check(sent.p_cursor===null&&sent.p_limit===200,'première page bornée à200');
await status({token,action:'progression',curseur:cursor,limite:1},200,'page suivante acceptée');
sent=JSON.parse(calls.at(-1).options.body);
check(sent.p_cursor===cursor&&sent.p_limit===1,'curseur opaque et limite transmis');
await status({token,action:'progression',curseur:null},200,'curseur nul accepté');
const before=calls.length;
for(const [body,label] of [
 [{token,action:'progression',owner:'forged'},'owner interdit'],
 [{token,action:'progression',child_ref:'forged'},'enfant choisi interdit'],
 [{token,action:'progression',access_id:id},'invitation choisie interdite'],
 [{token,action:'progression',paquet:{}},'lecture et écriture ne peuvent être mêlées'],
 [{token,action:'other'},'action inconnue rejetée'],
 ...[0,201,1.5,'1',null].map(limite=>[{token,action:'progression',limite},'limite invalide rejetée']),
 ...['bad','x'.repeat(101),12,{}].map(curseur=>[{token,action:'progression',curseur},'curseur invalide rejeté'])
])await status(body,400,label);
check(calls.length===before,'entrée invalide ne consulte jamais la base');
await status({token:'b'.repeat(63),action:'progression'},401,'secret invalide refusé uniformément');
for(const code of ['PT401','PT429','PT400']){
 const expected={PT401:401,PT429:429,PT400:400}[code];
 const h=createHandler({...config,fetcher:async()=>Response.json({code,message:'private detail',owner:'private-owner'},{status:400})});
 r=await status(undefined,expected,'code SQL '+code+' traduit sans détail',h);
 check(!JSON.stringify(await r.json()).includes('private'),'aucune information privée dans erreur');
 if(code==='PT429')check(r.headers.get('retry-after')==='60','quota lecture propose réessai après60s');
}
await status(undefined,503,'réseau indisponible échoue fermé',createHandler({...config,fetcher:async()=>{throw Error('private');}}));
await status(undefined,503,'résultat SQL malformé échoue fermé',createHandler({...config,fetcher:async()=>Response.json({lectures:[]})}));
for(const [change,label] of [
 [p=>p.version=2,'version inconnue'],[p=>p.objectif.valeur=66001,'objectif automatique hors limite'],
 [p=>p.objectif={valeur:60001,mode:'manuel'},'manuel hors limite'],[p=>p.objectif={valeur:0,mode:'attente'},'attente doit être nulle'],
 [p=>p.lectures.push({...row}),'UUID répété'],[p=>p.lectures[0].id='local-class-id','ID local non opaque'],
 [p=>p.lectures[0].origine='other','origine inconnue'],[p=>p.lectures[0].ep='E8','texte hors catalogue'],
 [p=>p.lectures[0].date='2025-01-01T10:00:00+00:00','date doit conserver UTC Z'],
 [p=>p.lectures[0].mclm=-1,'score négatif'],[p=>p.lectures[0].mclm=1.1,'score non entier'],
 [p=>p.lectures[0].lus=1001,'mots lus bornés'],[p=>p.lectures[0].erreurs=51,'erreurs dépassant lus'],
 [p=>p.lectures[0].secondes=61,'durée bornée'],[p=>p.lectures[0].dernier=10,'dernier indice cohérent'],
 [p=>p.lectures[0].fautes=[1],'nombre fautes cohérent'],
 [p=>Object.assign(p.lectures[0],{erreurs:2,fautes:[1,1]}),'fautes uniques'],
 [p=>p.suivant='bad','curseur de réponse valide']
]){const p=clone(page);change(p);check(valideProgression(p)===null,label+' : refus fermé');}
check(valideProgression({...page,objectif:{valeur:0,mode:'manuel'}})?.objectif.valeur===0,'manuel zéro préservé');
check(valideProgression({...page,objectif:{valeur:66000,mode:'automatique'}})?.objectif.valeur===66000,'objectif automatique maximal cohérent');
check(valideProgression({...page,objectif:{valeur:null,mode:'attente'},lectures:[]})?.lectures.length===0,'enfant sans lecture accepté');
check(valideProgression({...page,lectures:[{...row,secondes:0,mclm:77}]})?.lectures[0].mclm===77,'legacy sans fautes ni dernier ne recalcule pas score');
check(valideProgression({...page,suivant:cursor})?.suivant===cursor,'curseur PostgreSQL six décimales accepté');
check(valideProgression(page,0)===null,'réponse SQL ne dépasse pas limite demandée');
const infos=JSON.parse(await readFile(new URL('../../contenu/infos.json',import.meta.url),'utf8'));
const catalogue=Object.keys(infos).sort();
const ids=Array.from({length:7},(_,i)=>'E'+(i+1)).concat(Array.from({length:6},(_,i)=>'T'+(i+1))).sort();
check(JSON.stringify(catalogue)===JSON.stringify(ids),'catalogue source identique aux13 textes publiables');
for(const ep of ids)check(valideProgression({...page,lectures:[{...row,ep}]})!==null,'texte '+ep+' accepté par Edge');
const migration=await readFile(new URL('../migrations/202610190002_fluence_family_progress.sql',import.meta.url),'utf8');
check(migration.includes("where p->>'ep' ~ '^(E[1-7]|T[1-6])$'"),'vue SQL possède le même catalogue publié');
const typedPage={...page,lectures:[{...row,typeLecture:'defi'}]};
check(!Object.hasOwn(valideProgression(typedPage).lectures[0],'typeLecture'),'par défaut le type est retiré pour les anciens clients stricts');
check(valideProgression(typedPage,200,true).lectures[0].typeLecture==='defi','nouveau client reçoit le défi reconnu');
check(!Object.hasOwn(valideProgression(page,200,true).lectures[0],'typeLecture'),'aucun type inventé pour l’ancien historique');
for(const typeLecture of ['entrainement','defi']){
 const h=createHandler({...config,fetcher:async()=>Response.json({...page,lectures:[{...row,typeLecture}]})});
 for(const option of [undefined,false,true]){
  const b={token,action:'progression',...(option===undefined?{}:{avecTypeLecture:option})};
  const response=await status(b,200,'négociation du type : '+String(option),h),d=await response.json();
  check(option===true?d.lectures[0].typeLecture===typeLecture:!Object.hasOwn(d.lectures[0],'typeLecture'),'type seulement après opt-in explicite');
 }
}
for(const avecTypeLecture of [null,1,'true',[],{}])await status({token,action:'progression',avecTypeLecture},400,'capacité mal formée refusée');
for(const typeLecture of [null,'lecture','Defi',[],['defi'],{}])check(valideProgression({...page,lectures:[{...row,typeLecture}]},200,true)===null,'type de réponse invalide refusé');
console.log(count+' contrôles Edge progression réussis (aucun réseau).');

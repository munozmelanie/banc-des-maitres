// Modules réels et Preferences simulées ; uniquement données fictives, zéro réseau.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const read=n=>fs.readFileSync(path.join(__dirname,'../src',n),'utf8');
let count=0;const check=(ok,t)=>{assert.ok(ok,t);console.log('  ✓ '+t);count++;},copy=x=>JSON.parse(JSON.stringify(x));
const base=()=>({id:'maison:test-a:source-001',sourceId:'source-001',eleve:'test-a',origine:'maison',ep:'E1',date:'2025-01-01T10:00:00.000Z',secondes:60,dernier:9,fautes:[1],lus:10,erreurs:1,mclm:9,nomDeclare:'Ancien nom fictif',reception:'2025-01-01T11:00:00.000Z',source:'automatique'});
async function ouvre(resultats=[]){
 const prefs=new Map(),ls=new Map(),timers=new Map(),calls=[];let echec=false,seq=0,rows=[];
 const classe={eleves:[{id:'test-a',nom:'Test A',objectif:'85'}],maj:1};
 prefs.set('banc-db:banc/classe',JSON.stringify({data:classe,rev:1}));prefs.set('banc-db:banc/resultats',JSON.stringify({data:{liste:copy(resultats)},rev:1}));
 prefs.set('fluence-cloud-auth-v1',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expire:Date.now()+3600000,user:{id:'synthetic-owner',email:'test@example.invalid'}}));
 const c={console,TextEncoder,TextDecoder,URL,URLSearchParams,Response,Headers,AbortController,crypto:webcrypto,Date,
  setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval:()=>{},
  location:{hash:'#ecran',href:'https://test.invalid/#ecran',protocol:'https:',pathname:'/',search:''},screen:{width:1366,height:768},addEventListener:()=>{},
  document:{hidden:false,documentElement:{dataset:{}},addEventListener:()=>{}},
  __BANC:{episodes:[{id:'E1',titre:'Texte fictif',pages:[{toks:[]},{toks:Array.from({length:20},(_,i)=>['mot'+i])}]}]},
  localStorage:{getItem:k=>ls.get(k)??null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},
  Capacitor:{isNativePlatform:()=>true,Plugins:{Preferences:{get:async({key})=>({value:prefs.get(key)??null}),set:async({key,value})=>{if(echec&&key==='banc-db:banc/resultats')throw Error('Panne fictive');prefs.set(key,value);},remove:async({key})=>prefs.delete(key)}}},
  BANC_MAISON:{url:'https://synthetic.supabase.co',publishableKey:'synthetic-public-key-without-account'},
  fetch:async(url,options={})=>{
   assert.ok(url.startsWith('https://synthetic.supabase.co/'),'aucun réseau réel');calls.push({url,body:options.body?JSON.parse(options.body):null});
   if(url.includes('/fluence_accesses'))return Response.json([{id:'access-test',child_ref:'test-a'}]);
   if(url.includes('/fluence_results'))return Response.json(rows);
   if(url.includes('/rpc/fluence_sync_progress'))return Response.json({ok:true});
   throw Error('Endpoint inattendu');
  }};
 c.window=c;vm.createContext(c);
 // Exposer la vraie signature seulement dans le contexte de test, sans modifier l’API livrée.
 vm.runInContext(read('plateforme.js').replace('memeBilanMaison, lsG','memeBilanMaison, sigResultats, lsG'),c);
 for(const f of ['commun.js','envoi-maison.js','maison-cloud.js'])vm.runInContext(read(f),c);
 await c.Banc.Donnees.init();await c.MaisonCloud.init();await c.MaisonCloud.recoit();
 return {c,d:c.Banc.Donnees,cloud:c.MaisonCloud,platform:c.Plateforme,prefs,calls,classe,
  echec(v){echec=v;},data(){return copy(c.Banc.Donnees.sauvegarde());},
  serveur(r){const b={...r,id:r.sourceId,prenom:'Nom fictif famille'};delete b.sourceId;delete b.eleve;delete b.reception;delete b.source;delete b.nomDeclare;rows=[{id:'server-record',access_id:'access-test',received_at:'2025-01-02T10:00:00.000Z',payload:c.EnvoiMaison.paquet(b)}];}};
}
(async()=>{
 const r=base(),t=await ouvre([r]),avant=t.data();t.serveur({...r,typeLecture:'defi'});await t.cloud.recoit();const apres=t.data();
 check(apres.resultats.liste.length===1&&apres.resultats.liste[0].typeLecture==='defi','réception du brut typé enrichit un ancien import sans doublon');
 const sans=copy(apres.resultats.liste[0]);delete sans.typeLecture;
 check(JSON.stringify(sans)===JSON.stringify(r),'aucun ID, score, nom déclaré ou métadonnée de transport changé');
 check(JSON.stringify(avant.classe)===JSON.stringify(apres.classe)&&t.d.objectif('test-a')===85,'classe et objectif manuel conservés');
 check(JSON.parse(t.prefs.get('banc-db:banc/resultats')).data.liste[0].typeLecture==='defi','enrichissement durable dans Preferences');
 check(t.calls.filter(x=>x.url.includes('/rpc/fluence_sync_progress')).at(-1).body.p_lectures.some(x=>x.typeLecture==='defi'),'type enrichi republié dans projection privée');
 const ancien=await ouvre([r]);ancien.serveur(r);await ancien.cloud.recoit();check(!Object.hasOwn(ancien.data().resultats.liste[0],'typeLecture'),'ancien brut sans type ne reçoit aucune classification');
 const sup=await ouvre([{id:r.id,suppr:true,origine:'maison',eleve:r.eleve,sourceId:r.sourceId}]);sup.serveur({...r,typeLecture:'defi'});await sup.cloud.recoit();check(sup.data().resultats.liste[0].suppr&&!Object.hasOwn(sup.data().resultats.liste[0],'typeLecture'),'une suppression ne ressuscite jamais avec le type');
 const faux=await ouvre([{...r,mclm:8}]);faux.serveur({...r,typeLecture:'defi'});await faux.cloud.recoit();check(!Object.hasOwn(faux.data().resultats.liste[0],'typeLecture'),'mesures différentes interdisent l’enrichissement');
 const deja=await ouvre([{...r,typeLecture:'entrainement'}]);deja.serveur({...r,typeLecture:'defi'});await deja.cloud.recoit();check(deja.data().resultats.liste[0].typeLecture==='entrainement','un type existant n’est jamais remplacé');
 const panne=await ouvre([r]);panne.serveur({...r,typeLecture:'defi'});panne.echec(true);await panne.cloud.recoit();
 check(panne.cloud.statutReception().erreur&&!panne.data().resultats.liste[0].typeLecture,'panne stockage ne prétend pas réception à jour');
 panne.echec(false);await panne.cloud.recoit();check(!panne.cloud.statutReception().erreur&&panne.data().resultats.liste[0].typeLecture==='defi','reprise de réception retente l’enrichissement non sauvegardé');
 const p=t.platform,a={liste:[r]},b={liste:[{...r,typeLecture:'defi',reception:'2025-02-02T00:00:00Z',nomDeclare:'Autre nom fictif'}]};
 for(const [x,y] of [[a,b],[b,a]])check(p.fusionResultats(x,y).liste[0].typeLecture==='defi','deux appareils convergent vers type présent quel que soit ordre');
 check(p.sigResultats(a)!==p.sigResultats(b),'signature de liaison détecte l’enrichissement même ID');
 const merged=p.fusionResultats(a,b);check(p.sigResultats(merged)===p.sigResultats(p.fusionResultats(merged,a)),'un ancien pair ne fait pas perdre le type ni osciller la signature');
 for(const change of [{sourceId:'source-002'},{eleve:'test-b'},{ep:'E2'},{date:'2025-02-02T00:00:00Z'},{mclm:8},{lus:11},{erreurs:2},{secondes:59},{dernier:10},{fautes:[2]},{origine:'classe'},{typeLecture:'inconnu'}]){
  const fusion=p.fusionResultats(a,{liste:[{...r,typeLecture:'defi',...change}]});check(!Object.hasOwn(fusion.liste[0],'typeLecture'),'fusion refuse un enrichissement avec identité/mesure/type différent');
 }
 check(p.fusionResultats(b,{liste:[{id:r.id,suppr:true}]}).liste[0].suppr,'tombstone gagne sur résultat enrichi');
 check(p.fusionResultats({liste:[{id:r.id,suppr:true}]},b).liste[0].suppr,'résultat enrichi ne remplace pas tombstone existant');
 console.log(`\n${count} contrôles de conservation et réception du type réussis.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

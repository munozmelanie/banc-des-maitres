// Progrès familiaux : données fictives, API remplacée, aucun service externe.
const {chromium}=require('playwright'),{site}=require('./serveurs'),fs=require('node:fs'),path=require('node:path');
const CAPT=path.join(__dirname,'captures','parents-progres');fs.mkdirSync(CAPT,{recursive:true});
let nb=0;const vrai=(ok,m)=>{if(!ok)throw Error(m);nb++;console.log('  ✓ '+m);};
function prepare(){
 const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
 set.call(localStorage,'banc-db:banc/classe','{"prive":"Test Classe Invisible"}');set.call(localStorage,'banc-des-maitres-liaison','ABCDE-FGHJK');
 window.__prive=[],window.__ecritures=[],window.__appels=0;
 Storage.prototype.getItem=function(k){if(this===localStorage&&(/banc-db:|banc-des-maitres-liaison/.test(k)))__prive.push(k);return get.call(this,k);};
 Storage.prototype.setItem=function(k,v){if(this===localStorage)__ecritures.push([k,v]);return set.call(this,k,v);};
 window.WebSocket=class{constructor(){throw Error('Salon interdit dans cette vue');}};
 window.__mode='ok';window.__stock=()=>Object.keys(localStorage).map(k=>get.call(localStorage,k)).join('\n');
 let api;
 Object.defineProperty(window,'MaisonCloud',{configurable:true,get:()=>api,set:x=>{api=x;x.progressionParents=async()=>{
   __appels++;const t=new URLSearchParams(location.hash.slice(1)).get('famille');
   if(__mode==='lent')return new Promise(resolve=>{window.__reprend=resolve;});
   if(__mode==='offline'||t==='c'.repeat(64))throw {code:'offline'};
   if(__mode==='refuse')throw {code:'acces-refuse'};
   if(__mode==='vide')return {objectif:{valeur:null,mode:'attente'},lectures:[]};
   if(t==='b'.repeat(64))return {objectif:{valeur:88,mode:'manuel'},lectures:[{id:'b-lecture',ep:'T3',date:'2026-10-03T10:00:00Z',origine:'classe',mclm:80,lus:82,erreurs:2,secondes:60,fautes:[1,4]}]};
   return {objectif:{valeur:55,mode:'automatique'},lectures:[{id:'a-maison1',ep:'E1',date:'2026-10-01T10:00:00Z',origine:'maison',mclm:50,lus:51,erreurs:1,secondes:60,fautes:[1]},{id:'a-maison2',ep:'E1',date:'2026-10-02T10:00:00Z',origine:'maison',mclm:60,lus:62,erreurs:2,secondes:60,fautes:[1,4]},{id:'a-classe',ep:'T1',date:'2026-10-03T10:00:00Z',origine:'classe',mclm:70,lus:71,erreurs:1,secondes:60,fautes:[4]}]};
 };}});
}
(async()=>{const S=await site(),b=await chromium.launch(),erreurs=[],externes=[];
const hash=(t,nom)=>'#parents&famille='+t.repeat(64)+'&prenom='+encodeURIComponent(nom);
try{
 for(const width of [320,390,1366]){
  const c=await b.newContext({viewport:{width,height:width===320?568:width===390?844:900},isMobile:width<500,hasTouch:width<500});await c.addInitScript(prepare);
  const p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():(externes.push(r.request().url()),r.abort()));
  await p.goto(S.base+hash('a','Test Parent A'));await p.waitForSelector('[data-ep=E1]');
  vrai(await p.locator('[data-maison-rubrique]').count()===2,width+' : deux rubriques familiales visibles');
  await p.click('#maison-mes-progres');await p.waitForSelector('[data-parent-stat=lectures]');
  vrai(await p.textContent('[data-parent-stat=lectures]')==='2'&&await p.textContent('[data-parent-stat=evolution]')==='+10',width+' : les progrès ouvrent la maison avec ses seuls résultats');
  vrai((await p.textContent('#parents-progres-objectif')).includes('55')&&await p.locator('[data-parent-lecture]').count()===2,width+' : objectif et lectures consultables sont affichés');
  vrai(await p.locator('[data-suppr],#progression-eleves,#cloud-email').count()===0,width+' : aucune liste de classe, suppression ou connexion enseignante');
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(CAPT,width+'-maison-entete.png')});await p.locator('#parents-progres-graphe').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-maison-graphe.png')});
  await p.locator('[data-parent-point]').first().focus();await p.keyboard.press('Enter');
  vrai(await p.locator('[data-parent-lecture]').first().evaluate(e=>e.parentElement.querySelector('[open]')!==null)&&await p.evaluate(()=>document.activeElement.tagName==='SUMMARY'),width+' : un point au clavier ouvre les détails de la lecture');
  await p.focus('[data-parent-origine=classe]');await p.keyboard.press('Enter');
  vrai(await p.textContent('[data-parent-stat=lectures]')==='1'&&await p.textContent('[data-parent-stat=dernier]')==='70'&&await p.evaluate(()=>document.activeElement.dataset.parentOrigine==='classe'),width+' : bascule classe distincte et focus conservé');
  await p.selectOption('#parents-progres-texte','T3');
  vrai((await p.textContent('.progression-vide')).includes('Pas encore de lecture')&&await p.textContent('[data-parent-stat=lectures]')==='0',width+' : filtre sans lecture explicite, sans graphe trompeur');
  await p.selectOption('#parents-progres-texte','T1');
  vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('#parents-progres *')].filter(e=>e.getBoundingClientRect().width).every(e=>{let r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})),width+' : aucun débordement horizontal');
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(CAPT,width+'-entete.png')});await p.locator('#parents-progres-graphe').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-graphe.png')});
  await p.evaluate(()=>__mode='offline');await p.click('#parents-progres-actualiser');await p.waitForSelector('#parents-progres-reessayer');
  vrai((await p.textContent('#parents-progres')).includes('hors connexion')&&await p.locator('[data-parent-lecture]').count()===0,width+' : erreur hors ligne sans ancien résultat affiché');
  await p.evaluate(()=>__mode='refuse');await p.click('#parents-progres-reessayer');await p.waitForFunction(()=>document.querySelector('#parents-progres').textContent.includes('Ce lien ne permet plus'));
  vrai(await p.locator('[data-parent-lecture]').count()===0,width+' : un lien refusé ne révèle aucun résultat conservé');
  await p.evaluate(()=>__mode='vide');await p.click('#parents-progres-reessayer');await p.waitForSelector('[data-parent-stat=lectures]');
  vrai(await p.textContent('[data-parent-stat=lectures]')==='0'&&(await p.textContent('#parents-progres-objectif')).includes('Après la première lecture'),width+' : réessai et attente avant la première lecture');
  await p.click('[data-maison-rubrique=entrainement]');await p.click('[data-ep=E1]');
  vrai(await p.locator('#maison-depart').count()===1&&await p.locator('#maison-imprimer').count()===1&&await p.locator('.step,#play').count()===0,width+' : entraînement direct et impression conservés');
  vrai(await p.evaluate(()=>__prive.length===0&&!__stock().includes('a-maison1')&&!__stock().includes('a-classe')&&!document.body.textContent.includes('Test Classe Invisible')),width+' : aucun accès classe ou cache distant persistant');
  if(width===390){
   await p.evaluate(()=>__mode='lent');await p.click('#maison-mes-progres');await p.waitForFunction(()=>typeof __reprend==='function');
   vrai((await p.textContent('#parents-progres')).includes('Chargement'), 'la requête lente affiche un état de chargement');
   await p.evaluate(()=>{history.replaceState(null,'',location.pathname+'#parents&famille='+ 'b'.repeat(64)+'&prenom=Test%20Parent%20B');__reprend({objectif:{valeur:999,mode:'manuel'},lectures:[{id:'ancien-enfant',ep:'E1',date:'2026-10-01T10:00:00Z',origine:'maison',mclm:999,fautes:[]}]});});
   await p.waitForTimeout(50);
   vrai(!await p.locator('[data-parent-lecture="ancien-enfant"]').count()&&!/999/.test(await p.textContent('#parents-progres')),'une réponse retardée de l’ancien lien est ignorée');
   await p.evaluate(()=>dispatchEvent(new HashChangeEvent('hashchange')));await p.waitForSelector('[data-ep=E1]');
   await p.click('#maison-mes-progres');await p.waitForSelector('[data-parent-stat=lectures]');await p.click('[data-parent-origine=classe]');
   vrai((await p.textContent('#parents-progres')).includes('Test Parent B')&&!/Parent A/.test(await p.textContent('#parents-progres'))&&await p.textContent('[data-parent-stat=dernier]')==='80','ouvrir le lien frère/sœur ne montre que son propre prénom et ses résultats');
   await p.evaluate(()=>location.hash='#parents&famille='+ 'c'.repeat(64)+'&prenom=Test%20Parent%20C');await p.waitForSelector('[data-ep=E1]');await p.click('#maison-mes-progres');await p.waitForSelector('#parents-progres-reessayer');
   vrai(!/Parent A|Parent B|80/.test(await p.textContent('#parents-progres'))&&await p.locator('[data-parent-lecture]').count()===0,'une erreur sur le nouveau lien ne réaffiche aucun résultat des autres enfants');
   await p.evaluate(()=>location.hash='#parents');await p.waitForSelector('[data-ep=E1]');await p.click('#maison-mes-progres');
   vrai((await p.textContent('#parents-progres')).includes('Votre lien personnel est nécessaire')&&await p.evaluate(()=>__appels===0),'le lien générique ne charge aucun progrès personnel');
  }
  await c.close();
 }
 vrai(externes.length===0,'aucune requête externe, authentification ou donnée réelle');vrai(erreurs.length===0,'aucune erreur JavaScript');console.log(`\n${nb} vérifications des progrès parents réussies.`);
}finally{await b.close();S.serveur.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

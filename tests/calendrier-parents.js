// Calendrier familial : dates Paris explicites, horloge simulée et relais local.
// Aucun lien familial réel, aucune donnée de classe ou requête extérieure.
const {chromium,webkit}=require('playwright'),{site,relais}=require('./serveurs');
let nb=0;const vrai=(ok,m)=>{if(!ok)throw Error('ÉCHEC : '+m);nb++;console.log('  ✓ '+m);};
const DATES=['2026-11-02','2026-11-09','2026-11-16','2026-11-23','2026-11-30','2026-12-07','2026-12-14'];
(async()=>{
 const S=await site(),R=await relais(),b=await(process.argv.includes('--webkit')?webkit:chromium).launch(),erreurs=[],externes=[];
 async function ouvre(zone,time,role='parents'){
  const c=await b.newContext({timezoneId:zone,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await c.addInitScript(()=>{window.__impressions=0;window.print=()=>window.__impressions++;});
  const p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));
  await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():(externes.push(r.request().url()),r.abort()));
  const t=new Date(time);await p.clock.install({time:new Date(t.getTime()-60000)});await p.clock.pauseAt(t);
  await p.goto(S.base+'?relais='+encodeURIComponent('nostr:'+R.url)+'#'+role);
  await p.waitForSelector('button[data-ep=E1]');return p;
 }
 try{
  for(const zone of ['Europe/Paris','America/Los_Angeles','Asia/Tokyo']){
   const p=await ouvre(zone,'2026-11-02T15:29:59.000Z');
   vrai(await p.locator('button[data-ep]').count()===7&&await p.locator('button[data-ep^=T]').count()===0&&await p.locator('[data-categorie]').count()===2&&await p.locator('[data-categorie=periode]').textContent().then(t=>t.trim()==='Textes de la période (facultatifs)'),zone+' : sept épisodes par défaut et une rubrique P2 clairement facultative');
   vrai(await p.evaluate(()=>[...document.querySelectorAll('button[data-ep]')].every(x=>x.disabled&&x.classList.contains('maison-verrouille')&&x.querySelector('.maison-date-ouverture')&&!x.outerHTML.includes(Banc.ep(x.dataset.ep).titre))),zone+' : les cartes futures sont désactivées et ne dévoilent aucun titre, même dans leurs attributs');
   vrai(await p.locator('button[data-ep=E1] .maison-date-ouverture').textContent().then(t=>t.includes('lundi 2 novembre')&&t.includes('16 h 30')),zone+' : la petite date reste le lundi à16h30 de Paris');
   await p.locator('button[data-ep=E1]').evaluate(e=>e.click());
   vrai(await p.locator('#maison-depart,#maison-ecouter,#maison-imprimer').count()===0,zone+' : cliquer une carte verrouillée ne révèle ni lecture, ni défi, ni impression');
   await p.evaluate(()=>{Ecran.go({name:'episode',id:'E1',step:1});Banc.imprimeTexte(Banc.ep('E1'));});
   vrai(await p.evaluate(()=>Ecran.route().name==='home'&&__impressions===0&&document.querySelector('#maison-impression').childElementCount===0),zone+' : route directe et impression refusent aussi un épisode avant sa date');
   await p.click('[data-categorie=periode]');
   vrai(await p.evaluate(()=>{const cartes=[...document.querySelectorAll('button[data-ep]')];return cartes.map(x=>x.dataset.ep).join(',')==='T1,T3,T4,T5,T6'&&cartes.every(x=>!x.disabled&&x.textContent.includes(Banc.ep(x.dataset.ep).titre))&&!document.querySelector('.maison-date-ouverture');}),zone+' : les cinq textes facultatifs sont ouverts sans date, la BD reste exclue');
   await p.click('button[data-ep=T1]');await p.click('#back');
   vrai(await p.locator('button[data-ep=T1]').isVisible()&&await p.locator('button[data-ep=E1]').count()===0,zone+' : Retour conserve la catégorie facultative');
   const permis=await p.evaluate(()=>['T1','T3','T4','T5','T6'].every(id=>{Ecran.go({name:'episode',id,step:4});Banc.imprimeTexte(Banc.ep(id));return Ecran.route().id===id&&!!document.querySelector('#maison-depart')&&document.querySelector('#maison-impression').dataset.ep===id;}));
   vrai(permis&&await p.evaluate(()=>__impressions===5),zone+' : route et impression des cinq textes facultatifs sont autorisées avant l’ouverture de E1');
   await p.evaluate(()=>Ecran.go({name:'home'}));await p.click('[data-categorie=entrainement]');
   await p.clock.runFor(1000);
   vrai(await p.evaluate(()=>Banc.ouvertFamille(Banc.ep('E1'))),zone+' : E1 devient disponible exactement à16h30 Paris');
   await p.clock.runFor(1);
   vrai(await p.locator('button[data-ep=E1]').isEnabled()&&await p.locator('button[data-ep=E2]').isDisabled()&&await p.locator('button[data-ep=E1]').innerText().then(async t=>t.includes(await p.evaluate(()=>Banc.ep('E1').titre))),zone+' : la page déjà ouverte actualise la première carte sans rechargement');
   await p.click('button[data-ep=E1]');
   vrai(await p.locator('#maison-depart').isVisible()&&await p.locator('#maison-ecouter').isVisible()&&await p.locator('#maison-imprimer').isVisible(),zone+' : l’épisode ouvert donne accès à la voix, au défi et à l’impression');
   await p.click('#back');
   for(const id of ['T2','E2']){
    await p.evaluate(id=>{Ecran.go({name:'episode',id,step:4});Banc.imprimeTexte(Banc.ep(id));},id);
   }
   vrai(await p.evaluate(()=>Ecran.route().name==='home'&&__impressions===5)&&await p.locator('#maison-depart,#maison-ecouter').count()===0,zone+' : la BD et les épisodes futurs restent fermés même après un épisode ouvert');
   vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),zone+' : les cartes et leurs dates tiennent sur mobile');
   await p.context().close();
  }
  const p=await ouvre('Europe/Paris','2026-12-15T10:00:00Z');
  const calendrier=await p.evaluate(dates=>({ids:Banc.textesFamille().filter(E=>E.collection==='feuilleton').map(E=>E.id),points:dates.map((d,i)=>{const E=Banc.ep('E'+(i+1)),date=d+'T16:30:00+01:00',t=Date.parse(date);return E.ouvertureFamille===date&&!Banc.ouvertFamille(E,t-1)&&Banc.ouvertFamille(E,t)&&Banc.ouvertFamille(E,t+1);}),invalides:[null,{id:'inconnu'},Banc.ep('T2')].every(E=>!Banc.ouvertFamille(E))}),DATES);
  vrai(calendrier.ids.join(',')==='E1,E2,E3,E4,E5,E6,E7','la série familiale conserve exactement E1 àE7 dans l’ordre');
  calendrier.points.forEach((ok,i)=>vrai(ok,'E'+(i+1)+' : ouverture le '+DATES[i]+' à16h30, borne exacte incluse'));
  vrai(calendrier.invalides,'épisode absent, inconnu ou BD n’est jamais ouvert en famille');
  vrai(await p.locator('button[data-ep]:enabled').count()===7,'après le dernier lundi, les sept épisodes restent disponibles');
  await p.clock.setSystemTime(new Date('2026-11-09T15:29:59Z'));await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  vrai(await p.locator('button[data-ep=E1]').isEnabled()&&await p.locator('button[data-ep=E2]').isDisabled(),'au retour sur une page, l’état est recalculé avec la date actuelle');
  await p.click('[data-categorie=periode]');await p.clock.runFor(1001);
  vrai(await p.locator('button[data-ep=T1]').isVisible()&&await p.locator('button[data-ep=E1]').count()===0,'le rafraîchissement de date ne change pas la catégorie facultative choisie');
  await p.click('[data-categorie=entrainement]');
  vrai(await p.locator('button[data-ep=E1]').isEnabled()&&await p.locator('button[data-ep=E2]').isEnabled()&&await p.locator('button[data-ep=E3]').isDisabled(),'le deuxième lundi ouvre E2 en conservant E1 et en verrouillant E3');
  await p.context().close();
  const e=await ouvre('Europe/Paris','2026-10-19T10:00:00Z','ecran');
  vrai(await e.locator('button[data-ep]').count()===12&&await e.locator('button[data-ep=E7]').isEnabled()&&await e.locator('button[data-ep=T1]').isEnabled()&&await e.locator('button[data-ep=T2]').count()===0,'la classe garde ses douze textes actuels sans attendre le calendrier familial');
  await e.click('button[data-ep=E7]');vrai(await e.evaluate(()=>Ecran.route().id==='E7')&&await e.locator('#wd').isVisible(),'l’enseignante peut préparer E7 avant son ouverture aux familles');
  await e.evaluate(()=>Ecran.go({name:'episode',id:'T1',step:4}));vrai(await e.locator('#go').isVisible(),'le défi P2 reste accessible à l’enseignante');
  vrai(externes.length===0,'aucune requête extérieure');vrai(erreurs.length===0,'aucune erreur JavaScript');
  console.log(`\n${nb} vérifications du calendrier familial réussies.`);
 }finally{await b.close();S.serveur.close();R.wss.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

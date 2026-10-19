// Exception de calendrier : tokens exclusivement fictifs et empreinte injectée dans le HTML local.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const TOKEN='a'.repeat(64),AUTRE='b'.repeat(64),DOMAINE='fluence:apercu-episodes:v1:';
const sha=v=>createHash('sha256').update(v).digest('hex'),EMPREINTE=sha(DOMAINE+TOKEN);
let nb=0;const vrai=(ok,m)=>{if(!ok)throw Error(m);nb++;console.log('  ✓ '+m);};
(async()=>{
 const S=await site(),b=await(process.argv.includes('--webkit')?webkit:chromium).launch(),erreurs=[],api=[],autres=[];
 const original=fs.readFileSync(path.join(__dirname,'../www/index.html'),'utf8');
 const marqueur=/const EMPREINTE_APERCU\s*=\s*["'][a-f0-9]{64}["'];/;
 if(!marqueur.test(original))throw Error('Le marqueur de démonstration attendu est absent du build.');
 async function ouvre({hash='#parents&famille='+TOKEN+'&prenom=Test',empreinte=EMPREINTE,cryptoMode='',cloudRetarde=false,attend=true,historique=false}={}){
  const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await c.addInitScript(({cryptoMode,cloudRetarde,domaine,tokenA,contexte,historique})=>{
   window.__impressions=0;window.print=()=>{dispatchEvent(new Event('beforeprint'));window.__impressions++;};
   window.__authLue=0;const get=Storage.prototype.getItem;
   Storage.prototype.getItem=function(k){if(k==='fluence-cloud-auth-v1')window.__authLue++;return get.call(this,k);};
   if(historique)localStorage.setItem('fluence-parents-v1',JSON.stringify({version:1,prenom:'',vitesse:.8,profils:{[contexte]:{prenom:'Test Ancien A',vitesse:.8}},historique:[{id:'test-ancien-a',formatVersion:1,origine:'maison',contexte,prenom:'Test Ancien A',ep:'T3',titre:'Test ancien résultat',date:'2026-10-01T10:00:00.000Z',mclm:20,lus:20,erreurs:0,secondes:60,dernier:19,fautes:[]}]}));
   if(cloudRetarde){let api;Object.defineProperty(window,'MaisonCloud',{configurable:true,get:()=>api,set:x=>{api=x;const init=x.init;x.init=async()=>{if(new URLSearchParams(location.hash.slice(1)).get('famille')===tokenA)await new Promise(resolve=>{window.__cloudRetenu=true;window.__resoutCloud=resolve;});return init();};}});}
   if(cryptoMode){const digest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=(alg,data)=>{
    const texte=new TextDecoder().decode(data);
    if(texte!==domaine+tokenA)return digest(alg,data);
    if(cryptoMode==='refus')return Promise.reject(Error('Indisponibilité crypto synthétique'));
    return new Promise(resolve=>{window.__digestRetenu=true;window.__resoutDigest=()=>resolve(digest(alg,data));});
   };}
  },{cryptoMode,cloudRetarde,domaine:DOMAINE,tokenA:TOKEN,contexte:sha(TOKEN),historique});
  const p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));await p.clock.setFixedTime(new Date('2026-10-19T12:00:00Z'));
  await p.route('**/*',async r=>{
   if(r.request().url().startsWith(S.base)){
    if(r.request().resourceType()==='document')return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:original.replace(marqueur,'const EMPREINTE_APERCU = '+JSON.stringify(empreinte)+';')});
    return r.continue();
   }
   if(new URL(r.request().url()).pathname==='/functions/v1/fluence-bilan'){
    const d=r.request().postDataJSON();api.push({action:d.action,cles:Object.keys(d).sort(),tokenConforme:d.token===TOKEN||d.token===AUTRE,authorization:!!r.request().headers().authorization});
    return r.fulfill({status:401,contentType:'application/json',body:'{"error":"invalid_access"}'});
   }
   autres.push(new URL(r.request().url()).pathname);return r.abort();
  });
  await p.goto(S.base+hash);if(attend)await p.waitForSelector('button[data-ep=E1]');return {c,p};
 }
 try{
  let {c,p}=await ouvre();
  vrai(await p.evaluate(()=>Parents.apercuEpisodes()===true&&Banc.EPS.filter(E=>E.id.startsWith('E')).every(E=>Banc.ouvertFamille(E)))&&await p.locator('button[data-ep]:enabled').count()===7,'le seul lien fictif marqué ouvre les sept épisodes avant leurs dates');
  vrai(await p.evaluate(()=>__authLue===0)&&api.length===0,'l’aperçu ne lit aucune session enseignante et ne demande aucune autorisation supplémentaire à l’API');
  for(let n=1;n<=7;n++){
   const id='E'+n;await p.click('button[data-ep='+id+']');
   vrai(await p.evaluate(id=>Ecran.route().id===id&&document.querySelector('#maison-texte').children.length>0&&document.querySelector('.maison-entete h1').textContent===Banc.ep(id).titre,id),'E'+n+' : texte et défi accessibles avec leur vrai titre');
   await p.click('#maison-ecouter');await p.waitForFunction(()=>!document.querySelector('#audio').paused);
   vrai(await p.locator('#audio').evaluate((a,id)=>a.dataset.maisonEp===id&&!a.paused,id),'E'+n+' : sa voix enregistrée peut être lue');
   await p.click('#maison-imprimer');
   vrai(await p.evaluate(id=>document.querySelector('#audio').paused&&document.querySelector('#maison-impression').dataset.ep===id&&document.querySelectorAll('#maison-impression .impression-mot').length===Banc.motsDefi(Banc.ep(id)).length,id),'E'+n+' : impression autorisée, complète et sans audio en cours');
   await p.click('#back');
  }
  await p.click('[data-categorie=periode]');
  vrai(await p.locator('button[data-ep]').count()===5&&await p.locator('button[data-ep=T2]').count()===0&&!await p.evaluate(()=>Banc.ouvertFamille(Banc.ep('T2'))),'le mode aperçu conserve les cinq textes facultatifs et exclut toujours la BD');
  await p.evaluate(()=>Ecran.go({name:'episode',id:'T2',step:4}));
  vrai(await p.locator('#maison-depart').count()===0&&!await p.evaluate(()=>Banc.prepareImpression(Banc.ep('T2'))),'la BD reste refusée par route directe et par impression');
  const refus=await p.evaluate(async()=>{try{await MaisonCloud.progressionParents();return 'accepte';}catch(e){return e.code;}});
  vrai(refus==='acces-refuse'&&api.length===1&&api[0].tokenConforme&&!api[0].authorization&&api[0].cles.join(',')==='action,limite,token','l’aperçu ne contourne pas le refus de l’API privée et ne lui ajoute aucun privilège');
  await p.reload();await p.waitForSelector('button[data-ep=E1]');
  vrai(await p.evaluate(()=>Parents.apercuEpisodes())&&await p.locator('button[data-ep=E7]').isEnabled(),'le même QR retrouve son aperçu après rechargement');
  await p.evaluate(token=>history.replaceState(null,'',location.pathname+'#parents&famille='+token+'&prenom=Test'),AUTRE);
  vrai(!await p.evaluate(()=>Parents.apercuEpisodes()||Banc.ouvertFamille(Banc.ep('E7'))),'le getter cesse immédiatement d’autoriser après changement du token, avant tout événement');
  await p.evaluate(()=>Ecran.go({name:'episode',id:'E7',step:4}));
  vrai(await p.locator('#maison-depart').count()===0,'un ancien aperçu en mémoire ne permet pas d’ouvrir un épisode pour le nouveau lien');
  await Promise.all([p.waitForEvent('load'),p.evaluate(()=>dispatchEvent(new HashChangeEvent('hashchange')))]);await p.waitForSelector('button[data-ep=E1]');
  vrai(!await p.evaluate(()=>Parents.apercuEpisodes())&&await p.locator('button[data-ep]:disabled').count()===7,'après changement de lien et rechargement, la famille ordinaire conserve son calendrier');await c.close();
  for(const [label,hash,empreinte] of [
   ['même prénom Test','#parents&famille='+AUTRE+'&prenom=Test',EMPREINTE],
   ['lien générique','#parents&prenom=Test',EMPREINTE],
   ['token invalide','#parents&famille=invalide&prenom=Test',EMPREINTE],
   ['token répété identique','#parents&famille='+TOKEN+'&famille='+TOKEN,EMPREINTE],
   ['deux tokens distincts','#parents&famille='+TOKEN+'&famille='+AUTRE,EMPREINTE],
   ['paramètres imitation','#parents&famille='+AUTRE+'&test=true&apercu=1&prenom=Test',EMPREINTE],
   ['empreinte sans domaine','#parents&famille='+TOKEN,sha(TOKEN)]
  ]){
   ({c,p}=await ouvre({hash,empreinte}));
   vrai(!await p.evaluate(()=>Parents.apercuEpisodes())&&await p.locator('button[data-ep]:disabled').count()===7,label+' : aucun déverrouillage');await c.close();
  }
  ({c,p}=await ouvre({cryptoMode:'refus'}));
  vrai(!await p.evaluate(()=>Parents.apercuEpisodes())&&await p.locator('button[data-ep]:disabled').count()===7,'un échec crypto garde le calendrier fermé');await c.close();
  ({c,p}=await ouvre({cryptoMode:'retarde',attend:false,historique:true}));await p.waitForFunction(()=>window.__digestRetenu===true);
  vrai(!await p.evaluate(()=>Parents.apercuEpisodes()),'aucun aperçu pendant le calcul de l’empreinte');
  await p.evaluate(token=>{history.replaceState(null,'',location.pathname+'#parents&famille='+token+'&prenom=Test%20Nouveau%20B');window.__resoutDigest();},AUTRE);await p.waitForSelector('button[data-ep=E1]');
  vrai(!await p.evaluate(()=>Parents.apercuEpisodes())&&await p.locator('button[data-ep]:disabled').count()===7,'une réponse crypto retardée ne déverrouille pas un autre lien');
  await p.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));
  vrai(!await p.locator('#maison-bilan-precedent').count()&&!await p.evaluate(()=>document.body.textContent.includes('Test Ancien A')),'un changement de lien avant initialisation ne révèle pas le bilan du contexte précédent');await c.close();
  ({c,p}=await ouvre({cloudRetarde:true,attend:false,historique:true}));await p.waitForFunction(()=>window.__cloudRetenu===true);
  await p.evaluate(token=>{history.replaceState(null,'',location.pathname+'#parents&famille='+token+'&prenom=Test%20Nouveau%20B');window.__resoutCloud();},AUTRE);await p.waitForSelector('button[data-ep=E1]');
  vrai(!await p.evaluate(()=>Parents.apercuEpisodes())&&await p.locator('button[data-ep]:disabled').count()===7,'le changement de lien pendant l’initialisation cloud conserve le calendrier du nouveau lien');
  await p.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));
  vrai(!await p.locator('#maison-bilan-precedent').count()&&!await p.evaluate(()=>document.body.textContent.includes('Test Ancien A')),'un retour cloud tardif ne réaffiche pas l’ancien contexte familial');await c.close();
  ({c,p}=await ouvre({hash:'#ecran&famille='+TOKEN}));
  vrai(!await p.evaluate(()=>Parents.apercuEpisodes())&&await p.evaluate(()=>Banc.ROLE==='ecran'),'le marqueur ne crée pas un mode famille dans le rôle enseignante');await c.close();
  vrai(autres.length===0,'aucune requête extérieure non simulée');vrai(erreurs.length===0,'aucune erreur JavaScript');console.log(`\n${nb} vérifications de l’aperçu parents réussies.`);
 }finally{await b.close();S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Choix d'entraînement ou de défi final : seulement des données fictives et un service simulé.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs');
const {createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const moteur=process.argv.includes('--webkit')?'webkit':'chromium';
const CAPT=process.env.FLUENCE_CAPTURES||path.join('/private/tmp','fluence-quatre-soirs-qa',moteur);
fs.mkdirSync(CAPT,{recursive:true});
const token='a'.repeat(64),contexte=createHash('sha256').update(token).digest('hex');
let nb=0;const vrai=(ok,m)=>{if(!ok)throw Error(m);nb++;console.log('  ✓ '+m);};
function prepare(contexte){
 const cle='fluence-parents-v1';
 if(!localStorage.getItem(cle))localStorage.setItem(cle,JSON.stringify({version:1,prenom:'',vitesse:.8,profils:{[contexte]:{prenom:'Test Soirs',vitesse:.8}},historique:[{id:'ancien-sans-type',formatVersion:1,origine:'maison',contexte,prenom:'Test Soirs',ep:'E1',titre:'Texte fictif antérieur',date:'2026-12-01T17:00:00Z',mclm:40,lus:40,erreurs:0,secondes:60,dernier:39,fautes:[]}]}));
 window.__envoyes=[];let api;const etats={};
 Object.defineProperty(window,'MaisonCloud',{configurable:true,get:()=>api,set:x=>{api=x;
  x.init=async()=>{};x.parentActif=()=>true;x.surChange=()=>()=>{};x.etat=id=>etats[id]||null;
  x.envoie=async r=>{__envoyes.push(JSON.parse(JSON.stringify(r)));return etats[r.id]={etat:'recu',message:'Bilan reçu dans Fluence par l’enseignante'};};
  x.progressionParents=async()=>({objectif:{valeur:75,mode:'manuel'},lectures:[
   {id:'ancienne',ep:'E1',date:'2026-12-01T17:00:00Z',origine:'maison',mclm:40,lus:40,erreurs:0,secondes:60,fautes:[]},
   {id:'entrainement-1',ep:'E1',date:'2026-12-01T17:03:00Z',origine:'maison',mclm:50,lus:51,erreurs:1,secondes:60,fautes:[1],typeLecture:'entrainement'},
   {id:'final-1',ep:'E1',date:'2026-12-01T17:05:00Z',origine:'maison',mclm:60,lus:61,erreurs:1,secondes:60,fautes:[1],typeLecture:'defi'},
   {id:'entrainement-apres',ep:'E1',date:'2026-12-01T17:07:00Z',origine:'maison',mclm:55,lus:55,erreurs:0,secondes:60,fautes:[],typeLecture:'entrainement'},
   {id:'autre-texte',ep:'E2',date:'2026-12-02T17:00:00Z',origine:'maison',mclm:80,lus:80,erreurs:0,secondes:60,fautes:[],typeLecture:'defi'},
   {id:'classe-ancienne',ep:'E1',date:'2026-12-03T10:00:00Z',origine:'classe',mclm:65,lus:65,erreurs:0,secondes:60,fautes:[]}
  ]});
 }});
}
(async()=>{
 const S=await site(),b=await(moteur==='webkit'?webkit:chromium).launch(),erreurs=[],externes=[];
 try{
  for(const width of [320,390,1366]){
   const c=await b.newContext({viewport:{width,height:width===320?568:width===390?844:900},isMobile:width<500,hasTouch:width<500});
   await c.addInitScript(prepare,contexte);const p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));
   await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():(externes.push(r.request().url()),r.abort()));
   await p.clock.install({time:new Date('2026-12-15T17:00:00Z')});await p.clock.pauseAt(new Date('2026-12-15T17:00:01Z'));
   await p.goto(S.base+'#parents&famille='+token+'&essai-rapide');await p.click('button[data-ep=E1]');
   const choix=p.locator('#maison-type-lecture'),formation=p.getByRole('radio',{name:'Entraînement',exact:true}),final=p.getByRole('radio',{name:'Défi du 4ᵉ soir',exact:true});
   vrai(await choix.locator('input[type=radio]').count()===2&&await formation.isChecked()&&!await final.isChecked(),width+' : deux choix accessibles, entraînement par défaut');
   vrai(await p.textContent('#maison-bilan-precedent [data-type-lecture]')==='Lecture',width+' : l’ancien bilan reste une Lecture, sans classification inventée');
   vrai(await choix.locator('label').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44))&&await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' : les choix restent touchables et sans débordement');
   await formation.focus();await p.keyboard.press('ArrowRight');vrai(await final.isChecked(),width+' : le choix fonctionne aussi au clavier');await formation.check();
   await choix.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-choix.png')});
   if(width===390){
    async function termine(){await p.clock.runFor(3000);await p.locator('#maison-texte [data-index="1"]').dispatchEvent('click');await p.clock.runFor(8000);await p.locator('#maison-texte [data-index="20"]').dispatchEvent('click');}
    await p.click('#maison-depart');
    vrai(await formation.isDisabled()&&await final.isDisabled(),'le choix est figé dès le compte à rebours');
    await p.evaluate(()=>document.querySelector('[name=typeLecture][value=defi]').checked=true);await termine();
    vrai(await p.evaluate(()=>{const r=__envoyes.at(-1);return r.typeLecture==='entrainement'&&r.secondes===8&&r.lus===21&&r.erreurs===1&&r.mclm===150&&!('contexte' in r)&&!('eleve' in r);}), 'le type capturé résiste à une modification du formulaire et ne change pas le calcul ni la confidentialité');
    vrai(await p.textContent('#maison-resultat [data-type-lecture]')==='Entraînement','le bilan identifie l’entraînement enregistré');
    await p.click('#maison-depart');await final.check();await p.click('#maison-depart');await p.clock.runFor(1000);
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    vrai(await final.isEnabled()&&await final.isChecked()&&await p.evaluate(()=>__envoyes.length===1),'un départ interrompu permet de changer le choix sans créer de score');
    await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await p.click('#maison-depart');await termine();
    vrai(await p.textContent('#maison-resultat [data-type-lecture]')==='Défi du 4ᵉ soir'&&await p.locator('#maison-resultat .maison-lecture-defi').count()===1&&await p.evaluate(()=>__envoyes.at(-1).typeLecture==='defi'),'le défi choisi au deuxième essai porte son badge et est transmis comme défi');
    await p.screenshot({path:path.join(CAPT,width+'-resultat-final.png')});
    await p.reload();await p.click('button[data-ep=E1]');
    vrai(await p.textContent('#maison-bilan-precedent [data-type-lecture]')==='Défi du 4ᵉ soir'&&await formation.isChecked(),'le badge final survit au rechargement, une nouvelle lecture repart en entraînement');
    for(let i=0;i<3;i++){
     await p.click('#maison-depart');await termine();if(i<2)await p.click('#maison-depart');
    }
    vrai(await p.evaluate(()=>{const h=JSON.parse(localStorage.getItem('fluence-parents-v1')).historique;return h.length===6&&new Set(h.map(r=>r.id)).size===6&&h.filter(r=>r.typeLecture==='entrainement').length===4&&h.filter(r=>r.typeLecture==='defi').length===1&&!Object.hasOwn(h[0],'typeLecture')&&h.every(r=>r.ep==='E1');}), 'tous les essais du même texte restent distincts : aucun quatrième essai automatique, aucun ancien bilan reclassé');
    vrai(await p.evaluate(()=>__envoyes.length===3&&__envoyes.every(r=>r.typeLecture==='entrainement')),'chaque nouvel entraînement est transmis, même après un défi final');
    await p.reload();await p.click('button[data-ep=E1]');
    vrai(await p.evaluate(()=>JSON.parse(localStorage.getItem('fluence-parents-v1')).historique.length===6)&&await p.textContent('#maison-bilan-precedent [data-type-lecture]')==='Entraînement','le rechargement conserve l’ensemble de l’historique et montre la lecture la plus récente');
   }
   await p.click('#maison-mes-progres');await p.waitForSelector('[data-parent-stat=lectures]');await p.selectOption('#parents-progres-texte','E1');
   vrai(await p.textContent('[data-parent-stat=lectures]')==='4'&&await p.locator('[data-parent-point]').count()===4&&await p.textContent('[data-parent-stat=dernier]')==='55',width+' : la courbe d’un texte conserve tous les points, y compris après le défi');
   vrai(await p.locator('[data-parent-point=final-1] .maison-lecture-point-defi').count()===1&&await p.locator('#parents-progres-graphe .maison-lecture-point-defi').count()===1&&(await p.getAttribute('[data-parent-point=final-1]','aria-label')).includes('Défi du 4ᵉ soir'),width+' : le défi final possède un losange et un nom accessible, sans dépendre de sa couleur');
   vrai(await p.locator('.progression-legende .maison-lecture-losange').count()===1&&await p.textContent('[data-parent-lecture=ancienne] [data-type-lecture]')==='Lecture'&&await p.textContent('[data-parent-lecture=entrainement-1] [data-type-lecture]')==='Entraînement',width+' : la légende et les types de lecture distinguent ancien, entraînement et défi');
   await p.locator('[data-parent-point=final-1]').focus();await p.keyboard.press('Enter');
   vrai(await p.locator('[data-parent-lecture=final-1]').getAttribute('open')!==null&&await p.evaluate(()=>document.activeElement.tagName==='SUMMARY'),width+' : le losange ouvre ses détails au clavier');
   await p.locator('#parents-progres-graphe').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-courbe.png')});
   await p.locator('[data-parent-lecture=final-1]').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-lectures.png')});
   vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('#parents-progres *')].filter(e=>e.getBoundingClientRect().width).every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})),width+' : résultats, badges et courbe restent dans le viewport');
   await p.click('[data-parent-origine=classe]');
   vrai(await p.textContent('[data-parent-stat=lectures]')==='1'&&await p.locator('#parents-progres-graphe .maison-lecture-point-defi').count()===0&&await p.textContent('[data-parent-lecture=classe-ancienne] [data-type-lecture]')==='Lecture',width+' : le filtre classe garde les anciennes lectures sans faux défi');
   await c.close();
  }
  vrai(externes.length===0,'aucun réseau extérieur ni authentification réelle');vrai(erreurs.length===0,'aucune erreur JavaScript');console.log(`\n${nb} vérifications des quatre soirs parents réussies (${moteur}).`);
 }finally{await b.close();await new Promise(ok=>S.serveur.close(ok));}
})().catch(e=>{console.error(e);process.exitCode=1;});

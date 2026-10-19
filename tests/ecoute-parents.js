// Voix familiale dans le défi : enregistrements locaux, date après toutes les ouvertures, aucun service distant.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs');
const fs=require('fs'),path=require('path');
const CAPT=path.join(__dirname,'captures','ecoute-parents');fs.mkdirSync(CAPT,{recursive:true});
let nb=0;const vrai=(ok,m)=>{if(!ok)throw Error(m);nb++;console.log('  ✓ '+m);};
(async()=>{const S=await site(),b=await(process.argv.includes('--webkit')?webkit:chromium).launch(),erreurs=[],externes=[];try{
 const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage();
 p.on('pageerror',e=>erreurs.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():(externes.push(r.request().url()),r.abort()));
 await p.clock.install({time:new Date('2027-01-04T12:00:00Z')});await p.goto(S.base+'#parents&essai-rapide');await p.click('[data-ep=E1]');
 vrai(await p.textContent('#maison-ecouter')==='Écouter le texte'&&!await p.locator('#maison-ecouter-debut').isVisible(), 'une seule entrée Écouter le texte, sans lancement automatique');
 vrai(await p.evaluate(()=>{const a=document.querySelector('#audio');return a.paused&&a.currentTime===0&&a.playbackRate===1&&a.getAttribute('src')===Banc.ep('E1').audio&&!document.querySelector('.steps,#play,#wd');}), 'la vraie voix du texte est prête à vitesse normale, sans autres phases');
 async function joue(){await p.click('#maison-ecouter');await p.waitForFunction(()=>{const a=document.querySelector('#audio');return !a.paused&&a.currentTime>.15;});}
 await joue();vrai(await p.textContent('#maison-ecouter')==='Pause'&&await p.textContent('#maison-chrono')==='8','l’écoute démarre et ne déclenche pas le chronomètre');
 const position=await p.locator('#audio').evaluate(a=>a.currentTime);await p.click('#maison-ecouter');
 vrai(await p.locator('#audio').evaluate(a=>a.paused)&&await p.textContent('#maison-ecouter')==='Reprendre l’écoute','Pause conserve la position et propose de reprendre');
 await joue();await p.waitForFunction(t=>document.querySelector('#audio').currentTime>t+.15,position);
 vrai(await p.locator('#audio').evaluate((a,t)=>!a.paused&&a.currentTime>t,position),'Reprendre poursuit la même lecture');
 await p.locator('#audio').evaluate(a=>{a.currentTime=12;});await p.waitForFunction(()=>!document.querySelector('#audio').seeking);await p.click('#maison-ecouter-debut');
 await p.waitForFunction(()=>{const a=document.querySelector('#audio');return !a.paused&&!a.seeking&&a.currentTime<2;});
 vrai(await p.textContent('#maison-ecouter')==='Pause','Depuis le début relance réellement la voix depuis zéro');
 await p.locator('#audio').evaluate(a=>{a.currentTime=a.duration-.1;});await p.waitForFunction(()=>document.querySelector('#maison-ecoute-info').textContent==='Écoute terminée.');
 vrai(await p.locator('#audio').evaluate(a=>a.paused&&a.currentTime===0)&&await p.textContent('#maison-ecouter')==='Écouter le texte','la fin de l’enregistrement remet le bouton et la position au début');
 await joue();await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
 vrai(await p.locator('#audio').evaluate(a=>a.paused&&a.currentTime===0),'préparer une impression arrête la voix');
 await p.evaluate(()=>{const a=document.querySelector('#audio');window.__vraiPlay=a.play;a.play=()=>Promise.reject(new DOMException('Test synthétique','NotAllowedError'));});await p.click('#maison-ecouter');
 await p.waitForFunction(()=>document.querySelector('#maison-ecoute-info').textContent.includes('Impossible de lire'));
 vrai(await p.textContent('#maison-ecouter')==='Écouter le texte'&&await p.locator('#maison-ecouter').isEnabled(),'un refus de lecture affiche une erreur claire et reste réessayable');
 await p.evaluate(()=>{document.querySelector('#audio').play=window.__vraiPlay;});await joue();
 await p.fill('#maison-prenom','Test Voix');await p.click('#maison-depart');
 vrai(await p.locator('#audio').evaluate(a=>a.paused&&a.currentTime===0)&&await p.textContent('#maison-compte-nombre')==='3','Démarrer arrête la voix avant le premier nombre du compte à rebours');
 vrai(await p.locator('#maison-ecouter').isDisabled()&&await p.locator('#maison-ecouter-debut').isDisabled(),'la voix ne peut pas accompagner le défi chronométré');
 await p.clock.runFor(4000);await p.click('#maison-fini');await p.locator('#maison-texte [data-index="20"]').dispatchEvent('click');
 vrai(await p.locator('#maison-ecouter').isEnabled(),'l’écoute redevient disponible après le bilan');
 await joue();await p.click('#back');
 vrai(await p.locator('#audio').evaluate(a=>a.paused&&a.currentTime===0)&&await p.locator('#maison-ecouter').count()===0,'quitter le texte arrête et nettoie l’écoute');
 await p.click('[data-ep=E2]');await joue();
 vrai(await p.locator('#audio').evaluate(a=>a.dataset.maisonEp==='E2'&&!a.paused),'un autre épisode utilise sa propre voix sans anciens gestionnaires');
 await p.click('#maison-ecouter');await p.evaluate(()=>{const a=document.querySelector('#audio');a.play=()=>new Promise(resolve=>{window.__terminePlay=resolve;});});await p.click('#maison-ecouter');await p.click('#back');await p.evaluate(()=>window.__terminePlay());
 vrai(await p.locator('#audio').evaluate(a=>a.paused)&&await p.locator('#maison-ecouter').count()===0,'une promesse play terminée après navigation ne ressuscite pas le lecteur');
 await p.evaluate(()=>{document.querySelector('#audio').play=window.__vraiPlay;});await p.click('[data-ep=E1]');
 for(const width of [320,390]){await p.setViewportSize({width,height:width===320?568:844});await p.evaluate(()=>window.scrollTo(0,0));vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' px : les commandes d’écoute ne débordent pas');await p.screenshot({path:path.join(CAPT,width+'-ecoute.png')});}
 await p.evaluate(()=>Ecran.go({name:'episode',id:'T1',step:4}));await joue();
 vrai(await p.locator('#audio').evaluate(a=>a.dataset.maisonEp==='T1'&&!a.paused),'le texte facultatif T1 conserve sa voix enregistrée');
 await p.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));
 vrai(await p.locator('#maison-ecouter').count()===0&&await p.locator('#audio').evaluate(a=>a.paused)&&await p.locator('#maison-depart').count()===1,'un texte facultatif sans voix garde le défi, sans commande audio vide');
 vrai(externes.length===0,'aucune requête extérieure');vrai(erreurs.length===0,'aucune erreur JavaScript');console.log(`\n${nb} vérifications de l’écoute parents réussies.`);await c.close();
}finally{await b.close();S.serveur.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

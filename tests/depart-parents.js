// Départ familial : horloge virtuelle, sans donnée réelle ni service distant.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs'),fs=require('fs'),path=require('path');
const CAPT=path.join(__dirname,'captures','depart-parents');fs.mkdirSync(CAPT,{recursive:true});
let nb=0;const vrai=(ok,m)=>{if(!ok)throw Error(m);nb++;console.log('  ✓ '+m);};
(async()=>{const S=await site(),b=await(process.argv.includes('--webkit')?webkit:chromium).launch(),erreurs=[],externes=[];try{
for(const width of [320,390,1366]){
 const c=await b.newContext({viewport:{width,height:width===320?568:width===390?844:900},isMobile:width<500,hasTouch:width<500}),p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():(externes.push(r.request().url()),r.abort()));
 await p.clock.install({time:new Date('2026-12-15T10:00:00Z')});await p.clock.pauseAt(new Date('2026-12-15T10:01:00Z'));await p.goto(S.base+'#parents&essai-rapide');await p.click('button[data-ep=E1]');
 vrai((await p.textContent('#maison-consigne')).includes('3, 2, 1')&&(await p.textContent('#maison-consigne')).includes('trois bips'),width+' : le départ de trois secondes est expliqué avant Démarrer');
 await p.fill('#maison-prenom','Test Départ');await p.click('#maison-depart');
 vrai(await p.textContent('#maison-compte-nombre')==='3'&&await p.locator('#maison-compte-rebours').isVisible()&&await p.locator('#maison-depart').isDisabled()&&!await p.locator('#maison-fini').isVisible(),width+' : 3 est immédiat et le double départ est bloqué');
 vrai(await p.getAttribute('#maison-compte-rebours','role')==='status'&&await p.getAttribute('#maison-compte-rebours','aria-live')==='assertive',width+' : le compte à rebours possède une annonce accessible');
 await p.locator('#maison-compte-rebours').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-compte.png')});
 await p.evaluate(()=>{document.querySelector('#maison-depart').onclick();document.querySelector('#maison-texte [data-index="1"]').click();});
 vrai(await p.locator('#maison-texte .err').count()===0&&await p.textContent('#maison-chrono')==='8',width+' : toucher un mot ou redémarrer pendant le compte ne lance ni erreur ni chronomètre');
 await p.clock.runFor(1000);vrai(await p.textContent('#maison-compte-nombre')==='2'&&await p.textContent('#maison-chrono')==='8',width+' : 2 après une seconde, temps de lecture intact');
 await p.clock.runFor(1000);vrai(await p.textContent('#maison-compte-nombre')==='1'&&await p.textContent('#maison-chrono')==='8',width+' : 1 après deux secondes, temps de lecture intact');
 await p.clock.runFor(999);vrai(!await p.locator('#maison-fini').isVisible(),width+' : aucune lecture avant la fin des trois secondes');
 await p.clock.runFor(1);vrai(!await p.locator('#maison-compte-rebours').isVisible()&&await p.locator('#maison-fini').isVisible()&&await p.textContent('#maison-chrono')==='8',width+' : la lecture commence à trois secondes avec toute sa durée');
 await p.locator('#maison-texte [data-index="1"]').dispatchEvent('click');await p.clock.runFor(1000);
 vrai(await p.textContent('#maison-chrono')==='7'&&await p.locator('#maison-texte .err').count()===1,width+' : chronomètre et erreurs sont actifs seulement après le signal');
 await p.clock.runFor(7000);
 vrai(await p.locator('#maison-consigne.etat-dernier').count()===1&&await p.locator('.maison-pilotage.etat-dernier').count()===1&&(await p.textContent('#maison-consigne')).includes('dernier mot lu'),width+' : à la fin du temps, la bannière demande clairement le dernier mot');
 await p.locator('#maison-consigne').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-dernier.png')});
 vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' : compte à rebours et bannière ne débordent pas');
 await p.locator('#maison-texte [data-index="20"]').dispatchEvent('click');
 vrai(await p.evaluate(()=>{const r=JSON.parse(localStorage.getItem('fluence-parents-v1')).historique[0];return r.secondes===8&&r.erreurs===1&&r.lus===21;}),width+' : le bilan exclut les trois secondes de préparation et les clics prématurés');
 await p.click('#maison-depart');await p.click('#maison-depart');await p.clock.runFor(1000);await p.click('#back');await p.clock.runFor(5000);
 vrai(await p.locator('#maison-chrono,#maison-compte-rebours').count()===0&&await p.locator('button[data-ep=E1]').count()===1,width+' : quitter pendant 2 annule le départ sans lecture cachée');
 await p.click('button[data-ep=E1]');vrai(await p.textContent('#maison-chrono')==='8'&&await p.locator('#maison-depart').isEnabled()&&!await p.locator('#maison-compte-rebours').isVisible(),width+' : revenir retrouve un défi neuf prêt à démarrer');
 await p.click('#maison-depart');await p.clock.runFor(1000);await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await p.clock.runFor(5000);
 vrai(await p.locator('#maison-depart').isEnabled()&&!await p.locator('#maison-fini').isVisible()&&!await p.locator('#maison-compte-rebours').isVisible()&&await p.textContent('#maison-chrono')==='8',width+' : masquer la page annule le départ et ne lance pas la lecture en arrière-plan');
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await p.click('#maison-depart');await p.clock.runFor(3000);await p.clock.runFor(1000);await p.click('#maison-fini');
 vrai(await p.locator('#maison-consigne.etat-dernier').count()===1,width+' : Lecture terminée affiche aussi la bannière du dernier mot');
 await c.close();
}
vrai(externes.length===0,'aucune requête extérieure');vrai(erreurs.length===0,'aucune erreur JavaScript');console.log(`\n${nb} vérifications du départ parents réussies.`);
}finally{await b.close();S.serveur.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

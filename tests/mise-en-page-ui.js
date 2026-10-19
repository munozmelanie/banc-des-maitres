// Vrais rendus des fiches et routes retirées, avec données fictives uniquement.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs'),fs=require('fs'),path=require('path');
const CAPT=path.join(__dirname,'captures','mise-en-page');fs.mkdirSync(CAPT,{recursive:true});
let nb=0;const vrai=(v,m)=>{if(!v)throw Error(m);nb++;console.log('  ✓ '+m);};
(async()=>{const S=await site(),b=await(process.argv.includes('--webkit')?webkit:chromium).launch(),erreurs=[];try{
 for(const width of [320,390,1366]){
  const c=await b.newContext({viewport:{width,height:width<500?844:900},isMobile:width<500,hasTouch:width<500}),p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():r.abort());
  await p.goto(S.base+'#ecran');await p.waitForSelector('[data-ep=T1]');
  vrai(await p.locator('[data-ep^=T]').count()===5&&await p.locator('[data-ep=T2]').count()===0,width+' : cinq textes de période, sans BD');
  for(const id of ['T1','T3','T4','T5','T6']){
   await p.evaluate(id=>Ecran.go({name:'episode',id,step:4}),id);await p.evaluate(()=>document.fonts.ready);
   vrai(await p.evaluate(id=>{
    const E=Banc.ep(id),spans=[...document.querySelectorAll('#txt .w')];
    return JSON.stringify(spans.map(s=>s.textContent))===JSON.stringify(Banc.motsDefi(E).map(t=>t.t)) && E.layout.breaks.filter(r=>r.at>0).every(r=>spans[r.at].getBoundingClientRect().top>spans[r.at-1].getBoundingClientRect().top+2);
   },id),width+' '+id+' : tous les mots et toutes les ruptures originales restent dans leur ordre');
   vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' '+id+' : aucune ligne ne déborde du téléphone');
   if(width===390&&['T1','T4'].includes(id)){await p.locator('#txt').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,id+'-classe.png')});}
   await p.click('#back');
  }
  await p.evaluate(()=>Ecran.go({name:'episode',id:'T2',step:4}));
  vrai(await p.locator('#maison-depart').count()===0&&await p.locator('[data-ep^=T]').count()===5,width+' : une ancienne route BD revient aux textes disponibles');await c.close();
 }
 const c=await b.newContext({viewport:{width:1366,height:900}}),p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():r.abort());await p.goto(S.base+'#ecran');await p.waitForSelector('[data-ep=E1]');
 vrai(await p.locator('[data-ep]').count()===12&&await p.locator('[data-ep=T2]').count()===0,'Écran : douze textes disponibles');
 for(const id of ['T1','T4']){
  await p.evaluate(id=>Ecran.go({name:'episode',id,step:1}),id);await p.click('#next');await p.evaluate(()=>document.fonts.ready);
  const pages=await p.evaluate(id=>Banc.ep(id).pages.length-1,id);
  for(let n=1;n<=pages;n++){
   vrai(await p.evaluate(({id,n})=>{const P=Banc.ep(id).pages[n],spans=[...document.querySelectorAll('#txt .w')];return spans.length===P.toks.length&&P.layout.breaks.filter(r=>r.at>0).every(r=>spans[r.at].getBoundingClientRect().top>spans[r.at-1].getBoundingClientRect().top+2);},{id,n}),id+' page '+n+' : lignes conservées dans le lecteur et ses phrases audio');
   if(n<pages)await p.click('#next');
  }
 }
 await p.evaluate(async()=>{await Banc.Donnees.enregistreEleves([{id:'test-bd',nom:'Test Archive',objectif:''}]);await Banc.Donnees.ajoute({id:'test-ancien-bd',eleve:'test-bd',ep:'T2',date:'2026-10-18T10:00:00Z',mclm:60,lus:60,erreurs:0,secondes:60});Ecran.go({name:'progress'});});await p.click('[data-progress-eleve="test-bd"]');await p.selectOption('#progression-texte','T2');
 vrai(await p.locator('[data-progress-lecture="test-ancien-bd"]').count()===1,'Un résultat historique BD reste consultable sans réactiver le texte');
 await p.evaluate(()=>Ecran.go({name:'episode',id:'T2',step:1}));vrai(await p.locator('[data-ep=E1]').isVisible()&&await p.locator('#play').count()===0,'Ancienne route BD enseignante ramenée au catalogue');
 const t=await c.newPage();t.on('pageerror',e=>erreurs.push(e.message));await t.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():r.abort());await t.addInitScript(()=>localStorage.setItem('banc-des-maitres-defi-ep','T2'));await t.goto(S.base+'#tel');await t.click('[data-tab=defi]');
 vrai(await t.locator('#t-ep option').count()===12&&await t.locator('#t-ep').inputValue()!=='T2','Téléphone : ancienne sélection BD remplacée par un texte disponible');
 vrai(erreurs.length===0,'Aucune erreur JavaScript '+erreurs.join(' | '));console.log(nb+' vérifications de mise en page et catalogue réussies.');
}finally{await b.close();S.serveur.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

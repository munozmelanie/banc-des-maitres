// Scores fictifs : aucun service ni élève réel. Conservation et repérage du bilan final.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs'),fs=require('node:fs');
let n=0;const ok=(v,m)=>{if(!v)throw Error(m);console.log('  ✓ '+m);n++;};
(async()=>{const S=await site(),engine=process.argv.includes('--webkit')?webkit:chromium,b=await engine.launch();
try{for(const width of [390,1366]){const c=await b.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600}),p=await c.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{Object.defineProperty(window,'BANC_MAISON',{configurable:true,get:()=>({}),set:()=>{}});window.WebSocket=class{constructor(){throw Error('Pas de relais externe');}};});
await p.route('**/*',r=>r.request().url().startsWith(S.base)?r.continue():r.abort());
await p.goto(S.base+'?relais=local#'+(width<600?'tel':'ecran'));
await p.waitForFunction(()=>window.Banc?.Donnees.eleves().length);
const result=await p.evaluate(async()=>{
 await Banc.Donnees.enregistreEleves([{id:'test-suivi',nom:'Test Suivi',objectif:''}]);
 const E=Banc.ep('T3'),words=Banc.motsDefi(E).map((t,i)=>t.w?i:-1).filter(i=>i>=0);
 const base=Banc.calcule(E,'test-suivi',60,words[39],new Set());
 const lectures=[undefined,'entrainement','entrainement','entrainement','entrainement','defi'];
 const packets=lectures.map((type,i)=>EnvoiMaison.paquet({...base,id:'test-soir-'+i,origine:'maison',prenom:'Test Suivi',date:`2026-10-01T17:00:0${i}.000Z`,...(type?{typeLecture:type}:{})}));
 const parsed=packets.map(p=>EnvoiMaison.lit(JSON.stringify(p)));
 for(const r of parsed)await Banc.Donnees.ajoute({...r,id:EnvoiMaison.idLocal(r.id,'test-suivi'),sourceId:r.id,eleve:'test-suivi'});
 let invalides=0;for(const typeLecture of [null,'',4,'final','<script>']){try{EnvoiMaison.paquet({...base,origine:'maison',prenom:'Test Suivi',typeLecture});}catch(e){invalides++;}}
 return {oldAbsent:!Object.hasOwn(parsed[0],'typeLecture'),types:parsed.slice(1).map(r=>r.typeLecture),invalides,backup:JSON.stringify(Banc.Donnees.sauvegarde())};
});
ok(result.oldAbsent&&result.types.join(',')==='entrainement,entrainement,entrainement,entrainement,defi',width+': import/export conserve tous les types ; la quatrième tentative reste entraînement');
ok(result.invalides===5,width+': types inconnus refusés sans reclassification');
await p.click(width<600?'[data-tab=progres]':'[data-go=progress]');
await p.click('[data-progress-origine="maison"]');await p.click('[data-progress-eleve="test-suivi"]');await p.selectOption('#progression-texte','T3');
ok(await p.locator('[data-progress-point]').count()===6&&await p.locator('[data-progress-lecture]').count()===6,width+': six lectures du même texte, toutes sur la même courbe');
ok(await p.locator('.progression-point-defi').count()===1&&await p.locator('.progression-type-defi').count()===1,width+': seul le défi final porte un losange et son badge');
ok(await p.locator('.progression-legende').innerText().then(t=>t.includes('Défi du 4ᵉ soir')),width+': légende du défi final visible');
const final=p.locator('[data-progress-point="maison:test-suivi:test-soir-5"]');
ok((await final.getAttribute('aria-label')).includes('Défi du 4ᵉ soir'),width+': le type final est annoncé aux aides techniques');await final.focus();await p.keyboard.press('Enter');
ok(await p.locator('[data-progress-lecture="maison:test-suivi:test-soir-5"]').evaluate(e=>e.open),width+': le point final ouvre le bon bilan');
await p.selectOption('#progression-texte','E1');ok(await p.locator('[data-progress-point]').count()===0,width+': un autre épisode ne reprend aucun de ces scores');await p.selectOption('#progression-texte','T3');
const restore=await p.evaluate(async d=>{await Banc.Donnees.importe(JSON.parse(d));return Banc.Donnees.progres('test-suivi','maison','T3').lectures.map(r=>r.typeLecture||'ancienne');},result.backup);
ok(restore.join(',')==='ancienne,entrainement,entrainement,entrainement,entrainement,defi',width+': restauration sans doublon, types et anciens résultats conservés');
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': la page ne déborde pas');
ok(errors.length===0,width+': aucune erreur JavaScript');
fs.mkdirSync('/private/tmp/fluence-quatre-soirs-captures',{recursive:true});await p.screenshot({path:`/private/tmp/fluence-quatre-soirs-captures/suivi-${width}.png`,fullPage:true});await c.close();}
console.log(`${n} vérifications du suivi sur quatre soirs réussies.`);
}finally{await b.close();S.serveur.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

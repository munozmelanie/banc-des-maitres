// Changer la vitesse en cours de lecture : moteur audio, continuité et retour de la télécommande.
// Usage : python3 outils/build.py && node tests/vitesse.js
// Diagnostic court : node tests/vitesse.js --chromium --telephone
const fs=require("fs"),{chromium,webkit}=require("playwright"),{site,relais}=require("./serveurs");
let controles=0;
const verifie=(ok,message)=>{if(!ok)throw new Error(message);controles++;console.log("  ✓ "+message);};
const attend=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:5000});
const etat=p=>p.evaluate(()=>({vitesse:document.querySelector("#audio").playbackRate,pause:document.querySelector("#audio").paused,temps:document.querySelector("#audio").currentTime,choix:document.querySelector("#speed [aria-pressed=true]")?.id,page:document.querySelector("#pno")?.textContent}));
(async()=>{
  const S=await site(),R=await relais(),erreurs=[];
  const Q="?relais="+encodeURIComponent("nostr:"+R.url);
  const moteurs=process.argv.includes("--chromium")?[["Chromium",chromium]]:process.argv.includes("--webkit")?[["WebKit",webkit]]:[["Chromium",chromium],["WebKit",webkit]];
  try {
    for(const [nom,moteur] of moteurs){
      if(!fs.existsSync(moteur.executablePath())){if(nom==="Chromium"||process.argv.includes("--webkit"))throw new Error(nom+" absent : impossible de vérifier la vitesse.");console.log(nom+" absent : moteur ignoré.");continue;}
      console.log(nom+" : changement de vitesse pendant la lecture");
      const b=await moteur.launch(nom==="Chromium"?{args:["--autoplay-policy=no-user-gesture-required"]}:{});
      try {
        const ctx=await b.newContext(),ecran=await ctx.newPage({viewport:{width:1366,height:900}});ecran.on("pageerror",e=>erreurs.push(nom+" écran : "+e.message));
        await ecran.goto(S.base+Q+"#ecran");await ecran.click("[data-ep=E7]");
        await ecran.evaluate(()=>{const a=document.querySelector("#audio");window.__testVitesse={pauses:0,sauts:0};a.addEventListener("pause",()=>window.__testVitesse.pauses++);a.addEventListener("seeking",()=>window.__testVitesse.sauts++);});
        async function ouvreMode(step){
          // La première phrase d'E7/page2 dure dix secondes : l'écho ne finit pas pendant la mesure.
          await ecran.click(`.step >> nth=${step}`);await ecran.click("#v08");await ecran.click("#next");await ecran.click("#next");await ecran.click("#play");
          await attend(ecran,()=>{const a=document.querySelector("#audio");return !a.paused&&!a.seeking&&a.currentTime>Banc.ep("E7").pages[2].a+0.25;});
          await ecran.evaluate(()=>{window.__testVitesse={pauses:0,sauts:0};});
        }
        async function mesure(v,tempsAvant,label){
          // Vérifier la continuité ; la cadence exacte du tampon audio dépend du moteur du navigateur.
          const r=await ecran.evaluate(async()=>{const a=document.querySelector("#audio"),t=a.currentTime,pauseAvant=a.paused;await new Promise(resolve=>setTimeout(resolve,650));return {v:a.playbackRate,pauseAvant,pauseApres:a.paused,t0:t,t1:a.currentTime,evenements:{...window.__testVitesse},choix:+document.querySelector("#speed [aria-pressed=true]").dataset.v};});
          if(!(r.v===v&&r.choix===v&&!r.pauseAvant&&!r.pauseApres&&r.t0>=tempsAvant-0.03&&r.t1>r.t0&&r.evenements.pauses===0&&r.evenements.sauts===0))throw new Error(label+" : lecture interrompue ou état incorrect "+JSON.stringify(r));
          verifie(true,label+" : vitesse effective et sélection correctes, lecture continue sans retour au début");
        }
        if(!process.argv.includes("--telephone")){
          for(const step of [1,2,3]){
            await ouvreMode(step);
            for(const v of [0.6,1]){const avant=await etat(ecran);await ecran.click(v===0.6?"#v06":"#v10");await mesure(v,avant.temps,nom+" direct, mode "+step+", "+v+"×");}
          }
        }
        const code=await ecran.evaluate(()=>Plateforme.Liaison.code());
        const ctxT=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),tel=await ctxT.newPage();tel.on("pageerror",e=>erreurs.push(nom+" téléphone : "+e.message));
        await tel.goto(S.base+Q+"#tel&lien="+code);
        await tel.waitForFunction(()=>document.querySelector("#t-lien-txt").textContent==="Écran relié",null,{timeout:15000});
        for(const step of [1,2,3]){
          await ouvreMode(step);
          await attend(tel,s=>Telephone.etat()?.etape===s&&document.querySelector('[data-clic="v08"]')?.getAttribute("aria-pressed")==="true",step);
          for(const [v,origine] of [[0.6,"téléphone"],[1,"écran"]]){
            const id=v===0.6?"v06":v===1?"v10":"v08",avant=await etat(ecran);
            await (origine==="téléphone"?tel.locator(`[data-clic=${id}]`):ecran.locator("#"+id)).click();
            await attend(ecran,cible=>document.querySelector("#audio").playbackRate===cible,v);
            try {await attend(tel,cible=>document.querySelector(`[data-clic="${cible}"]`)?.getAttribute("aria-pressed")==="true",id);}
            catch(e){const distant=await tel.evaluate(()=>[...document.querySelectorAll('[data-clic][aria-pressed="true"]')].map(x=>x.dataset.clic));throw new Error(nom+" : après clic "+origine+" "+id+", le téléphone reste sur "+distant.join(",")+" ; écran="+JSON.stringify(await etat(ecran)));}
            verifie(true,nom+" mode "+step+" : le téléphone reflète "+v+"× après clic "+origine+", sans attendre une pause");
            await mesure(v,avant.temps,nom+" relié, mode "+step+", "+v+"×");
          }
        }
      } finally {await b.close();}
    }
    verifie(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${controles} vérifications de vitesse réussies.`);
  } finally {S.serveur.close();R.wss.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

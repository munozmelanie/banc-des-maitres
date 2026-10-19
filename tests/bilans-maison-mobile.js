// Bilans fictifs uniquement. Le tableau ancien comprimait ses mots lettre par lettre sur iPhone.
const {chromium,webkit}=require("playwright"),{site}=require("./serveurs"),fs=require("node:fs"),path=require("node:path");
const CAPT="/private/tmp/fluence-bilans-mobile";fs.mkdirSync(CAPT,{recursive:true});
let nb=0;const vrai=(ok,message)=>{if(!ok)throw Error(message);nb++;console.log("  ✓ "+message);};
(async()=>{
  const S=await site(),erreurs=[],externes=[];
  try{
    for(const [nom,moteur]of process.argv.includes("--chromium")?[["chromium",chromium]]:[["chromium",chromium],["webkit",webkit]]){
      const b=await moteur.launch();
      try{
        for(const width of [375,390,1366]){
          const mobile=width<600,c=await b.newContext({viewport:{width,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,colorScheme:"light"}),p=await c.newPage();
          await p.addInitScript(()=>Object.defineProperty(window,"BANC_MAISON",{get:()=>({}),set:()=>{}}));
          p.on("pageerror",e=>erreurs.push(e.message));
          await p.route("**/*",r=>{if(r.request().url().startsWith(S.base))return r.continue();externes.push(r.request().url());return r.abort();});
          await p.goto(S.base+"#tel");await p.click("[data-tab=eleves]");
          await p.evaluate(async()=>{
            await Banc.Donnees.enregistreEleves([{id:"qa-a",nom:"Test Élève au prénom composé particulièrement long",objectif:""},{id:"qa-b",nom:"Test B",objectif:""}]);
            for(const [i,ep]of ["T5","E1","T1"].entries())await Banc.Donnees.ajoute({id:"qa-maison-"+i,sourceId:"qa-source-"+i,eleve:i?"qa-b":"qa-a",origine:"maison",ep,date:`2026-10-${18-i}T10:00:00.000Z`,mclm:i?55:60000,lus:50,erreurs:i?1:0,secondes:60,...(i===0?{typeLecture:"defi"}:i===1?{typeLecture:"entrainement"}:{})});
            const d=Banc.Donnees.sauvegarde();window.__bilansAvant=JSON.stringify([d.classe,d.resultats,d.reglages]);
          });
          await p.click("#acces-parents");await p.evaluate(()=>document.fonts.ready);
          const label=`${nom} ${width}px`,cartes=p.locator(".maison-bilan-enregistre");
          vrai(await cartes.count()===3,label+" : chaque bilan dispose d’une fiche lisible");
          const contenu=await p.locator("#maison-resultats").innerText();
          vrai(contenu.includes("Test Élève au prénom composé particulièrement long")&&contenu.includes("La fée qui ne voulait pas être remerciée")&&contenu.includes("60000"),label+" : nom long, titre et score complet conservés");
          vrai(contenu.includes("Défi du 4ᵉ soir")&&contenu.includes("Entraînement")&&contenu.includes("Lecture"),label+" : les deux types et les anciennes lectures restent distingués");
          vrai(await p.evaluate(()=>[...document.querySelectorAll("[data-maison-supprime]")].map(e=>e.dataset.maisonSupprime).join(",")==="qa-maison-0,qa-maison-1,qa-maison-2"),label+" : ordre du plus récent au plus ancien conservé");
          vrai(await p.evaluate(()=>[document.querySelector("#maison-dialogue"),document.querySelector("#maison-resultats"),...document.querySelectorAll(".maison-bilan-enregistre")].every(e=>e.scrollWidth<=e.clientWidth+1)),label+" : ni le dialogue ni les fiches n’ont de défilement horizontal");
          vrai(await p.evaluate(()=>[...document.querySelectorAll(".maison-bilan-identite time,.maison-bilan-mesures dt,.maison-bilan-mesures dd,[data-maison-supprime]")].every(e=>{const r=document.createRange();r.selectNodeContents(e);const lignes=[...r.getClientRects()].filter(x=>x.width>0&&x.height>0);return lignes.length===1;})),label+" : dates, chiffres, légendes et boutons ne sont pas coupés lettre par lettre");
          vrai(await p.evaluate(()=>[...document.querySelectorAll("[data-maison-supprime]")].every(e=>{const r=e.getBoundingClientRect();return r.width>=100&&r.height>=48;})),label+" : boutons de suppression suffisamment larges pour le toucher");
          vrai(await p.evaluate(()=>{const d=Banc.Donnees.sauvegarde();return JSON.stringify([d.classe,d.resultats,d.reglages])===__bilansAvant;}),label+" : consulter les fiches ne modifie aucune donnée");
          await p.evaluate(()=>{const h=[...document.querySelectorAll("#maison-dialogue h2")].find(e=>e.textContent==="Bilans maison enregistrés");h.scrollIntoView({block:"start"});});
          await p.screenshot({path:path.join(CAPT,`${nom}-after-${width}.png`)});
          const supprime=p.locator('[data-maison-supprime="qa-maison-0"]');await supprime.scrollIntoViewIfNeeded();
          vrai(await supprime.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),label+" : supprimer reste accessible sans décalage");
          await supprime.focus();await p.keyboard.press("Enter");
          vrai(await supprime.innerText()==="Confirmer ?"&&await cartes.count()===3,label+" : premier appui demande confirmation sans supprimer");
          await p.keyboard.press("Enter");await p.waitForFunction(()=>Banc.Donnees.essaisMaison().length===2);
          vrai(await cartes.count()===2&&await p.evaluate(()=>{const r=Banc.Donnees.sauvegarde().resultats.liste.find(r=>r.id==="qa-maison-0");return r.suppr&&r.sourceId==="qa-source-0"&&r.eleve==="qa-a";}),label+" : confirmation conserve la suppression durable et son identité");
          for(const id of ["qa-maison-1","qa-maison-2"]){const bouton=p.locator(`[data-maison-supprime="${id}"]`);await bouton.click();await bouton.click();await bouton.waitFor({state:"detached"});}
          vrai((await p.locator("#maison-resultats").innerText()).includes("Aucun bilan maison"),label+" : l’état sans bilan reste lisible");
          await c.close();
        }
      }finally{await b.close();}
    }
    vrai(externes.length===0,"aucune requête vers un service réel");vrai(erreurs.length===0,"aucune erreur JavaScript");
    console.log(`\n${nb} vérifications des bilans maison réussies.`);
  }finally{S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

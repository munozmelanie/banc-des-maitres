// Parcours réels Élèves/Progrès avec des données inventées, écran et téléphone.
// Usage : python3 outils/build.py && node tests/objectifs-ui.js
const {chromium,webkit}=require("playwright"),{site,relais}=require("./serveurs"),fs=require("node:fs"),path=require("node:path");
const CAPT="/private/tmp/fluence-objectifs-captures";
let nb=0;
const vrai=(ok,message)=>{if(!ok)throw new Error(message);nb++;console.log("  ✓ "+message);};
const attend=(p,f)=>p.waitForFunction(f,null,{timeout:8000});
(async()=>{
  const S=await site(),R=await relais(),b=await (process.argv.includes("--webkit")?webkit:chromium).launch(),erreurs=[];
  fs.mkdirSync(CAPT,{recursive:true,mode:0o700});
  try{
    for(const tel of [false,true]){
      const mode=tel?"téléphone":"écran",c=await b.newContext({viewport:tel?{width:390,height:844}:{width:1366,height:900},isMobile:tel,hasTouch:tel});
      const p=await c.newPage();p.on("pageerror",e=>erreurs.push(e.message));
      await p.goto(S.base+"?relais="+encodeURIComponent("nostr:"+R.url)+(tel?"#tel":"#ecran"));
      await attend(p,()=>window.Banc&&Banc.Donnees.eleves().length>0);
      await p.evaluate(()=>Banc.Donnees.enregistreEleves([{id:"test-a",nom:"Test A",objectif:""},{id:"test-b",nom:"Test B",objectif:"90"},{id:"test-c",nom:"Test C",objectif:""}]));
      const eleves=()=>p.click(tel?"[data-tab=eleves]":"[data-go=students]");
      await eleves();
      vrai(await p.locator("#g0").inputValue()===""&&/Après la première lecture/.test(await p.locator('[data-objectif-info="test-a"]').textContent()),mode+" : le champ vide explique l'attente de la première lecture");
      await p.fill("#n0","Test Renommé");
      await p.evaluate(()=>Banc.Donnees.ajoute({id:"test-classe",eleve:"test-a",ep:"E1",date:"2026-10-19T10:00:00Z",mclm:50,lus:50,erreurs:0,secondes:60,fautes:[]}));
      await attend(p,()=>document.querySelector('[data-objectif-info="test-a"]').textContent==="Automatique : 55 MCLM");
      vrai(await p.locator("#n0").inputValue()==="Test Renommé"&&await p.locator("#g0").inputValue()==="",mode+" : recevoir une lecture actualise l'objectif sans perdre le prénom en cours de saisie");
      await p.click("#sv");
      await attend(p,()=>Banc.Donnees.eleve("test-a").nom==="Test Renommé");
      vrai(await p.evaluate(()=>Banc.Donnees.eleve("test-a").objectif===""&&Banc.Donnees.objectif("test-a")===55),mode+" : Enregistrer conserve le mode automatique, sans transformer 55 en valeur manuelle");
      await p.locator("#f").scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,tel?"objectifs-mobile.png":"objectifs-ecran.png"),fullPage:true});
      await p.evaluate(()=>Banc.Donnees.ajoute({id:"test-maison",eleve:"test-a",ep:"T1",date:"2026-10-17T10:00:00Z",mclm:70,lus:70,erreurs:0,secondes:60,fautes:[],origine:"maison",sourceId:"test-source-maison"}));
      await attend(p,()=>document.querySelector('[data-objectif-info="test-a"]').textContent==="Automatique : 77 MCLM");
      vrai(await p.locator("#g0").inputValue()===""&&/Meilleur score valide : 70 MCLM/.test(await p.locator('[data-objectif-info="test-a"]').getAttribute("title")),mode+" : le meilleur bilan maison actualise l’indication et sa référence tout en gardant le champ vide");
      await p.fill("#g0","91");
      vrai(await p.locator('[data-objectif-info="test-a"]').textContent()==="Objectif manuel"&&await p.evaluate(()=>Banc.Donnees.objectif("test-a")===77),mode+" : le brouillon manuel est annoncé sans être enregistré avant confirmation");
      await p.click("#sv");await attend(p,()=>Banc.Donnees.objectif("test-a")===91);
      await p.evaluate(()=>Banc.Donnees.ajoute({id:"test-encore-plus-ancien",eleve:"test-a",ep:"E1",date:"2026-10-01T10:00:00Z",mclm:100,lus:100,erreurs:0,secondes:60,fautes:[]}));
      vrai(await p.evaluate(()=>Banc.Donnees.objectif("test-a")===91)&&await p.locator("#g0").inputValue()==="91",mode+" : la valeur manuelle reste prioritaire après l’arrivée d’un score plus élevé");
      await p.fill("#g0","");await p.click("#sv");await attend(p,()=>Banc.Donnees.objectif("test-a")===110);
      vrai(await p.locator('[data-objectif-info="test-a"]').textContent()==="Automatique : 110 MCLM",mode+" : effacer puis enregistrer réactive le calcul automatique");
      await p.click("#sv");await p.evaluate(()=>Banc.Donnees.supprime("test-encore-plus-ancien"));
      await attend(p,()=>document.querySelector('[data-objectif-info="test-a"]').textContent==="Automatique : 77 MCLM");
      vrai(await p.evaluate(()=>Banc.Donnees.eleve("test-a").objectif===""),mode+" : un second Enregistrer ne fige pas la référence, même avant sa suppression");
      await p.click(tel?"[data-tab=progres]":"[data-go=progress]");
      await p.click('[data-progress-eleve="test-a"]');
      vrai((await p.locator("[data-progress-objectif-valeur]").textContent()).trim()==="77"&&/automatique/i.test(await p.locator("#progression-objectif").textContent()),mode+" : le détail de l'élève dans Progrès affiche l'objectif automatique calculé");
      await eleves();await p.fill("#g0","0");await p.click("#sv");await attend(p,()=>Banc.Donnees.objectif("test-a")===0);
      await p.click(tel?"[data-tab=progres]":"[data-go=progress]");
      vrai((await p.locator("[data-progress-objectif-valeur]").textContent()).trim()==="0"&&/manuel/i.test(await p.locator("#progression-objectif").textContent()),mode+" : le détail sélectionné et l'objectif manuel zéro sont conservés dans Progrès");
      await p.reload();await eleves();
      vrai(await p.locator("#g0").inputValue()==="0"&&await p.evaluate(()=>Banc.Donnees.objectif("test-a")===0),mode+" : le choix manuel est conservé après rechargement");
      vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),mode+" : les indications d'objectif ne débordent pas de l'écran");
      if(!tel){
        await p.click("[data-go=home]");await p.click("[data-ep=E1]");await p.locator(".step").nth(4).click();
        await p.click('[data-eleve="test-c"]');
        vrai(!/Objectif/.test(await p.locator("#essai").textContent()),"défi écran : pas d'objectif inventé avant la première lecture");
        await p.click("#go");await attend(p,()=>Ecran.etat().defi?.etat==="run");await p.waitForTimeout(1600);await p.click("#stop");
        const premierMot=await p.evaluate(()=>Banc.motsDefi(Banc.ep("E1")).findIndex(x=>x.w));
        await p.locator("#txt .w").nth(premierMot).click();await attend(p,()=>!document.querySelector("#res").hidden&&Banc.Donnees.essaisDe("test-c").length===1);
        vrai(await p.evaluate(()=>document.querySelector("#essai").textContent.includes(`Objectif : ${Banc.Donnees.objectif("test-c")} MCLM`)),"défi écran : terminer la première lecture affiche aussitôt son objectif calculé");
        vrai(await p.evaluate(()=>[...document.querySelectorAll("#res dt")].find(e=>e.textContent==="Objectif automatique")?.nextElementSibling.textContent===String(Banc.Donnees.objectif("test-c"))),"la carte du résultat affiche le même objectif que la préparation du défi");
        await p.evaluate(async()=>{const db=await claude.use("db");await db._ecritDistant("banc/resultats",{liste:[{id:"test-reference-distante-c",eleve:"test-c",ep:"T1",date:"2020-10-01T10:00:00Z",mclm:50,lus:50,erreurs:0,secondes:60,fautes:[],origine:"maison",sourceId:"test-reference-source-c"}]});});
        await attend(p,()=>document.querySelector("#essai").textContent.includes("Objectif : 55 MCLM"));
        vrai(await p.evaluate(()=>!document.querySelector("#res").hidden&&[...document.querySelectorAll("#res dt")].find(e=>e.textContent==="Objectif automatique")?.nextElementSibling.textContent==="55"),"un meilleur score distant reçu après le défi actualise l'objectif sans fermer le résultat");
        await p.click("#go");
        vrai(await p.locator("#go").textContent()==="Départ"&&/Objectif : 55 MCLM/.test(await p.locator("#essai").textContent()),"Recommencer conserve l'objectif automatique dans la préparation suivante");
      }
      await c.close();
    }
    vrai(erreurs.length===0,"aucune erreur JavaScript pendant les deux parcours");
    console.log(`\n${nb} vérifications d'interface des objectifs réussies.`);
  }finally{await b.close();S.serveur.close();R.wss.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

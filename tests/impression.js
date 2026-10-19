// Feuilles familiales : même texte que le défi, sans prénom ni interface enseignante.
// Usage : python3 outils/build.py && node tests/impression.js
const {chromium}=require("playwright"),{site}=require("./serveurs"),fs=require("fs"),path=require("path");
const DOSSIER=path.join(__dirname,"captures","impression");fs.mkdirSync(DOSSIER,{recursive:true});
let nb=0;const vrai=(condition,message)=>{if(!condition)throw new Error("ÉCHEC : "+message);nb++;console.log("  ✓ "+message);};
(async()=>{
  const S=await site(),b=await chromium.launch();const erreurs=[];
  try{
    const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await c.addInitScript(()=>{window.__impressions=0;window.print=()=>{window.__impressions++;};});
    const p=await c.newPage();p.on("pageerror",e=>erreurs.push(e.message));
    await p.goto(S.base+"#parents&prenom=Test%20Impression");await p.waitForSelector("[data-ep=T1]");
    for(const id of ["T1","T2","E1"]){
      await p.click(`[data-ep=${id}]`);
      vrai(await p.locator("#maison-imprimer").isVisible(),id+" propose l'impression dès les mots à préparer");
      await p.click("#maison-imprimer");
      vrai(await p.evaluate(id=>{
        const f=document.querySelector("#maison-impression"),E=Banc.ep(id),mots=[...f.querySelectorAll(".impression-mot")].map(x=>x.textContent);
        return f.dataset.ep===id&&f.querySelector("h1").textContent===E.titre&&JSON.stringify(mots)===JSON.stringify(Banc.motsDefi(E).map(x=>x.t))&&f.querySelectorAll("p[data-page]").length===E.pages.length-1&&!f.querySelector("button,audio,img,input")&&!f.textContent.includes("Test Impression");
      },id),id+" imprime exactement les mots du défi, dans l'ordre et sans prénom ni commandes");
      await p.emulateMedia({media:"print"});
      vrai(await p.evaluate(()=>getComputedStyle(document.querySelector("#app-ecran")).display==="none"&&getComputedStyle(document.querySelector("#app-tel")).display==="none"&&getComputedStyle(document.querySelector("#maison-impression")).display==="block"),id+" masque toute l'application lors de l'impression");
      await p.evaluate(()=>document.fonts.ready);
      await p.pdf({path:path.join(DOSSIER,id+".pdf"),format:"A4",preferCSSPageSize:true,displayHeaderFooter:false,printBackground:false});
      await p.emulateMedia({media:"screen"});
      await p.click("[data-go=home]");
    }
    await p.click("[data-ep=T3]");
    for(const step of [1,4]){
      await p.click(`[data-step='${step}']`);await p.click("#maison-imprimer");
      vrai(await p.evaluate(()=>document.querySelector("#maison-impression").dataset.ep==="T3"&&document.documentElement.scrollWidth<=390),`T3 : bouton imprimable et page sans débordement à l'étape ${step}`);
    }
    vrai(await p.locator("#panel").innerText().then(t=>/feuille imprimée ou à l’écran/.test(t)&&/sur son téléphone/.test(t)),"les consignes permettent la feuille pour l'enfant et le suivi sur téléphone, avec lecture à l'écran possible");
    vrai(await p.evaluate(()=>window.__impressions===5),"seuls les cinq clics explicites ont demandé l'impression");
    vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${nb} vérifications d'impression réussies. PDF : ${DOSSIER}`);
  }finally{await b.close();S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

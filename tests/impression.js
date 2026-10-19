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
    await p.goto(S.base+"#parents&prenom=Test%20Impression");await p.waitForSelector("[data-ep=E1]");
    const ids=[...Array.from({length:7},(_,i)=>"E"+(i+1)),...Array.from({length:6},(_,i)=>"T"+(i+1))];
    for(const id of ids){
      if(id==="T1")await p.click("[data-categorie=periode]");
      await p.click(`[data-ep=${id}]`);
      vrai(await p.locator("#maison-imprimer").isVisible()&&await p.locator("#maison-depart").isVisible()&&await p.locator(".step,#play,#wd").count()===0,id+" propose immédiatement le défi et l'impression sans étapes intermédiaires");
      await p.click("#maison-imprimer");
      vrai(await p.evaluate(id=>{
        const f=document.querySelector("#maison-impression"),E=Banc.ep(id),mots=[...f.querySelectorAll(".impression-mot")].map(x=>x.textContent);
        return f.dataset.ep===id&&f.querySelector("h1").textContent===E.titre&&JSON.stringify(mots)===JSON.stringify(Banc.motsDefi(E).map(x=>x.t))&&f.querySelectorAll("p[data-page]").length===E.pages.length-1&&!f.querySelector("button,audio,img,input")&&!f.textContent.includes("Test Impression");
      },id),id+" imprime exactement les mots du défi, dans l'ordre et sans prénom ni commandes");
      await p.emulateMedia({media:"print"});
      vrai(await p.evaluate(()=>getComputedStyle(document.querySelector("#app-ecran")).display==="none"&&getComputedStyle(document.querySelector("#app-tel")).display==="none"&&getComputedStyle(document.querySelector("#maison-impression")).display==="block"),id+" masque toute l'application lors de l'impression");
      await p.evaluate(()=>document.fonts.ready);
      if(["T1","T2","E1"].includes(id))await p.pdf({path:path.join(DOSSIER,id+".pdf"),format:"A4",preferCSSPageSize:true,displayHeaderFooter:false,printBackground:false});
      await p.emulateMedia({media:"screen"});
      await p.click("#back");
    }
    await p.click("[data-ep=T3]");
    vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=390),"T3 : le défi et le bouton d'impression tiennent sur le téléphone");
    vrai(await p.locator("#panel .lead").innerText().then(t=>/mots mal lus/.test(t))&&await p.locator("#maison-texte .w").count()>10,"le défi conserve une consigne brève et tout le texte pour suivre la lecture");
    vrai(await p.evaluate(()=>window.__impressions===13),"seuls les treize clics explicites ont demandé l'impression");
    vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${nb} vérifications d'impression réussies. PDF : ${DOSSIER}`);
  }finally{await b.close();S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

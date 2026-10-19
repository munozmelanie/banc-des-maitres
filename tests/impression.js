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
    const p=await c.newPage();await p.clock.setFixedTime(new Date("2027-01-04T12:00:00Z"));p.on("pageerror",e=>erreurs.push(e.message));
    await p.goto(S.base+"#parents&prenom=Test%20Impression");await p.waitForSelector("[data-ep=E1]");
    const ids=[...Array.from({length:7},(_,i)=>"E"+(i+1)),"T1","T3","T4","T5","T6"];
    for(const id of ids){
      if(id==="T1"){await p.goto(S.base+"?impression-classe=1#ecran");await p.waitForSelector("[data-ep=T1]");}
      await p.click(`[data-ep=${id}]`);
      vrai(await p.locator("#maison-imprimer").isVisible()&&(id.startsWith("T")||await p.locator("#maison-depart").isVisible()),id+" propose l’impression dans l’espace adapté, famille ou classe");
      await p.click("#maison-imprimer");
      vrai(await p.evaluate(id=>{
        const f=document.querySelector("#maison-impression"),E=Banc.ep(id),mots=[...f.querySelectorAll(".impression-mot")].map(x=>x.textContent);
        const ruptures=Banc.motsDefi(E).map((t,i)=>({...t,i})).filter(t=>t.rupture);
        const conserveRuptures=ruptures.every(t=>{const span=f.querySelector(`[data-index="${t.i}"]`);return ["paragraph","stanza"].includes(t.rupture)?span.parentElement.dataset.debut===String(t.i):span.previousElementSibling?.dataset.rupture===t.rupture;});
        return f.dataset.ep===id&&f.querySelector("h1").textContent===E.titre&&JSON.stringify(mots)===JSON.stringify(Banc.motsDefi(E).map(x=>x.t))&&conserveRuptures&&!f.querySelector("button,audio,img,input")&&!f.textContent.includes("Test Impression");
      },id),id+" imprime exactement les mots du défi, dans l'ordre et sans prénom ni commandes");
      await p.emulateMedia({media:"print"});
      vrai(await p.evaluate(()=>getComputedStyle(document.querySelector("#app-ecran")).display==="none"&&getComputedStyle(document.querySelector("#app-tel")).display==="none"&&getComputedStyle(document.querySelector("#maison-impression")).display==="block"),id+" masque toute l'application lors de l'impression");
      await p.evaluate(()=>document.fonts.ready);
      if(["T1","T3","T4","T5","T6","E1"].includes(id))await p.pdf({path:path.join(DOSSIER,id+".pdf"),format:"A4",preferCSSPageSize:true,displayHeaderFooter:false,printBackground:false});
      await p.emulateMedia({media:"screen"});
      await p.click("#back");
    }
    await p.evaluate(()=>Ecran.go({name:"episode",id:"T3",step:4}));
    vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=390),"T3 : le défi et le bouton d'impression tiennent sur le téléphone");
    vrai(await p.locator("#txt .w").count()>10&&await p.locator("#go").isVisible(),"le défi conserve une consigne brève et tout le texte pour suivre la lecture");
    vrai(await p.evaluate(()=>window.__impressions===5),"les cinq fiches de période ont été imprimées depuis la classe après les sept épisodes familiaux");
    vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${nb} vérifications d'impression réussies. PDF : ${DOSSIER}`);
  }finally{await b.close();S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

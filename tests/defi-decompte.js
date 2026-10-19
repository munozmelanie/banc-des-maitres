// Départ réel et annulation : écran, téléphone et relais local. Données fictives.
const {chromium,webkit}=require("playwright"),{site,relais}=require("./serveurs"),fs=require("fs"),path=require("path");
const CAPT="/private/tmp/fluence-defi-decompte";let nb=0;
const vrai=(ok,t)=>{if(!ok)throw Error(t);nb++;console.log("  ✓ "+t);};
const attend=(p,fn,arg,timeout=10000)=>p.waitForFunction(fn,arg,{timeout});
function sonFictif(){
  window.__bips=[];window.__reprisesSon=0;
  window.AudioContext=class{constructor(){this.state="suspended";this.currentTime=0;this.destination={};}resume(){this.state="running";__reprisesSon++;return Promise.resolve();}createOscillator(){return {frequency:{value:0},connect(g){return g;},start(){__bips.push(performance.now());},stop(){},disconnect(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},disconnect(){}};}};
}
(async()=>{
  const S=await site(),R=await relais(),engine=process.argv.includes("--webkit")?webkit:chromium,b=await engine.launch(),erreurs=[];
  fs.mkdirSync(CAPT,{recursive:true});const Q="?relais="+encodeURIComponent("nostr:"+R.url);
  const ouvre=async(tel,fragment)=>{const c=await b.newContext({viewport:tel?{width:390,height:844}:{width:1366,height:900},hasTouch:tel,isMobile:tel});await c.addInitScript(sonFictif);const p=await c.newPage();p.on("pageerror",e=>erreurs.push(e.message));await p.goto(S.base+Q+"#"+fragment);await attend(p,()=>!!window.Banc&&Banc.Donnees.eleves().length>0);return p;};
  try{
    const e=await ouvre(false,"ecran&essai-rapide");await e.evaluate(()=>Banc.Donnees.enregistreEleves([{id:"test-a",nom:"Test A",objectif:""},{id:"test-b",nom:"Test B",objectif:""}]));
    await e.click("[data-ep=E1]");await e.click("[data-step='4']");await e.click("#who [data-eleve=test-a]");
    vrai(/3 secondes/.test(await e.locator(".defi-depart-info").textContent()),"l’écran annonce les trois secondes avant le départ");
    await e.evaluate(()=>{__bips=[];window.__clic=performance.now();});await e.click("#go");
    vrai(await e.evaluate(()=>Ecran.etat().defi.etat==="countdown"&&document.querySelector("#defi-nombre").textContent==="3"&&parseFloat(document.querySelector("#bar").style.width)===0&&document.querySelector("#stop").hidden),"3 apparaît immédiatement ; le chrono de lecture reste arrêté");
    await e.locator("#go").dispatchEvent("click");await e.locator("#txt .w").nth(1).click();
    vrai(await e.evaluate(()=>__bips.length===1&&!document.querySelector("#txt .w.err")&&Ecran.etat().defi.local),"double départ et erreurs pendant le décompte sont ignorés ; l’écran réserve le pilotage");
    await attend(e,()=>document.querySelector("#defi-nombre").textContent==="2");await attend(e,()=>document.querySelector("#defi-nombre").textContent==="1");
    await e.screenshot({path:path.join(CAPT,"ecran-decompte.png")});await attend(e,()=>Ecran.etat().defi.etat==="run");
    vrai(await e.evaluate(()=>__bips.length===3&&__reprisesSon===1&&performance.now()-__clic>=2800&&document.querySelector("#defi-decompte").hidden),"3, 2, 1 jouent chacun un bip ; la lecture démarre après trois secondes");
    await e.locator("#txt .w").nth(2).click();await e.locator("#txt .w").nth(4).click();await e.locator("#txt .w").nth(4).click();await e.waitForTimeout(1050);await e.click("#stop");
    vrai(await e.evaluate(()=>document.querySelector("#hint").classList.contains("etat-dernier")&&document.querySelector("#hint").getAttribute("role")==="alert"&&parseFloat(getComputedStyle(document.querySelector("#hint")).fontSize)>=22),"la consigne du dernier mot est grande, contrastée et annoncée");
    await e.screenshot({path:path.join(CAPT,"ecran-dernier-mot.png")});
    await e.evaluate(()=>{const original=Banc.Donnees.ajoute;window.__sauvegardes=0;Banc.Donnees.ajoute=r=>{__sauvegardes++;return new Promise(resolve=>{window.__finSauvegarde=async()=>{Banc.Donnees.ajoute=original;resolve(await original(r));};});};});
    await e.locator("#txt .w").nth(20).click();await attend(e,()=>Ecran.etat().defi.etat==="saving");
    await e.locator("#go").dispatchEvent("click");await e.locator("#go").dispatchEvent("click");await e.locator("#who [data-eleve=test-b]").click();await e.locator("#txt .w").nth(21).click();
    vrai(await e.evaluate(()=>Ecran.etat().defi.etat==="saving"&&Ecran.etat().defi.local&&Ecran.etat().defi.eleve==="test-a"&&document.querySelector("#go").disabled&&document.querySelector("#res").hidden&&__sauvegardes===1),"un stockage lent bloque nouveau départ, changement d’élève et double résultat");
    await e.evaluate(()=>__finSauvegarde());await attend(e,()=>!document.querySelector("#res").hidden);
    vrai(await e.evaluate(()=>Ecran.etat().defi.etat==="done"&&!document.querySelector("#go").disabled&&document.querySelector("#defi-decompte").hidden),"la confirmation du stockage rend le résultat et réactive seulement Recommencer");
    vrai(await e.evaluate(()=>{const r=Banc.Donnees.essais()[0];return r.secondes>=1&&r.secondes<=2&&r.erreurs===1;}),"les trois secondes de préparation ne comptent pas dans le score");
    await e.click("#go");await e.click("#go");await e.click("#defi-annule");await e.waitForTimeout(3200);
    vrai(await e.evaluate(()=>Ecran.etat().defi.etat==="idle"&&Banc.Donnees.essais().length===1&&document.querySelector("#defi-decompte").hidden),"Annuler le départ supprime les rappels sans enregistrer de résultat");
    await e.click("#go");await e.click("[data-go=home]");await e.waitForTimeout(3200);vrai(await e.evaluate(()=>Ecran.route().name==="home"&&Banc.Donnees.essais().length===1),"quitter le défi annule aussi son décompte");
    const code=await e.evaluate(()=>Plateforme.Liaison.code()),t=await ouvre(true,"tel&lien="+code+"&essai-rapide");
    await attend(t,()=>Banc.Lien.relie()&&Banc.Donnees.eleve("test-a"));await attend(e,()=>Banc.Lien.relie());
    await t.click("[data-tab=defi]");await t.selectOption("#t-ep","E2");await t.click("#t-who [data-eleve=test-a]");await attend(e,()=>Ecran.route().id==="E2"&&Ecran.route().step===4);
    await e.evaluate(()=>{__bips=[];});await t.evaluate(()=>{__bips=[];});await t.click("#t-go");
    await attend(e,()=>Ecran.etat().defi.etat==="countdown"&&document.querySelector("#defi-nombre").textContent==="3");
    vrai(await t.evaluate(()=>Telephone.defi().etat==="decompte"&&Telephone.defi().t0===0&&Telephone.defi().ecoule===0&&Telephone.defi().tick===null),"le téléphone montre le décompte sans lancer le temps de lecture");
    vrai(await e.evaluate(()=>document.querySelector("#go").disabled&&!Ecran.etat().defi.local&&parseFloat(document.querySelector("#bar").style.width)===0&&__bips.length===0),"l’écran distant suit le nombre et laisse le téléphone seul piloter le départ");
    await t.setViewportSize({width:320,height:740});await t.screenshot({path:path.join(CAPT,"telephone-decompte.png")});
    await attend(t,()=>Telephone.defi().etat==="lecture");await attend(e,()=>Ecran.etat().defi.etat==="run");
    vrai(await t.evaluate(()=>__bips.length===3&&Telephone.defi().t0>0)&&await e.evaluate(()=>__bips.length===0),"le téléphone produit trois bips et un seul vrai départ, sans doublon sur l’écran");
    await t.evaluate(()=>{const d=Telephone.defi();Banc.Lien.emit("defi",{etat:"decompte",ep:d.ep,eleve:d.eleve,nombre:3,tour:d.tour,sequence:d.sequence-1});});await e.waitForTimeout(300);
    vrai(await e.evaluate(()=>Ecran.etat().defi.etat==="run"&&document.querySelector("#defi-decompte").hidden),"un ancien message de décompte retardé ne relance pas l’écran");
    await t.locator("#t-txt .w").nth(2).click();await t.waitForTimeout(1000);await t.click("#t-stop");
    vrai(await t.evaluate(()=>Telephone.defi().etat==="dernier"&&document.querySelector("#t-hint").classList.contains("etat-dernier")&&document.querySelector(".collant .etat-dernier")&&document.documentElement.scrollWidth<=320),"la consigne finale reste visible sur le téléphone étroit sans déborder");
    await t.screenshot({path:path.join(CAPT,"telephone-dernier-mot.png")});await t.locator("#t-txt .w").nth(20).click();await attend(t,()=>Telephone.defi().etat==="fini");
    const r=await t.evaluate(()=>Telephone.defi().resultat);await attend(e,id=>Banc.Donnees.contientResultat(id),r.id);
    vrai(r.secondes<4&&r.erreurs===1&&await e.evaluate(id=>Banc.Donnees.essais().filter(x=>x.id===id).length===1,r.id),"le même résultat du téléphone arrive une fois sur l’écran sans inclure le décompte");
    await t.click("#t-encore");await t.click("#t-go");await t.click("#t-annule-depart");await attend(e,()=>Ecran.etat().defi.etat==="idle");await t.waitForTimeout(3200);
    vrai(await t.evaluate(()=>Telephone.defi().etat==="choix"&&Banc.Donnees.essais().length===2)&&await e.evaluate(()=>Ecran.etat().defi.etat==="idle"),"annuler sur le téléphone annule aussi la préparation distante");
    await t.click("#t-go");await t.click("[data-tab=progres]");await attend(e,()=>Ecran.etat().defi.etat==="idle");await t.waitForTimeout(3200);
    vrai(await t.evaluate(()=>Telephone.defi().etat==="choix"&&Banc.Donnees.essais().length===2),"changer d’onglet annule le décompte du téléphone et tous ses rappels");
    vrai(erreurs.length===0,"aucune erreur JavaScript pendant les départs et annulations");
    console.log(`\n${nb} vérifications de départ du défi réussies.`);
  }finally{await b.close();S.serveur.close();R.wss.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Espace parents : classe fictive préexistante, aucun vrai prénom ni envoi externe.
// Usage : python3 outils/build.py && node tests/parents.js
const {chromium}=require("playwright"),{site}=require("./serveurs");
const fs=require("fs"),path=require("path");
const CAPT=path.join(__dirname,"captures");fs.mkdirSync(CAPT,{recursive:true});
let nb=0;
const vrai=(ok,message)=>{if(!ok)throw new Error("ÉCHEC : "+message);nb++;console.log("  ✓ "+message);};
const attend=(p,fn)=>p.waitForFunction(fn,null,{timeout:12000});

// Le remplissage précède les espions ; les lectures de contrôle contournent volontairement ceux-ci.
function espion(){
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  const cleClasse="banc-db:banc/classe",cleResultats="banc-db:banc/resultats",cleReglages="banc-db:banc/reglages";
  const fixtures={
    [cleClasse]:JSON.stringify({data:{eleves:[{id:"test-prive-a",nom:"Test Classe Cachée Alpha",objectif:"61"}],maj:123},rev:123}),
    [cleResultats]:JSON.stringify({data:{liste:[{id:"test-resultat-classe",eleve:"test-prive-a",ep:"T1",mclm:61,date:"2026-10-01T10:00:00Z"}]},rev:123}),
    [cleReglages]:JSON.stringify({data:{vitesse:1,maj:123},rev:123}),
    "banc-des-maitres-liaison":"ABCDE-FGHJK",
    "banc-des-maitres-role":"tel",
    "banc-des-maitres-onglet":"eleves"
  };
  if(!get.call(sessionStorage,"parents-test-seeded")){
    Object.entries(fixtures).forEach(([k,v])=>set.call(localStorage,k,v));
    set.call(sessionStorage,"parents-test-seeded","1");
  }
  const sensibles=k=>String(k).startsWith("banc-db:")||k==="banc-des-maitres-liaison";
  window.__parentsProbe={lectures:[],ecritures:[],websockets:[],envois:[]};
  window.__classeIntacte=()=>Object.entries(fixtures).every(([k,v])=>get.call(localStorage,k)===v);
  Storage.prototype.getItem=function(k){if(this===localStorage&&sensibles(k))window.__parentsProbe.lectures.push(k);return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){if(this===localStorage&&sensibles(k))window.__parentsProbe.ecritures.push(k);return set.call(this,k,v);};
  Storage.prototype.removeItem=function(k){if(this===localStorage&&sensibles(k))window.__parentsProbe.ecritures.push(k);return remove.call(this,k);};
  window.WebSocket=class{
    constructor(url){window.__parentsProbe.websockets.push(String(url));throw new Error("Une page parents ne doit ouvrir aucun salon.");}
  };
}

(async()=>{
  const S=await site(),b=await chromium.launch();const erreurs=[],externes=[],envoisHTTP=[];
  async function ouvre(hash,mobile=true){
    const c=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},isMobile:mobile,hasTouch:mobile});
    await c.addInitScript(espion);
    const p=await c.newPage();p.on("pageerror",e=>erreurs.push(e.message));
    p.on("request",r=>{if(!["GET","HEAD"].includes(r.method()))envoisHTTP.push(r.method());});
    await p.route("**/*",r=>{if(r.request().url().startsWith(S.base))return r.continue();externes.push(r.request().url());return r.abort();});
    await p.goto(S.base+hash);await p.waitForSelector("[data-ep=E1]");return p;
  }
  async function isolation(p,label){
    const etat=await p.evaluate(()=>({role:Banc.ROLE,lectures:__parentsProbe.lectures.length,ecritures:__parentsProbe.ecritures.length,ws:__parentsProbe.websockets.length,intacte:__classeIntacte(),fuite:document.body.innerText.includes("Test Classe Cachée Alpha")}));
    vrai(etat.role==="parents"&&etat.lectures===0&&etat.ecritures===0&&etat.ws===0&&etat.intacte&&!etat.fuite,label+" : aucune lecture de classe ou de code, aucun salon, données enseignantes intactes");
  }
  try{
    const p=await ouvre("#parents&lien=ABCDE-FGHJK&tel&essai-rapide");
    vrai(await p.evaluate(()=>document.documentElement.dataset.role==="parents"),"le lien parents prime sur le code de liaison, le rôle téléphone et les préférences enregistrées");
    await isolation(p,"Au démarrage");
    const gardes=await p.evaluate(async()=>{
      const db=await claude.use("db"),room=await claude.use("room");let refuse=false;
      try{await Banc.Donnees.init();}catch(e){refuse=true;}
      history.replaceState(null,"",location.pathname+"#ecran&lien=ZZZZZ-ZZZZZ");
      await Plateforme.Liaison.ouvre();await Plateforme.Liaison.assure();await Plateforme.Liaison.fixe("ZZZZZ-ZZZZZ");await Plateforme.Liaison.nouveau();await Plateforme.Liaison.oublie();
      const stable=Plateforme.role()==="parents";
      history.replaceState(null,"",location.pathname+"#parents&essai-rapide");
      return {db:db===null,room:room===null,refuse,stable,code:Plateforme.Liaison.code()};
    });
    vrai(gardes.db&&gardes.room&&gardes.refuse&&gardes.stable&&!gardes.code,"les capacités de classe et les méthodes de liaison restent fermées même après modification du fragment");
    await isolation(p,"Après appels de liaison refusés");
    for(const route of [{name:"students"},{name:"progress"},{name:"episode",id:"T1",step:5}])await p.evaluate(r=>Ecran.go(r),route);
    vrai(await p.locator("#f:visible, #import-classe-choisir:visible, #exp:visible, #imp:visible, #b-tel:visible").count()===0,"les routes Élèves, Progrès et sauvegarde de la classe sont inaccessibles aux parents");
    await p.evaluate(()=>Ecran.go({name:"home"}));
    await p.click("[data-categorie=entrainement]");
    vrai(await p.evaluate(()=>{
      const categories=[...document.querySelectorAll("[data-categorie]")];
      return categories.length===2&&categories[0].textContent.trim()==="Textes d’entraînement"&&categories[1].textContent.trim()==="Textes de la période"&&
        document.querySelectorAll("[data-ep]").length===7&&[...document.querySelectorAll("[data-ep]")].every((b,i)=>b.dataset.ep==="E"+(i+1));
    }),"l'accueil affiche deux catégories et uniquement les sept textes d'entraînement par défaut");
    vrai(await p.evaluate(()=>[...document.querySelectorAll("[data-ep]")].every(b=>b.textContent.trim()===Banc.ep(b.dataset.ep).titre)&&!document.querySelector("#maison-historique,#maison-bilans")),"les cartes ne contiennent que les titres, sans métadonnées de séance ni historique global");
    await p.click("[data-categorie=periode]");
    vrai(await p.evaluate(()=>document.querySelectorAll("[data-ep]").length===6&&[...document.querySelectorAll("[data-ep]")].every((b,i)=>b.dataset.ep==="T"+(i+1)&&b.textContent.trim()===Banc.ep(b.dataset.ep).titre)),"la catégorie période remplace la liste par ses six textes, sans afficher les textes d'entraînement");
    await p.evaluate(()=>window.scrollTo(0,0));
    vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=390),"l'accueil parents tient sur un téléphone de 390 px");
    await p.screenshot({path:path.join(CAPT,"parents-accueil-mobile.png")});

    for(const id of ["T1","T3"]){
      await p.click(`[data-ep=${id}]`);
      vrai(await p.locator("#maison-depart").isVisible()&&await p.locator("#maison-imprimer").isVisible()&&await p.locator(".step,#play,#wd,.noaudio").count()===0,id+" mène directement au défi et à l'impression, sans phases de préparation ou audio");
      for(const step of [0,1,2,3]){
        await p.evaluate(r=>Ecran.go(r),{name:"episode",id,step});
        vrai(await p.locator("#maison-depart").isVisible()&&await p.locator(".step,#play,#wd").count()===0,`${id} : une ancienne route d'étape ${step} ne peut pas afficher les autres phases`);
      }
      await p.click("#back");
      vrai(await p.locator("[data-ep=T1]").isVisible()&&await p.locator("[data-ep=E1]").count()===0,id+" : Retour conserve la catégorie période choisie");
    }
    await p.click("[data-ep=T3]");
    vrai(await p.evaluate(()=>JSON.stringify([...document.querySelectorAll("#maison-texte .w")].map(s=>s.textContent))===JSON.stringify(Banc.motsDefi(Banc.ep("T3")).map(x=>x.t))),"le défi direct reprend tous les mots du texte choisi dans leur ordre exact");
    await p.screenshot({path:path.join(CAPT,"parents-defi-mobile.png")});
    await p.fill("#maison-prenom","Test Famille");await p.click("#maison-depart");
    await p.click("#maison-texte .w[data-index='1']");await p.click("#maison-texte .w[data-index='4']");
    await attend(p,()=>/dernier/i.test(document.querySelector("#maison-consigne").textContent));
    await p.click("#maison-texte .w[data-index='20']");
    await attend(p,()=>!!document.querySelector("#maison-resultat")&&/mots/i.test(document.querySelector("#maison-resultat").textContent));
    const stock=await p.evaluate(()=>JSON.parse(localStorage.getItem("fluence-parents-v1"))),r=stock.historique[0];
    vrai(r&&r.origine==="maison"&&r.ep==="T3"&&r.prenom==="Test Famille"&&!Object.hasOwn(r,"eleve"),"le bilan local porte l'origine maison et ne contient aucun identifiant de classe");
    vrai(r.lus===21&&r.erreurs===2&&Math.abs(r.mclm-19*60/r.secondes)<=1,"le défi compte les mots, les deux erreurs et la durée effective");
    vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=390),"le bilan reste lisible sans débordement horizontal");
    await p.screenshot({path:path.join(CAPT,"parents-resultat-mobile.png")});
    await isolation(p,"Après lecture et défi");
    vrai(envoisHTTP.length===0,"sans lien personnel, le défi n'envoie aucun bilan automatiquement");

    await p.evaluate(()=>{window.__transmissionTest=null;window.EnvoiMaison={partage:async r=>{window.__transmissionTest=JSON.parse(JSON.stringify(r));r.prenom="Test mutation adaptateur";return {ok:true};}};});
    await p.locator("[data-envoi-maison]").first().click();await attend(p,()=>!!window.__transmissionTest);
    vrai(await p.evaluate(()=>{const r=__transmissionTest,s=JSON.parse(localStorage.getItem("fluence-parents-v1"));return r.origine==="maison"&&r.prenom==="Test Famille"&&!Object.hasOwn(r,"eleve")&&!Object.hasOwn(r,"classe")&&s.historique[0].prenom==="Test Famille";}),"l'action d'envoi reçoit uniquement une copie du bilan familial, sans accès à la classe");
    await p.reload();await p.waitForSelector("[data-ep=E1]");await p.click("[data-categorie=periode]");await p.click("[data-ep=T3]");
    await p.locator("#maison-bilan-precedent summary").click();
    vrai(await p.locator("#maison-bilan-precedent").innerText().then(t=>t.includes("Test Famille")),"le dernier bilan du texte reste disponible après rechargement");
    await isolation(p,"Après rechargement");
    await p.evaluate(()=>{window.EnvoiMaison={partage:async()=>{throw new DOMException("Partage de test annulé","AbortError");}};});
    await p.locator("[data-envoi-maison]").first().click();
    await attend(p,()=>/annulé/i.test(document.querySelector("[data-envoi-info]").textContent));
    vrai(await p.locator("[data-envoi-maison]").first().isEnabled()&&await p.evaluate(()=>JSON.parse(localStorage.getItem("fluence-parents-v1")).historique.length===1),"annuler le partage conserve le bilan et réactive le bouton");
    const sansStock=await ouvre("#parents&essai-rapide");
    await sansStock.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="fluence-parents-v1")throw new DOMException("Stockage de test plein","QuotaExceededError");return set.call(this,k,v);};});
    await sansStock.click("[data-categorie=periode]");await sansStock.click("[data-ep=T3]");await sansStock.fill("#maison-prenom","Test Stockage");await sansStock.click("#maison-depart");
    vrai(await sansStock.locator("#maison-stockage").isVisible(),"un stockage plein est signalé avant de perdre le bilan");
    await sansStock.click("#maison-fini");await sansStock.click("#maison-texte .w[data-index='20']");
    vrai(await sansStock.locator("#maison-resultat").innerText().then(t=>t.includes("Test Stockage"))&&await sansStock.evaluate(()=>localStorage.getItem("fluence-parents-v1")===null),"le bilan reste consultable en mémoire quand l'enregistrement local échoue");
    await isolation(sansStock,"Après échec du stockage familial");
    const large=await ouvre("#lien=ABCDE-FGHJK&parents&ecran",false);
    await isolation(large,"Parents sur grand écran avec paramètres mélangés");
    vrai(await large.evaluate(()=>document.documentElement.scrollWidth<=1366),"l'accueil parents tient aussi sur grand écran");
    await large.screenshot({path:path.join(CAPT,"parents-accueil-ecran.png")});
    vrai(externes.length===0,"aucune requête vers un service extérieur pendant lecture et défi");
    vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${nb} vérifications parents réussies.`);
  }finally{await b.close();S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

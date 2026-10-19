// Bilans maison : familles et classe fictives, partages interceptés, relais uniquement local.
// Usage : python3 outils/build.py && node tests/envoi-maison.js
const {chromium}=require("playwright"),{site,relais}=require("./serveurs");
const fs=require("fs"),path=require("path");
const CAPT=path.join(__dirname,"captures");fs.mkdirSync(CAPT,{recursive:true});
let nb=0;
const vrai=(ok,message)=>{if(!ok)throw new Error("ÉCHEC : "+message);nb++;console.log("  ✓ "+message);};
const attend=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:12000});
const code=d=>Buffer.from(JSON.stringify(d),"utf8").toString("base64url");
(async()=>{
  const S=await site(),R=await relais(),b=await chromium.launch(),erreurs=[],externes=[];
  const Q="?relais="+encodeURIComponent("nostr:"+R.url),liaison="ABCDE-FGHJK";
  async function ouvre(hash="ecran",mobile=false){
    const c=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},isMobile:mobile,hasTouch:mobile});
    await c.addInitScript(url=>{const WS=WebSocket;window.WebSocket=class extends WS{constructor(u,...args){if(String(u)!==url)throw new Error("Relais externe interdit dans ce test");super(u,...args);}};},R.url);
    const p=await c.newPage();p.on("pageerror",e=>erreurs.push(e.message));
    await p.route("**/*",r=>{const u=r.request().url();if(u.startsWith(S.base)||u.startsWith("blob:"))return r.continue();externes.push(u);return r.abort();});
    await p.goto(S.base+Q+"#"+hash);await attend(p,()=>!!window.Banc&&Banc.Donnees.eleves().length>0);return p;
  }
  const lire=(p,texte)=>p.evaluate(t=>EnvoiMaison.lit(t),texte);
  async function apercu(p,texte){await p.fill("#maison-importe",texte);await p.click("#maison-lit");await p.waitForSelector("#maison-confirme");}
  async function ferme(p){await p.click("#maison-retour");await p.waitForSelector("#maison-dialogue",{state:"detached"});}
  try{
    const p=await ouvre("ecran&lien="+liaison);
    await p.evaluate(async()=>{
      await Banc.Donnees.enregistreEleves([{id:"test-classe-a",nom:"Test Alpha",objectif:"70"},{id:"test-classe-b",nom:"Test Bêta",objectif:"80"}]);
      await Banc.Donnees.ajoute({id:"test-classe-essai",eleve:"test-classe-a",ep:"T3",date:"2026-10-01T10:00:00.000Z",lus:10,erreurs:0,secondes:60,mclm:10});
    });
    const brut=await p.evaluate(()=>{
      const E=Banc.ep("T3"),indices=Banc.motsDefi(E).map((t,i)=>t.w?i:-1).filter(i=>i>=0);
      const r=Banc.calcule(E,"identifiant-extérieur-à-ignorer",30,indices[19],new Set([indices[1],indices[4]]));
      return {...r,id:"test-maison-0001",origine:"maison",prenom:"  Test   Famille É  ",titre:"Titre extérieur à ignorer",mclm:9999,classe:{secret:"synthétique"},inconnu:"à ignorer"};
    });
    const paquet=await p.evaluate(r=>EnvoiMaison.paquet(r),brut),json=JSON.stringify(paquet),lien=S.base+"#bilan="+code(paquet);
    vrai(paquet.format==="fluence/bilan-maison"&&paquet.version===1&&/^[0-9a-f]{8}$/.test(paquet.texte),"le fichier possède un format, une version et l'empreinte du texte");
    vrai(paquet.bilan.prenom==="Test Famille É"&&paquet.bilan.mclm===36&&paquet.bilan.titre!==brut.titre&&!paquet.bilan.eleve&&!paquet.bilan.classe&&!paquet.bilan.inconnu,"normalisation : prénom et titre fiables, score recalculé, champs étrangers exclus");
    vrai(JSON.stringify(await lire(p,json))===JSON.stringify(await lire(p,"Voici le bilan :\n"+lien)),"JSON et lien partagé retrouvent le même bilan Unicode");
    async function refuse(d,label){const msg=await p.evaluate(t=>{try{EnvoiMaison.lit(t);return "";}catch(e){return e.message;}},typeof d==="string"?d:JSON.stringify(d));vrai(!!msg,label);}
    for(const [champ,valeur,label] of [["origine","classe","origine autre que maison refusée"],["id","x","identifiant invalide refusé"],["ep","T99","texte inconnu refusé"],["prenom","<img src=x onerror=alert(1)>","contenu HTML refusé"],["secondes",0,"durée nulle refusée"],["secondes",61,"durée supérieure à une minute refusée"],["dernier",99999,"dernier mot hors texte refusé"],["fautes",[1,1],"erreurs répétées refusées"],["lus",999,"nombre de mots incohérent refusé"],["erreurs",99,"nombre d'erreurs incohérent refusé"],["date","invalide","date invalide refusée"]])await refuse({...paquet,bilan:{...paquet.bilan,[champ]:valeur}},label);
    await refuse({...paquet,texte:"00000000"},"une autre version du texte ne peut être importée silencieusement");
    await refuse({...paquet,version:2},"version de fichier inconnue refusée");
    await refuse("x".repeat(30001),"limite de 30 Ko appliquée avant lecture");
    await refuse(S.base+"#bilan="+"a".repeat(20001),"lien encodé trop long refusé");

    await p.click("[data-go=students]");await p.click("#acces-parents");
    vrai(await p.locator("#maison-dialogue").isVisible(),"l'accès parents s'ouvre depuis la liste des élèves");
    await p.selectOption("#maison-invitation","test-classe-a");
    const invitation=await p.locator("#maison-url").inputValue(),fragment=new URLSearchParams(new URL(invitation).hash.slice(1));
    vrai(fragment.has("parents")&&fragment.get("prenom")==="Test Alpha"&&!fragment.has("lien")&&!invitation.includes("test-classe-a"),"le lien individuel contient uniquement le prénom prérempli, sans code ni ID de classe");
    await p.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async t=>{window.__copieParents=t;}}}));await p.click("#maison-copie");
    vrai(await p.evaluate(()=>__copieParents===document.querySelector("#maison-url").value),"copier le lien utilise uniquement le lien parents affiché");
    await apercu(p,json);
    vrai(await p.locator("#maison-eleve").inputValue()===""&&await p.evaluate(()=>Banc.Donnees.essaisMaison().length===0),"l'aperçu n'enregistre rien et demande l'élève pour un prénom inconnu");
    await p.click("#maison-confirme");vrai(/Choisis/.test(await p.locator("#maison-info").innerText()),"aucun import sans élève de la classe choisi");
    await p.click("#maison-annule");vrai(await p.evaluate(()=>Banc.Donnees.essaisMaison().length===0),"annuler l'aperçu conserve les résultats inchangés");
    await apercu(p,lien);await p.selectOption("#maison-eleve","test-classe-a");
    await p.screenshot({path:path.join(CAPT,"envoi-maison-apercu-desktop.png")});
    await p.click("#maison-confirme");await attend(p,()=>Banc.Donnees.essaisMaison().length===1);
    vrai(await p.evaluate(()=>{const r=Banc.Donnees.essaisMaison()[0];return r.id==="maison:test-classe-a:test-maison-0001"&&r.eleve==="test-classe-a"&&r.nomDeclare==="Test Famille É"&&!r.prenom&&r.mclm===36;}),"la confirmation associe le bilan à l'élève explicitement choisi");
    vrai(await p.evaluate(()=>Banc.Donnees.essais().length===1&&Banc.Donnees.essaisDe("test-classe-a","T3").length===1&&Banc.Donnees.record("test-classe-a")===10&&Banc.Donnees.sauvegarde().resultats.liste.length===2),"le bilan est sauvegardé mais ne modifie ni essais, ni numérotation, ni record de classe");
    await apercu(p,json);await p.selectOption("#maison-eleve","test-classe-b");await p.click("#maison-confirme");
    vrai(/déjà/.test(await p.locator("#maison-info").innerText())&&await p.evaluate(()=>Banc.Donnees.essaisMaison().length===1),"un second import est refusé même en choisissant un autre élève");await p.click("#maison-annule");

    const tel=await ouvre("tel&lien="+liaison,true);await attend(tel,()=>Banc.Donnees.essaisMaison().length===1);
    vrai(await tel.evaluate(()=>Banc.Donnees.essaisMaison()[0].eleve==="test-classe-a"&&Banc.Donnees.essais().length===1&&Banc.Donnees.record("test-classe-a")===10),"le téléphone récupère le bilan par la liaison existante sans l'inclure dans les records");
    await tel.click("[data-tab=progres]");await tel.click("#acces-parents");
    await tel.screenshot({path:path.join(CAPT,"envoi-maison-mobile.png")});
    const cadre=await tel.evaluate(()=>{const e=document.querySelector("#maison-dialogue"),r=e.getBoundingClientRect();return {gauche:r.left,droite:r.right,client:e.clientWidth,contenu:e.scrollWidth};});
    vrai(cadre.gauche>=0&&cadre.droite<=390&&cadre.contenu<=cadre.client+1,"la fenêtre de suivi maison et son contenu tiennent sur 390 px ("+JSON.stringify(cadre)+")");
    await p.click("[data-maison-supprime='maison:test-classe-a:test-maison-0001']");
    vrai(await p.evaluate(()=>Banc.Donnees.essaisMaison().length===1),"la première action de suppression demande confirmation sans supprimer");
    await p.click("[data-maison-supprime='maison:test-classe-a:test-maison-0001']");await attend(tel,()=>Banc.Donnees.essaisMaison().length===0);
    await apercu(p,json);await p.selectOption("#maison-eleve","test-classe-a");await p.click("#maison-confirme");
    vrai(/supprimé/.test(await p.locator("#maison-info").innerText())&&await p.evaluate(()=>Banc.Donnees.contientResultat("maison:test-classe-a:test-maison-0001")&&Banc.Donnees.sauvegarde().resultats.liste.some(r=>r.id==="maison:test-classe-a:test-maison-0001"&&r.suppr)),"une suppression synchronisée laisse un tombstone qui empêche la résurrection par import");await p.click("#maison-annule");

    const echec={...paquet,bilan:{...paquet.bilan,id:"test-maison-echec"}};
    await apercu(p,JSON.stringify(echec));await p.selectOption("#maison-eleve","test-classe-a");
    await p.evaluate(()=>{window.__setStockOriginal=Plateforme.Stock.set;Plateforme.Stock.set=async(k,v)=>{if(k==="banc-db:banc/resultats")throw new Error("Stockage de test refusé");return __setStockOriginal(k,v);};});
    await p.click("#maison-confirme");await attend(p,()=>/Impossible/.test(document.querySelector("#maison-info").textContent));
    vrai(await p.locator("#maison-confirme").isEnabled()&&await p.evaluate(async()=>!Banc.Donnees.contientResultat("maison:test-classe-a:test-maison-echec")&&!(await (await claude.use("db")).doc("banc/resultats").get()).data().liste.some(r=>r.id==="maison:test-classe-a:test-maison-echec")),"échec durable : pas de faux succès, pas de résultat en mémoire/cache, bouton réactivé");
    await p.evaluate(()=>{Plateforme.Stock.set=window.__setStockOriginal;});await p.click("#maison-confirme");await attend(p,()=>Banc.Donnees.contientResultat("maison:test-classe-a:test-maison-echec"));
    vrai(true,"le même bilan peut être réessayé après rétablissement du stockage");
    await ferme(p);await p.click("[data-go=progress]");await p.click("#acces-parents");
    vrai(await p.locator("#maison-dialogue").isVisible(),"l'accès parents est également disponible depuis les progrès");await ferme(p);
    await p.reload();await attend(p,()=>!!window.Banc&&Banc.Donnees.essaisMaison().length===1);
    vrai(await p.evaluate(()=>Banc.Donnees.essaisMaison()[0].id==="maison:test-classe-a:test-maison-echec"&&Banc.Donnees.essais().length===1),"le bilan importé persiste après rechargement sans modifier les essais de classe");
    const auto=await ouvre("ecran&bilan="+code({...paquet,bilan:{...paquet.bilan,id:"test-maison-auto"}}));await auto.waitForSelector("#maison-confirme");
    vrai(await auto.evaluate(()=>Banc.Donnees.essaisMaison().length===0&&!location.hash.includes("bilan=")),"ouvrir un lien reçu présente l'aperçu automatiquement, nettoie l'URL et attend la confirmation");
    await auto.click("#maison-annule");vrai(await auto.evaluate(()=>Banc.Donnees.essaisMaison().length===0),"annuler un lien reçu n'importe aucun bilan");
    await auto.locator("#maison-file").setInputFiles({name:"Fluence-bilan-test.json",mimeType:"application/json",buffer:Buffer.from(json)});await auto.waitForSelector("#maison-confirme");
    vrai(await auto.locator("#maison-apercu").innerText().then(t=>t.includes("Test Famille É")),"le fichier JSON reçu ouvre aussi un aperçu vérifiable");

    // API de partage réelle, plateformes remplacées par des espions : rien n'est envoyé.
    const partage=await p.evaluate(async r=>{
      let natif=null,web=null,copie=null;
      const old=Plateforme.partage;Plateforme.partage={share:async d=>{natif=d;}};
      const a=await EnvoiMaison.partage(r);Plateforme.partage=null;
      Object.defineProperty(navigator,"share",{configurable:true,value:async d=>{web=d;}});
      const b=await EnvoiMaison.partage(r);
      Object.defineProperty(navigator,"share",{configurable:true,value:undefined});
      Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async t=>{copie=t;}}});
      const c=await EnvoiMaison.partage(r);Plateforme.partage=old;
      return {natif,web,copie,messages:[a.message,b.message,c.message]};
    },brut);
    vrai(partage.natif.url===partage.web.url&&partage.web.url.includes("#bilan=")&&!partage.web.url.includes("lien=")&&partage.copie.includes(partage.web.url),"partage natif, navigateur et copie utilisent le même bilan sans code de classe");
    vrai(partage.messages.slice(0,2).every(t=>t.includes("réception n'est pas confirmée"))&&partage.messages[2].includes("puis envoie"),"les messages distinguent partage/copie et réception effective par l'enseignante");
    const annule=await p.evaluate(async r=>{Object.defineProperty(navigator,"share",{configurable:true,value:async()=>{throw new DOMException("Annulé pour le test","AbortError");}});try{await EnvoiMaison.partage(r);return false;}catch(e){return e.name==="AbortError";}},brut);
    vrai(annule,"l'annulation du navigateur remonte au parcours parents sans faux succès");
    await p.evaluate(()=>{Object.defineProperty(navigator,"share",{configurable:true,value:undefined});Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("Copie indisponible pour le test");}}});});
    const [download,retour]=await Promise.all([p.waitForEvent("download"),p.evaluate(r=>EnvoiMaison.partage(r),brut)]);
    const fichier=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
    vrai(download.suggestedFilename().startsWith("Fluence-bilan-T3-")&&fichier.bilan.mclm===36&&retour.message.includes("Joins ce fichier"),"sans partage ni presse-papiers, un fichier de bilan est téléchargé pour un envoi manuel");
    vrai(externes.length===0,"aucune requête externe : seuls le site et le relais de test locaux sont utilisés");
    vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${nb} vérifications d'envoi/import maison réussies.`);
  }finally{await b.close();S.serveur.close();R.wss.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Accès fictifs uniquement. Le guide ne déclenche ni installation système ni envoi externe.
const {chromium,webkit}=require("playwright"),{site}=require("./serveurs"),fs=require("node:fs"),path=require("node:path"),{createHash}=require("node:crypto");
const A="a".repeat(64),B="b".repeat(64),HASH_A=createHash("sha256").update(A).digest("hex"),HASH_B=createHash("sha256").update(B).digest("hex");
const CLE="fluence-installation-parents-v1:";
const ACCES="fluence-parents-acces-v1";
const UA={ios:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",android:"Mozilla/5.0 (Linux; Android 16; Test Phone) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36"};
const CAPT=process.env.FLUENCE_INSTALLATION_CAPTURES||"/private/tmp/fluence-installation-parents-qa";
// Parcours officiels : support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios
// et support.google.com/chrome/answer/15085120?co=GENIE.Platform%3DAndroid&hl=fr.
// Captures Android 16 / Chrome 155 : premier choix « Installer », puis sa confirmation.
const ETAPES={ios:[/menu|plus|…/i,/Partager/i,/Sur l’écran d’accueil/i,/Ouvrir comme app web/i,/Ajouter/i],android:[/menu.*⋮.*Chrome/i,/Installer et créer un raccourci/i,/Choisissez.*Installer.*premier choix/i,/Confirmez.*Installer/i]};
let nb=0;const vrai=(ok,message)=>{if(!ok)throw Error("ÉCHEC : "+message);nb++;console.log("  ✓ "+message);};
function observeMinuteurs(){
  const actifs=new Map(),set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
  window.__installationMinuteurs={actifs,executes:0};
  window.setTimeout=(callback,delai,...args)=>{
    let id;id=set(()=>{actifs.delete(id);__installationMinuteurs.executes++;callback(...args);},delai);
    actifs.set(id,delai);return id;
  };
  window.clearTimeout=id=>{actifs.delete(id);return clear(id);};
}
function prepare(options){
  window.__installation={copies:[],lecturesPrivees:[],lecturesAcces:0,ecritures:[],sockets:0};
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  for(const [k,v] of Object.entries(options.stockInitial||{}))if(get.call(localStorage,k)===null)set.call(localStorage,k,v);
  Storage.prototype.getItem=function(k){if(String(k).startsWith("banc-db:")||k==="banc-des-maitres-liaison")__installation.lecturesPrivees.push(k);if(k==="fluence-parents-acces-v1"){__installation.lecturesAcces++;if(options.lectureAccesRefuse)throw new DOMException("Lecture fictive refusée","SecurityError");}return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){__installation.ecritures.push([k,v]);if(options.stockageRefuse&&k.startsWith("fluence-installation-parents-v1:")||options.stockageAccesRefuse&&k==="fluence-parents-acces-v1")throw new DOMException("Quota fictif","QuotaExceededError");return set.call(this,k,v);};
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async texte=>{if(window.__copieRefusee)throw Error("Copie refusée");__installation.copies.push(texte);}}});
  if(options.standalone==="ios")Object.defineProperty(navigator,"standalone",{value:true,configurable:true});
  if(options.standalone==="css"){
    const media=window.matchMedia.bind(window);
    window.matchMedia=q=>q==="(display-mode: standalone)"?{matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:media(q);
  }
  if(options.natif)window.Capacitor={isNativePlatform:()=>true,Plugins:{}};
  window.WebSocket=class{constructor(){__installation.sockets++;throw Error("Réseau non autorisé dans le test");}};
}
(async()=>{
 const S=await site(),erreurs=[],externes=[],fuites=[];
 const moteurs=process.argv.includes("--chromium")?[["chromium",chromium]]:process.argv.includes("--webkit")?[["webkit",webkit]]:[["chromium",chromium],["webkit",webkit]];
 try{for(const [nom,moteur] of moteurs){
  const b=await moteur.launch();
  const dossier=path.join(CAPT,nom);fs.mkdirSync(dossier,{recursive:true});
  async function ouvre({systeme="ios",width=390,hash="#parents&famille="+A+"&prenom=Test%20Installation",standalone="",natif=false,stockageRefuse=false,stockageAccesRefuse=false,lectureAccesRefuse=false,stockInitial={},reducedMotion="no-preference",contexte}={}){
    const c=contexte||await b.newContext({viewport:{width,height:width===320?568:844},isMobile:systeme!=="desktop",hasTouch:systeme!=="desktop",...(UA[systeme]?{userAgent:UA[systeme]}:{}),colorScheme:"light",reducedMotion});
    if(!contexte)await c.addInitScript(prepare,{standalone,natif,stockageRefuse,stockageAccesRefuse,lectureAccesRefuse,stockInitial});
    const p=await c.newPage();p.setDefaultTimeout(12000);p.on("pageerror",e=>erreurs.push(nom+": "+e.message));
    p.on("request",r=>{if([r.url(),r.postData()||"",...Object.values(r.headers())].some(v=>v.includes(A)||v.includes(B)))fuites.push(true);});
    await p.route("**/*",r=>new URL(r.request().url()).origin===new URL(S.base).origin?r.continue():(externes.push(new URL(r.request().url()).origin),r.abort()));
    // L'horloge Playwright est partagée par les onglets du contexte.
    if(!contexte){await p.clock.install({time:new Date("2027-01-04T11:59:00Z")});await p.clock.pauseAt(new Date("2027-01-04T12:00:00Z"));}
    await p.goto(S.base+hash);await p.waitForFunction(()=>!!window.Parents&&document.documentElement.dataset.role);
    await p.waitForSelector("#view h1");return p;
  }
  async function taille(p,label){
    vrai(await p.evaluate(()=>{const d=document.querySelector("#maison-installation"),r=d.getBoundingClientRect();return Math.abs(r.left)<1&&Math.abs(r.top)<1&&r.right<=innerWidth+1&&r.height<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1;}),label+" : pleine page et aucun débordement horizontal");
    const bouton=p.locator("#maison-installation-continuer");await bouton.scrollIntoViewIfNeeded();
    vrai(await bouton.evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=48&&r.top>=0&&r.bottom<=innerHeight+1;}),label+" : continuer reste atteignable avec une cible tactile de 48 px");
  }
  async function attendCapture(animation){
    return animation.locator(".animation-capture img").evaluate(e=>e.complete?e.naturalWidth>0:new Promise(resolve=>{e.addEventListener("load",()=>resolve(e.naturalWidth>0),{once:true});e.addEventListener("error",()=>resolve(false),{once:true});}));
  }
  async function verifieCapture(animation,systeme,i){
    const capture=animation.locator(".animation-capture"),img=capture.locator("img");
    vrai(await img.count()===1&&await attendCapture(animation)&&await animation.getAttribute("data-loaded")==="true",`${systeme} étape ${i+1} : la vraie capture se charge entièrement`);
    vrai(await img.evaluate((e,systeme)=>{const u=new URL(e.currentSrc),r=e.getBoundingClientRect();return u.origin===location.origin&&new RegExp("/img/installation-"+systeme+"-[0-9]+\\.(png|webp)$").test(u.pathname)&&!u.search&&!u.hash&&e.naturalWidth>0&&e.naturalHeight>0&&r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&Math.abs(r.width/r.height-e.naturalWidth/e.naturalHeight)<0.01;},systeme),`${systeme} étape ${i+1} : image locale complète, proportions conservées et sans débordement`);
    vrai(await capture.locator("[data-animation-target]").count()===1&&await capture.evaluate(e=>{const image=e.querySelector("img").getBoundingClientRect(),cible=e.querySelector("[data-animation-target]").getBoundingClientRect();return cible.left>=image.left&&cible.left<=image.right&&cible.top>=image.top&&cible.top<=image.bottom;})&&await capture.locator(".animation-anneau").isVisible(),`${systeme} étape ${i+1} : le repère de toucher se situe dans la vraie capture`);
  }
  async function verifieAnimation(p,systeme){
    const animation=p.locator("[data-installation-animation]"),nombre=ETAPES[systeme].length;
    const frame=()=>animation.getAttribute("data-frame"),joue=()=>animation.getAttribute("data-playing");
    const actifs=()=>p.evaluate(()=>__installationMinuteurs.actifs.size);
    vrai(await animation.getAttribute("data-installation-animation")===systeme&&Number(await animation.getAttribute("data-frame-count"))===nombre,systeme+" : la démonstration suit le parcours du téléphone");
    vrai(await animation.locator(".animation-telephone").count()===0&&await animation.locator(".animation-capture").getAttribute("aria-hidden")==="true"&&await animation.locator(".animation-capture button,.animation-capture a,.animation-capture input").count()===0,"la capture réelle remplace le faux écran et ne détourne ni le focus ni les gestes du navigateur");
    for(let i=0;i<nombre;i++){
      await animation.locator(`[data-animation-step="${i}"]`).click();
      vrai(Number(await frame())===i&&await joue()==="false"&&ETAPES[systeme][i].test(await animation.locator("[data-animation-caption]").innerText()),`${systeme} étape ${i+1} : consigne correcte et sélection manuelle en pause`);
      await verifieCapture(animation,systeme,i);
    }
    await animation.locator('[data-animation-step="1"]').click();await animation.locator("[data-animation-prev]").click();
    vrai(await frame()==="0"&&await joue()==="false","Précédent revient à la première étape sans relancer l’animation");
    await animation.locator("[data-animation-next]").click();vrai(await frame()==="1"&&await joue()==="false","Suivant avance d’une étape en restant en pause");
    await animation.locator('[data-animation-step="0"]').click();await animation.locator("[data-animation-play]").click();await attendCapture(animation);
    vrai(await joue()==="true"&&await actifs()===1,"Lire démarre une seule séquence, sans minuteur doublé");
    await p.clock.runFor(3500);await attendCapture(animation);vrai(await frame()==="1","la démonstration avance après le temps de lecture de la consigne");
    for(let i=1;i<nombre;i++){await p.clock.runFor(3500);await attendCapture(animation);}vrai(await frame()==="0","la séquence complète revient à son début");
    await animation.locator("[data-animation-play]").click();const arret=await frame();await p.clock.runFor(10500);
    vrai(await frame()===arret&&await joue()==="false"&&await actifs()===0,"Pause fige la séquence et annule son minuteur");
    await animation.locator("[data-animation-play]").click();await attendCapture(animation);await p.clock.runFor(3500);await attendCapture(animation);
    vrai(await frame()==="1","Lire reprend après une pause");
    await p.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));});
    const cache=await frame();await p.clock.runFor(10500);
    vrai(await frame()===cache&&await joue()==="false"&&await actifs()===0,"passer en arrière-plan met l’animation en pause sans minuteur restant");
    await p.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));});await p.clock.runFor(3500);
    vrai(await frame()===cache&&await joue()==="false","le retour au premier plan attend une reprise volontaire");
    await animation.locator('[data-animation-step="0"]').click();await animation.locator("[data-animation-play]").click();await attendCapture(animation);
    await p.evaluate(()=>{window.__ancienneAnimation=document.querySelector("[data-installation-animation]");});
    await p.click("#maison-installation-continuer");await p.clock.runFor(10500);
    vrai(await animation.count()===0&&await actifs()===0&&await p.evaluate(()=>__ancienneAnimation.dataset.frame==="0"),"fermer le guide annule la séquence et ne modifie plus son ancien écran");
    await p.click("#maison-guide-installation");await attendCapture(animation);
    vrai(await animation.count()===1&&await actifs()===1,"rouvrir le guide monte une seule nouvelle séquence");
    await animation.locator("[data-animation-play]").click();
  }
  try{
    for(const systeme of ["ios","android"])for(const width of [320,390]){
      const p=await ouvre({systeme,width}),initial=p.url();await p.waitForSelector("#maison-installation[open]");
      vrai(await p.locator("#maison-installation-titre").isVisible(),`${nom} ${systeme} ${width} : première visite personnelle avec un accueil accessible`);
      await taille(p,`${systeme} ${width} accueil`);await p.locator("#maison-installation").evaluate(e=>e.scrollTop=0);await p.screenshot({path:path.join(dossier,`${systeme}-${width}-accueil.png`)});
      vrai(await p.locator("[data-installation-animation]").count()===0,"la démonstration n’est pas montée avant l’ouverture des étapes");
      await p.evaluate(observeMinuteurs);
      await p.click("#maison-installer");
      await p.locator(".maison-installation-ecrit summary").click();
      const texte=await p.locator("#maison-installation-etapes").innerText();
      vrai(systeme==="ios"?/Partager/.test(texte)&&/Sur l’écran d’accueil/.test(texte)&&/Ouvrir comme app/.test(texte):/Installer et créer un raccourci/.test(texte)&&/Installer l’application/.test(texte)&&/premier choix/.test(texte),`${systeme} : étapes adaptées et aucune fausse confirmation d’installation`);
      await p.locator(".maison-installation-ecrit summary").click();
      vrai(p.url()===initial&&await p.evaluate(()=>Banc.ROLE==="parents"&&__installation.lecturesPrivees.length===0&&__installation.sockets===0),"ouvrir le guide garde le lien personnel et n’accède pas à la classe");
      vrai(await p.locator("[data-animation-preview]").evaluate((e,token)=>{const r=e.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1&&!e.outerHTML.includes(token)&&!e.textContent.includes("Test Installation");},A),"le tutoriel tient dans l’écran et ne contient aucun prénom ni accès personnel");
      if(width===390)await verifieAnimation(p,systeme);
      else{
        const animation=p.locator("[data-installation-animation]");
        for(let i=0;i<ETAPES[systeme].length;i++){await animation.locator(`[data-animation-step="${i}"]`).click();await verifieCapture(animation,systeme,i);}
        await animation.locator('[data-animation-step="0"]').click();
      }
      await p.locator("#maison-installation-mode").scrollIntoViewIfNeeded();await p.screenshot({path:path.join(dossier,`${systeme}-${width}-etapes.png`)});
      await p.click("#maison-installation-copier");await p.waitForFunction(()=>document.querySelector("#maison-installation-message").textContent.startsWith("Lien copié"));
      vrai(await p.evaluate(()=>__installation.copies.length===1&&__installation.copies[0]===location.href),"le clic Copier conserve exactement l’accès personnel, uniquement dans le presse-papiers simulé");
      await p.evaluate(()=>{window.__copieRefusee=true;});await p.click("#maison-installation-copier");
      await p.waitForFunction(()=>document.querySelector("#maison-installation-message").textContent.includes("n’est pas disponible"));
      vrai(await p.evaluate(()=>__installation.copies.length===1),"un refus de copie affiche une aide sans prétendre avoir copié le lien");
      await taille(p,`${systeme} ${width} étapes`);await p.click("#maison-installation-continuer");
      vrai(await p.locator("#maison-installation").count()===0&&await p.locator("#maison-guide-installation").isVisible(),"continuer ferme l’accueil et laisse le guide retrouvable");
      const etat=await p.evaluate(()=>({ecritures:__installation.ecritures,stock:Object.fromEntries(Object.entries(localStorage))}));
      const autres={stock:Object.fromEntries(Object.entries(etat.stock).filter(([k])=>k!==ACCES)),ecritures:etat.ecritures.filter(([k])=>k!==ACCES)};
      vrai(etat.stock[CLE+HASH_A]==="vu"&&!JSON.stringify(autres).includes(A),"la préférence du guide ne contient que l’empreinte ; le secret Android reste dans le seul registre local des accès");
      vrai(systeme==="android"?JSON.parse(etat.stock[ACCES]).acces[0].token===A:!(ACCES in etat.stock),systeme==="android"?"l’accès Android est conservé pour l’icône commune, sans changement du lien courant":"l’iPhone ne conserve aucun nouveau registre d’accès");
      await p.click("button[data-ep=E1]");await p.waitForSelector("#maison-depart");
      vrai(p.url()===initial&&await p.inputValue("#maison-prenom")==="Test Installation","la lecture reste accessible avec le bon enfant après le guide");
      await p.reload();await p.waitForSelector("button[data-ep=E1]");
      vrai(await p.locator("#maison-installation").count()===0,"le même lien ne réaffiche pas l’accueil après rechargement");
      await p.click("#maison-guide-installation");await p.waitForSelector("#maison-installation-etapes:not([hidden])");
      await p.keyboard.press("Escape");vrai(await p.locator("#maison-installation").count()===0&&await p.locator("#maison-guide-installation").evaluate(e=>e===document.activeElement),"le guide se rouvre, Échap le ferme et le focus revient au bouton");
      if(systeme==="android"&&width===390){
        const result=await p.evaluate(()=>{let demandes=0;const e=new Event("beforeinstallprompt",{cancelable:true});e.prompt=()=>{demandes++;};dispatchEvent(e);return {demandes,annule:e.defaultPrevented,manifest:document.querySelector('link[rel="manifest"]').getAttribute("href")};});
        vrai(result.demandes===0&&!result.annule&&result.manifest==="parents.webmanifest","le guide laisse l’installation au menu de Chrome avec le manifest parents public");
        const autre=await ouvre({contexte:p.context(),systeme,width,hash:"#parents&famille="+B+"&prenom=Test%20Autre"});await autre.waitForSelector("#maison-installation[open]");await autre.click("#maison-installation-continuer");
        vrai(await autre.evaluate(({cle,hashA,hashB})=>localStorage.getItem(cle+hashA)==="vu"&&localStorage.getItem(cle+hashB)==="vu",{cle:CLE,hashA:HASH_A,hashB:HASH_B}),"deux liens familiaux gardent chacun leur préférence sans réaffecter l’icône à un dernier enfant");
        await p.click("#maison-guide-installation");await p.evaluate(token=>{location.hash="parents&famille="+token+"&prenom=Test%20Autre";},B);await p.waitForFunction(token=>location.hash.includes(token)&&document.querySelector("button[data-ep=E1]")&&!document.querySelector("#maison-installation"),B);
        await p.click("button[data-ep=E1]");vrai(await p.inputValue("#maison-prenom")==="Test Autre","changer de lien ferme l’ancien guide et ouvre uniquement le nouveau contexte");
      }
      await p.context().close();
    }
    for(const systeme of ["ios","android"]){
      const p=await ouvre({systeme,reducedMotion:"reduce"});await p.waitForSelector("#maison-installation[open]");await p.evaluate(observeMinuteurs);await p.click("#maison-installer");
      const animation=p.locator("[data-installation-animation]");await p.clock.runFor(10500);
      vrai(await animation.getAttribute("data-playing")==="false"&&await animation.getAttribute("data-frame")==="0"&&await p.evaluate(()=>__installationMinuteurs.actifs.size===0),systeme+" : réduction des animations respectée dès l’ouverture, sans défilement automatique");
      vrai(await animation.evaluate(e=>e.getAnimations({subtree:true}).every(a=>a.playState!=="running")),"réduction des animations : aucun mouvement CSS n’est actif");
      await animation.locator("[data-animation-next]").click();vrai(await animation.getAttribute("data-frame")==="1","les étapes restent consultables manuellement avec les animations réduites");
      await p.click("#maison-installation-continuer");await p.context().close();
    }
    for(const ancienne of [false,true]){
      const p=await ouvre(),animation=p.locator("[data-installation-animation]");
      let libere,signale;const requete=new Promise(resolve=>signale=resolve);
      await p.route("**/img/installation-ios-1.png",r=>new Promise(resolve=>{libere=async()=>{await r.continue();resolve();};signale();}),{times:1});
      await p.waitForSelector("#maison-installation[open]");await p.evaluate(observeMinuteurs);await p.click("#maison-installer");await requete;
      await p.clock.runFor(10500);
      vrai(await animation.getAttribute("data-frame")==="0"&&await animation.getAttribute("data-loaded")==="false"&&await p.evaluate(()=>__installationMinuteurs.actifs.size===0),"une capture lente garde la première consigne sans minuterie ni défilement à vide");
      if(ancienne){
        await p.evaluate(()=>window.__ancienneCapture=document.querySelector(".animation-capture img"));
        await animation.locator('[data-animation-step="1"]').click();await attendCapture(animation);await libere();
        await p.evaluate(()=>{const e=window.__ancienneCapture;return e.complete?true:new Promise(resolve=>{e.addEventListener("load",()=>resolve(true),{once:true});e.addEventListener("error",()=>resolve(true),{once:true});});});
        await p.clock.runFor(10500);
        vrai(await animation.getAttribute("data-frame")==="1"&&await animation.getAttribute("data-playing")==="false"&&await animation.getAttribute("data-loaded")==="true"&&await p.evaluate(()=>__installationMinuteurs.actifs.size===0),"l’arrivée tardive d’une ancienne image ne réactive ni l’étape quittée ni sa minuterie");
      }else{
        await libere();await attendCapture(animation);
        vrai(await animation.getAttribute("data-loaded")==="true"&&await p.evaluate(()=>__installationMinuteurs.actifs.size===1),"la séquence commence une seule fois après le chargement réel de l’image");
        await p.clock.runFor(3499);vrai(await animation.getAttribute("data-frame")==="0","la capture chargée bénéficie de son temps de lecture complet");
        await p.clock.runFor(1);await attendCapture(animation);vrai(await animation.getAttribute("data-frame")==="1","la séquence reprend normalement après un téléchargement lent");
      }
      await p.click("#maison-installation-continuer");await p.context().close();
    }
    // L'icône Android démarre sur une adresse commune ; aucun enfant « récent »
    // implicite. Le registre ne contient que des accès reçus sur cet appareil.
    const registre=acces=>JSON.stringify({version:1,acces});
    const persoA={token:A,prenom:"Test Installation"},persoB={token:B,prenom:"Test Autre"};
    const historique=JSON.stringify({version:1,prenom:"Ancien profil",vitesse:0.8,historique:[],profils:{[HASH_A]:{prenom:"Test Installation",vitesse:0.6},[HASH_B]:{prenom:"Test Autre",vitesse:1}}});
    const direct=await ouvre({systeme:"android",stockInitial:{"fluence-parents-v1":historique}});
    vrai(await direct.evaluate(cle=>JSON.parse(localStorage.getItem(cle)).acces.length===1,ACCES),"un accès Android valide est mémorisé dès ouverture, avant tout clic sur le guide");
    const lancement=await ouvre({systeme:"android",standalone:"css",contexte:direct.context(),hash:"#parents&app=1"});
    vrai(new URL(lancement.url()).hash.includes(A)&&await lancement.evaluate(()=>Banc.ROLE==="parents"&&__installation.lecturesPrivees.length===0&&__installation.sockets===0),"le lancement app=1 restaure l’unique accès avant le rôle et sans lire la classe");
    vrai(await lancement.locator("#maison-choix-acces").count()===0&&await lancement.evaluate(()=>MaisonCloud.parentActif()),"l’accès restauré retrouve les fonctions privées de son enfant");
    if(await lancement.locator("#maison-installation").count())await lancement.click("#maison-installation-continuer");
    await lancement.click("button[data-ep=E1]");
    vrai(await lancement.inputValue("#maison-prenom")==="Test Installation"&&await lancement.evaluate(texte=>localStorage.getItem("fluence-parents-v1")===texte,historique),"la restauration conserve le prénom et les profils déjà enregistrés sans réécrire les résultats");
    await lancement.reload();await lancement.waitForSelector("button[data-ep=E1]");
    vrai(new URL(lancement.url()).hash.includes(A),"le même accès reste associé après rechargement");
    await direct.context().close();

    const plusieurs=await ouvre({systeme:"android",hash:"#parents&app=1",stockInitial:{[ACCES]:registre([persoA,persoB]),"fluence-parents-v1":historique}});
    vrai(await plusieurs.locator("#maison-choix-acces").isVisible()&&await plusieurs.locator("[data-acces-choix]").count()===2&&!new URL(plusieurs.url()).hash.includes(A),"plusieurs accès imposent un choix explicite, sans restaurer le dernier enfant");
    vrai(await plusieurs.evaluate(()=>!MaisonCloud.parentActif()&&__installation.lecturesPrivees.length===0&&__installation.sockets===0)&&await plusieurs.locator("#maison-choix-acces").evaluate(e=>!/[a-f0-9]{64}/.test(e.outerHTML)),"le sélecteur reste sans connexion de classe et n’insère aucun secret dans le DOM");
    await plusieurs.click('[data-acces-choix="1"]');await plusieurs.waitForSelector("button[data-ep=E1]");
    if(await plusieurs.locator("#maison-installation").count())await plusieurs.click("#maison-installation-continuer");
    await plusieurs.click("button[data-ep=E1]");
    vrai(new URL(plusieurs.url()).hash.includes(B)&&await plusieurs.inputValue("#maison-prenom")==="Test Autre","le choix du second enfant ouvre son lien et son propre prénom");
    vrai(await plusieurs.evaluate(texte=>localStorage.getItem("fluence-parents-v1")===texte,historique),"le choix d’un enfant conserve les profils des autres enfants");
    const nouveauLancement=await ouvre({systeme:"android",contexte:plusieurs.context(),hash:"#parents&app=1"});
    vrai(await nouveauLancement.locator("[data-acces-choix]").count()===2,"le lancement suivant redemande le choix au lieu de mémoriser un dernier enfant");
    await nouveauLancement.evaluate(t=>location.hash="parents&famille="+t+"&prenom=Test%20Installation",A);await nouveauLancement.waitForSelector("button[data-ep=E1]");
    vrai(await nouveauLancement.locator("#maison-choix-acces").count()===0&&new URL(nouveauLancement.url()).hash.includes(A),"un nouveau lien reçu dans le sélecteur recharge le bon contexte familial");
    await plusieurs.context().close();

    for(const [nom,hash] of [
      ["secret invalide","#parents&app=1&famille=invalide"],
      ["deux secrets","#parents&app=1&famille="+A+"&famille="+B],
      ["deux marqueurs parents","#parents&parents&app=1"],
      ["deux marqueurs app","#parents&app=1&app=1"],
      ["valeur app invalide","#parents&app=2"],
      ["prénom ajouté au lanceur","#parents&app=1&prenom=Autre"]
    ]){
      const p=await ouvre({systeme:"android",hash,stockInitial:{[ACCES]:registre([persoA])}});
      vrai(await p.locator("#maison-choix-acces").isVisible()&&await p.locator("[data-acces-choix]").count()===0&&!await p.evaluate(()=>MaisonCloud.parentActif()),nom+" : aucun accès mémorisé de remplacement");
      vrai(await p.locator('link[rel="manifest"]').getAttribute("href")==="parents.webmanifest",nom+" : le manifest reste public même si le lien est malformé");
      await p.context().close();
    }
    for(const [nom,stock,refuse] of [
      ["aucun accès",null,false],
      ["registre corrompu","{corrompu",false],
      ["registre ambigu",registre([persoA,persoA]),false],
      ["lecture du stockage refusée",registre([persoA]),true]
    ]){
      const p=await ouvre({systeme:"android",hash:"#parents&app=1",lectureAccesRefuse:refuse,stockInitial:{...(stock===null?{}:{[ACCES]:stock}),"fluence-parents-v1":historique}});
      vrai(await p.locator("#maison-choix-info").innerText().then(t=>t.includes("QR code"))&&!await p.evaluate(()=>MaisonCloud.parentActif()),nom+" : aide pour rouvrir le QR, aucune association choisie au hasard");
      vrai(await p.evaluate(t=>localStorage.getItem("fluence-parents-v1")===t,historique),nom+" : les anciennes lectures sont préservées");
      await p.context().close();
    }
    const sansStockage=await ouvre({systeme:"android",stockageAccesRefuse:true,stockInitial:{"fluence-parents-v1":historique}});
    await sansStockage.click("#maison-installer");
    vrai(await sansStockage.locator("#maison-installation-acces").innerText().then(t=>t.includes("ne peut pas être conservé")&&t.includes("QR code")),"l’échec de mémorisation est visible dans le guide, sans faux succès");
    await sansStockage.click("#maison-installation-continuer");await sansStockage.click("button[data-ep=E1]");
    vrai(await sansStockage.inputValue("#maison-prenom")==="Test Installation"&&await sansStockage.evaluate(t=>localStorage.getItem("fluence-parents-v1")===t,historique),"le lien courant reste utilisable et les lectures existantes restent intactes malgré un refus de stockage");
    await sansStockage.context().close();
    for(const cas of [
      {nom:"iPhone",systeme:"ios",hash:"#parents&app=1"},
      {nom:"native Android",systeme:"android",natif:true,hash:"#parents&app=1"},
      {nom:"espace enseignante Android",systeme:"android",hash:"#ecran&relais=local"},
      {nom:"lien parents générique Android",systeme:"android",hash:"#parents"}
    ]){
      const p=await ouvre({...cas,stockInitial:{[ACCES]:registre([persoA])}});
      vrai(!new URL(p.url()).hash.includes(A)&&await p.evaluate(()=>__installation.lecturesAcces===0&&__installation.ecritures.every(([k])=>k!=="fluence-parents-acces-v1")),cas.nom+" : aucun registre familial relu ou modifié, aucune restauration implicite");
      if(cas.systeme!=="android"||cas.natif||!cas.hash.startsWith("#parents"))vrai(await p.locator('link[rel="manifest"]').getAttribute("href")==="manifest.webmanifest",cas.nom+" : manifest existant conservé");
      await p.context().close();
    }
    for(const cas of [
      {nom:"ordinateur",systeme:"desktop",width:1366},{nom:"ordinateur étroit",systeme:"desktop",width:320},
      {nom:"app iPhone déjà ajoutée",standalone:"ios"},{nom:"app Android déjà ajoutée",systeme:"android",standalone:"css"},
      {nom:"appli native",natif:true},{nom:"lien générique",hash:"#parents"},
      {nom:"lien ambigu",hash:"#parents&famille="+A+"&famille="+B},
      {nom:"espace enseignante",hash:"#ecran&relais=local"}
    ]){
      const p=await ouvre(cas);vrai(await p.locator("#maison-installation,#maison-guide-installation").count()===0,cas.nom+" : aucun accueil ni guide d’installation familiale");await p.context().close();
    }
    const quota=await ouvre({stockageRefuse:true});await quota.waitForSelector("#maison-installation[open]");await quota.click("#maison-installation-continuer");await quota.click("button[data-ep=E1]");
    vrai(await quota.locator("#maison-depart").isVisible(),"une erreur de stockage de la préférence n’empêche pas d’accéder à la lecture");await quota.context().close();
  }finally{await b.close();}
 }}finally{S.serveur.close();}
 vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?": "+erreurs.join(" | "):""));
 vrai(externes.length===0,"aucune requête externe ni transmission du lien personnel");
 vrai(fuites.length===0,"aucun accès familial dans les URL réseau, en-têtes ou corps des requêtes");
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"../www/manifest.webmanifest"),"utf8"));
 vrai(!("start_url" in manifest)&&!("id" in manifest),"le manifest public reste inchangé, sans adresse familiale ni identifiant individuel");
 const parentsManifest=JSON.parse(fs.readFileSync(path.join(__dirname,"../www/parents.webmanifest"),"utf8"));
 vrai(parentsManifest.start_url==="./#parents&app=1"&&parentsManifest.scope==="./"&&parentsManifest.id==="./parents-app"&&parentsManifest.name==="Fluence","le manifest Android parents définit une identité et un lancement publics fixes");
 vrai(!JSON.stringify(parentsManifest).includes(A)&&!JSON.stringify(parentsManifest).includes(B)&&!JSON.stringify(parentsManifest).includes("famille")&&!JSON.stringify(parentsManifest).includes("prenom"),"les métadonnées transmises à WebAPK ne contiennent ni secret familial ni prénom");
 console.log(`\n${nb} contrôles du guide d’installation parents réussis. Captures : ${CAPT}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});

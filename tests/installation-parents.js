// Accès fictifs uniquement. Le guide ne déclenche ni installation système ni envoi externe.
const {chromium,webkit}=require("playwright"),{site}=require("./serveurs"),fs=require("node:fs"),path=require("node:path"),{createHash}=require("node:crypto");
const A="a".repeat(64),B="b".repeat(64),HASH_A=createHash("sha256").update(A).digest("hex"),HASH_B=createHash("sha256").update(B).digest("hex");
const CLE="fluence-installation-parents-v1:";
const UA={ios:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",android:"Mozilla/5.0 (Linux; Android 15; Test Phone) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36"};
const CAPT=process.env.FLUENCE_INSTALLATION_CAPTURES||"/private/tmp/fluence-installation-parents-qa";
let nb=0;const vrai=(ok,message)=>{if(!ok)throw Error("ÉCHEC : "+message);nb++;console.log("  ✓ "+message);};
function prepare(options){
  window.__installation={copies:[],lecturesPrivees:[],ecritures:[],sockets:0};
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  Storage.prototype.getItem=function(k){if(String(k).startsWith("banc-db:")||k==="banc-des-maitres-liaison")__installation.lecturesPrivees.push(k);return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){__installation.ecritures.push([k,v]);if(options.stockageRefuse&&k.startsWith("fluence-installation-parents-v1:"))throw new DOMException("Quota fictif","QuotaExceededError");return set.call(this,k,v);};
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
 const S=await site(),erreurs=[],externes=[];
 const moteurs=process.argv.includes("--chromium")?[["chromium",chromium]]:process.argv.includes("--webkit")?[["webkit",webkit]]:[["chromium",chromium],["webkit",webkit]];
 try{for(const [nom,moteur] of moteurs){
  const b=await moteur.launch();
  const dossier=path.join(CAPT,nom);fs.mkdirSync(dossier,{recursive:true});
  async function ouvre({systeme="ios",width=390,hash="#parents&famille="+A+"&prenom=Test%20Installation",standalone="",natif=false,stockageRefuse=false,contexte}={}){
    const c=contexte||await b.newContext({viewport:{width,height:width===320?568:844},isMobile:systeme!=="desktop",hasTouch:systeme!=="desktop",...(UA[systeme]?{userAgent:UA[systeme]}:{}),colorScheme:"light"});
    if(!contexte)await c.addInitScript(prepare,{standalone,natif,stockageRefuse});
    const p=await c.newPage();p.setDefaultTimeout(12000);p.on("pageerror",e=>erreurs.push(nom+": "+e.message));
    await p.route("**/*",r=>new URL(r.request().url()).origin===new URL(S.base).origin?r.continue():(externes.push(new URL(r.request().url()).origin),r.abort()));
    await p.clock.setFixedTime(new Date("2027-01-04T12:00:00Z"));
    await p.goto(S.base+hash);await p.waitForFunction(()=>!!window.Parents&&document.documentElement.dataset.role);
    await p.waitForSelector("#view h1");return p;
  }
  async function taille(p,label){
    vrai(await p.evaluate(()=>{const d=document.querySelector("#maison-installation"),r=d.getBoundingClientRect();return Math.abs(r.left)<1&&Math.abs(r.top)<1&&r.right<=innerWidth+1&&r.height<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1;}),label+" : pleine page et aucun débordement horizontal");
    const bouton=p.locator("#maison-installation-continuer");await bouton.scrollIntoViewIfNeeded();
    vrai(await bouton.evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=48&&r.top>=0&&r.bottom<=innerHeight+1;}),label+" : continuer reste atteignable avec une cible tactile de 48 px");
  }
  try{
    for(const systeme of ["ios","android"])for(const width of [320,390]){
      const p=await ouvre({systeme,width}),initial=p.url();await p.waitForSelector("#maison-installation[open]");
      vrai(await p.locator("#maison-installation-titre").isVisible(),`${nom} ${systeme} ${width} : première visite personnelle avec un accueil accessible`);
      await taille(p,`${systeme} ${width} accueil`);await p.locator("#maison-installation").evaluate(e=>e.scrollTop=0);await p.screenshot({path:path.join(dossier,`${systeme}-${width}-accueil.png`)});
      await p.click("#maison-installer");
      const texte=await p.locator("#maison-installation-etapes").innerText();
      vrai(systeme==="ios"?/Partager/.test(texte)&&/Sur l’écran d’accueil/.test(texte)&&/Ouvrir comme app/.test(texte):/Installer et créer un raccourci/.test(texte)&&/Créer un raccourci/.test(texte)&&/ouvrir Chrome/.test(texte),`${systeme} : étapes adaptées et aucune fausse confirmation d’installation`);
      vrai(p.url()===initial&&await p.evaluate(()=>Banc.ROLE==="parents"&&__installation.lecturesPrivees.length===0&&__installation.sockets===0),"ouvrir le guide garde le lien personnel et n’accède pas à la classe");
      await p.locator("#maison-installation-mode").scrollIntoViewIfNeeded();await p.screenshot({path:path.join(dossier,`${systeme}-${width}-etapes.png`)});
      await p.click("#maison-installation-copier");await p.waitForFunction(()=>document.querySelector("#maison-installation-message").textContent.startsWith("Lien copié"));
      vrai(await p.evaluate(()=>__installation.copies.length===1&&__installation.copies[0]===location.href),"le clic Copier conserve exactement l’accès personnel, uniquement dans le presse-papiers simulé");
      await p.evaluate(()=>{window.__copieRefusee=true;});await p.click("#maison-installation-copier");
      await p.waitForFunction(()=>document.querySelector("#maison-installation-message").textContent.includes("n’est pas disponible"));
      vrai(await p.evaluate(()=>__installation.copies.length===1),"un refus de copie affiche une aide sans prétendre avoir copié le lien");
      await taille(p,`${systeme} ${width} étapes`);await p.click("#maison-installation-continuer");
      vrai(await p.locator("#maison-installation").count()===0&&await p.locator("#maison-guide-installation").isVisible(),"continuer ferme l’accueil et laisse le guide retrouvable");
      const etat=await p.evaluate(()=>({ecritures:__installation.ecritures,stock:Object.fromEntries(Object.entries(localStorage))}));
      vrai(etat.stock[CLE+HASH_A]==="vu"&&!JSON.stringify(etat).includes(A),"la préférence locale ne contient que l’empreinte et aucun secret familial");
      await p.click("button[data-ep=E1]");await p.waitForSelector("#maison-depart");
      vrai(p.url()===initial&&await p.inputValue("#maison-prenom")==="Test Installation","la lecture reste accessible avec le bon enfant après le guide");
      await p.reload();await p.waitForSelector("button[data-ep=E1]");
      vrai(await p.locator("#maison-installation").count()===0,"le même lien ne réaffiche pas l’accueil après rechargement");
      await p.click("#maison-guide-installation");await p.waitForSelector("#maison-installation-etapes:not([hidden])");
      await p.keyboard.press("Escape");vrai(await p.locator("#maison-installation").count()===0&&await p.locator("#maison-guide-installation").evaluate(e=>e===document.activeElement),"le guide se rouvre, Échap le ferme et le focus revient au bouton");
      if(systeme==="android"&&width===390){
        const result=await p.evaluate(()=>{let demandes=0;const e=new Event("beforeinstallprompt",{cancelable:true});e.prompt=()=>{demandes++;};dispatchEvent(e);return {demandes,annule:e.defaultPrevented,manifest:document.querySelector('link[rel="manifest"]').getAttribute("href")};});
        vrai(result.demandes===0&&!result.annule&&result.manifest==="manifest.webmanifest","le guide n’invoque pas WebAPK et ne remplace pas le manifest par un accès privé");
        const autre=await ouvre({contexte:p.context(),systeme,width,hash:"#parents&famille="+B+"&prenom=Test%20Autre"});await autre.waitForSelector("#maison-installation[open]");await autre.click("#maison-installation-continuer");
        vrai(await autre.evaluate(({cle,hashA,hashB})=>localStorage.getItem(cle+hashA)==="vu"&&localStorage.getItem(cle+hashB)==="vu",{cle:CLE,hashA:HASH_A,hashB:HASH_B}),"deux liens familiaux gardent chacun leur préférence sans réaffecter l’icône à un dernier enfant");
        await p.click("#maison-guide-installation");await p.evaluate(token=>{location.hash="parents&famille="+token+"&prenom=Test%20Autre";},B);await p.waitForFunction(token=>location.hash.includes(token)&&document.querySelector("button[data-ep=E1]")&&!document.querySelector("#maison-installation"),B);
        await p.click("button[data-ep=E1]");vrai(await p.inputValue("#maison-prenom")==="Test Autre","changer de lien ferme l’ancien guide et ouvre uniquement le nouveau contexte");
      }
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
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"../www/manifest.webmanifest"),"utf8"));
 vrai(!("start_url" in manifest)&&!("id" in manifest),"le manifest public reste inchangé, sans adresse familiale ni identifiant individuel");
 console.log(`\n${nb} contrôles du guide d’installation parents réussis. Captures : ${CAPT}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});

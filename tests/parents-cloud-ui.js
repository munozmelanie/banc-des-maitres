// Contrat visuel de transmission ; faux service en mémoire, aucun envoi externe.
const {chromium}=require("playwright"),{site}=require("./serveurs"),{createHash}=require("node:crypto");
let nb=0;const vrai=(c,m)=>{if(!c)throw new Error("ÉCHEC : "+m);nb++;console.log("  ✓ "+m);};
(async()=>{
  const S=await site(),b=await chromium.launch();const erreurs=[];
  try{
    async function service(p,actif){
      await p.evaluate(async actif=>{
        window.__cloudUI={actif,envois:[],etats:{},ecoutes:[]};
        window.MaisonCloud={
          parentActif:()=>__cloudUI.actif,
          etat:id=>__cloudUI.etats[id]||null,
          surChange:f=>{__cloudUI.ecoutes.push(f);return ()=>{__cloudUI.ecoutes=__cloudUI.ecoutes.filter(x=>x!==f);};},
          envoie:async r=>{
            __cloudUI.envois.push(JSON.parse(JSON.stringify(r)));
            const e={etat:__cloudUI.etats[r.id]?"recu":"attente",message:"En attente de réseau."};
            __cloudUI.etats[r.id]=e;__cloudUI.ecoutes.forEach(f=>f());return e;
          }
        };
        await Parents.demarre();
      },actif);
    }
    async function ouvre(actif,contexte,url="#parents"){
      const c=contexte||await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage();
      p.on("pageerror",e=>erreurs.push(e.message));
      await p.route("**/*",r=>r.request().url().startsWith(S.base)?r.continue():r.abort());
      await p.goto(S.base+url);await p.waitForSelector("[data-ep=T3]");
      await service(p,actif);return p;
    }
    async function defi(p,prenom="Test Transmission"){
      await p.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));await p.fill("#maison-prenom",prenom);
      await p.click("#maison-depart");await p.click("#maison-fini");await p.click("#maison-texte [data-index='2']");
      await p.waitForSelector("#maison-resultat .maison-bilan");
    }
    const p=await ouvre(true);await defi(p);
    await p.waitForFunction(()=>__cloudUI.envois.length===1);
    vrai(await p.evaluate(()=>{const r=__cloudUI.envois[0];return r.origine==="maison"&&r.prenom==="Test Transmission"&&!('eleve'in r)&&!('token'in r)&&!('famille'in r)&&!('contexte'in r);}),"un nouveau bilan est transmis automatiquement, sans identifiant de classe, token ni contexte local dans l'objet");
    vrai(await p.locator("[data-cloud-reessayer]").isVisible()&&await p.locator("[data-cloud-info]").innerText().then(t=>/attente/i.test(t)),"un bilan en attente propose Réessayer et ne prétend pas être reçu");
    await p.click("[data-cloud-reessayer]");
    await p.waitForFunction(()=>__cloudUI.envois.length===2&&document.querySelector('[data-cloud-info]').textContent.includes('reçu'));
    vrai(await p.evaluate(()=>__cloudUI.envois[0].id===__cloudUI.envois[1].id)&&!await p.locator("[data-cloud-reessayer]").isVisible(),"Réessayer conserve le même bilan ; le succès confirmé retire le bouton");
    await p.evaluate(()=>{__cloudUI.etats={};Ecran.go({name:'home'});});
    vrai(await p.evaluate(()=>__cloudUI.envois.length===2)&&await p.locator("[data-cloud-reessayer]").count()===1&&!await p.locator("[data-cloud-reessayer]").isVisible(),"un ancien bilan sans queue n'est pas envoyé sous un nouveau contexte familial");
    const g=await ouvre(false);await defi(g);
    vrai(await g.evaluate(()=>__cloudUI.envois.length===0),"le lien générique ne déclenche aucune transmission automatique");
    vrai(await g.locator("[data-cloud-info]").innerText().then(t=>/lien personnel/.test(t)),"le lien générique explique que la réception directe nécessite le lien personnel de l'enseignante");

    // Migration d'une version antérieure, puis deux liens dans le même navigateur.
    await g.evaluate(()=>{const d=JSON.parse(localStorage.getItem("fluence-parents-v1"));d.prenom="Test Héritage";d.historique[0].prenom=d.prenom;delete d.historique[0].contexte;delete d.profils;localStorage.setItem("fluence-parents-v1",JSON.stringify(d));});
    const tokenA="a".repeat(64),tokenB="b".repeat(64),hashA=createHash("sha256").update(tokenA).digest("hex"),hashB=createHash("sha256").update(tokenB).digest("hex");
    const a=await ouvre(true,g.context(),"#parents&famille="+tokenA+"&prenom=Test%20Famille%20A");
    const bb=await ouvre(true,g.context(),"#parents&famille="+tokenB);
    vrai(await a.locator("#maison-historique .maison-bilan").count()===0&&await bb.locator("#maison-historique .maison-bilan").count()===0,"les anciens bilans sans contexte ne sont attribués à aucun lien personnel");
    await a.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));await bb.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));
    vrai(await a.inputValue("#maison-prenom")==="Test Famille A"&&await bb.inputValue("#maison-prenom")==="","un lien préremplit son prénom ; l'autre ne reprend pas le prénom du lien commun");
    await defi(a,"Test Famille A");await defi(bb,"Test Famille B");
    vrai(await a.evaluate(()=>__cloudUI.envois.length===1)&&await bb.evaluate(()=>__cloudUI.envois.length===1),"chaque lien ne transmet que son nouveau défi, jamais les bilans des autres liens");
    const stock=await bb.evaluate(()=>JSON.parse(localStorage.getItem("fluence-parents-v1")));
    vrai(stock.historique.length===3&&stock.historique.some(r=>r.prenom==="Test Héritage"&&r.contexte==="")&&stock.historique.some(r=>r.prenom==="Test Famille A"&&r.contexte===hashA)&&stock.historique.some(r=>r.prenom==="Test Famille B"&&r.contexte===hashB),"deux onglets conservent les trois historiques, avec des empreintes SHA-256 distinctes et une migration sans perte");
    vrai(!JSON.stringify(stock).includes(tokenA)&&!JSON.stringify(stock).includes(tokenB)&&stock.prenom==="Test Héritage"&&stock.profils[hashA].prenom==="Test Famille A"&&stock.profils[hashB].prenom==="Test Famille B","le stockage des bilans ne contient aucun token brut et sépare les trois prénoms");
    await a.reload();await a.waitForSelector("#maison-historique");await service(a,true);
    vrai(await a.locator("#maison-historique .maison-bilan").count()===1&&await a.locator("#maison-historique").innerText().then(t=>t.includes("Test Famille A")&&!t.includes("Test Famille B")&&!t.includes("Test Héritage")),"le lien A ne retrouve que son propre historique après rechargement");
    await a.evaluate(()=>{window.__partage=null;window.EnvoiMaison.partage=async r=>{window.__partage=r;return {message:"Préparé pour le test."};};});
    await a.click("[data-envoi-maison]");
    vrai(await a.evaluate(()=>__partage.prenom==="Test Famille A"&&!('contexte'in __partage)&&!('token'in __partage)&&!('famille'in __partage)),"le partage manuel exclut aussi l'empreinte du contexte familial");
    await bb.reload();await bb.waitForSelector("#maison-historique");await bb.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));
    vrai(await bb.inputValue("#maison-prenom")==="Test Famille B","le lien B sans prénom dans l'URL retrouve uniquement son propre prénom mémorisé");
    await g.reload();await g.waitForSelector("#maison-historique");
    vrai(await g.locator("#maison-historique .maison-bilan").count()===1&&await g.locator("#maison-historique").innerText().then(t=>t.includes("Test Héritage")&&!t.includes("Test Famille A")&&!t.includes("Test Famille B")),"l'accès commun conserve les anciens bilans mais masque tous les bilans personnels");
    await g.evaluate(()=>Ecran.go({name:'episode',id:'T3',step:4}));
    vrai(await g.inputValue("#maison-prenom")==="Test Héritage","l'accès commun garde son prénom initial après les entraînements des deux liens");
    await a.evaluate(token=>{window.__ancienOnglet=true;location.hash="parents&famille="+token;},tokenB);
    await a.waitForFunction(()=>!window.__ancienOnglet&&document.querySelector("#maison-historique"));
    vrai(await a.locator("#maison-historique .maison-bilan").count()===1&&await a.locator("#maison-historique").innerText().then(t=>t.includes("Test Famille B")&&!t.includes("Test Famille A")),"ouvrir le lien du frère ou de la sœur dans le même onglet change réellement le contexte visible");
    vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${nb} vérifications de transmission familiale réussies.`);
  }finally{await b.close();S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

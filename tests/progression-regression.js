// Régressions indépendantes du suivi : uniquement classe, session et service fictifs.
// Usage : python3 outils/build.py && node tests/progression-regression.js [--chromium|--webkit]
const {chromium,webkit}=require("playwright"),{site}=require("./serveurs");
const fs=require("node:fs"),path=require("node:path");
const CAPT="/private/tmp/fluence-progression-regression",AUTH="fluence-cloud-auth-v1";
const API="https://fluence-regression.supabase.co",ACCESS="11111111-1111-4111-8111-111111111111";
let nb=0;
const vrai=(ok,message)=>{if(!ok)throw new Error(message);nb++;console.log("  ✓ "+message);};
const attend=(p,f,arg)=>p.waitForFunction(f,arg,{timeout:10000});
function serviceFictif({api,auth,access}){
  localStorage.setItem(auth,JSON.stringify({access_token:"test-session-locale",refresh_token:"test-refresh-local",user:{id:"test-enseignante",email:"enseignante@example.test"},expire:Date.now()+3600000}));
  Object.defineProperty(window,"BANC_MAISON",{configurable:true,get:()=>({url:api,publishableKey:"sb_publishable_fictif_sans_compte"}),set:()=>{}});
  window.__progressTest={rows:[],requests:[]};
  const fetchReel=window.fetch;
  window.fetch=async(input,options={})=>{
    const url=typeof input==="string"?input:input.url;
    if(!url.startsWith(api))return fetchReel(input,options);
    __progressTest.requests.push({path:new URL(url).pathname,method:options.method||"GET"});
    let data;
    if(url.includes("/rest/v1/fluence_accesses"))data=[{id:access,child_ref:"test-alpha",revoked:false,created_at:"2026-10-01T00:00:00Z"}];
    else if(url.includes("/rest/v1/fluence_results"))data=__progressTest.rows;
    else if(url.includes("/rest/v1/rpc/fluence_teacher_enabled"))data=true;
    else throw new Error("API fictive inattendue");
    return new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
  };
  window.WebSocket=class{constructor(){throw new Error("Aucun relais réseau dans ce test");}};
}
async function fixture(p){
  await p.evaluate(async()=>{
    await Banc.Donnees.enregistreEleves([
      {id:"test-alpha",nom:"Test Alpha",objectif:""},
      {id:"test-beta",nom:"Test Bêta",objectif:"0"},
      {id:"test-vide",nom:"Test Sans lecture",objectif:""}
    ]);
    const r=(id,eleve,ep,date,mclm,origine)=>({id,eleve,ep,date,mclm,lus:mclm+2,erreurs:2,secondes:60,dernier:mclm+1,fautes:[1,3],...(origine?{origine}:{}),...(origine==="maison"?{sourceId:"source-"+id}:{} )});
    const rs=[
      r("reg-class-04","test-alpha","E1","2026-10-06T09:00:00Z",75),
      r("reg-house-02","test-alpha","E1","2026-10-05T09:00:00Z",65,"maison"),
      r("reg-beta-class","test-beta","E2","2026-10-03T09:00:00Z",100),
      r("reg-class-01","test-alpha","E1","2026-10-02T09:00:00Z",50),
      r("reg-beta-house","test-beta","E2","2026-10-03T09:00:00Z",60,"maison"),
      r("reg-house-01","test-alpha","T1","2026-10-01T09:00:00Z",40,"maison"),
      r("reg-class-03","test-alpha","T1","2026-10-04T09:00:00Z",90,"classe"),
      r("reg-class-02","test-alpha","E1","2026-10-02T09:00:00Z",60,"classe"),
      r("reg-house-deleted","test-alpha","T1","2026-09-01T09:00:00Z",999,"maison")
    ];
    for(const row of rs)await Banc.Donnees.ajoute(row);
    await Banc.Donnees.supprime("reg-house-deleted");
  });
}
const stable=p=>p.evaluate(auth=>{const d=Banc.Donnees.sauvegarde();return JSON.stringify({classe:d.classe,resultats:d.resultats,reglages:d.reglages,session:localStorage.getItem(auth)});},AUTH);
const points=p=>p.locator("[data-progress-point]").evaluateAll(es=>es.map(e=>e.dataset.progressPoint));
const lectures=p=>p.locator("[data-progress-lecture]").evaluateAll(es=>es.map(e=>e.dataset.progressLecture));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function valeur(p,nom,attendu){
  const t=(await p.locator(`[data-progress-stat="${nom}"]`).textContent()).replace(/\u2212/g,"-");
  return new RegExp("(^|[^0-9])"+String(attendu).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"([^0-9]|$)").test(t);
}
async function ouvreLecture(p,id){
  if(!await p.locator("#tous").evaluate(e=>e.open))await p.locator("#tous > summary").click();
  const d=p.locator(`[data-progress-lecture="${id}"]`);
  if(!await d.evaluate(e=>e.open))await d.locator(":scope > summary").click();
}
(async()=>{
  const S=await site(),erreurs=[],externes=[];fs.mkdirSync(CAPT,{recursive:true,mode:0o700});
  try{
    const moteurs=process.argv.includes("--chromium")?[["chromium",chromium]]:process.argv.includes("--webkit")?[["webkit",webkit]]:[["chromium",chromium],["webkit",webkit]];
    for(const [moteur,engine] of moteurs){
      const b=await engine.launch();
      try{
        for(const width of [1366,390,320]){
          const tel=width<600,label=`${moteur} ${width}px`,ctx=await b.newContext({viewport:{width,height:tel?844:900},isMobile:tel,hasTouch:tel}),p=await ctx.newPage();
          p.setDefaultTimeout(10000);await p.addInitScript(serviceFictif,{api:API,auth:AUTH,access:ACCESS});
          p.on("pageerror",e=>erreurs.push(e.message));
          await p.route("**/*",route=>{if(route.request().url().startsWith(S.base)||route.request().url().startsWith("blob:"))return route.continue();externes.push(route.request().url());return route.abort();});
          await p.goto(S.base+"?relais=local#"+(tel?"tel":"ecran"));
          await attend(p,()=>window.Banc&&Banc.Donnees.eleves().length>0&&window.MaisonCloud?.connectee());
          await fixture(p);const avant=await stable(p);
          const progres=()=>p.click(tel?"[data-tab=progres]":"[data-go=progress]");
          await progres();
          vrai(await p.locator("[data-progress-eleve]").count()===3,label+" : les trois élèves, même sans lecture, sont proposés");
          vrai(await p.locator("#progression-titre").count()===0&&(await points(p)).length===0,label+" : aucun élève ni résultat n'est sélectionné avant le choix d'une fiche");
          vrai(await p.locator('[data-progress-origine="classe"]').getAttribute("aria-pressed")==="true"&&await p.locator('[data-progress-origine="maison"]').getAttribute("aria-pressed")==="false",label+" : l'origine sélectionnée est annoncée aux aides techniques");
          await p.fill("#progression-recherche","Beta");
          vrai(await p.locator("[data-progress-eleve]:visible").count()===1&&await p.locator('[data-progress-eleve="test-beta"]').isVisible(),label+" : la recherche retrouve un prénom accentué sans imposer l'accent");
          await p.fill("#progression-recherche","Introuvable");
          vrai(await p.locator("#progression-recherche-vide").isVisible(),label+" : une recherche sans résultat affiche son état vide");
          await p.fill("#progression-recherche","Test");
          await p.locator("#progression-recherche").evaluate(e=>e.setSelectionRange(2,2));
          await p.evaluate(async()=>{const db=await claude.use("db");await db._ecritDistant("banc/classe",Banc.Donnees.sauvegarde().classe);});
          await attend(p,()=>document.activeElement.id==="progression-recherche"&&document.activeElement.selectionStart===2);
          vrai(await p.locator("#progression-recherche").inputValue()==="Test",label+" : une copie reçue de la classe conserve recherche, focus et curseur en cours");
          await p.fill("#progression-recherche","");
          const choix=p.locator('[data-progress-eleve="test-alpha"]');await choix.focus();await p.keyboard.press("Enter");
          await p.waitForSelector("#progression-texte");
          vrai((await p.locator("#progression-titre").textContent()).includes("Test Alpha"),label+" : un élève est sélectionnable au clavier");
          vrai(eq(await points(p),["reg-class-01","reg-class-02","reg-class-03","reg-class-04"]),label+" : la courbe classe suit date puis identifiant, sans bilans maison ni suppression");
          vrai(eq(await lectures(p),["reg-class-04","reg-class-03","reg-class-02","reg-class-01"]),label+" : la liste des lectures présente les plus récentes d'abord");
          vrai(await valeur(p,"dernier",75)&&await valeur(p,"meilleur",90)&&await valeur(p,"evolution",25)&&await valeur(p,"lectures",4),label+" : les statistiques portent seulement sur les lectures classe de l'élève");
          vrai((await p.locator("[data-progress-objectif-valeur]").textContent()).trim()==="45"&&/automatique/i.test(await p.locator("#progression-objectif").textContent()),label+" : l'objectif commun utilise la première lecture maison malgré le mode classe");
          await p.selectOption("#progression-texte","E1");
          vrai(eq(await points(p),["reg-class-01","reg-class-02","reg-class-04"])&&await valeur(p,"meilleur",75)&&await valeur(p,"lectures",3),label+" : le filtre E1 modifie ensemble courbe, statistiques et lectures");
          vrai(eq((await lectures(p)).slice().sort(),["reg-class-01","reg-class-02","reg-class-04"]),label+" : aucun autre texte n'apparaît dans la liste filtrée");
          await p.selectOption("#progression-texte","T1");
          vrai(eq(await points(p),["reg-class-03"])&&await valeur(p,"lectures",1),label+" : une seule lecture reste lisible dans la courbe");
          await p.selectOption("#progression-texte","");
          const point=p.locator('[data-progress-point="reg-class-02"]');
          vrai(await point.getAttribute("tabindex")==="0",label+" : les points du graphique sont atteignables au clavier");
          await point.focus();await p.keyboard.press("Enter");
          vrai(await p.locator('[data-progress-lecture="reg-class-02"]').evaluate(e=>e.open)&&await p.locator("#tous").evaluate(e=>e.open),label+" : Entrée sur un point ouvre sa lecture exacte");
          const texteLecture=await p.locator('[data-progress-lecture="reg-class-02"]').innerText();
          vrai(/60/.test(texteLecture)&&/erreur/i.test(texteLecture)&&/mot/i.test(texteLecture),label+" : la fiche conserve score, erreurs, durée et mots travaillés");
          await p.click('[data-progress-origine="maison"]');
          vrai(eq(await points(p),["reg-house-01","reg-house-02"])&&await valeur(p,"meilleur",65)&&await valeur(p,"lectures",2),label+" : le mode maison exclut tous les résultats de classe");
          await p.selectOption("#progression-texte","E1");
          vrai(eq(await points(p),["reg-house-02"])&&(await p.locator("[data-progress-objectif-valeur]").textContent()).trim()==="45",label+" : filtrer les bilans maison ne recalcule pas l'objectif sur le seul texte");
          if(tel){
            await p.click("#progression-retour");
            vrai(await p.locator("#progression-eleves").isVisible(),label+" : Retour rend la liste d'élèves accessible sur téléphone");
          }
          await p.locator('[data-progress-eleve="test-vide"]').focus();await p.keyboard.press("Space");
          vrai((await points(p)).length===0&&/pas encore|aucune lecture/i.test(await p.locator("#progression-detail").innerText()),label+" : un élève sans lecture affiche un état vide compréhensible");
          if(tel)await p.click("#progression-retour");
          await p.click('[data-progress-eleve="test-beta"]');
          vrai((await p.locator("[data-progress-objectif-valeur]").textContent()).trim()==="0"&&/manuel/i.test(await p.locator("#progression-objectif").textContent()),label+" : l'objectif manuel zéro n'est pas remplacé par un objectif automatique");
          if(tel)await p.click("#progression-retour");
          await p.click('[data-progress-eleve="test-alpha"]');await p.selectOption("#progression-texte","E1");await p.click('[data-progress-origine="classe"]');
          vrai(await stable(p)===avant,label+" : consulter et filtrer ne modifie ni classe, résultats, réglages ni session");
          const session=await p.evaluate(auth=>localStorage.getItem(auth),AUTH);
          // Réception automatique via le vrai client, mais serveur et données entièrement fictifs.
          await p.evaluate(access=>{
            const E=Banc.ep("E1"),indices=Banc.motsDefi(E).map((t,i)=>t.w?i:-1).filter(i=>i>=0);
            const r=Banc.calcule(E,"test-alpha",30,indices[19],new Set());
            Object.assign(r,{id:"regression-auto-0001",date:"2026-10-10T10:00:00Z",origine:"maison",prenom:"Test Famille",titre:E.titre});
            __progressTest.rows=[{id:"22222222-2222-4222-8222-222222222222",access_id:access,payload:EnvoiMaison.paquet(r),received_at:"2026-10-10T10:00:01Z"}];
          },ACCESS);
          await p.evaluate(()=>MaisonCloud.recoit());
          await attend(p,()=>Banc.Donnees.contientBilan("regression-auto-0001","test-alpha"));
          vrai(await p.locator("#progression-texte").inputValue()==="E1"&&await p.locator('[data-progress-origine="classe"]').getAttribute("aria-pressed")==="true"&&(await p.locator("#progression-titre").textContent()).includes("Test Alpha"),label+" : recevoir un bilan conserve l'élève, l'origine et le filtre affichés");
          vrai(eq(await points(p),["reg-class-01","reg-class-02","reg-class-04"])&&await p.evaluate(auth=>MaisonCloud.connectee()&&localStorage.getItem(auth),AUTH)===session,label+" : la réception maison ne change ni la courbe classe ni la session connectée");
          await p.click('[data-progress-origine="maison"]');
          const recu="maison:test-alpha:regression-auto-0001";
          vrai(eq(await points(p),["reg-house-02",recu])&&await valeur(p,"dernier",40)&&await valeur(p,"meilleur",65)&&await valeur(p,"evolution",-25),label+" : le nouveau bilan paraît à la bonne place avec une évolution négative fidèle");
          await p.click(tel?"[data-tab=eleves]":"[data-go=students]");await progres();
          vrai(await p.locator("#progression-texte").inputValue()==="E1"&&await p.locator('[data-progress-origine="maison"]').getAttribute("aria-pressed")==="true"&&(await p.locator("#progression-titre").textContent()).includes("Test Alpha"),label+" : quitter puis retrouver Progrès conserve le choix courant");
          await p.click("#acces-parents");vrai(await p.locator("#maison-dialogue").isVisible(),label+" : l'accès parents reste disponible dans Progrès");await p.click("#maison-retour");
          await p.locator(".progression-sauvegarde > summary").click();
          const downloadPromise=p.waitForEvent("download");await p.click("#exp");const download=await downloadPromise;
          const sauvegarde=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
          vrai(sauvegarde.format==="banc-des-maitres/sauvegarde"&&sauvegarde.classe.eleves.length===3&&sauvegarde.resultats.liste.length===10,label+" : Exporter conserve toute la classe, les deux origines et les suppressions malgré le filtre");
          await p.selectOption("#progression-texte","T1");await ouvreLecture(p,"reg-house-01");
          await p.click('[data-suppr="reg-house-01"]');
          vrai(await p.evaluate(()=>Banc.Donnees.essaisMaison().some(r=>r.id==="reg-house-01")),label+" : le premier clic Supprimer attend une confirmation");
          await p.click('[data-suppr="reg-house-01"]');
          await attend(p,()=>Banc.Donnees.sauvegarde().resultats.liste.some(r=>r.id==="reg-house-01"&&r.suppr));
          vrai(await p.locator("#progression-texte").inputValue()==="T1"&&await p.locator('[data-progress-origine="maison"]').getAttribute("aria-pressed")==="true"&&(await points(p)).length===0,label+" : la suppression garde la fiche et son filtre, avec une courbe vide");
          vrai(await p.evaluate(()=>{const r=Banc.Donnees.sauvegarde().resultats.liste.find(r=>r.id==="reg-house-01");return r.suppr&&r.origine==="maison"&&r.sourceId==="source-reg-house-01"&&r.eleve==="test-alpha"&&Banc.Donnees.essais().length===5;}),label+" : la marque de suppression maison garde son identité sans toucher aux cinq résultats classe");
          vrai((await p.locator("[data-progress-objectif-valeur]").textContent()).trim()==="55",label+" : supprimer la première référence fait prendre la prochaine lecture valide pour l'objectif");
          if(!await p.locator(".progression-sauvegarde").evaluate(e=>e.open))await p.locator(".progression-sauvegarde > summary").click();
          await p.locator("#progression-importer").focus();
          const choixFichier=p.waitForEvent("filechooser");await p.keyboard.press("Enter");
          await (await choixFichier).setFiles({name:"regression-sauvegarde-fictive.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(sauvegarde))});
          await attend(p,()=>document.querySelector("#ioinfo")?.textContent.includes("Sauvegarde importée"));
          vrai(await p.locator("#progression-texte").inputValue()==="T1"&&(await p.locator("#progression-titre").textContent()).includes("Test Alpha")&&(await points(p)).length===0,label+" : importer une sauvegarde garde le contexte sans ressusciter la lecture supprimée");
          vrai(await p.evaluate(auth=>MaisonCloud.connectee()&&localStorage.getItem(auth),AUTH)===session,label+" : suppression et import laissent la connexion intacte");
          await p.selectOption("#progression-texte","");
          vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+" : la fiche ne crée aucun débordement horizontal");
          vrai(await p.locator("#progression-texte").evaluate(e=>!!e.labels?.length&&parseFloat(getComputedStyle(e).fontSize)>=16),label+" : le filtre possède un libellé et évite le zoom automatique iOS");
          await p.evaluate(()=>document.querySelector("#progression").closest("main")?.scrollTo({top:0}));
          await p.screenshot({path:path.join(CAPT,`${moteur}-${width}.png`),fullPage:true});
          await ctx.close();
        }
      }finally{await b.close();}
    }
    vrai(externes.length===0,"aucune requête vers un service réel");vrai(erreurs.length===0,"aucune erreur JavaScript dans les parcours de suivi");
    console.log(`\n${nb} vérifications indépendantes de régression Progrès réussies.`);
  }finally{S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

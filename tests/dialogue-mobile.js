// Dialogue enseignant : WebKit/Chromium locaux, clavier simulé et liens fictifs.
const {chromium,webkit}=require("playwright"),{site}=require("./serveurs"),fs=require("node:fs"),path=require("node:path");
const CAPT=path.join(__dirname,"captures","dialogue-mobile");fs.mkdirSync(CAPT,{recursive:true});
let nb=0;const vrai=(ok,message)=>{if(!ok)throw new Error(message);nb++;console.log("  ✓ "+message);};
function prepare(){
  Object.defineProperty(window,"BANC_MAISON",{configurable:true,get:()=>({url:"https://fluence-test.supabase.co",publishableKey:"sb_publishable_test_sans_compte"}),set:()=>{}});
  // Un clavier iOS peut réduire le viewport visuel sans modifier innerHeight.
  const v=new EventTarget(),valeurs={width:null,height:null,offsetTop:0,offsetLeft:0,scale:1},ecoutes=new Set();
  for(const cle of Object.keys(valeurs))Object.defineProperty(v,cle,{get:()=>valeurs[cle]??(cle==="width"?innerWidth:innerHeight)});
  const ajoute=v.addEventListener.bind(v),retire=v.removeEventListener.bind(v);
  v.addEventListener=(type,f,...args)=>{ecoutes.add(type);ajoute(type,f,...args);};
  v.removeEventListener=(type,f,...args)=>{ecoutes.delete(type);retire(type,f,...args);};
  Object.defineProperty(window,"visualViewport",{configurable:true,value:v});
  window.__viewportTest={regle:patch=>{Object.assign(valeurs,patch);v.dispatchEvent(new Event("resize"));v.dispatchEvent(new Event("scroll"));},ecoutes:()=>ecoutes.size};
}
(async()=>{
  const S=await site(),erreurs=[],externes=[];
  try{
    for(const [nom,moteur] of process.argv.includes("--chromium")?[["chromium",chromium]]:[["chromium",chromium],["webkit",webkit]]){
      const b=await moteur.launch();
      try{
        for(const width of [390,320]){
          const height=width===390?844:568,c=await b.newContext({viewport:{width,height},isMobile:true,hasTouch:true}),p=await c.newPage();
          p.setDefaultTimeout(10000);await p.addInitScript(prepare);
          p.on("pageerror",e=>erreurs.push(e.message));
          await p.route("**/*",r=>{if(r.request().url().startsWith(S.base))return r.continue();externes.push(r.request().url());return r.abort();});
          await p.goto(S.base+"#tel");await p.click("[data-tab=eleves]");await p.focus("#acces-parents");await p.press("#acces-parents","Enter");
          const label=`${nom} ${width}px`;
          const tient=()=>p.evaluate(()=>{const e=document.querySelector("#maison-dialogue"),r=e.getBoundingClientRect(),v=visualViewport;return r.left>=v.offsetLeft-1&&r.right<=v.offsetLeft+v.width+1&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1&&e.scrollWidth<=e.clientWidth+1;});
          vrai(await tient(),label+" : dialogue contenu dans la zone visible dès l'ouverture");
          vrai(await p.evaluate(()=>[...document.querySelectorAll('#maison-dialogue input:not([hidden]),#maison-dialogue select,#maison-dialogue textarea')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)),label+" : tous les champs ont une police d'au moins16px, sans désactiver le zoom utilisateur");
          vrai(await p.locator("#maison-cloud").innerText().then(t=>t.includes("Une seule connexion pour recevoir les résultats de tous tes élèves")&&t.includes("cartes sont réservés aux familles")),label+" : les accès familles sont distingués de l'unique connexion enseignante");
          await p.screenshot({path:path.join(CAPT,`${nom}-${width}-ouverture.png`)});
          const lien="https://test.invalid/#parents&prenom=Test%20Famille&famille="+"a".repeat(64);
          await p.fill("#cloud-email","test.enseignante@example.invalid");await p.fill("#cloud-otp",lien);
          vrai(await p.evaluate(async lien=>{const email=document.querySelector("#cloud-email"),champ=document.querySelector("#cloud-otp");champ.focus();await MaisonCloud.deconnecte();return document.querySelector("#cloud-email")===email&&document.querySelector("#cloud-otp")===champ&&email.value==="test.enseignante@example.invalid"&&champ.value===lien&&document.activeElement===champ;},lien),label+" : une notification sans changement de connexion conserve les champs et le focus");
          await p.click("#cloud-connexion");
          await p.waitForFunction(()=>document.querySelector("#cloud-info").textContent.startsWith("Ce lien est un accès parents."));
          vrai(await p.locator("#cloud-connexion").isEnabled()&&!await p.evaluate(()=>MaisonCloud.connectee()),label+" : coller une carte famille affiche une explication et laisse la connexion disponible");
          await p.locator("#cloud-otp").focus();
          await p.evaluate(()=>__viewportTest.regle({height:280,offsetTop:30,offsetLeft:0}));
          await p.waitForFunction(()=>document.querySelector("#maison-dialogue").getBoundingClientRect().bottom<=310);
          vrai(await tient(),label+" : le clavier réduit le dialogue même quand innerHeight reste inchangé");
          await p.waitForFunction(()=>{const e=document.querySelector("#cloud-otp"),r=e.getBoundingClientRect(),v=visualViewport;return r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height&&e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));});
          vrai(await p.locator("#cloud-otp").evaluate(e=>e===document.activeElement),label+" : le champ actif reste entièrement visible au-dessus du clavier");
          await p.screenshot({path:path.join(CAPT,`${nom}-${width}-clavier.png`)});
          await p.fill("#cloud-otp","https://test.invalid/auth/v1/verify?token="+"b".repeat(6000));
          vrai(await tient(),label+" : une URL longue reste dans le champ de connexion sans élargir la fenêtre");
          await p.fill("#maison-importe","https://test.invalid/#bilan="+"c".repeat(12000));
          vrai(await tient(),label+" : un long bilan collé garde la largeur du dialogue");
          for(const selecteur of ["#cloud-connexion","#maison-lit","#maison-fichier","#maison-retour"]){
            await p.locator(selecteur).scrollIntoViewIfNeeded();
            vrai(await p.locator(selecteur).evaluate(e=>{const r=e.getBoundingClientRect(),v=visualViewport;return r.left>=v.offsetLeft-1&&r.right<=v.offsetLeft+v.width+1&&r.top>=v.offsetTop-1&&r.bottom<=v.offsetTop+v.height+1&&e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),label+" : "+selecteur+" reste atteignable par défilement avec le clavier ouvert");
          }
          await p.evaluate(()=>__viewportTest.regle({height:visualViewport.height,offsetLeft:10,width:innerWidth-20}));
          await p.waitForFunction(()=>document.querySelector("#maison-dialogue").getBoundingClientRect().left>=10);
          vrai(await tient(),label+" : le déplacement du viewport visuel ne fait pas déborder le dialogue");
          await p.evaluate(()=>__viewportTest.regle({height:innerHeight,width:innerWidth,offsetTop:0,offsetLeft:0}));
          await p.locator("#cloud-otp").fill(lien);await p.click("#cloud-connexion");await p.locator("#cloud-info").scrollIntoViewIfNeeded();
          await p.screenshot({path:path.join(CAPT,`${nom}-${width}-connexion.png`)});
          vrai(await tient(),label+" : fermer le clavier restaure la hauteur disponible sans débordement");
          await p.click("#maison-retour");await p.waitForSelector("#maison-dialogue",{state:"detached"});
          vrai(await p.evaluate(()=>__viewportTest.ecoutes()===0&&document.activeElement.id==="acces-parents"),label+" : Retour ferme la fenêtre, retire les écouteurs et rend le focus");
          await p.click("#acces-parents");await p.keyboard.press("Escape");
          vrai(await p.locator("#maison-dialogue").count()===0,label+" : rouvrir puis fermer au clavier reste possible");
          await c.close();
        }
      }finally{await b.close();}
    }
    vrai(externes.length===0,"aucune authentification ni requête vers un service réel");
    vrai(erreurs.length===0,"aucune erreur JavaScript");
    console.log(`\n${nb} vérifications du dialogue mobile réussies.`);
  }finally{S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

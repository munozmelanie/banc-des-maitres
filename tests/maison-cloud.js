// Réception privée : API entièrement simulée ; aucun compte ni réseau externe.
// Usage : python3 outils/build.py && node tests/maison-cloud.js
const {chromium}=require("playwright"),{site}=require("./serveurs");
const API="https://fluence-test.supabase.co",CLE="sb_publishable_test_sans_compte",TOKEN_A="a".repeat(64),TOKEN_B="b".repeat(64),QUEUE="fluence-parents-envois-v1",ACCES="11111111-1111-4111-8111-111111111111",RECU="22222222-2222-4222-8222-222222222222";
let nb=0;
const vrai=(ok,message)=>{if(!ok)throw new Error("ÉCHEC : "+message);nb++;console.log("  ✓ "+message);};
const attend=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:10000});
function installe(o){
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  const ancienneClasse=JSON.stringify({data:{eleves:[{id:"test-prive",nom:"Test Classe Privée",objectif:"70"}]},rev:1});
  set.call(localStorage,"banc-db:banc/classe",ancienneClasse);set.call(localStorage,"banc-des-maitres-liaison","ABCDE-FGHJK");
  if(o.expiree)set.call(localStorage,"fluence-cloud-auth-v1",JSON.stringify({access_token:"test-access-expire",refresh_token:"test-refresh-expire",user:{id:"test-enseignante",email:"enseignante@example.test"},expire:1}));
  window.__cloudTest={mode:o.mode,requetes:[],lecturesClasse:[],ecrituresClasse:[],ws:[],externes:[],refuseStock:false,permis:o.permis,attendUser:o.attendUser,userRefuse:o.userRefuse,attendRefresh:o.expiree,rows:[],acces:[{id:o.acces,child_ref:"test-prive",revoked:false,created_at:"2026-10-01T10:00:00Z"}]};
  window.__classeIntacte=()=>get.call(localStorage,"banc-db:banc/classe")===ancienneClasse&&get.call(localStorage,"banc-des-maitres-liaison")==="ABCDE-FGHJK";
  const sensible=k=>String(k).startsWith("banc-db:")||k==="banc-des-maitres-liaison"||k==="fluence-cloud-auth-v1";
  Storage.prototype.getItem=function(k){if(this===localStorage&&sensible(k))__cloudTest.lecturesClasse.push(k);return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){if(this===localStorage&&sensible(k))__cloudTest.ecrituresClasse.push(k);if(this===localStorage&&k===o.queue&&__cloudTest.refuseStock)throw new DOMException("Stockage de test plein","QuotaExceededError");return set.call(this,k,v);};
  window.WebSocket=class{constructor(u){__cloudTest.ws.push(String(u));throw new Error("Salon interdit pour un parent");}};
  Object.defineProperty(window,"BANC_MAISON",{configurable:true,get:()=>o.config?{url:o.api,publishableKey:o.cle}:{},set:()=>{}});
  const fetchReel=window.fetch;
  window.fetch=async(input,init={})=>{
    const url=typeof input==="string"?input:input.url;
    if(!url.startsWith(o.api)){if(url.startsWith(location.origin)||url.startsWith("/"))return fetchReel(input,init);__cloudTest.externes.push(url);throw new Error("Service extérieur interdit dans ce test");}
    const body=JSON.parse(init.body||"{}"),headers=Object.fromEntries(new Headers(init.headers||{}));
    __cloudTest.requetes.push({url,method:init.method||"GET",body,headers});
    if(url.includes("/auth/v1/user")&&__cloudTest.attendUser)return new Promise(resolve=>{window.__reponseUser=resolve;});
    if(url.includes("/auth/v1/user")&&__cloudTest.userRefuse)return new Response(JSON.stringify({error:"invalid_token"}),{status:401,headers:{"content-type":"application/json"}});
    if(url.includes("/auth/v1/token")&&__cloudTest.refuseRefresh)return Response.json({error:"refresh_token_not_found"},{status:400});
    if(url.includes("/auth/v1/token")&&__cloudTest.attendRefresh)return new Promise(resolve=>{window.__reponseRefresh=resolve;});
    if(url.includes("/auth/v1/verify")&&__cloudTest.attendVerify)return new Promise(resolve=>{window.__reponseVerify=resolve;});
    if(url.includes("/rest/v1/fluence_results")&&__cloudTest.attendResultats)return new Promise(resolve=>{window.__reponseResultats=resolve;});
    if(__cloudTest.mode==="reseau")throw new TypeError("Réseau de test coupé");
    if(__cloudTest.mode==="attend")return new Promise(resolve=>{window.__reponseCloud=resolve;});
    if(__cloudTest.mode==="401")return new Response(JSON.stringify({error:"Lien révoqué"}),{status:401,headers:{"content-type":"application/json"}});
    let reponse={id:o.recu,received_at:new Date().toISOString()};
    if(body.action==="progression")reponse=__cloudTest.progression||{version:1,objectif:{valeur:null,mode:"attente"},lectures:[],suivant:null};
    else if(url.includes("/auth/v1/otp")||url.includes("/auth/v1/logout"))reponse={};
    else if(url.includes("/auth/v1/user"))reponse={id:"test-enseignante",email:"enseignante@example.test"};
    else if(url.includes("/auth/v1/verify")||url.includes("/auth/v1/token"))reponse={access_token:"test-access-token",refresh_token:"test-refresh-token",expires_in:3600,user:{id:"test-enseignante",email:"enseignante@example.test"}};
    else if(url.includes("/rest/v1/rpc/fluence_teacher_enabled"))reponse=__cloudTest.permis;
    else if(url.includes("/rest/v1/rpc/fluence_sync_progress"))reponse={ok:true};
    else if(url.includes("/rest/v1/fluence_results")){const offset=+(new URL(url).searchParams.get("offset")||0);reponse=__cloudTest.rows.slice(offset,offset+500);}
    else if(url.includes("/rest/v1/fluence_accesses")){
      if(init.method==="POST"){__cloudTest.acces.push({...body,id:"33333333-3333-4333-8333-333333333333",revoked:false,created_at:new Date().toISOString()});reponse=[__cloudTest.acces.at(-1)];}
      else if(init.method==="PATCH"){const id=new URL(url).searchParams.get("id").replace(/^eq\./,"");__cloudTest.acces.find(a=>a.id===id).revoked=true;reponse=[];}
      else reponse=__cloudTest.acces;
    }
    if(__cloudTest.mode==="vide")reponse={};
    if(__cloudTest.mode==="idnombre")reponse.id=12;
    if(__cloudTest.mode==="sansdate")delete reponse.received_at;
    return new Response(JSON.stringify(reponse),{status:200,headers:{"content-type":"application/json"}});
  };
}
(async()=>{
  const S=await site(),b=await chromium.launch(),erreurs=[],requêtesExtérieures=[];
  async function ouvre({config=true,token=TOKEN_A,mode="ok",enseignante=false,expiree=false,permis=true,attendUser=false,userRefuse=false,fragment=null}={}){
    const c=await b.newContext({viewport:{width:390,height:844}});
    await c.addInitScript(installe,{config,mode,api:API,cle:CLE,queue:QUEUE,acces:ACCES,recu:RECU,expiree,permis,attendUser,userRefuse});
    const p=await c.newPage();p.on("pageerror",e=>erreurs.push(e.message));
    await p.route("**/*",r=>{if(r.request().url().startsWith(S.base))return r.continue();requêtesExtérieures.push(r.request().url());return r.abort();});
    await p.goto(S.base+"?relais=local#"+(fragment??(enseignante?"ecran":"parents"+(token?"&famille="+token:"")+"&prenom=Test%20Famille")));await p.waitForSelector("[data-ep=E1]");
    await p.evaluate(()=>MaisonCloud.init());return p;
  }
  const état=(p,id)=>p.evaluate(id=>MaisonCloud.etat(id),id);
  async function bilan(p,id){return p.evaluate(id=>{const E=Banc.ep("T3"),indices=Banc.motsDefi(E).map((t,i)=>t.w?i:-1).filter(i=>i>=0),r=Banc.calcule(E,"ignoré",30,indices[19],new Set([indices[1],indices[4]]));delete r.eleve;return {...r,id,origine:"maison",prenom:"Test Famille",titre:E.titre};},id);}
  async function isolation(p){return p.evaluate(()=>__classeIntacte()&&__cloudTest.lecturesClasse.length===0&&__cloudTest.ecrituresClasse.length===0&&__cloudTest.ws.length===0&&__cloudTest.externes.length===0);}
  try{
    const p=await ouvre();vrai(await p.evaluate(()=>MaisonCloud.parentActif()),"un lien personnel valide active la transmission familiale");
    const r=await bilan(p,"test-cloud-recu");
    await p.evaluate(()=>{__cloudTest.mode="attend";window.__envoiFini=false;});
    await p.evaluate(r=>{MaisonCloud.envoie(r).then(()=>{window.__envoiFini=true;});},r);
    await attend(p,()=>__cloudTest.requetes.length===1);
    vrai((await état(p,r.id))?.etat!=="recu","le bilan n'est pas déclaré reçu avant la réponse du serveur");
    vrai(await p.evaluate(([key,id])=>(localStorage.getItem(key)||"").includes(id),[QUEUE,r.id]),"la file est enregistrée avant d'attendre le serveur");
    await p.evaluate(id=>__reponseCloud(new Response(JSON.stringify({id,received_at:new Date().toISOString()}),{status:200,headers:{"content-type":"application/json"}})),RECU);
    await attend(p,id=>MaisonCloud.etat(id)?.etat==="recu",r.id);
    const envoyé=await p.evaluate(()=>__cloudTest.requetes[0]);
    vrai(envoyé.method==="POST"&&envoyé.url===API+"/functions/v1/fluence-bilan"&&envoyé.body.token===TOKEN_A&&envoyé.body.paquet.format==="fluence/bilan-maison"&&!envoyé.body.paquet.bilan.eleve,"le POST contient uniquement le jeton individuel et l'enveloppe normalisée du bilan");
    vrai(await isolation(p),"le parent n'accède ni à la classe, ni au code de liaison, ni au salon");
    const garde=await p.evaluate(async()=>{const n=__cloudTest.requetes.length;let refuses=0;for(const f of [()=>MaisonCloud.demandeCode("test@example.test"),()=>MaisonCloud.connecteCode("test@example.test","123456"),()=>MaisonCloud.invitations(),()=>MaisonCloud.creeLien("test-prive"),()=>MaisonCloud.revoque("test")]){try{await f();}catch(e){refuses++;}}await MaisonCloud.recoit();await MaisonCloud.deconnecte();return refuses===5&&__cloudTest.requetes.length===n;});
    vrai(garde&&await isolation(p),"toutes les capacités enseignante sont refusées aux parents sans lire leur session");

    for(const mode of ["vide","idnombre","sansdate","401"]){
      const q=await ouvre({mode}),r=await bilan(q,"test-cloud-"+mode);
      await q.evaluate(r=>MaisonCloud.envoie(r),r);
      vrai((await état(q,r.id))?.etat!=="recu",mode==="401"?"un lien refusé ne produit aucun faux accusé de réception":"une réponse serveur "+mode+" n'est pas un accusé de réception valable");
      vrai(await q.evaluate(([k,id])=>(localStorage.getItem(k)||"").includes(id),[QUEUE,r.id]),"le bilan reste conservé après la réponse "+mode);
    }
    const horsLigne=await ouvre({mode:"reseau"}),attente=await bilan(horsLigne,"test-cloud-reprise");
    await horsLigne.evaluate(r=>MaisonCloud.envoie(r),attente);
    vrai((await état(horsLigne,attente.id))?.etat!=="recu"&&await horsLigne.evaluate(([k,id])=>(localStorage.getItem(k)||"").includes(id),[QUEUE,attente.id]),"une coupure réseau conserve le bilan en attente durable");
    await horsLigne.reload();await horsLigne.waitForSelector("[data-ep=E1]");await horsLigne.evaluate(()=>MaisonCloud.init());
    vrai((await état(horsLigne,attente.id))?.etat!=="recu"&&!!(await état(horsLigne,attente.id)),"l'état en attente est relu après fermeture/rechargement");
    await horsLigne.evaluate(()=>{__cloudTest.mode="ok";});await horsLigne.evaluate(r=>MaisonCloud.envoie(r),attente);await attend(horsLigne,id=>MaisonCloud.etat(id)?.etat==="recu",attente.id);
    vrai(await horsLigne.evaluate(id=>__cloudTest.requetes.every(q=>q.body.paquet.bilan.id===id),attente.id),"le réessai garde l'identifiant original pour éviter les doublons");
    const fratrie=await ouvre({mode:"reseau"}),a=await bilan(fratrie,"test-cloud-frere-a");await fratrie.evaluate(r=>MaisonCloud.envoie(r),a);
    await fratrie.goto(S.base+"?relais=local#parents&famille="+TOKEN_B+"&prenom=Test%20Deux");await fratrie.waitForSelector("[data-ep=E1]");await fratrie.evaluate(()=>{__cloudTest.mode="ok";});
    await fratrie.evaluate(r=>MaisonCloud.envoie(r),a);const autre=await bilan(fratrie,"test-cloud-frere-b");await fratrie.evaluate(r=>MaisonCloud.envoie(r),autre);
    vrai(await fratrie.evaluate(([a,b])=>{const rs=__cloudTest.requetes.filter(r=>r.url.endsWith("/fluence-bilan"));return rs.find(r=>r.body.paquet.bilan.id==="test-cloud-frere-a")?.body.token===a&&rs.find(r=>r.body.paquet.bilan.id==="test-cloud-frere-b")?.body.token===b;},[TOKEN_A,TOKEN_B]),"deux enfants sur le même téléphone : chaque bilan garde le jeton familial de sa création");

    const plein=await ouvre({mode:"reseau"}),mémoire=await bilan(plein,"test-cloud-memoire");
    await plein.evaluate(()=>{__cloudTest.refuseStock=true;});await plein.evaluate(r=>MaisonCloud.envoie(r),mémoire);
    vrai(!!(await état(plein,mémoire.id))&&(await état(plein,mémoire.id)).etat!=="recu","un stockage indisponible conserve le bilan dans la file en mémoire");
    await plein.evaluate(()=>{__cloudTest.refuseStock=false;__cloudTest.mode="ok";});await plein.evaluate(r=>MaisonCloud.envoie(r),mémoire);await attend(plein,id=>MaisonCloud.etat(id)?.etat==="recu",mémoire.id);
    vrai(true,"le bilan en mémoire peut être réessayé après rétablissement du stockage");

    for(const options of [{config:false},{token:""},{token:"abc"}]){
      const q=await ouvre(options);vrai(!await q.evaluate(()=>MaisonCloud.parentActif())&&await q.evaluate(()=>__cloudTest.requetes.length===0),"sans configuration ou jeton valide, aucun envoi automatique ni accès de classe");vrai(await isolation(q),"l'isolation parents reste active sans connexion configurée");
    }

    // Compte enseignante autorisé et bilans reçus : serveur et session factices.
    const enseignante=await ouvre({enseignante:true});
    await enseignante.evaluate(()=>MaisonCloud.demandeCode("enseignante@example.test"));
    vrai(await enseignante.evaluate(()=>__cloudTest.requetes.at(-1).body.create_user===false&&!MaisonCloud.connectee()),"demander le lien e-mail ne crée pas de compte et ne connecte pas encore l'enseignante");
    const paquet=await p.evaluate(r=>EnvoiMaison.paquet(r),r);
    const rows=[{id:RECU,access_id:ACCES,payload:paquet,received_at:new Date().toISOString()},{id:"test-sans-eleve",access_id:"absent",payload:paquet,received_at:new Date().toISOString()},{id:"test-texte-change",access_id:ACCES,payload:{...paquet,texte:"00000000"},received_at:new Date().toISOString()}];
    await enseignante.evaluate(rows=>{__cloudTest.rows=rows;},rows);await enseignante.evaluate(()=>MaisonCloud.connecteCode("enseignante@example.test","123456"));
    vrai(await enseignante.evaluate(()=>MaisonCloud.connectee()&&JSON.parse(localStorage.getItem("fluence-cloud-auth-v1")).user.id==="test-enseignante"),"la session est persistée après vérification du compte autorisé");
    vrai(await enseignante.evaluate(id=>{const rs=Banc.Donnees.essaisMaison();return rs.length===1&&rs[0].id==="maison:test-prive:"+id&&rs[0].eleve==="test-prive"&&rs[0].source==="automatique"&&rs[0].mclm===36&&Banc.Donnees.essais().length===0&&Banc.Donnees.record("test-prive")===null;},paquet.bilan.id),"la réception utilise l'association privée du serveur, ignore les bilans inassociables et préserve les records de classe");
    await enseignante.evaluate(()=>MaisonCloud.recoit());vrai(await enseignante.evaluate(()=>Banc.Donnees.essaisMaison().length===1),"plusieurs réceptions du même bilan ne créent aucun doublon");
    async function importeManuel(q){
      await q.evaluate(()=>EnvoiMaison.ouvre());await q.fill("#maison-importe",JSON.stringify(paquet));await q.click("#maison-lit");await q.selectOption("#maison-eleve","test-prive");await q.click("#maison-confirme");
      await attend(q,()=>/ajouté|déjà/.test(document.querySelector("#maison-info").textContent));
      const message=await q.locator("#maison-info").innerText();await q.click("#maison-retour");return message;
    }
    vrai(/déjà/.test(await importeManuel(enseignante))&&await enseignante.evaluate(()=>Banc.Donnees.essaisMaison().length===1),"un bilan déjà reçu automatiquement ne peut être ajouté une seconde fois par le fichier manuel");
    const invitation=await enseignante.evaluate(()=>MaisonCloud.creeLien("test-prive"));
    const secret=new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("famille");
    vrai(/^[a-f0-9]{64}$/.test(secret)&&!invitation.url.includes("test-prive")&&!new URLSearchParams(new URL(invitation.url).hash.slice(1)).has("lien"),"un lien privé utilise un nouveau secret de 256 bits, sans ID ni code de classe");
    vrai(await enseignante.evaluate(async secret=>{const r=__cloudTest.requetes.find(q=>q.method==="POST"&&q.url.endsWith("/fluence_accesses"));const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret))),b=>b.toString(16).padStart(2,"0")).join("");return r.body.token_hash===hash&&r.body.child_ref==="test-prive"&&!JSON.stringify(r.body).includes(secret)&&r.headers.authorization==="Bearer test-access-token";},secret),"seule l'empreinte du secret est enregistrée, avec la session authentifiée de l'enseignante");
    await enseignante.evaluate(id=>MaisonCloud.revoque(id),invitation.id);vrai(await enseignante.evaluate(id=>__cloudTest.acces.find(a=>a.id===id).revoked,invitation.id),"l'enseignante peut révoquer le lien individuel");
    await enseignante.evaluate(id=>Banc.Donnees.supprime("maison:test-prive:"+id),paquet.bilan.id);await enseignante.evaluate(()=>MaisonCloud.recoit());
    vrai(await enseignante.evaluate(id=>Banc.Donnees.essaisMaison().length===0&&Banc.Donnees.contientResultat("maison:test-prive:"+id),paquet.bilan.id),"un bilan supprimé n'est pas ressuscité par la réception automatique");
    vrai(/déjà/.test(await importeManuel(enseignante))&&await enseignante.evaluate(()=>Banc.Donnees.essaisMaison().length===0),"la suppression d'un bilan automatique bloque aussi son réimport manuel");
    const manuelDabord=await ouvre({enseignante:true});vrai(/ajouté/.test(await importeManuel(manuelDabord)),"un bilan reçu par fichier peut être enregistré avant la connexion privée");
    await manuelDabord.evaluate(rows=>{__cloudTest.rows=rows;},[rows[0]]);await manuelDabord.evaluate(()=>MaisonCloud.connecteCode("enseignante@example.test","123456"));
    vrai(await manuelDabord.evaluate(id=>Banc.Donnees.essaisMaison().length===1&&Banc.Donnees.essaisMaison()[0].id==="maison:test-prive:"+id,paquet.bilan.id),"la réception automatique reconnaît le bilan manuel existant, sans doublon");
    await manuelDabord.evaluate(id=>Banc.Donnees.supprime("maison:test-prive:"+id),paquet.bilan.id);await manuelDabord.evaluate(()=>MaisonCloud.recoit());
    vrai(await manuelDabord.evaluate(id=>Banc.Donnees.essaisMaison().length===0&&Banc.Donnees.contientBilan(id,"test-prive"),paquet.bilan.id),"la suppression manuelle garde l'identité source et empêche la résurrection automatique");
    const second={...rows[0],id:"44444444-4444-4444-8444-444444444444",payload:{...paquet,bilan:{...paquet.bilan,id:"test-cloud-second"}}};
    await enseignante.evaluate(row=>{__cloudTest.rows=[row];window.__setCloudOriginal=Plateforme.Stock.set;Plateforme.Stock.set=async(k,v)=>{if(k==="banc-db:banc/resultats")throw new Error("Stockage local refusé pour le test");return __setCloudOriginal(k,v);};},second);
    await enseignante.evaluate(()=>MaisonCloud.recoit());vrai(await enseignante.evaluate(id=>!Banc.Donnees.contientResultat("maison:test-prive:"+id),second.payload.bilan.id),"un bilan reçu en ligne n'est pas marqué enregistré si le stockage local échoue");
    await enseignante.evaluate(()=>{Plateforme.Stock.set=__setCloudOriginal;});await enseignante.evaluate(()=>MaisonCloud.recoit());
    vrai(await enseignante.evaluate(id=>Banc.Donnees.contientResultat("maison:test-prive:"+id),second.payload.bilan.id),"une prochaine réception récupère le bilan après rétablissement du stockage");
    await enseignante.evaluate(()=>{__cloudTest.attendResultats=true;window.__receptionFinie=false;MaisonCloud.recoit().then(()=>{__receptionFinie=true;});});await attend(enseignante,()=>!!window.__reponseResultats);
    await enseignante.evaluate(()=>MaisonCloud.deconnecte());
    await enseignante.evaluate(row=>__reponseResultats(new Response(JSON.stringify([row]),{status:200,headers:{"content-type":"application/json"}})),{...rows[0],id:"55555555-5555-4555-8555-555555555555",payload:{...paquet,bilan:{...paquet.bilan,id:"test-cloud-deconnexion"}}});await attend(enseignante,()=>__receptionFinie);
    vrai(await enseignante.evaluate(()=>!MaisonCloud.connectee()&&!Banc.Donnees.contientResultat("maison:test-prive:test-cloud-deconnexion")),"une réception retardée après déconnexion n'ajoute aucun résultat de l'ancien compte");
    const refusée=await ouvre({enseignante:true});await refusée.evaluate(()=>{__cloudTest.permis=false;});
    const refus=await refusée.evaluate(async()=>{try{await MaisonCloud.connecteCode("refuse@example.test","123456");return false;}catch(e){return !MaisonCloud.connectee()&&!localStorage.getItem("fluence-cloud-auth-v1");}});
    vrai(refus,"un compte non autorisé ne devient pas une session enseignante persistée");
    const expirée=await ouvre({enseignante:true,expiree:true});await attend(expirée,()=>!!window.__reponseRefresh);
    await expirée.evaluate(()=>{window.__refreshFini=false;MaisonCloud.recoit().then(()=>{window.__refreshFini=true;});});await expirée.evaluate(()=>MaisonCloud.deconnecte());
    vrai(await expirée.evaluate(()=>!MaisonCloud.connectee()&&localStorage.getItem("fluence-cloud-auth-v1")==="null"),"la déconnexion efface la session même pendant le renouvellement du jeton");
    const sessionRéponse={access_token:"test-access-renouvele",refresh_token:"test-refresh-renouvele",expires_in:3600,user:{id:"test-enseignante",email:"enseignante@example.test"}};
    await expirée.evaluate(d=>__reponseRefresh(new Response(JSON.stringify(d),{status:200,headers:{"content-type":"application/json"}})),sessionRéponse);await attend(expirée,()=>__refreshFini);
    vrai(await expirée.evaluate(()=>!MaisonCloud.connectee()&&localStorage.getItem("fluence-cloud-auth-v1")==="null"),"une réponse de renouvellement tardive ne reconnecte pas le compte déconnecté");
    // Une session présente mais expirée doit ouvrir un vrai formulaire de reconnexion.
    const renouvelle=await ouvre({enseignante:true,expiree:true});await attend(renouvelle,()=>!!window.__reponseRefresh);
    await renouvelle.evaluate(()=>EnvoiMaison.ouvre());await renouvelle.waitForSelector("#cloud-actualise");
    await renouvelle.evaluate(()=>{__cloudTest.attendRefresh=false;__cloudTest.refuseRefresh=true;__reponseRefresh(Response.json({error:"refresh_token_not_found"},{status:400}));});
    await attend(renouvelle,()=>MaisonCloud.statutReception().reconnexionNecessaire&&!MaisonCloud.statutReception().enCours);await renouvelle.waitForSelector("#cloud-connexion");
    vrai(await renouvelle.locator("#cloud-email").inputValue()==="enseignante@example.test"&&await renouvelle.locator("#cloud-actualise").count()===0,"session expirée : le dialogue remplace le panneau Connectée par le formulaire prérempli");
    vrai(await renouvelle.evaluate(()=>MaisonCloud.connectee()&&JSON.parse(localStorage.getItem("fluence-cloud-auth-v1")).access_token==="test-access-expire"),"l’ancienne session reste intacte pendant la reconnexion");
    const gardeBilan=await bilan(renouvelle,"test-reconnexion-conserve");
    await renouvelle.evaluate(async r=>{const v={...r,id:"maison:test-prive:"+r.id,sourceId:r.id,eleve:"test-prive"};delete v.prenom;await Banc.Donnees.ajoute(v);window.__pedagogieAvant=JSON.stringify({classe:Banc.Donnees.sauvegarde().classe,resultats:Banc.Donnees.sauvegarde().resultats,reglages:Banc.Donnees.sauvegarde().reglages});},gardeBilan);
    await renouvelle.fill("#cloud-otp","123456");await renouvelle.evaluate(()=>{__cloudTest.permis=false;});await renouvelle.click("#cloud-connexion");
    await attend(renouvelle,()=>/pas autorisé/.test(document.querySelector("#cloud-info")?.textContent||""));
    vrai(await renouvelle.evaluate(()=>MaisonCloud.connectee()&&MaisonCloud.statutReception().reconnexionNecessaire&&JSON.parse(localStorage.getItem("fluence-cloud-auth-v1")).access_token==="test-access-expire"),"un nouveau compte refusé ne remplace ni ne déconnecte l’ancienne session");
    await renouvelle.evaluate(()=>{__cloudTest.permis=true;__cloudTest.refuseRefresh=false;});await renouvelle.click("#cloud-connexion");await renouvelle.waitForSelector("#cloud-actualise");
    await attend(renouvelle,()=>!MaisonCloud.statutReception().enCours&&MaisonCloud.statutReception().derniereReception>0);
    vrai(await renouvelle.evaluate(()=>MaisonCloud.connectee()&&!MaisonCloud.statutReception().reconnexionNecessaire&&!MaisonCloud.statutReception().erreur&&JSON.parse(localStorage.getItem("fluence-cloud-auth-v1")).access_token==="test-access-token"),"connexion autorisée remplace la session et confirme une nouvelle réception réelle");
    vrai(await renouvelle.evaluate(()=>JSON.stringify({classe:Banc.Donnees.sauvegarde().classe,resultats:Banc.Donnees.sauvegarde().resultats,reglages:Banc.Donnees.sauvegarde().reglages})===__pedagogieAvant),"reconnexion conserve exactement élèves, objectifs, résultats et réglages");
    vrai(await renouvelle.locator("#cloud-connexion").count()===0,"le formulaire disparaît après reconnexion réussie");
    const connexionTardive=await ouvre({enseignante:true});await connexionTardive.evaluate(()=>{__cloudTest.attendVerify=true;window.__connexionFinie=false;MaisonCloud.connecteCode("enseignante@example.test","123456").then(()=>{window.__connexionFinie=true;},()=>{window.__connexionFinie=true;});});await attend(connexionTardive,()=>!!window.__reponseVerify);
    await connexionTardive.evaluate(()=>MaisonCloud.deconnecte());await connexionTardive.evaluate(d=>__reponseVerify(new Response(JSON.stringify(d),{status:200,headers:{"content-type":"application/json"}})),sessionRéponse);await attend(connexionTardive,()=>__connexionFinie);
    vrai(await connexionTardive.evaluate(()=>!MaisonCloud.connectee()&&localStorage.getItem("fluence-cloud-auth-v1")==="null"),"une vérification OTP tardive ne rétablit pas la session après déconnexion");

    // Liens e-mail gratuits de Supabase : échange direct, jamais navigation vers l'URL collée.
    const secretConnexion="c".repeat(64),lienConnexion=API+"/auth/v1/verify?token="+secretConnexion+"&type=magiclink&redirect_to="+encodeURIComponent(S.base);
    for(const lien of [lienConnexion,API+"/auth/v1/verify?token_hash="+secretConnexion+"&type=email"]){
      const q=await ouvre({enseignante:true});await q.evaluate(lien=>MaisonCloud.connecteCode("enseignante@example.test",lien),lien);
      vrai(await q.evaluate(hash=>{const req=__cloudTest.requetes.find(r=>r.url.endsWith("/auth/v1/verify"));return MaisonCloud.connectee()&&req.method==="POST"&&req.body.token_hash===hash&&req.body.type==="email"&&!req.body.token&&__cloudTest.requetes.every(r=>!r.url.includes("?token="));},secretConnexion),"le lien e-mail est échangé en POST avec token_hash sans ouvrir l'URL collée");
    }
    const mauvaisLiens=[
      [lienConnexion.replace("https:","http:"),"protocole non sécurisé"],
      [lienConnexion.replace("fluence-test.supabase.co","autre-projet.supabase.co"),"autre projet"],
      [lienConnexion.replace("fluence-test.supabase.co","fluence-test.supabase.co.example.invalid"),"domaine trompeur"],
      [lienConnexion.replace("https://","https://test@"),"identifiant dans l'URL"],
      [lienConnexion.replace("/auth/v1/verify","/auth/v1/token"),"chemin différent"],
      [lienConnexion.replace("type=magiclink","type=recovery"),"type de récupération de mot de passe"],
      [lienConnexion+"#fragment","fragment supplémentaire"],
      [lienConnexion+"&token_hash="+secretConnexion,"deux variantes de token"],
      [lienConnexion+"&token="+secretConnexion,"token répété"]
    ];
    const lienInvalide=await ouvre({enseignante:true});
    for(const fragment of ["parents","parents&prenom=Test%20Famille&famille="+TOKEN_A,"famille="+TOKEN_A]){
      const refus=await lienInvalide.evaluate(async lien=>{const n=__cloudTest.requetes.length;try{await MaisonCloud.connecteCode("enseignante@example.test",lien);return false;}catch(e){return e.message==="Ce lien est un accès parents. Demande un lien de connexion par e-mail pour ton espace enseignante."&&__cloudTest.requetes.length===n&&!MaisonCloud.connectee();}},S.base+"#"+fragment);
      vrai(refus,"un lien famille collé à la place du lien e-mail est expliqué sans appel réseau ni ouverture de session");
    }
    for(const [lien,label] of mauvaisLiens){const refus=await lienInvalide.evaluate(async lien=>{const n=__cloudTest.requetes.length;try{await MaisonCloud.connecteCode("enseignante@example.test",lien);return false;}catch(e){return __cloudTest.requetes.length===n&&!MaisonCloud.connectee();}},lien);vrai(refus,"lien de connexion refusé avant tout appel : "+label);}
    const compteLienRefuse=await ouvre({enseignante:true,permis:false});
    vrai(await compteLienRefuse.evaluate(async lien=>{try{await MaisonCloud.connecteCode("refuse@example.test",lien);return false;}catch(e){return !MaisonCloud.connectee()&&!localStorage.getItem("fluence-cloud-auth-v1");}},lienConnexion),"un lien e-mail valide ne connecte pas un compte non autorisé");
    const callback="ecran&access_token=test-callback-access&refresh_token=test-callback-refresh&expires_in=3600&token_type=bearer&type=magiclink";
    const retour=await ouvre({enseignante:true,fragment:callback});await attend(retour,()=>MaisonCloud.connectee());
    vrai(await retour.evaluate(()=>{const rs=__cloudTest.requetes,us=rs.find(r=>r.url.endsWith("/auth/v1/user")),ok=rs.find(r=>r.url.endsWith("/fluence_teacher_enabled"));return !/access_token|refresh_token/.test(location.hash)&&us.method==="GET"&&us.headers.authorization==="Bearer test-callback-access"&&!!ok&&JSON.parse(localStorage.getItem("fluence-cloud-auth-v1")).user.id==="test-enseignante";}),"le retour web retire les jetons de l'URL et vérifie le compte puis son autorisation avant de garder la session");
    const retourRefuse=await ouvre({enseignante:true,fragment:callback,permis:false});await attend(retourRefuse,()=>__cloudTest.requetes.some(r=>r.url.endsWith("/fluence_teacher_enabled")));
    vrai(await retourRefuse.evaluate(()=>!MaisonCloud.connectee()&&!localStorage.getItem("fluence-cloud-auth-v1")&&!/access_token|refresh_token/.test(location.hash)),"un retour web de compte non autorisé est nettoyé sans session persistée");
    const retourInvalide=await ouvre({enseignante:true,fragment:callback,userRefuse:true});await attend(retourInvalide,()=>__cloudTest.requetes.some(r=>r.url.endsWith("/auth/v1/user")));
    vrai(await retourInvalide.evaluate(()=>!MaisonCloud.connectee()&&!localStorage.getItem("fluence-cloud-auth-v1")&&!__cloudTest.requetes.some(r=>r.url.endsWith("/fluence_teacher_enabled"))),"un jeton de retour refusé par Auth ne peut ouvrir le compte enseignante");
    const retourParent=await ouvre({fragment:callback.replace(/^ecran/,"parents")+"&famille="+TOKEN_A+"&prenom=Test"});
    vrai(await retourParent.evaluate(()=>Banc.ROLE==="parents"&&MaisonCloud.parentActif()&&!MaisonCloud.connectee()&&__cloudTest.requetes.length===0&&!/access_token|refresh_token/.test(location.hash)&&new URLSearchParams(location.hash.slice(1)).get("prenom")==="Test")&&await isolation(retourParent),"un callback dans l'espace parents est nettoyé puis ignoré, sans lire ni créer de session enseignante");
    for(const [fragment,label] of [
      [callback.replace("&refresh_token=test-callback-refresh",""),"jeton de renouvellement manquant"],
      [callback+"&access_token=autre-token","jeton répété"],
      [callback.replace("type=magiclink","type=recovery"),"type non autorisé"],
      ["ecran&error=access_denied&error_code=otp_expired","lien expiré"]
    ]){
      const q=await ouvre({enseignante:true,fragment});
      vrai(await q.evaluate(()=>!MaisonCloud.connectee()&&!localStorage.getItem("fluence-cloud-auth-v1")&&__cloudTest.requetes.length===0&&!/access_token|refresh_token|error_code/.test(location.hash)),"callback refusé et nettoyé avant appel : "+label);
    }
    const retourTardif=await ouvre({enseignante:true,fragment:callback,attendUser:true});await attend(retourTardif,()=>!!window.__reponseUser);await retourTardif.evaluate(()=>MaisonCloud.deconnecte());
    await retourTardif.evaluate(()=>__reponseUser(new Response(JSON.stringify({id:"test-enseignante",email:"enseignante@example.test"}),{status:200,headers:{"content-type":"application/json"}})));
    await retourTardif.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    vrai(await retourTardif.evaluate(()=>!MaisonCloud.connectee()&&localStorage.getItem("fluence-cloud-auth-v1")==="null"),"la validation tardive d'un callback ne reconnecte pas après déconnexion");
    const stockageAuth=await ouvre({enseignante:true});await stockageAuth.evaluate(lien=>MaisonCloud.connecteCode("enseignante@example.test",lien),lienConnexion);
    const logout=await stockageAuth.evaluate(async()=>{const avant=__cloudTest.requetes.length,stock=Plateforme.Stock.set;Plateforme.Stock.set=async(k,v)=>{if(k==="fluence-cloud-auth-v1"&&v==="null")throw new Error("Stockage de test indisponible");return stock(k,v);};let message="";try{await MaisonCloud.deconnecte();}catch(e){message=e.message;}return {message,connectee:MaisonCloud.connectee(),tente:__cloudTest.requetes.slice(avant).some(r=>r.url.endsWith("/auth/v1/logout?scope=local")&&r.method==="POST")};});
    vrai(logout.tente&&!logout.connectee&&!!logout.message,"même si l'effacement local échoue, la déconnexion serveur est tentée et l'échec est signalé");
    const consultation=await ouvre();
    const lecturePrivee=await bilan(consultation,"test-consultation-privee");
    await consultation.evaluate(({r,id})=>{const {ep,date,mclm,lus,erreurs,secondes,dernier,fautes}=r;__cloudTest.progression={version:1,objectif:{valeur:70,mode:"manuel"},lectures:[{id,origine:"classe",ep,date,mclm,lus,erreurs,secondes,dernier,fautes}],suivant:null};},{r:lecturePrivee,id:RECU});
    const progression=await consultation.evaluate(()=>MaisonCloud.progressionParents());
    vrai(progression.lectures.length===1&&progression.objectif.valeur===70&&await isolation(consultation),"la consultation privée fonctionne dans le navigateur sans lire la classe ni la session");
    vrai(await consultation.evaluate(()=>{const r=__cloudTest.requetes.at(-1);return r.body.action==="progression"&&!r.headers.authorization&&!localStorage.getItem("fluence-parents-progres");}),"la consultation utilise le secret personnel sans conserver les progrès distants");
    const projection=await ouvre({enseignante:true});await projection.evaluate(()=>MaisonCloud.connecteCode("enseignante@example.test","123456"));
    const lectureClasse=await bilan(projection,"test-projection-classe");
    await projection.evaluate(async r=>{const d={...r,origine:"classe",eleve:"test-prive"};delete d.prenom;await Banc.Donnees.ajoute(d);await MaisonCloud.synchronise();},lectureClasse);
    vrai(await projection.evaluate(id=>__cloudTest.requetes.filter(r=>r.url.endsWith("/fluence_sync_progress")).some(r=>r.body.p_lectures.some(x=>x.id===id&&x.origine==="classe")&&!!r.headers.authorization),lectureClasse.id),"une lecture ajoutée dans Donnees est projetée avec la connexion enseignante");
    await projection.evaluate(async id=>{await Banc.Donnees.supprime(id);await MaisonCloud.synchronise();},lectureClasse.id);
    vrai(await projection.evaluate(id=>__cloudTest.requetes.filter(r=>r.url.endsWith("/fluence_sync_progress")).some(r=>r.body.p_suppressions.some(x=>x.id===id))&&Banc.Donnees.contientResultat(id),lectureClasse.id),"une suppression est publiée sans effacer sa marque locale");
    vrai(requêtesExtérieures.length===0,"aucune requête ne quitte les doublures de l'API et le site local");
    vrai(erreurs.length===0,"aucune erreur JavaScript"+(erreurs.length?" : "+erreurs.join(" | "):""));
    console.log(`\n${nb} vérifications de connexion familiale privée réussies.`);
  }finally{await b.close();S.serveur.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

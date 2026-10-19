// Projection privée et consultation des progrès : doubles locaux, aucun réseau réel.
const fs=require("fs"),vm=require("vm"),assert=require("assert/strict"),{webcrypto}=require("crypto");
const source=fs.readFileSync(require("path").join(__dirname,"../src/maison-cloud.js"),"utf8");
const TOKEN="a".repeat(64),AUTRE="b".repeat(64),API="https://fluence-test.supabase.co";
const copie=x=>JSON.parse(JSON.stringify(x));let nb=0;
function vrai(ok,t){assert.ok(ok,t);nb++;console.log("  ✓ "+t);}
const uuid=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const mesure=(n=1,plus={})=>({id:uuid(n),origine:n%2?"classe":"maison",ep:"E1",date:new Date(Date.UTC(2026,0,1,0,0,n)).toISOString(),mclm:43,lus:45,erreurs:2,secondes:60,dernier:44,fautes:[1,4],...plus});
const page=(lectures=[],suivant=null)=>({version:1,objectif:{valeur:48,mode:"automatique"},lectures,suivant});
const classe=()=>({classe:{eleves:[{id:"test-a",nom:"Test A",objectif:""},{id:"test-b",nom:"Test B",objectif:"0"}],maj:12345},resultats:{liste:[{...mesure(1),id:"lecture-classe-1",typeLecture:"defi",eleve:"test-a",nomPrive:"ne-pas-transmettre"},{...mesure(2),id:"maison:test-a:source-maison-2",eleve:"test-a",sourceId:"source-maison-2",nomDeclare:"Test Famille"},{id:"ancienne-classe-supprimee",suppr:true,date:"2026-01-01T00:00:00Z"},{id:"maison:test-b:source-supprime",suppr:true,origine:"maison",eleve:"test-b",sourceId:"source-supprime"}]},reglages:{vitesse:.8}});
function contexte({parents=true,stockSession=!parents,donnees=classe(),reponse=()=>page([mesure()]),hash=null,sessionExpiree=false}={}){
  const requetes=[],lecturesStock=[],ecrituresStock=[],ecoutes={},ecoutesDocument={},timers=new Map(),ecoutesDonnees=[];let compteur=0;
  const memoire=new Map();if(stockSession)memoire.set("fluence-cloud-auth-v1",JSON.stringify({access_token:"jeton-synthetique",refresh_token:"renouvellement-synthetique",user:{id:"enseignante-fictive",email:"test@example.test"},expire:sessionExpiree?1:Date.now()+3600000}));
  const etat={donnees,reponse,erreurSync:false,pages:0,sync:[],attendSync:null,lectureClasse:0};
  const ecoute=(c,n,f)=>(c[n]||=[]).push(f);
  const stockage={getItem:k=>{lecturesStock.push(k);return memoire.get(k)||null;},setItem:(k,v)=>{ecrituresStock.push(k);memoire.set(k,v);}};
  const sandbox={console,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,Response,Headers,crypto:webcrypto,Date,Map,Set,Uint8Array,Promise,
    location:{hash:hash??(parents?"#parents&famille="+TOKEN:"#ecran"),pathname:"/",search:""},
    history:{replaceState(a,b,url){sandbox.location.hash=url.includes("#")?url.slice(url.indexOf("#")):"";}},localStorage:stockage,
    setTimeout:(f,ms)=>{const id=++compteur;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,
    document:{hidden:false,addEventListener:(n,f)=>ecoute(ecoutesDocument,n,f)},
    Banc:{ROLE:parents?"parents":"ecran",Donnees:{sauvegarde(){etat.lectureClasse++;if(parents)throw Error("Lecture de classe interdite");return etat.donnees;},surChange(f){ecoutesDonnees.push(f);return()=>{};},eleve(id){return etat.donnees.classe.eleves.find(e=>e.id===id);},contientResultat:()=>false,contientBilan:()=>false,ajoute:async()=>{throw Error("Aucune importation prévue dans ce test");}}},
    Plateforme:{Stock:{get:async k=>stockage.getItem(k),set:async(k,v)=>stockage.setItem(k,v)}},EnvoiMaison:{lit:()=>{throw Error("Aucun bilan à importer dans ce test");}}
  };
  sandbox.window=sandbox;sandbox.BANC_MAISON={url:API,publishableKey:"sb_publishable_test_sans_compte"};sandbox.addEventListener=(n,f)=>ecoute(ecoutes,n,f);
  sandbox.fetch=async(url,init={})=>{
    assert.ok(url.startsWith(API),"Aucun réseau extérieur");
    const req={url,method:init.method||"GET",body:JSON.parse(init.body||"{}"),headers:Object.fromEntries(new Headers(init.headers)),cache:init.cache,credentials:init.credentials};requetes.push(req);
    let data;
    if(url.endsWith("/functions/v1/fluence-bilan")){etat.pages++;data=await etat.reponse(req,etat.pages);}
    else if(url.includes("/fluence_sync_progress")){etat.sync.push(req);if(etat.attendSync)data=await etat.attendSync(req);else if(etat.erreurSync)throw new TypeError("Coupure simulée");else data={ok:true};}
    else if(url.includes("/fluence_accesses"))data=etat.attendReception?await etat.attendReception:[];
    else if(url.includes("/auth/v1/token?grant_type=refresh_token"))data=Response.json({error:"refresh_token_not_found"},{status:400});
    else if(url.includes("/fluence_results")){if(etat.erreurReception)throw TypeError("Réception indisponible");data=[];}
    else if(url.includes("/auth/v1/logout"))data={};
    else throw Error("Endpoint inattendu : "+url);
    return data instanceof Response?data:new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return {cloud:sandbox.MaisonCloud,sandbox,etat,requetes,lecturesStock,ecrituresStock,memoire,
    async initialise(){await sandbox.MaisonCloud.init();if(!parents)await sandbox.MaisonCloud.recoit();},
    changeHash(t){sandbox.location.hash="#parents&famille="+t;(ecoutes.hashchange||[]).forEach(f=>f());},
    change(q="resultats"){ecoutesDonnees.forEach(f=>f(q));},
    async minuteurs(){for(const [id,t] of [...timers])if(t.ms===250){timers.delete(id);t.f();}await sandbox.MaisonCloud.synchronise();},
    async online(){(ecoutes.online||[]).forEach(f=>f());await sandbox.MaisonCloud.recoit();},
    async visible(){(ecoutesDocument.visibilitychange||[]).forEach(f=>f());await sandbox.MaisonCloud.recoit();}
  };
}
async function refuse(c,code,label){let e;try{await c.cloud.progressionParents();}catch(x){e=x;}vrai(e?.code===code,label);}
(async()=>{
  const c=contexte({reponse:(r,n)=>n===1?page([mesure(1)],"curseur-opaque"):page([mesure(2)])});await c.initialise();const lu=await c.cloud.progressionParents();
  vrai(lu.lectures.length===2&&lu.objectif.valeur===48,"toutes les pages classe et maison sont réunies avant affichage");
  vrai(c.requetes.length===2&&c.requetes[1].body.curseur==="curseur-opaque"&&c.requetes.every(r=>r.method==="POST"&&r.body.token===TOKEN&&r.body.action==="progression"&&r.body.avecTypeLecture===true&&r.body.limite===200),"secret personnel en POST et pagination opaque");
  vrai(c.requetes.every(r=>!r.headers.authorization&&r.cache==="no-store"&&r.credentials==="omit"),"aucune session enseignante ni cookie dans les consultations parents");
  vrai(c.etat.lectureClasse===0&&!c.lecturesStock.some(k=>/auth|banc-db|liaison/.test(k))&&c.ecrituresStock.length===0,"consultation sans lire la classe ni conserver les progrès distants");
  const typage=contexte({reponse:()=>page([mesure(1,{typeLecture:"entrainement"}),mesure(2,{typeLecture:"defi"}),mesure(3)])});
  const types=(await typage.cloud.progressionParents()).lectures;
  vrai(types[0].typeLecture==="entrainement"&&types[1].typeLecture==="defi"&&!Object.hasOwn(types[2],"typeLecture"),"types reconnus conservés, historique ancien sans classification inventée");
  const anomalies=[
    ...[null,"lecture","Defi",["defi"],{},1].map(typeLecture=>[()=>page([mesure(1,{typeLecture})]),"type de lecture invalide"]),
    [()=>({...page(),version:2}),"version inconnue"],
    [()=>({...page(),owner:"autre-compte"}),"champ compte inattendu"],
    [()=>({...page(),objectif:{valeur:0,mode:"attente"}}),"objectif incohérent"],
    [()=>page([mesure(1,{child_ref:"autre-enfant"})]),"identité de classe inattendue"],
    [()=>page([mesure(1,{id:"identifiant-local"})]),"identifiant non opaque"],
    [()=>page([mesure(1,{origine:"autre"})]),"origine inconnue"],
    [()=>page([mesure(1,{mclm:-1})]),"score négatif"],
    [()=>page([mesure(1,{secondes:Infinity})]),"durée invalide"],
    [()=>page([mesure(1,{date:"2026-02-31T00:00:00Z"})]),"date inexistante"],
    [()=>page([mesure(1,{fautes:[1,1]})]),"erreurs répétées"],
    [()=>page([mesure(1,{lus:90,dernier:44})]),"dernier mot incompatible avec le nombre de mots lus"],
    [()=>page([mesure(1,{fautes:[1]})]),"nombre d’erreurs incohérent"],
    [()=>page([mesure(1,{fautes:[1,5001]})]),"indice hors limites"],
    [()=>page([mesure(2),mesure(1)]),"ordre chronologique inversé"],
    [()=>page([mesure(1),mesure(1)]),"lecture répétée"],
    [()=>page(Array.from({length:201},(_,i)=>mesure(i+1))),"page trop volumineuse"],
    [()=>page([],"suite"),"suite vide"],
    [()=>page([mesure(1)]," "),"curseur mal formé"]
  ];
  for(const [reponse,label] of anomalies)await refuse(contexte({reponse}),"reponse-invalide","refus de la réponse : "+label);
  await refuse(contexte({reponse:(r,n)=>page([mesure(n)],"toujours-identique")}),"reponse-invalide","une boucle de curseurs ne produit aucun historique partiel");
  const limite=contexte({reponse:(r,n)=>page([mesure(n)],"page-"+n)});await refuse(limite,"reponse-invalide","une histoire trop volumineuse est signalée, jamais tronquée silencieusement");vrai(limite.etat.pages===100,"la pagination s’arrête à la limite explicite de 100 pages");
  for(const status of [401,403])await refuse(contexte({reponse:()=>new Response("{}",{status})}),"acces-refuse","lien refusé/révoqué : "+status);
  await refuse(contexte({reponse:()=>{throw TypeError("hors ligne");}}),"offline","une coupure réseau garde un message de reprise clair");
  await refuse(contexte({hash:"#parents"}),"acces-refuse","un accès générique ne consulte aucun progrès privé");
  await refuse(contexte({hash:"#parents&famille="+TOKEN+"&famille="+AUTRE}),"acces-refuse","des secrets répétés dans le lien sont refusés");
  await refuse(contexte({parents:false}),"non-configure","l’API parents ne réutilise pas une session enseignante");
  for(const retourAncien of [false,true]){
    let resolve;const d=contexte({reponse:()=>new Promise(r=>resolve=r)});const prom=d.cloud.progressionParents();d.changeHash(AUTRE);if(retourAncien)d.changeHash(TOKEN);resolve(page([mesure()]));let e;try{await prom;}catch(x){e=x;}vrai(e?.code==="acces-change","une réponse tardive est ignorée après changement de famille"+(retourAncien?", même si le premier lien revient":""));
  }
  const e=contexte({parents:false}),avant=JSON.stringify(e.etat.donnees);await e.initialise();
  vrai(e.etat.sync.length===1,"une seule connexion publie automatiquement tous les élèves");
  const lot=e.etat.sync[0].body;
  vrai(lot.p_eleves.length===2&&lot.p_eleves[0].objectif_manuel===null&&lot.p_eleves[1].objectif_manuel===0&&lot.p_eleves.every(x=>x.maj===12345),"objectifs automatiques et manuels, y compris zéro, gardent la révision de classe");
  vrai(lot.p_lectures.length===2&&lot.p_lectures.some(x=>x.origine==="classe")&&lot.p_lectures.some(x=>x.origine==="maison"&&x.source_id==="source-maison-2"),"les lectures de classe et les maisons déjà importées sont projetées séparément");
  vrai(lot.p_lectures.find(x=>x.id==="lecture-classe-1").typeLecture==="defi"&&!Object.hasOwn(lot.p_lectures.find(x=>x.origine==="maison"),"typeLecture"),"projection conserve le type capturé et l’absence historique");
  vrai(lot.p_suppressions.some(x=>x.id==="ancienne-classe-supprimee"&&!x.child_ref)&&lot.p_suppressions.some(x=>x.source_id==="source-supprime"),"les anciens tombstones classe et les suppressions maison gardent leur identité");
  vrai(!/nomPrive|nomDeclare|Test A|Test B|reglages|access_token|refresh_token|liaison/.test(JSON.stringify(lot)),"aucun nom, réglage, code de liaison ou jeton dans la projection");
  vrai(e.etat.sync[0].headers.authorization==="Bearer jeton-synthetique"&&JSON.stringify(e.etat.donnees)===avant,"la requête enseignante est authentifiée sans modifier les documents locaux");
  await e.cloud.synchronise();vrai(e.etat.sync.length===1,"les lignes déjà confirmées ne sont pas renvoyées à chaque passage");
  e.etat.donnees.resultats.liste.push({...mesure(3),id:"nouvelle-lecture",eleve:"test-b"});e.change();await e.minuteurs();vrai(e.etat.sync.at(-1).body.p_lectures.length===1&&e.etat.sync.at(-1).body.p_lectures[0].id==="nouvelle-lecture","un changement local ou reçu par liaison déclenche la publication différentielle");
  e.etat.donnees.classe.eleves[0].objectif="85";e.etat.donnees.classe.maj++;e.change("classe");await e.minuteurs();vrai(e.etat.sync.at(-1).body.p_eleves.find(x=>x.child_ref==="test-a").objectif_manuel===85,"un objectif modifié est publié automatiquement");
  const n=e.etat.sync.length;e.change("reglages");await e.minuteurs();vrai(e.etat.sync.length===n,"un réglage de vitesse ne publie aucune donnée pédagogique");
  const erreurs=classe();erreurs.resultats.liste.push({...mesure(3),id:"lecture-invalide",eleve:"test-a",mclm:-1},{...mesure(4),id:"lecture-legacy",eleve:"test-a",origine:"classe",secondes:0,dernier:2,fautes:[999]},{id:"maison:test-a:source-ancienne",suppr:true});
  const f=contexte({parents:false,donnees:erreurs});await f.initialise();const lignes=f.etat.sync.flatMap(x=>x.body.p_lectures);vrai(!lignes.some(x=>x.id==="lecture-invalide")&&lignes.some(x=>x.id==="lecture-legacy"&&x.secondes===0&&!Object.hasOwn(x,"fautes")&&!Object.hasOwn(x,"dernier")),"une donnée ancienne invalide n’empêche pas les autres ; le score historique reste conservé");
  vrai(f.etat.sync.flatMap(x=>x.body.p_suppressions).some(x=>x.source_id==="source-ancienne"&&x.child_ref==="test-a"),"une ancienne suppression maison retrouve son identité depuis l’ID stable");
  const typesInvalides=classe();typesInvalides.resultats.liste.push({...mesure(5),id:"type-invalide",eleve:"test-a",typeLecture:"lecture"});
  const invalide=contexte({parents:false,donnees:typesInvalides});await invalide.initialise();
  vrai(!invalide.etat.sync.flatMap(x=>x.body.p_lectures).some(x=>x.id==="type-invalide"),"type invalide ignoré sans bloquer les autres lectures ni être supprimé localement");
  const grande=classe();grande.resultats.liste=Array.from({length:460},(_,i)=>({...mesure(i+1),id:"classe-lot-"+i,eleve:"test-a",origine:"classe",lus:400,erreurs:200,dernier:399,fautes:Array.from({length:200},(_,j)=>j)}));
  const g=contexte({parents:false,donnees:grande});await g.initialise();vrai(g.etat.sync.length>3&&g.etat.sync.flatMap(x=>x.body.p_lectures).length===460,"un historique volumineux est envoyé intégralement en plusieurs lots");
  vrai(g.etat.sync.every(x=>Buffer.byteLength(JSON.stringify(x.body))<=24000&&Object.values(x.body).every(a=>a.length<=200)),"chaque lot respecte 200 lignes et 24 Kio, sous la limite JSONB serveur");
  const h=contexte({parents:false});h.etat.erreurSync=true;await h.initialise();vrai(h.etat.sync.length===1,"une panne ne crée pas une boucle de tentatives immédiates");h.etat.erreurSync=false;await h.online();vrai(h.etat.sync.length===2&&h.etat.sync[1].body.p_lectures.length===2,"le retour en ligne retente les lignes non confirmées");
  h.etat.donnees.resultats.liste.push({...mesure(5),id:"lecture-retour-visible",eleve:"test-a"});await h.visible();vrai(h.etat.sync.at(-1).body.p_lectures[0].id==="lecture-retour-visible","le retour dans l’application actualise aussi les progrès");
  const receptionCoupee=contexte({parents:false});receptionCoupee.etat.erreurReception=true;await receptionCoupee.initialise();vrai(receptionCoupee.etat.sync.length===1&&receptionCoupee.etat.sync[0].body.p_lectures.length===2,"une panne de réception n’empêche pas la publication des lectures de classe");
  const i=contexte({parents:false});await i.initialise();let libere;i.etat.attendSync=()=>new Promise(r=>libere=r);i.etat.donnees.classe.maj++;i.etat.donnees.classe.eleves[0].objectif="88";const pending=i.cloud.synchronise();await Promise.resolve();await Promise.resolve();await i.cloud.deconnecte();libere({ok:true});await pending;const compte=i.etat.sync.length;i.change();await i.minuteurs();vrai(!i.cloud.connectee()&&i.etat.sync.length===compte,"une réponse tardive après déconnexion ne poursuit ni ne rétablit la synchronisation");
  const statut=contexte({parents:false}),evenements=[];statut.cloud.surChange(()=>evenements.push(statut.cloud.statutReception()));
  vrai(statut.cloud.statutReception().derniereReception===0,"aucun succès de réception inventé avant appel au service");
  await statut.initialise();const initial=statut.cloud.statutReception();
  vrai(initial.connectee&&!initial.enCours&&!initial.erreur&&initial.derniereReception>0,"statut succès seulement après réception terminée");
  initial.message="modifié";vrai(statut.cloud.statutReception().message!=="modifié","le statut public est une copie sans modification des infos internes");
  vrai(!/access_token|refresh_token|email|user|jeton-synthetique/.test(JSON.stringify(initial)),"statut sans compte ni secret");
  let debloque;statut.etat.attendReception=new Promise(r=>debloque=r);const lecture=statut.cloud.recoit();
  vrai(statut.cloud.statutReception().enCours&&evenements.at(-1).enCours,"le début de réception notifie les vues");
  debloque([]);await lecture;statut.etat.attendReception=null;
  vrai(!statut.cloud.statutReception().enCours&&!evenements.at(-1).enCours,"la fin libère et notifie le bouton Actualiser");
  const date=statut.cloud.statutReception().derniereReception;statut.etat.erreurReception=true;await statut.cloud.recoit();
  const echec=statut.cloud.statutReception();
  vrai(echec.connectee&&echec.erreur&&!echec.reconnexionNecessaire&&echec.derniereReception===date,"panne réseau visible sans faux succès ni déconnexion");
  const expiree=contexte({parents:false,sessionExpiree:true});await expiree.initialise();const refus=expiree.cloud.statutReception();
  vrai(refus.connectee&&refus.erreur&&refus.reconnexionNecessaire&&refus.derniereReception===0,"session locale présente mais renouvellement refusé exige une reconnexion visible");
  vrai(expiree.requetes.filter(x=>x.url.includes("/auth/v1/token")).length>=1&&!expiree.ecrituresStock.length,"refus de renouvellement ne supprime ni ne remplace la session");
  await statut.cloud.deconnecte();vrai(!statut.cloud.statutReception().connectee&&statut.cloud.statutReception().derniereReception===0,"déconnexion remet à zéro le statut public");
  vrai(!c.cloud.statutReception().connectee&&c.cloud.statutReception().message===""&&!c.cloud.statutReception().enCours,"mode parents n’expose aucun état enseignant");
  console.log(`\n${nb} vérifications de progrès privés réussies.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

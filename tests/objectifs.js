// Objectifs dérivés : vrais modules, stockage local simulé, aucune donnée réelle.
// Usage : node tests/objectifs.js (aucun serveur ni build nécessaire).
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),{webcrypto}=require("node:crypto");
const sources=["plateforme.js","commun.js"].map(n=>fs.readFileSync(path.join(__dirname,"..","src",n),"utf8"));
const copie=x=>JSON.parse(JSON.stringify(x));
let nb=0;
const vrai=(ok,message)=>{assert.ok(ok,message);nb++;console.log("  ✓ "+message);};
const egal=(actual,expected,message)=>{assert.deepEqual(copie(actual),copie(expected),message);nb++;console.log("  ✓ "+message);};
const eleves=()=>[{id:"test-a",nom:"Test A",objectif:""},{id:"test-b",nom:"Test B",objectif:""}];
const resultat=(id,mclm,date="2026-10-19T10:00:00.000Z",extra={})=>({id,eleve:"test-a",ep:"E1",date,mclm,lus:mclm,erreurs:0,secondes:60,...extra});
const maison=(id,mclm,date)=>resultat(id,mclm,date,{origine:"maison",sourceId:"source-"+id});

async function ouvre(options={}){
  const preferences=options.preferences||new Map(),miroir=options.miroir||new Map();let echecResultat=false;
  if(!options.preferences){
    preferences.set("banc-db:banc/classe",JSON.stringify({data:{eleves:options.eleves||eleves(),maj:1},rev:1}));
    preferences.set("banc-db:banc/resultats",JSON.stringify({data:{liste:options.resultats||[]},rev:1}));
  }
  const prefs={get:async({key})=>({value:preferences.get(key)??null}),set:async({key,value})=>{
    if(key==="banc-db:banc/resultats"&&echecResultat){echecResultat=false;throw new Error("Panne fictive de sauvegarde");}
    preferences.set(key,value);
  },remove:async({key})=>preferences.delete(key)};
  const contexte={console,TextEncoder,TextDecoder,crypto:webcrypto,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,
    location:{hash:"#ecran",href:"https://test.invalid/#ecran",protocol:"https:"},screen:{width:1366,height:768},
    localStorage:{getItem:k=>miroir.get(k)??null,setItem:(k,v)=>miroir.set(k,v),removeItem:k=>miroir.delete(k)},
    document:{documentElement:{dataset:{}}},__BANC:{episodes:[{id:"E1"},{id:"T1"}]},
    Capacitor:{isNativePlatform:()=>true,Plugins:{Preferences:prefs}}};
  contexte.window=contexte;vm.createContext(contexte);sources.forEach(s=>vm.runInContext(s,contexte));
  const d=contexte.Banc.Donnees;await d.init();const db=await contexte.claude.use("db");
  return {d,db,preferences,miroir,importClasse:contexte.Banc.ImportClasse,echoue:()=>{echecResultat=true;},stockClasse:()=>JSON.parse(preferences.get("banc-db:banc/classe")).data};
}
async function ajoute(t,r){assert.equal(await t.d.ajoute(r),true,"le résultat fictif doit être sauvegardé");}

(async()=>{
  {
    const t=await ouvre();egal(t.d.objectif("test-a"),null,"sans lecture ni objectif manuel, aucun nombre n'est inventé");
    egal(t.d.objectifInfo("test-a"),{valeur:null,mode:"attente",reference:null},"l'interface distingue l'attente de la première lecture");
    vrai(!t.importClasse.estDefaut([{id:"e1",nom:"Élève 1",objectif:0}]),"un objectif manuel numérique zéro empêche le remplacement des fiches initiales par un import");
    vrai(t.importClasse.estDefaut([{id:"e1",nom:"Élève 1",objectif:""}]),"une fiche initiale avec champ vide reste remplaçable lors de l'import");
  }
  for(const [score,attendu] of [[0,5],[1,6],[49,54],[50,55],[51,57],[59,65],[100,110],[101,112]]){
    const t=await ouvre();await ajoute(t,resultat("test-calcul",score));
    egal(t.d.objectif("test-a"),attendu,`première lecture ${score} → objectif entier ${attendu}`);
    if(score===0)egal(t.d.objectifInfo("test-a").reference.mclm,0,"un premier score nul est une vraie référence");
  }
  {
    const t=await ouvre();await ajoute(t,resultat("test-recent",100,"2026-10-19T10:00:00Z"));
    await ajoute(t,resultat("test-premier",50,"2026-10-17T10:00:00Z",{ep:"T1"}));
    await ajoute(t,resultat("test-record",150,"2026-10-20T10:00:00Z"));
    egal(t.d.objectif("test-a"),55,"la première lecture chronologique compte, pas le meilleur score ni l'ordre d'arrivée");
    egal(t.d.objectifInfo("test-a"),{valeur:55,mode:"automatique",reference:{id:"test-premier",date:"2026-10-17T10:00:00Z",mclm:50}},"la référence explique exactement l'objectif automatique");
    egal(t.d.objectif("test-b"),null,"les lectures d'un autre élève ne fournissent pas de référence");
    egal(t.stockClasse().eleves,eleves(),"consulter un objectif automatique n'ajoute aucun champ à la classe persistée");
    const relu=await ouvre(t);egal(relu.d.objectif("test-a"),55,"l'objectif est retrouvé après redémarrage à partir des résultats existants");
  }
  {
    const t=await ouvre({resultats:[resultat("test-heure-z",90,"2026-10-19T08:30:00Z"),resultat("test-heure-locale",40,"2026-10-19T10:00:00+02:00")]});
    egal(t.d.objectif("test-a"),45,"les dates sont comparées comme des instants, même avec des fuseaux différents");
    const commun=[resultat("test-z",90),resultat("test-a",40)];
    const a=await ouvre({resultats:commun}),b=await ouvre({resultats:commun.slice().reverse()});
    egal([a.d.objectif("test-a"),b.d.objectif("test-a")],[45,45],"deux appareils départagent la même date par l'identifiant, quel que soit l'ordre de réception");
  }
  {
    const t=await ouvre({eleves:[{id:"test-a",nom:"Test A",objectif:"88"}]});
    await ajoute(t,resultat("test-premier",50));egal(t.d.objectif("test-a"),88,"un objectif manuel historique reste prioritaire");
    egal(t.d.objectifInfo("test-a"),{valeur:88,mode:"manuel",reference:null},"le mode manuel ne prétend pas provenir d'une lecture");
    await ajoute(t,maison("test-maison-plus-ancien",0,"2026-10-01T10:00:00Z"));
    egal(t.d.objectif("test-a"),88,"un bilan maison plus ancien ne remplace pas un objectif manuel");
    await t.d.enregistreEleves([{...t.d.eleve("test-a"),objectif:"0"}]);
    egal(t.d.objectif("test-a"),0,"l'objectif manuel zéro est conservé, sans basculer en automatique");
    await t.d.enregistreEleves([{...t.d.eleve("test-a"),objectif:""}]);
    egal(t.d.objectif("test-a"),5,"effacer l'objectif manuel réactive la première lecture disponible");
    egal(t.d.sauvegarde().classe.eleves[0].objectif,"","la sauvegarde conserve le champ vide pour le mode automatique");
  }
  {
    const t=await ouvre();await ajoute(t,resultat("test-en-classe",100,"2026-10-19T10:00:00Z"));
    await ajoute(t,maison("test-maison",30,"2026-10-17T10:00:00Z"));
    egal(t.d.objectif("test-a"),35,"un premier défi maison importé fournit aussi la référence");
    egal([t.d.essais().length,t.d.essaisMaison().length],[1,1],"calculer l'objectif ne mélange pas les listes classe et maison");
    const sauvegarde={format:"banc-des-maitres/sauvegarde",classe:copie(t.d.sauvegarde().classe),resultats:{liste:[maison("test-import-plus-ancien",20,"2026-10-16T10:00:00Z")]}};
    vrai(await t.d.importe(sauvegarde),"la sauvegarde contenant une lecture plus ancienne est importée");
    egal(t.d.objectif("test-a"),25,"l'import d'une sauvegarde actualise la première référence disponible");
    egal(t.d.sauvegarde().resultats.liste.length,3,"l'import de la référence conserve tous les résultats précédents");
    await t.d.supprime("test-import-plus-ancien");egal(t.d.objectif("test-a"),35,"supprimer la référence sélectionne la première lecture encore valide");
    await t.db._ecritDistant("banc/resultats",{liste:sauvegarde.resultats.liste});
    egal(t.d.objectif("test-a"),35,"le rejeu distant d'une référence supprimée ne la ressuscite pas");
    vrai(t.d.contientBilan("source-test-import-plus-ancien","test-a"),"le tombstone garde l'identité du bilan maison supprimé");
    await t.d.supprime("test-maison");egal(t.d.objectif("test-a"),110,"la lecture de classe restante devient référence après les suppressions maison");
    await t.d.supprime("test-en-classe");egal(t.d.objectif("test-a"),null,"après suppression de toutes les lectures, le mode automatique attend de nouveau");
  }
  {
    const mauvais=[
      resultat("test-supprime",200,"2026-10-01T10:00:00Z",{suppr:true}),
      resultat("test-sans-score",undefined,"2026-10-01T10:00:00Z"),
      resultat("test-null",null,"2026-10-01T10:00:00Z"),
      resultat("test-score-texte","90","2026-10-01T10:00:00Z"),
      resultat("test-score-negatif",-1,"2026-10-01T10:00:00Z"),
      resultat("test-score-fraction",50.5,"2026-10-01T10:00:00Z"),
      resultat("test-score-hors-precision",Number.MAX_SAFE_INTEGER+1,"2026-10-01T10:00:00Z"),
      resultat("test-episode-inconnu",200,"2026-10-01T10:00:00Z",{ep:"inconnu"}),
      resultat("test-autre-eleve",200,"2026-10-01T10:00:00Z",{eleve:"test-b"}),
      resultat("test-date-invalide",200,"date impossible"),
      resultat("test-date-vide",200,"")
    ];
    const ancien=resultat("test-ancien-compatible",50,"2026-10-19T10:00:00Z");delete ancien.secondes;
    const t=await ouvre({resultats:[...mauvais,ancien]});
    egal(t.d.objectif("test-a"),55,"les références invalides sont exclues, les anciens essais sans durée restent compatibles");
    egal(t.d.objectifInfo("test-a").reference.id,ancien.id,"une donnée malformée plus ancienne ne masque pas la première lecture valide");
  }
  {
    const a=await ouvre(),b=await ouvre();
    await ajoute(a,resultat("test-appareil-a",80,"2026-10-19T10:00:00Z"));
    await ajoute(b,maison("test-appareil-b",40,"2026-10-18T10:00:00Z"));
    const sa=copie(a.d.sauvegarde()),sb=copie(b.d.sauvegarde());
    await a.db._ecritDistant("banc/resultats",sb.resultats);await b.db._ecritDistant("banc/resultats",sa.resultats);
    egal([a.d.objectif("test-a"),b.d.objectif("test-a")],[45,45],"la fusion bidirectionnelle des résultats donne le même objectif sur les deux appareils");
    const manuelle={eleves:[{id:"test-a",nom:"Test A",objectif:"73"},{id:"test-b",nom:"Test B",objectif:""}],maj:2};
    await a.db._ecritDistant("banc/classe",manuelle);await b.db._ecritDistant("banc/classe",manuelle);
    egal([a.d.objectif("test-a"),b.d.objectif("test-a")],[73,73],"la classe distante au format historique transmet toujours un objectif manuel");
    const auto={eleves:eleves(),maj:3};await a.db._ecritDistant("banc/classe",auto);
    egal(a.d.objectif("test-a"),45,"le champ vide reçu d'un autre appareil réactive l'automatique sans nouveau format");
  }
  {
    const t=await ouvre();
    vrai(await t.d.importe({students:[{id:"test-v1",name:"Test Ancien",goal:""}],results:[{sid:"test-v1",ep:"E1",date:"2026-10-01T10:00:00Z",mclm:50,read:50,err:0}],speed:.8}),"une sauvegarde de la première version reste importable");
    egal(t.d.objectif("test-v1"),55,"une ancienne sauvegarde sans objectif ni durée fournit sa première lecture");
    vrai(await t.d.importe({students:[{id:"test-v1",name:"Test Ancien",goal:0}],results:[],speed:.8}),"une ancienne sauvegarde avec objectif numérique zéro reste importable");
    egal(t.d.objectif("test-v1"),0,"l'import V1 conserve le zéro manuel au lieu de réactiver l'automatique");
  }
  {
    const t=await ouvre();t.echoue();
    vrai(await t.d.ajoute(resultat("test-non-enregistre",20,"2026-10-01T10:00:00Z"))===false,"la panne de stockage est signalée");
    egal(t.d.objectif("test-a"),null,"un résultat dont la sauvegarde échoue ne devient jamais référence");
    await ajoute(t,resultat("test-confirme",50));egal(t.d.objectif("test-a"),55,"le premier résultat réellement enregistré devient référence après une panne");
  }
  console.log(`\n${nb} vérifications des objectifs réussies.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

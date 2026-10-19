// Vrais modules exécutés avec Preferences différé : aucune donnée ni connexion réelle.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict"),{webcrypto}=require("node:crypto");
const sources=["plateforme.js","commun.js"].map(n=>fs.readFileSync(path.join(__dirname,"..","src",n),"utf8"));
const CLE="banc-db:banc/resultats";
let nb=0;
function vrai(ok,message){assert.ok(ok,message);nb++;console.log("  ✓ "+message);}
function egal(actual,expected,message){assert.deepEqual(copie(actual),copie(expected),message);nb++;console.log("  ✓ "+message);}
const resultat=(id,maison=false)=>({id,eleve:"test-eleve",ep:"T3",date:"2026-10-19T12:00:00.000Z",mclm:50,lus:50,erreurs:0,secondes:60,dernier:49,fautes:[],...(maison?{origine:"maison",sourceId:"test-source-"+id}:{})});
const copie=x=>JSON.parse(JSON.stringify(x));

async function ouvre(){
  const preferences=new Map(),miroir=new Map(),disponibles=[],attentes=[],ecritures=[];
  let actives=0,maxActives=0;
  const prefs={
    get:async({key})=>({value:preferences.get(key)??null}),
    set:({key,value})=>{
      if(key!==CLE){preferences.set(key,value);return Promise.resolve();}
      return new Promise((resolve,reject)=>{
        actives++;maxActives=Math.max(maxActives,actives);let fini=false;
        const operation={data:JSON.parse(value).data,termine(erreur){
          assert.equal(fini,false,"une écriture ne peut être libérée qu'une fois");fini=true;actives--;
          if(erreur)reject(new Error("Échec Preferences simulé"));
          else{preferences.set(key,value);resolve();}
        }};
        ecritures.push(operation);
        if(attentes.length)attentes.shift()(operation);else disponibles.push(operation);
      });
    },
    remove:async({key})=>preferences.delete(key)
  };
  const contexte={console,TextEncoder,TextDecoder,crypto:webcrypto,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,
    location:{hash:"#ecran",href:"https://test.invalid/#ecran",protocol:"https:"},screen:{width:1366,height:768},
    localStorage:{getItem:k=>miroir.get(k)??null,setItem:(k,v)=>miroir.set(k,v),removeItem:k=>miroir.delete(k)},
    document:{documentElement:{dataset:{}}},__BANC:{episodes:[]},
    Capacitor:{isNativePlatform:()=>true,Plugins:{Preferences:prefs}}
  };
  contexte.window=contexte;vm.createContext(contexte);sources.forEach(s=>vm.runInContext(s,contexte));
  const d=contexte.Banc.Donnees;await d.init();const db=await contexte.claude.use("db");
  return {d,db,ecritures,maxActives:()=>maxActives,
    prochaine:()=>disponibles.length?Promise.resolve(disponibles.shift()):new Promise(r=>attentes.push(r)),
    async etat(){
      const ids=x=>(x?.liste||[]).map(r=>r.id).sort();
      return {memoire:ids(d.sauvegarde().resultats),cache:ids((await db.doc("banc/resultats").get()).data()),
        preferences:ids(JSON.parse(preferences.get(CLE)||"null")?.data),miroir:ids(JSON.parse(miroir.get(CLE)||"null")?.data)};
    }
  };
}
async function conserve(t,ids,message){const attendus=ids.slice().sort();egal(await t.etat(),{memoire:attendus,cache:attendus,preferences:attendus,miroir:attendus},message);vrai(t.maxActives()===1,"Preferences ne reçoit jamais deux écritures de résultats en parallèle");}
async function ajoute(t,r){const p=t.d.ajoute(r);(await t.prochaine()).termine();assert.equal(await p,true);}

(async()=>{
  {
    const t=await ouvre(),a=t.d.ajoute(resultat("test-classe")),b=t.d.ajoute(resultat("test-maison",true));
    const premiere=await t.prochaine();egal(premiere.data.liste.map(r=>r.id),["test-classe"],"le premier ajout attend seul la confirmation native");
    egal((await t.etat()).memoire,[],"un ajout en attente n'entre pas encore en mémoire");
    premiere.termine();vrai(await a,"le score de classe est confirmé");
    const deuxieme=await t.prochaine();egal(deuxieme.data.liste.map(r=>r.id).sort(),["test-classe","test-maison"],"l'ajout maison fusionne avec la valeur confirmée pendant son attente");
    deuxieme.termine();vrai(await b,"le bilan maison est confirmé");
    await conserve(t,["test-classe","test-maison"],"deux ajouts concurrents restent présents dans tous les états");
  }
  {
    const t=await ouvre(),id="maison:test-eleve:test-source-unique",r={...resultat(id,true),sourceId:"test-source-unique"};
    const a=t.d.ajoute({...r,source:"automatique"}),b=t.d.ajoute(r);
    (await t.prochaine()).termine();await a;
    const seconde=await t.prochaine();egal(seconde.data.liste.map(r=>r.id),[id],"les deux voies simultanées d'un bilan avec ID canonique produisent une seule entrée");
    seconde.termine();vrai(await b,"la seconde voie confirme le bilan déjà sauvegardé");
    await conserve(t,[id],"l'identité canonique déduplique aussi les écritures concurrentes");
  }
  for(const distantPremier of [false,true]){
    const t=await ouvre(),local=()=>t.d.ajoute(resultat("test-local")),distant=()=>t.db._ecritDistant("banc/resultats",{liste:[resultat("test-distant")]});
    const a=distantPremier?distant():local(),premiere=await t.prochaine();
    const b=distantPremier?local():distant();premiere.termine();await a;
    const deuxieme=await t.prochaine();egal(deuxieme.data.liste.map(r=>r.id).sort(),["test-distant","test-local"],"fusion au début de la transaction, ordre "+(distantPremier?"distant puis local":"local puis distant"));
    deuxieme.termine();await b;
    await conserve(t,["test-distant","test-local"],"le snapshot distant et l'ajout local sont conservés, ordre "+(distantPremier?"distant/local":"local/distant"));
  }
  for(const rejeuPremier of [false,true]){
    const t=await ouvre(),ancien=resultat("test-supprime",true);await ajoute(t,ancien);
    const supprime=()=>t.d.supprime(ancien.id),rejoue=()=>t.db._ecritDistant("banc/resultats",{liste:[ancien]});
    const a=rejeuPremier?rejoue():supprime(),premiere=await t.prochaine();
    const b=rejeuPremier?supprime():rejoue();premiere.termine();await a;(await t.prochaine()).termine();await b;
    const mem=copie(t.d.sauvegarde().resultats.liste),cache=(await t.db.doc("banc/resultats").get()).data().liste;
    vrai(mem.length===1&&mem[0].suppr===true&&cache[0].suppr===true,"la suppression gagne face à un ancien résultat rejoué, ordre "+(rejeuPremier?"rejeu/suppression":"suppression/rejeu"));
    vrai(mem[0].sourceId===ancien.sourceId&&mem[0].eleve===ancien.eleve&&mem[0].origine==="maison"&&t.d.contientBilan(ancien.sourceId,ancien.eleve),"le tombstone conserve l'identité source du bilan maison");
    vrai(t.d.essaisMaison().length===0,"un bilan supprimé ne revient pas dans les résultats visibles");
    await conserve(t,[ancien.id],"le tombstone est conservé sans duplication dans tous les états");
  }
  {
    const t=await ouvre();await ajoute(t,resultat("test-initial"));const signaux=[];t.d.surChange(q=>signaux.push(q));
    const echec=t.d.ajoute(resultat("test-non-sauve")),suivant=t.d.ajoute(resultat("test-apres-erreur"));
    (await t.prochaine()).termine(true);vrai(await echec===false,"une panne native renvoie false à l'ajout concerné");
    egal(signaux,[],"un résultat non enregistré n'émet aucun signal de réussite");
    const seconde=await t.prochaine();egal(seconde.data.liste.map(r=>r.id).sort(),["test-apres-erreur","test-initial"],"la transaction suivante exclut l'ajout échoué et garde l'ancien résultat");
    egal((await t.etat()).memoire,["test-initial"],"le résultat échoué n'entre jamais en mémoire");
    seconde.termine();vrai(await suivant,"la file continue après une panne de Preferences");
    await conserve(t,["test-initial","test-apres-erreur"],"seuls les résultats confirmés restent présents après reprise");
  }
  {
    const t=await ouvre(),echec=t.db._ecritDistant("banc/resultats",{liste:[resultat("test-distant-perdu")] }).then(()=>false,()=>true);
    const suivante=t.d.ajoute(resultat("test-local-apres-erreur"));(await t.prochaine()).termine(true);
    vrai(await echec,"une panne distante rejette la transaction sans publier de snapshot");
    (await t.prochaine()).termine();vrai(await suivante,"un ajout local continue après une écriture distante échouée");
    await conserve(t,["test-local-apres-erreur"],"le résultat distant non sauvegardé ne contamine pas l'ajout local suivant");
  }
  {
    const t=await ouvre();await ajoute(t,resultat("test-deja-sauve"));
    const p=t.d.importe({format:"banc-des-maitres/sauvegarde",classe:copie(t.d.sauvegarde().classe),resultats:{liste:[resultat("test-import-echoue")]}});
    const ecriture=await t.prochaine();egal((await t.etat()).memoire,["test-deja-sauve"],"un import attend sa sauvegarde avant d'entrer en mémoire");
    ecriture.termine(true);vrai(await p===false,"l'import propage l'échec de sauvegarde des résultats");
    await conserve(t,["test-deja-sauve"],"l'import échoué préserve les résultats antérieurs sans succès apparent");
  }
  console.log(`\n${nb} vérifications de concurrence des résultats réussies.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(limite));
// Garde-fou d'un test bloqué, indépendant de l'ordre contrôlé des transactions.
const limite=setTimeout(()=>{console.error("Une transaction de test ne s'est pas terminée.");process.exit(1);},10000);

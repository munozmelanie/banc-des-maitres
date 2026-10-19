// Progrès : vrais modules, données synthétiques, stockage natif simulé.
// Aucun réseau, aucune donnée réelle. Les filtres sont des lectures pures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const sources=['plateforme.js','commun.js'].map(f=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8'));
const copie=x=>JSON.parse(JSON.stringify(x));let nb=0;
const egal=(a,b,m)=>{assert.deepEqual(copie(a),copie(b),m);nb++;console.log('  ✓ '+m);};
const vrai=(a,m)=>{assert.ok(a,m);nb++;console.log('  ✓ '+m);};
const resultat=(id,mclm,date='2026-10-10T10:00:00Z',extra={})=>({id,eleve:'test-a',ep:'E1',date,mclm,lus:mclm,erreurs:0,secondes:60,...extra});
async function ouvre(liste=[],eleves=[{id:'test-a',nom:'Test A',objectif:''},{id:'test-b',nom:'Test B',objectif:''}]){
  const prefs=new Map(),local=new Map();let echec=false;
  prefs.set('banc-db:banc/classe',JSON.stringify({data:{eleves,maj:1},rev:1}));
  prefs.set('banc-db:banc/resultats',JSON.stringify({data:{liste},rev:1}));
  const c={console,TextEncoder,TextDecoder,crypto:webcrypto,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,
    location:{hash:'#ecran',href:'https://test.invalid/#ecran',protocol:'https:'},screen:{width:1366,height:900},document:{documentElement:{dataset:{}}},
    __BANC:{episodes:[{id:'E1',titre:'Texte fictif A'},{id:'T1',titre:'Texte fictif B'}]},
    localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
    Capacitor:{isNativePlatform:()=>true,Plugins:{Preferences:{get:async({key})=>({value:prefs.get(key)??null}),set:async({key,value})=>{if(echec&&key==='banc-db:banc/resultats'){echec=false;throw Error('Panne fictive');}prefs.set(key,value);},remove:async({key})=>prefs.delete(key)}}}};
  c.window=c;vm.createContext(c);sources.forEach(s=>vm.runInContext(s,c));await c.Banc.Donnees.init();
  return {d:c.Banc.Donnees,db:await c.claude.use('db'),echoue:()=>{echec=true;}};
}
(async()=>{
  const liste=[
    resultat('classe-z',80,'2026-10-12T10:00:00Z',{origine:'classe'}),
    resultat('maison-a',40,'2026-10-01T10:00:00Z',{origine:'maison',ep:'T1',sourceId:'source-maison-a'}),
    resultat('classe-a',50,'2026-10-10T10:00:00Z'),
    resultat('classe-b',60,'2026-10-11T10:00:00Z',{ep:'T1',origine:null}),
    resultat('classe-c',70,'2026-10-12T10:00:00Z'),
    resultat('maison-b',90,'2026-10-13T10:00:00Z',{origine:'maison',sourceId:'source-maison-b'}),
    resultat('autre-eleve',999,'2026-10-14T10:00:00Z',{eleve:'test-b'}),
    resultat('origine-inconnue',888,'2026-10-15T10:00:00Z',{origine:'autre'}),
    resultat('efface',1000,'2026-10-15T10:00:00Z',{suppr:true})
  ];
  const t=await ouvre(liste),avant=JSON.stringify(t.d.sauvegarde().resultats),p=t.d.progres('test-a');
  egal(p.lectures.map(r=>r.id),['classe-a','classe-b','classe-c','classe-z'],'classe : origines historique, null et classe, sans maison ni autre élève');
  egal(p.lectures.map(r=>r.essai),[1,1,2,3],'les lectures sont numérotées par texte dans leur origine');
  egal([p.nombre,p.dernier,p.meilleur,p.evolution],[4,80,80,30],'statistiques sur les seules lectures de classe visibles');
  egal(p.objectif.valeur,45,'objectif unique issu de la première lecture maison, même dans la vue classe');
  const f=t.d.progres('test-a','classe','E1');
  egal(f.lectures.map(r=>r.id),['classe-a','classe-c','classe-z'],'le filtre texte n’ajoute aucune lecture d’un autre texte');
  egal([f.nombre,f.dernier,f.meilleur,f.evolution],[3,80,80,30],'statistiques recalculées pour le texte filtré');
  const maison=t.d.progres('test-a','maison');
  egal(maison.lectures.map(r=>r.id),['maison-a','maison-b'],'maison : exclusivement les bilans de l’élève sélectionné');
  egal([maison.nombre,maison.dernier,maison.meilleur,maison.evolution],[2,90,90,50],'un meilleur score maison ne devient pas un record de classe');
  const une=t.d.progres('test-a','maison','T1');
  egal([une.nombre,une.dernier,une.meilleur,une.evolution],[1,40,40,null],'une seule lecture n’invente pas une progression');
  egal(une.objectif.valeur,45,'changer de texte ne change pas l’objectif de l’élève');
  const vide=t.d.progres('test-b','maison');
  egal([vide.nombre,vide.dernier,vide.meilleur,vide.evolution],[0,null,null,null],'aucune lecture maison : les statistiques restent vides');
  egal(vide.objectif.valeur,1099,'l’objectif reste affichable sans lecture dans le mode sélectionné');
  egal(t.d.progres('test-inconnu').objectif.valeur,null,'un identifiant élève inconnu ne reçoit pas un objectif inventé');
  egal(JSON.stringify(t.d.sauvegarde().resultats),avant,'consulter tous les filtres ne change aucun résultat ni numéro enregistré');
  const inverse=await ouvre(liste.slice().reverse());
  egal(inverse.d.progres('test-a').lectures.map(r=>r.id),p.lectures.map(r=>r.id),'ordre identique entre appareils à date égale, quel que soit l’ordre de réception');
  const heures=await ouvre([resultat('apres',90,'2026-10-19T08:30:00Z'),resultat('avant',60,'2026-10-19T10:00:00+02:00')]);
  egal(heures.d.progres('test-a').lectures.map(r=>r.id),['avant','apres'],'chronologie des instants correcte avec des fuseaux horaires différents');
  const invalides=await ouvre([resultat('bon',0),resultat('texte','80'),resultat('negatif',-1),resultat('fraction',2.5),resultat('date',60,'invalide')]);
  egal(invalides.d.progres('test-a').mesures.map(r=>r.id),['bon'],'les scores invalides et dates absentes ne créent pas de points trompeurs');
  egal([invalides.d.progres('test-a').dernier,invalides.d.progres('test-a').meilleur],[0,0],'un vrai score zéro est conservé dans les statistiques');
  egal(invalides.d.progres('test-a').nombre,5,'les anciennes lectures imparfaites restent consultables sans être détruites');
  await t.d.enregistreEleves([{id:'test-a',nom:'Test A',objectif:'0'},{id:'test-b',nom:'Test B',objectif:''}]);
  egal(t.d.progres('test-a','maison','T1').objectif,{valeur:0,mode:'manuel',reference:null},'l’objectif manuel zéro reste prioritaire dans chaque vue');
  const avantEchec=t.d.progres('test-a','maison').lectures.map(r=>r.id);t.echoue();
  vrai(!await t.d.supprime('maison-a'),'une panne de stockage signale une suppression non confirmée');
  egal(t.d.progres('test-a','maison').lectures.map(r=>r.id),avantEchec,'la lecture reste visible après un échec de suppression');
  vrai(await t.d.supprime('maison-a'),'la suppression confirmée retire la lecture de la vue');
  egal(t.d.progres('test-a','maison').lectures.map(r=>r.id),['maison-b'],'la suppression maison laisse intactes les autres lectures');
  const tombe=t.d.sauvegarde().resultats.liste.find(r=>r.id==='maison-a');
  vrai(tombe.suppr&&tombe.origine==='maison'&&tombe.sourceId==='source-maison-a'&&tombe.eleve==='test-a','le tombstone conserve l’identité du bilan importé');
  await t.db._ecritDistant('banc/resultats',{liste:[liste[1]]});
  egal(t.d.progres('test-a','maison').lectures.map(r=>r.id),['maison-b'],'une synchronisation ancienne ne ressuscite pas le bilan supprimé');
  egal(t.d.progres('test-a').lectures.map(r=>r.id),['classe-a','classe-b','classe-c','classe-z'],'les lectures de classe sont préservées après suppression maison et synchronisation');
  console.log('\n'+nb+' vérifications de progression réussies.');
})().catch(e=>{console.error(e);process.exitCode=1;});

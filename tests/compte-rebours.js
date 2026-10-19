// Horloge et sortie audio simulées : aucun son ni donnée d’élève.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/commun.js'),'utf8');
const sourcePlateforme=fs.readFileSync(path.join(__dirname,'../src/plateforme.js'),'utf8');
let controles=0;const verifie=(f,message)=>{f();controles++;console.log('  ✓ '+message);};
function environnement({etat='suspended',reprise='immediate',indisponible=false,sessionRefusee=false,plateforme={}}={}){
 let now=0,id=0;const timers=new Map(),sons=[],contexts=[],sessions=[],noeuds=[];
 class AudioContext{
  constructor(){if(indisponible)throw Error('Audio indisponible');this.state=etat;this.currentTime=0;this.destination={};this.reprise=reprise;this.reprises=0;contexts.push(this);}
  resume(){this.reprises++;if(this.reprise==='refus')return Promise.reject(Error('Reprise audio refusée'));if(this.reprise==='retard')return new Promise(resolve=>{(this.attentes??=[]).push(resolve);this.reprend=(etat='running')=>{this.state=etat;for(const f of this.attentes.splice(0))f();};});this.state='running';return Promise.resolve();}
  createGain(){const suivi={type:'gain',connecte:false};noeuds.push(suivi);return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){suivi.connecte=true;return this;},disconnect(){suivi.connecte=false;}};}
  createOscillator(){if(this.state==='closed')throw Error('Contexte fermé');const contexte=this,suivi={type:'oscillateur',connecte:false,arrete:false};noeuds.push(suivi);return {frequency:{},connect(g){suivi.connecte=true;return g;},start(){sons.push({at:now,etat:contexte.state});},stop(instant){if(instant===undefined)suivi.arrete=true;},disconnect(){suivi.connecte=false;}};}
 }
 const audioSession={};Object.defineProperty(audioSession,'type',{set:v=>{if(sessionRefusee)throw Error('Session non modifiable');sessions.push(v);}});
 const ctx={console,AudioContext,navigator:{audioSession},document:{documentElement:{dataset:{}},hidden:false},Plateforme:{role:()=>"parents",rid:()=>`bip-test-${++id}`,...plateforme},__BANC:{episodes:[]},location:{hash:''},performance:{now:()=>now},
  Date:class extends Date{static now(){return now;}},
  setTimeout:(f,ms)=>{timers.set(++id,{f,at:now+ms});return id;},clearTimeout:i=>timers.delete(i)};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 const avance=ms=>{const fin=now+ms;while(true){const suivant=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!suivant||suivant[1].at>fin)break;now=suivant[1].at;timers.delete(suivant[0]);suivant[1].f();}now=fin;};
 return {Banc:ctx.Banc,avance,sons,contexts,sessions,noeuds,document:ctx.document,maintenant:()=>now};
}
const resoutPromesses=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
// Le pont enregistre uniquement des commandes. Il ne prétend pas vérifier
// l’audibilité physique, qui nécessite un iPhone et son haut-parleur.
function pontAudio(maintenant){
 const appels=[],arrets=[],attentes=[],annules=new Set();let mode='succes',modeArret='succes',courant=null;
 const accepte=p=>{
  const joue=!annules.has(p.id)&&maintenant()<=p.avant;
  if(joue)courant=p.id;
  return {joue};
 };
 const plugin={
  play(p){
   p={...p};appels.push({at:maintenant(),...p});
   if(mode==='throw')throw Error('Pont indisponible');
   if(mode==='refus')return Promise.reject(Error('Lecture native refusée'));
   if(mode==='muet')return Promise.resolve({joue:false});
   if(mode==='retard')return new Promise((resolve,reject)=>attentes.push({p,resolve,reject}));
   return Promise.resolve(accepte(p));
  },
  stop({id}){arrets.push(id);annules.add(id);if(courant===id)courant=null;if(modeArret==='throw')throw Error('Arrêt natif indisponible');return modeArret==='refus'?Promise.reject(Error('Arrêt natif refusé')):Promise.resolve();}
 };
 return {plugin,appels,arrets,attentes,mode:v=>{mode=v;},modeArret:v=>{modeArret=v;},courant:()=>courant,
  termine(i,{refus=false}={}){const a=attentes[i];if(refus)a.reject(Error('Lecture native refusée'));else a.resolve(accepte(a.p));}};
}
function environnementNatif(){
 let e;const pont=pontAudio(()=>e.maintenant());
 e=environnement({plateforme:{son:pont.plugin}});
 return {...e,pont};
}
function plateformeAudio({natif=true,disponible=true,preenregistre=false,sansDetection=false,erreurDetection=false}={}){
 const enregistrements=[],detections=[],plugin={play(){},stop(){}};
 let disponibleMaintenant=disponible;
 const Capacitor={isNativePlatform:()=>natif,Plugins:preenregistre?{FluenceAudio:plugin}:{},
  registerPlugin(nom){enregistrements.push(nom);return nom==='FluenceAudio'?plugin:null;}};
 if(!sansDetection)Capacitor.isPluginAvailable=nom=>{detections.push(nom);if(erreurDetection)throw Error('Détection indisponible');return disponibleMaintenant;};
 const ctx={console,TextEncoder,TextDecoder,Capacitor,location:{hash:'#parents',href:'https://test.invalid/#parents',protocol:'https:'},
  localStorage:{getItem(){throw Error('Lecture privée inattendue');},setItem(){throw Error('Écriture privée inattendue');}},
  screen:{width:390,height:844},document:{documentElement:{dataset:{}}}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(sourcePlateforme,ctx);
 return {Plateforme:ctx.Plateforme,plugin,enregistrements,detections,disponible:v=>{disponibleMaintenant=v;}};
}
(async()=>{
 const e=environnement(),nombres=[],departs=[];
 e.Banc.compteRebours({surNombre:n=>nombres.push([e.maintenant(),n]),termine:()=>departs.push(e.maintenant())});
 verifie(()=>{assert.deepEqual(nombres,[[0,3]]);assert.deepEqual(e.sons,[{at:0,etat:'running'}]);assert.equal(e.contexts[0].reprises,1);},'le premier geste reprend le contexte suspendu et émet le premier bip');
 e.avance(2999);
 verifie(()=>{assert.deepEqual(nombres,[[0,3],[1000,2],[2000,1]]);assert.deepEqual(e.sons.map(x=>x.at),[0,1000,2000]);assert.equal(departs.length,0);},'trois nombres et trois bips, sans départ prématuré');
 e.avance(1);e.avance(5000);
 verifie(()=>{assert.deepEqual(departs,[3000]);assert.equal(e.sons.length,3);assert.ok(e.sons.every(x=>x.etat==='running'));},'le départ a lieu à trois secondes et aucun bip ne se répète');
 const annule=e.Banc.compteRebours({surNombre:()=>{},termine:()=>{throw Error('Départ après annulation');}});annule();annule();e.avance(4000);
 verifie(()=>assert.equal(e.sons.length,4),'annuler deux fois supprime les deux bips et le départ restants');
 e.contexts[0].state='interrupted';const reprises=e.contexts[0].reprises;e.Banc.bip();await Promise.resolve();
 verifie(()=>{assert.equal(e.contexts[0].reprises,reprises+1);assert.equal(e.contexts[0].state,'running');assert.equal(e.sons.at(-1).etat,'running');},'après interruption iOS, un nouveau geste reprend aussi le contexte interrupted');
 e.contexts[0].state='closed';e.Banc.bip();await Promise.resolve();
 verifie(()=>{assert.equal(e.contexts.length,2);assert.equal(e.contexts[1].state,'running');assert.equal(e.sons.at(-1).etat,'running');},'un contexte définitivement fermé est remplacé pour retrouver les bips');
 const refus=environnement({reprise:'refus'}),nv=[],dv=[];
 refus.Banc.compteRebours({surNombre:n=>nv.push(n),termine:()=>dv.push(refus.maintenant())});refus.avance(3000);await Promise.resolve();await Promise.resolve();
 verifie(()=>{assert.deepEqual(nv,[3,2,1]);assert.deepEqual(dv,[3000]);},'un refus de reprise audio ne bloque ni les nombres ni le vrai départ');
 refus.contexts.at(-1).reprise='immediate';refus.Banc.bip();await Promise.resolve();
 verifie(()=>{assert.equal(refus.contexts.at(-1).state,'running');assert.equal(refus.sons.at(-1).etat,'running');},'un nouvel essai peut retrouver le son après un refus temporaire');
 const lent=environnement({etat:'interrupted',reprise:'retard'}),nl=[],dl=[];
 lent.Banc.compteRebours({surNombre:n=>nl.push(n),termine:()=>dl.push(lent.maintenant())});
 verifie(()=>{assert.equal(lent.contexts[0].reprises,1);assert.equal(lent.sons.length,0);},'resume est demandé dans le geste mais aucun oscillateur ne part avant sa reprise effective');
 lent.avance(1000);lent.contexts[0].reprend();await Promise.resolve();await Promise.resolve();
 verifie(()=>{assert.deepEqual(nl,[3,2]);assert.deepEqual(lent.sons,[{at:1000,etat:'running'}]);},'une reprise lente ne rejoue pas le bip du nombre précédent');
 lent.avance(2000);
 verifie(()=>{assert.deepEqual(dl,[3000]);assert.deepEqual(lent.sons.map(x=>x.at),[1000,2000]);},'une reprise lente ne décale pas le début des trois secondes');
 const quitte=environnement({etat:'interrupted',reprise:'retard'}),quittes=[];
 const stop=quitte.Banc.compteRebours({surNombre:()=>{},termine:()=>quittes.push(true)});stop();stop();quitte.contexts[0].reprend();await Promise.resolve();quitte.avance(4000);
 verifie(()=>{assert.equal(quitte.sons.length,0);assert.equal(quittes.length,0);},'une reprise résolue après annulation ne produit ni vieux bip ni départ');
 const tresLent=environnement({reprise:'retard'});let finiLent=false;tresLent.Banc.compteRebours({surNombre:()=>{},termine:()=>{finiLent=true;}});tresLent.avance(3000);tresLent.contexts[0].reprend();await Promise.resolve();await Promise.resolve();
 verifie(()=>{assert.equal(finiLent,true);assert.equal(tresLent.sons.length,0);},'une reprise après la fin du décompte ne produit pas une rafale tardive');
 const encoreSuspendu=environnement({etat:'interrupted',reprise:'retard'});encoreSuspendu.Banc.bip();encoreSuspendu.contexts[0].reprend('suspended');await Promise.resolve();
 verifie(()=>assert.equal(encoreSuspendu.sons.length,0),'une promesse résolue dans l’état suspended ne prétend pas émettre un bip');
 const sessionRefusee=environnement({sessionRefusee:true});sessionRefusee.Banc.bip();
 verifie(()=>{assert.equal(sessionRefusee.sons.length,1);assert.ok(e.sessions.includes('playback'));},'la session playback est demandée quand disponible et son refus ne bloque pas le bip');
 const sansAudio=environnement({indisponible:true}),muets=[];sansAudio.Banc.compteRebours({surNombre:()=>{},termine:()=>muets.push(sansAudio.maintenant())});sansAudio.avance(3000);
 verifie(()=>assert.deepEqual(muets,[3000]),'sans sortie audio, le compte à rebours reste utilisable');

 const natif=environnementNatif(),departsNatifs=[],nombresNatifs=[];
 for(let essai=0;essai<20;essai++){
  natif.Banc.compteRebours({surNombre:n=>nombresNatifs.push([natif.maintenant(),n]),termine:()=>departsNatifs.push(natif.maintenant())});
  await resoutPromesses();
  for(let seconde=0;seconde<3;seconde++){natif.avance(1000);await resoutPromesses();}
 }
 verifie(()=>{
  assert.equal(natif.pont.appels.length,60);
  assert.deepEqual(nombresNatifs,Array.from({length:60},(_,i)=>[i*1000,3-i%3]));
  assert.deepEqual(departsNatifs,Array.from({length:20},(_,i)=>(i+1)*3000));
 },'vingt défis successifs demandent chacun trois bips natifs et démarrent à trois secondes');
 verifie(()=>{
  assert.equal(natif.contexts.length,0);assert.equal(natif.sons.length,0);
  assert.equal(natif.pont.arrets.length,60);assert.equal(natif.pont.courant(),null);
 },'les succès natifs n’allouent aucun AudioContext et chaque bip est arrêté avant le suivant ou le départ');
 verifie(()=>{
  assert.equal(new Set(natif.pont.appels.map(p=>p.id)).size,60);
  assert.ok(natif.pont.appels.every(p=>typeof p.id==='string'&&p.id&&p.duree===.18&&p.avant>p.at&&p.avant<=p.at+1000));
  assert.deepEqual(natif.pont.arrets,natif.pont.appels.map(p=>p.id));
 },'les commandes natives ont des identifiants distincts, une durée et une échéance brève, puis un arrêt ciblé');

 const anciens=environnementNatif(),stopAncien=anciens.Banc.bip(),stopNouveau=anciens.Banc.bip();
 await resoutPromesses();const [ancienId,nouveauId]=anciens.pont.appels.map(p=>p.id);
 stopAncien();stopAncien();await resoutPromesses();
 verifie(()=>{
  assert.notEqual(ancienId,nouveauId);assert.deepEqual(anciens.pont.arrets,[ancienId]);
  assert.equal(anciens.pont.courant(),nouveauId);assert.equal(anciens.pont.appels[1].duree,.6);
 },'arrêter deux fois un ancien bip ne coupe pas le nouveau bip de fin de défi');
 stopNouveau();await resoutPromesses();
 verifie(()=>assert.equal(anciens.pont.courant(),null),'le nouveau bip conserve sa propre commande d’arrêt');

 const annuleNatif=environnementNatif();annuleNatif.pont.mode('retard');let departAnnule=false;
 const stopNatif=annuleNatif.Banc.compteRebours({surNombre:()=>{},termine:()=>{departAnnule=true;}});
 stopNatif();stopNatif();annuleNatif.pont.termine(0);await resoutPromesses();annuleNatif.avance(4000);await resoutPromesses();
 verifie(()=>{
  assert.equal(annuleNatif.pont.appels.length,1);assert.equal(annuleNatif.pont.courant(),null);
  assert.ok(annuleNatif.pont.arrets.includes(annuleNatif.pont.appels[0].id));
  assert.equal(departAnnule,false);assert.equal(annuleNatif.contexts.length,0);
 },'une lecture native encore en attente est annulée sans vieux bip, secours WebAudio ni départ du défi');

 const lentNatif=environnementNatif();lentNatif.pont.mode('retard');let departLentNatif=null;
 lentNatif.Banc.compteRebours({surNombre:()=>{},termine:()=>{departLentNatif=lentNatif.maintenant();}});
 lentNatif.avance(1000);lentNatif.pont.termine(0);lentNatif.pont.termine(1);await resoutPromesses();
 verifie(()=>{
  assert.equal(lentNatif.pont.courant(),lentNatif.pont.appels[1].id);
  assert.equal(lentNatif.contexts.length,0);
 },'une réponse native tardive pour « trois » ne remplace pas le bip courant de « deux »');
 lentNatif.pont.mode('succes');lentNatif.avance(2000);await resoutPromesses();
 verifie(()=>{assert.equal(departLentNatif,3000);assert.equal(lentNatif.pont.appels.length,3);assert.equal(lentNatif.pont.courant(),null);},'un pont natif lent ne décale jamais le départ du défi');

 for(const mode of ['refus','muet','throw']){
  const secours=environnementNatif();secours.pont.mode(mode);const arreteSecours=secours.Banc.bip();await resoutPromesses();
  verifie(()=>{assert.equal(secours.pont.appels.length,1);assert.equal(secours.contexts.length,1);assert.equal(secours.sons.length,1);},`le pont natif ${mode} laisse le secours WebAudio émettre une seule fois`);
  arreteSecours();arreteSecours();await resoutPromesses();
  verifie(()=>{assert.ok(secours.noeuds.every(n=>!n.connecte));assert.ok(secours.noeuds.filter(n=>n.type==='oscillateur').every(n=>n.arrete));},`annuler le secours après ${mode} arrête l’oscillateur et déconnecte ses ressources`);
 }
 const retente=environnementNatif();retente.pont.mode('refus');retente.Banc.bip();await resoutPromesses();
 retente.pont.mode('succes');retente.Banc.bip();await resoutPromesses();
 verifie(()=>{assert.equal(retente.pont.appels.length,2);assert.equal(retente.sons.length,1);assert.equal(retente.pont.courant(),retente.pont.appels[1].id);},'un refus temporaire ne désactive pas les bips natifs des essais suivants');

 const expire=environnementNatif();expire.pont.mode('retard');expire.Banc.bip();expire.avance(1001);expire.pont.termine(0);await resoutPromesses();
 verifie(()=>{assert.equal(expire.pont.courant(),null);assert.equal(expire.contexts.length,0);},'une commande native arrivée après son échéance ne produit aucun bip de secours tardif');
 for(const raison of ['annule','masque']){
  const obsolete=environnementNatif();obsolete.pont.mode('retard');const stopObsolete=obsolete.Banc.bip();
  if(raison==='annule')stopObsolete();else obsolete.document.hidden=true;
  obsolete.pont.termine(0,{refus:true});await resoutPromesses();
  verifie(()=>assert.equal(obsolete.contexts.length,0),`un refus natif reçu après ${raison==='annule'?'annulation':'masquage de la page'} ne lance pas WebAudio`);
 }
 const masque=environnementNatif();masque.document.hidden=true;masque.Banc.bip();await resoutPromesses();
 verifie(()=>{assert.equal(masque.pont.appels.length,0);assert.equal(masque.contexts.length,0);},'une page masquée ne demande ni bip natif ni bip WebAudio');
 masque.document.hidden=false;masque.Banc.bip();await resoutPromesses();
 verifie(()=>{assert.equal(masque.pont.appels.length,1);assert.equal(masque.contexts.length,0);},'le retour au premier plan permet un nouveau bip natif');
 for(const mode of ['refus','throw']){
  const arretRefuse=environnementNatif();arretRefuse.pont.modeArret(mode);let departApresErreur=false;
  const arrete=arretRefuse.Banc.compteRebours({surNombre:()=>{},termine:()=>{departApresErreur=true;}});
  arrete();arrete();await resoutPromesses();arretRefuse.avance(4000);await resoutPromesses();
  verifie(()=>{assert.equal(arretRefuse.pont.appels.length,1);assert.equal(arretRefuse.pont.arrets.length,1);assert.equal(departApresErreur,false);},`un arrêt natif ${mode} n’empêche pas l’annulation du défi et ne lance aucun autre bip`);
 }

 const web=plateformeAudio({natif:false,preenregistre:true});
 verifie(()=>{assert.equal(web.Plateforme.son,null);assert.equal(web.enregistrements.length,0);assert.equal(web.detections.length,0);},'le navigateur ne détecte ni n’enregistre de plugin audio natif, même si un objet de ce nom existe');
 for(const options of [{disponible:false,preenregistre:true},{sansDetection:true},{erreurDetection:true}]){
  const ancien=plateformeAudio(options);
  verifie(()=>{assert.equal(ancien.Plateforme.son,null);assert.ok(!ancien.enregistrements.includes('FluenceAudio'));},'un plugin absent ou une détection indisponible ne crée pas de pont audio fantôme');
 }
 const present=plateformeAudio({preenregistre:true});
 verifie(()=>{assert.equal(present.Plateforme.son,present.plugin);assert.equal(present.Plateforme.son,present.plugin);assert.ok(!present.enregistrements.includes('FluenceAudio'));},'le plugin déjà enregistré est utilisé seulement après confirmation de sa présence native');
 const tardif=plateformeAudio({disponible:false});
 verifie(()=>{
  assert.ok(!tardif.enregistrements.includes('FluenceAudio'));assert.equal(tardif.Plateforme.son,null);
  tardif.disponible(true);assert.equal(tardif.Plateforme.son,tardif.plugin);assert.equal(tardif.Plateforme.son,tardif.plugin);
  assert.equal(tardif.enregistrements.filter(n=>n==='FluenceAudio').length,1);
 },'le plugin est obtenu à la demande et une seule fois lorsqu’il devient disponible');

 console.log(`\n${controles} vérifications du compte à rebours et de la reprise audio réussies.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

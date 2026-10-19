// Horloge et sortie audio simulées : aucun son ni donnée d’élève.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/commun.js'),'utf8');
let controles=0;const verifie=(f,message)=>{f();controles++;console.log('  ✓ '+message);};
function environnement({etat='suspended',reprise='immediate',indisponible=false,sessionRefusee=false}={}){
 let now=0,id=0;const timers=new Map(),sons=[],contexts=[],sessions=[];
 class AudioContext{
  constructor(){if(indisponible)throw Error('Audio indisponible');this.state=etat;this.currentTime=0;this.destination={};this.reprise=reprise;this.reprises=0;contexts.push(this);}
  resume(){this.reprises++;if(this.reprise==='refus')return Promise.reject(Error('Reprise audio refusée'));if(this.reprise==='retard')return new Promise(resolve=>{(this.attentes??=[]).push(resolve);this.reprend=(etat='running')=>{this.state=etat;for(const f of this.attentes.splice(0))f();};});this.state='running';return Promise.resolve();}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},disconnect(){}};}
  createOscillator(){if(this.state==='closed')throw Error('Contexte fermé');const contexte=this;return {frequency:{},connect(g){return g;},start(){sons.push({at:now,etat:contexte.state});},stop(){},disconnect(){}};}
 }
 const audioSession={};Object.defineProperty(audioSession,'type',{set:v=>{if(sessionRefusee)throw Error('Session non modifiable');sessions.push(v);}});
 const ctx={console,AudioContext,navigator:{audioSession},document:{documentElement:{dataset:{}}},Plateforme:{role:()=>"parents"},__BANC:{episodes:[]},location:{hash:''},performance:{now:()=>now},
  Date:class extends Date{static now(){return now;}},
  setTimeout:(f,ms)=>{timers.set(++id,{f,at:now+ms});return id;},clearTimeout:i=>timers.delete(i)};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 const avance=ms=>{const fin=now+ms;while(true){const suivant=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!suivant||suivant[1].at>fin)break;now=suivant[1].at;timers.delete(suivant[0]);suivant[1].f();}now=fin;};
 return {Banc:ctx.Banc,avance,sons,contexts,sessions,maintenant:()=>now};
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
 console.log(`\n${controles} vérifications du compte à rebours et de la reprise audio réussies.`);
})().catch(e=>{console.error(e);process.exitCode=1;});

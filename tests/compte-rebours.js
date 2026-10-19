// Horloge et sortie audio simulées : aucun son ni donnée d'élève.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=0,id=0,resumes=0;const timers=new Map(),sons=[],nombres=[],departs=[];
class AudioContext{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};}
  resume(){resumes++;this.state='running';return Promise.resolve();}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  createOscillator(){return {frequency:{},connect(g){return g;},start(){sons.push(now);},stop(){},disconnect(){}};}
}
const ctx={console,AudioContext,document:{documentElement:{dataset:{}}},Plateforme:{role:()=>"parents"},__BANC:{episodes:[]},location:{hash:''},
  setTimeout:(f,ms)=>{timers.set(++id,{f,at:now+ms});return id;},clearTimeout:i=>timers.delete(i)};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/commun.js'),'utf8'),ctx);
const avance=ms=>{const fin=now+ms;while(true){const suivant=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!suivant||suivant[1].at>fin)break;now=suivant[1].at;timers.delete(suivant[0]);suivant[1].f();}now=fin;};
ctx.Banc.compteRebours({surNombre:n=>nombres.push([now,n]),termine:()=>departs.push(now)});
assert.deepEqual(nombres,[[0,3]]);assert.deepEqual(sons,[0]);assert.equal(resumes,1);
avance(2999);assert.deepEqual(nombres,[[0,3],[1000,2],[2000,1]]);assert.deepEqual(sons,[0,1000,2000]);assert.equal(departs.length,0);
avance(1);assert.deepEqual(departs,[3000]);avance(5000);assert.equal(sons.length,3);assert.equal(departs.length,1);
const annule=ctx.Banc.compteRebours({surNombre:()=>{},termine:()=>{throw Error('Départ après annulation');}});annule();annule();avance(4000);assert.equal(sons.length,4);
// Un navigateur sans sortie audio conserve un compte à rebours utilisable.
ctx.AudioContext=class{constructor(){throw Error('Audio indisponible');}};
const silencieux={...ctx,AudioContext:ctx.AudioContext};silencieux.window=silencieux;vm.createContext(silencieux);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/commun.js'),'utf8'),silencieux);
let fini=false;silencieux.Banc.compteRebours({surNombre:()=>{},termine:()=>{fini=true;}});avance(3000);assert.equal(fini,true);
console.log('Compte à rebours : 3 bips, reprise audio, départ à 3 s, annulation et absence audio vérifiés.');

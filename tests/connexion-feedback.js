// Connexion enseignante : lien et compte fictifs, réponses locales, aucune authentification réelle.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs'),fs=require('node:fs'),path=require('node:path');
const moteur=process.argv.includes('--webkit')?'webkit':'chromium',CAPT=path.join('/private/tmp','fluence-connexion-feedback',moteur);fs.mkdirSync(CAPT,{recursive:true});
let n=0;const vrai=(b,m)=>{if(!b)throw Error(m);n++;console.log('  ✓ '+m);};
function prepare(expiree){
 const API='https://fluence-connexion-test.supabase.co';Object.defineProperty(window,'BANC_MAISON',{configurable:true,get:()=>({url:API,publishableKey:'sb_publishable_synthese_sans_compte'}),set:()=>{}});
 if(expiree)localStorage.setItem('fluence-cloud-auth-v1',JSON.stringify({access_token:'ancien-acces-fictif',refresh_token:'ancien-refresh-fictif',user:{id:'enseignante-fictive',email:'test@example.test'},expire:1}));
 window.__authTest={requ:[],permis:true};const original=fetch;
 window.fetch=async(u,o={})=>{if(!String(u).startsWith(API))return original(u,o);const p=new URL(u).pathname;__authTest.requ.push({path:p,body:o.body?JSON.parse(o.body):null});
  if(p==='/auth/v1/otp')return new Promise(resolve=>window.__retourDemande=resolve);
  if(p==='/auth/v1/verify')return new Promise(resolve=>window.__retourVerify=resolve);
  let d=[],status=200;if(p==='/auth/v1/token'){d={error:'refresh_refuse_fictif'};status=401;}
  if(p==='/rest/v1/rpc/fluence_teacher_enabled')d=__authTest.permis;
  if(p==='/rest/v1/rpc/fluence_sync_progress')d={};
  return Response.json(d,{status});
 };
 const v=new EventTarget(),d={height:innerHeight};for(const k of ['height','width','offsetTop','offsetLeft','scale'])Object.defineProperty(v,k,{get:()=>k==='height'?d.height:k==='width'?innerWidth:k==='scale'?1:0});Object.defineProperty(window,'visualViewport',{configurable:true,value:v});window.__clavier=h=>{d.height=h;v.dispatchEvent(new Event('resize'));v.dispatchEvent(new Event('scroll'));};
 window.__session=()=>localStorage.getItem('fluence-cloud-auth-v1');window.__pedagogie=()=>{const d=Banc.Donnees.sauvegarde();return JSON.stringify({classe:d.classe,resultats:d.resultats,reglages:d.reglages});};
}
(async()=>{const S=await site(),b=await(moteur==='webkit'?webkit:chromium).launch(),erreurs=[],externes=[];try{
 for(const width of [320,390])for(const expiree of [false,true]){
  const label=width+'px '+(expiree?'session expirée':'sans session'),c=await b.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});await c.addInitScript(prepare,expiree);const p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).origin===new URL(S.base).origin?r.continue():(externes.push(new URL(r.request().url()).origin),r.abort()));
  await p.goto(S.base+'#tel');if(expiree)await p.waitForFunction(()=>MaisonCloud.statutReception().reconnexionNecessaire&&!MaisonCloud.statutReception().enCours);
  await p.click('[data-tab=eleves]');await p.click('#acces-parents');await p.waitForSelector('#cloud-connexion');
  const visible=()=>p.evaluate(()=>{const e=document.querySelector('#cloud-info'),r=e.getBoundingClientRect(),b=document.querySelector('#maison-dialogue').getBoundingClientRect(),v=visualViewport;return e.isConnected&&r.height>0&&r.top>=Math.max(b.top,v.offsetTop)-1&&r.bottom<=Math.min(b.bottom,v.offsetTop+v.height)+1;});
  const session=await p.evaluate(()=>__session()),pedagogie=await p.evaluate(()=>__pedagogie());
  vrai((await p.textContent('#maison-cloud')).includes('sans l’ouvrir')&&await p.getByRole('button',{name:'Recevoir un lien',exact:true}).isVisible(),label+' : le formulaire demande un lien à copier sans ouverture préalable');
  await p.fill('#cloud-email','test@example.test');await p.fill('#cloud-otp',S.base);await p.evaluate(()=>__clavier(300));
  // Position reproductible du défaut initial : bouton tout en bas de la zone visible.
  await p.locator('#cloud-connexion').scrollIntoViewIfNeeded();const cible=await p.evaluate(()=>{const b=document.querySelector('#cloud-connexion'),box=document.querySelector('#maison-dialogue');box.scrollTop+=b.getBoundingClientRect().bottom-box.getBoundingClientRect().bottom+14;const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});await p.touchscreen.tap(cible.x,cible.y);
  await p.waitForFunction(()=>document.querySelector('#cloud-info')?.getAttribute('role')==='alert');
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  vrai((await p.textContent('#cloud-info')).includes('Colle le lien')&&await visible()&&await p.locator('#cloud-connexion').isEnabled(),label+' : l’adresse déjà ouverte est refusée avec une erreur visible après le toucher');
  vrai(await p.evaluate(()=>!__authTest.requ.some(r=>r.path==='/auth/v1/verify')),label+' : une URL non valide n’est jamais envoyée au service');
  await p.fill('#cloud-otp','https://example.test/#parents&famille='+ 'a'.repeat(64));await p.click('#cloud-connexion');await p.waitForFunction(()=>document.querySelector('#cloud-info').textContent.startsWith('Ce lien est un accès parents'));
  vrai(await visible(),label+' : l’erreur d’accès famille est visible près du champ');
  await p.click('#cloud-code');await p.waitForFunction(()=>typeof __retourDemande==='function');
  vrai(await p.textContent('#cloud-code')==='Demande du lien…'&&(await p.textContent('#cloud-info')).includes('Demande du lien en cours')&&await visible(),label+' : la demande d’e-mail affiche immédiatement son attente');
  await p.evaluate(()=>__retourDemande(Response.json({})));await p.waitForFunction(()=>!document.querySelector('#cloud-code').disabled);
  vrai((await p.textContent('#cloud-info')).includes('copie-le ici sans l’ouvrir')&&await visible(),label+' : la demande confirmée garde une instruction visible et juste');
  const lien='https://fluence-connexion-test.supabase.co/auth/v1/verify?token='+ 'b'.repeat(64)+'&type=magiclink';await p.fill('#cloud-otp',lien);await p.click('#cloud-connexion');await p.waitForFunction(()=>typeof __retourVerify==='function');
  vrai(await p.textContent('#cloud-connexion')==='Connexion…'&&await p.locator('#cloud-connexion').isDisabled()&&await p.locator('#cloud-code').isDisabled()&&await p.textContent('#cloud-info')==='Connexion en cours…'&&await visible(),label+' : la connexion en attente est visible et les doubles demandes sont bloquées');
  await p.evaluate(()=>{document.querySelector('#cloud-connexion').onclick();__clavier(844);});if(expiree)await p.evaluate(()=>MaisonCloud.recoit());
  vrai(await p.textContent('#cloud-info')==='Connexion en cours…'&&await p.evaluate(()=>__authTest.requ.filter(r=>r.path==='/auth/v1/verify').length===1),label+' : une réception parallèle ne remplace pas l’attente et un double appel ne consomme pas deux liens');
  await p.evaluate(()=>__retourVerify(Response.json({error:'otp_expired'},{status:403})));await p.waitForFunction(()=>!document.querySelector('#cloud-connexion').disabled);
  const erreurLien=await p.textContent('#cloud-info');vrai(erreurLien.includes('expiré, déjà utilisé')&&erreurLien.includes('copie-le sans l’ouvrir')&&await visible(),label+' : un lien consommé ou expiré donne une action claire et visible');
  if(expiree)await p.evaluate(()=>MaisonCloud.recoit());
  vrai(await p.textContent('#cloud-info')===erreurLien&&await p.inputValue('#cloud-otp')===lien&&await p.evaluate(()=>__session())===session,label+' : le polling garde l’erreur, la saisie et l’ancienne session intactes');
  await p.screenshot({path:path.join(CAPT,width+'-'+(expiree?'expiree':'absente')+'-erreur.png')});
  await p.evaluate(()=>{__authTest.permis=false;delete window.__retourVerify;});await p.click('#cloud-connexion');await p.waitForFunction(()=>typeof __retourVerify==='function');
  const d={access_token:'nouvel-acces-fictif',refresh_token:'nouveau-refresh-fictif',expires_in:3600,user:{id:'enseignante-fictive',email:'test@example.test'}};await p.evaluate(d=>__retourVerify(Response.json(d)),d);await p.waitForFunction(()=>!document.querySelector('#cloud-connexion').disabled);
  vrai((await p.textContent('#cloud-info')).includes('pas autorisé')&&!/expiré, déjà utilisé/.test(await p.textContent('#cloud-info'))&&await p.evaluate(()=>__session())===session,label+' : le refus du compte enseignante garde son diagnostic distinct sans remplacer la session');
  await p.fill('#cloud-otp','123456');await p.evaluate(()=>{__authTest.permis=true;delete window.__retourVerify;});await p.click('#cloud-connexion');await p.waitForFunction(()=>typeof __retourVerify==='function');await p.evaluate(d=>__retourVerify(Response.json(d)),d);await p.waitForSelector('#cloud-actualise');
  vrai(await p.evaluate(()=>MaisonCloud.connectee()&&!MaisonCloud.statutReception().reconnexionNecessaire&&__authTest.requ.filter(r=>r.path==='/auth/v1/verify').at(-1).body.token==='123456'),label+' : une nouvelle connexion autorisée fonctionne et le code optionnel reste compatible');
  vrai(await p.evaluate(()=>__pedagogie())===pedagogie,label+' : toutes les tentatives conservent élèves, objectifs et résultats');
  vrai(await p.evaluate(()=>{const b=document.querySelector('#maison-dialogue');return b.scrollWidth<=b.clientWidth+1&&b.getBoundingClientRect().right<=innerWidth;}),label+' : aucun débordement du dialogue');
  await c.close();
 }
 vrai(externes.length===0,'aucune requête ni identité réelle');vrai(erreurs.length===0,'aucune erreur JavaScript');console.log(`\n${n} vérifications de retour de connexion réussies (${moteur}).`);
}finally{await b.close();await new Promise(ok=>S.serveur.close(ok));}})().catch(e=>{console.error(e);process.exitCode=1;});

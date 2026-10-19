// Statut de réception dans Progrès : service et classe fictifs, aucun compte ni réseau distant.
const {chromium,webkit}=require('playwright'),{site}=require('./serveurs'),fs=require('node:fs'),path=require('node:path');
const moteur=process.argv.includes('--webkit')?'webkit':'chromium',CAPT=path.join('/private/tmp','fluence-reception-progres-qa',moteur);fs.mkdirSync(CAPT,{recursive:true});
let nb=0;const vrai=(ok,m)=>{if(!ok)throw Error(m);nb++;console.log('  ✓ '+m);};
function prepare(){
 window.__reception={configuree:true,connectee:false,enCours:false,message:'',recu:0,nonAssocies:0,derniereReception:0,erreur:false,reconnexionNecessaire:false};
 window.__appelsReception=0;let api,resolve,reject;const ecoutes=new Set();
 window.__signaleReception=()=>ecoutes.forEach(f=>f());
 window.__nombreEcoutes=()=>ecoutes.size;
 Object.defineProperty(window,'MaisonCloud',{configurable:true,get:()=>api,set:x=>{api=x;
  x.init=async()=>{};x.connectee=()=>__reception.connectee;x.statutReception=()=>({...__reception});x.surChange=f=>{ecoutes.add(f);return ()=>ecoutes.delete(f);};
  x.vue=box=>{box.innerHTML='<h2>Connexion enseignante fictive</h2>';return ()=>{};};
  x.recoit=()=>{__appelsReception++;__reception.enCours=true;__reception.erreur=false;__signaleReception();return new Promise((oui,non)=>{resolve=oui;reject=non;});};
 }});
 window.__termineReception=async mode=>{
  if(mode==='ok'){
   for(let i=0;i<5;i++)await Banc.Donnees.ajoute({id:'recu-'+i,sourceId:'source-'+i,eleve:'test-reception',origine:'maison',ep:'E1',date:`2026-12-0${i+2}T17:00:00Z`,mclm:50+i,lus:50+i,erreurs:0,secondes:60,dernier:49+i,fautes:[],typeLecture:i===4?'defi':'entrainement'});
   Object.assign(__reception,{message:'5 nouveaux bilans reçus. Réception à jour.',recu:5,erreur:false,derniereReception:Date.now()});
  }else Object.assign(__reception,{message:'Connexion indisponible. Réessaie avec internet.',erreur:true});
  __reception.enCours=false;__signaleReception();if(mode==='throw')reject(Error('panne simulée'));else resolve();
 };
}
(async()=>{const S=await site(),b=await(moteur==='webkit'?webkit:chromium).launch(),erreurs=[],externes=[];try{
 for(const width of [320,390,1366]){
  const tel=width<600,c=await b.newContext({viewport:{width,height:tel?844:900},isMobile:tel,hasTouch:tel});await c.addInitScript(prepare);const p=await c.newPage();p.on('pageerror',e=>erreurs.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).origin===new URL(S.base).origin?r.continue():(externes.push(r.request().url()),r.abort()));
  await p.goto(S.base+'#'+(tel?'tel':'ecran'));await p.waitForFunction(()=>window.Banc&&Banc.Donnees.eleves().length);
  await p.evaluate(async()=>{await Banc.Donnees.enregistreEleves([{id:'test-reception',nom:'Test Réception',objectif:''},{id:'test-autre',nom:'Test Autre',objectif:''}]);await Banc.Donnees.ajoute({id:'deja-present',eleve:'test-reception',origine:'maison',ep:'E1',date:'2026-12-01T17:00:00Z',mclm:40,lus:40,erreurs:0,secondes:60,dernier:39,fautes:[]});});
  const progres=()=>p.click(tel?'[data-tab=progres]':'[data-go=progress]');await progres();
  vrai(await p.locator('#progression-actualiser').isHidden()&&(await p.textContent('#progression-reception')).includes('Connecte-toi')&&await p.getByRole('button',{name:'Se connecter',exact:true}).isVisible(),width+' : l’accès déconnecté indique comment recevoir les bilans sans fausse confirmation');
  await p.click('#acces-parents');vrai(await p.locator('#maison-dialogue').isVisible()&&(await p.textContent('#maison-cloud')).includes('Connexion enseignante fictive'),width+' : le bouton existant donne toujours accès à la connexion');await p.click('#maison-retour');
  await p.evaluate(()=>{__reception.connectee=true;__signaleReception();});
  vrai(await p.locator('#progression-actualiser').isVisible()&&await p.locator('#acces-parents').isHidden()&&(await p.textContent('#progression-reception')).includes('pas encore été vérifiés'),width+' : connectée, seule l’actualisation reste visible sans fausse réception réussie');
  await p.fill('#progression-recherche','Test');await p.locator('#progression-recherche').evaluate(e=>{window.__champRecherche=e;e.setSelectionRange(2,2);});
  await p.evaluate(()=>{__reception.message='Vérification à venir.';__signaleReception();});
  vrai(await p.evaluate(()=>document.querySelector('#progression-recherche')===__champRecherche&&document.activeElement===__champRecherche&&__champRecherche.selectionStart===2),width+' : une notification de réception préserve le champ, le focus et le curseur');
  await p.click('[data-progress-origine=maison]');await p.click('[data-progress-eleve=test-reception]');await p.selectOption('#progression-texte','E1');
  await p.locator('[data-progress-lecture=deja-present] summary').click();
  const ecoutes=await p.evaluate(()=>__nombreEcoutes());
  await p.click('#progression-actualiser');await p.evaluate(()=>document.querySelector('#progression-actualiser').click());
  vrai(await p.getAttribute('#progression-actualiser','aria-disabled')==='true'&&(await p.textContent('#progression-reception')).includes('Réception des bilans')&&await p.evaluate(()=>__appelsReception===1),width+' : actualisation visible et double requête bloquée');
  await p.focus('#progression-texte');await p.evaluate(()=>__termineReception('ok'));
  await p.waitForFunction(()=>document.querySelector('#progression-actualiser').getAttribute('aria-disabled')==='false');
  vrai(await p.textContent('[data-progress-stat=lectures]')==='6'&&await p.locator('[data-progress-point]').count()===6&&(await p.textContent('#progression-reception')).includes('5 nouveaux bilans'),width+' : les cinq bilans reçus s’ajoutent immédiatement au suivi');
  vrai(await p.inputValue('#progression-texte')==='E1'&&(await p.textContent('#progression-titre')).includes('Test Réception')&&await p.getAttribute('[data-progress-origine=maison]','aria-pressed')==='true'&&await p.evaluate(()=>document.activeElement.id==='progression-texte')&&await p.locator('[data-progress-lecture=deja-present]').getAttribute('open')!==null,width+' : élève, texte, lieu, détails ouverts et focus sont conservés pendant l’import');
  vrai(await p.evaluate(()=>__nombreEcoutes())===ecoutes,width+' : les cinq mises à jour ne multiplient pas les abonnements au statut');
  const pointFinal=p.locator('[data-progress-point]').last();
  vrai(await pointFinal.locator('path.progression-point-defi').evaluate(e=>getComputedStyle(e).fill==='rgb(177, 92, 22)'),width+' : le dernier défi reste un losange ambre');
  await pointFinal.focus();await p.keyboard.press('ArrowRight');
  vrai(await pointFinal.locator('path.progression-point-defi').evaluate(e=>getComputedStyle(e).fill==='rgb(246, 214, 172)'&&getComputedStyle(e).strokeWidth==='5px'),width+' : son focus reste visible en ambre, sans le confondre avec une lecture ordinaire');
  await p.locator('#progression-acces').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(CAPT,width+'-reception.png')});
  await p.click('#progression-actualiser');await p.evaluate(()=>__termineReception('erreur'));await p.waitForFunction(()=>document.querySelector('#progression-actualiser').getAttribute('aria-disabled')==='false');
  vrai((await p.textContent('#progression-reception')).includes('Connexion indisponible')&&!/à jour|vérifiés/.test(await p.textContent('#progression-reception'))&&await p.textContent('[data-progress-stat=lectures]')==='6',width+' : l’échec reste visible et ne supprime aucun résultat déjà reçu');
  await p.evaluate(()=>{__reception.message='';__reception.erreur=true;__signaleReception();});
  vrai((await p.textContent('#progression-reception')).includes('indisponible'),width+' : même sans message serveur, une erreur ne réutilise pas la dernière confirmation');
  await p.click('#progression-actualiser');await p.evaluate(()=>__termineReception('throw'));await p.waitForFunction(()=>document.querySelector('#progression-actualiser').getAttribute('aria-disabled')==='false');
  vrai((await p.textContent('#progression-reception')).includes('Impossible d’actualiser'),width+' : un rejet inattendu permet encore de réessayer');
  await p.evaluate(()=>{__reception.reconnexionNecessaire=true;__signaleReception();});
  vrai((await p.textContent('#progression-reception')).includes('Reconnecte-toi')&&await p.getByRole('button',{name:'Se connecter',exact:true}).isVisible(),width+' : une session refusée renvoie vers l’accès existant');
  vrai(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('#progression-acces *')].filter(e=>e.getBoundingClientRect().width).every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})),width+' : boutons et messages restent accessibles sans débordement');
  await p.evaluate(()=>{__reception.connectee=false;__reception.reconnexionNecessaire=false;__signaleReception();});
  vrai(await p.locator('#progression-actualiser').isHidden()&&(await p.textContent('#progression-reception')).includes('Connecte-toi')&&await p.textContent('[data-progress-stat=lectures]')==='6',width+' : se déconnecter masque l’actualisation sans effacer les lectures');
  await p.click(tel?'[data-tab=eleves]':'[data-go=students]');
  vrai(await p.getByRole('button',{name:'Accès parents et bilans maison',exact:true}).isVisible(),width+' : la gestion des liens reste accessible dans Élèves');
  await c.close();
 }
 vrai(externes.length===0,'aucune authentification ni requête extérieure réelle'+(externes.length?' : '+[...new Set(externes.map(u=>new URL(u).origin))].join(', '):''));vrai(erreurs.length===0,'aucune erreur JavaScript');console.log(`\n${nb} vérifications du statut de réception réussies (${moteur}).`);
}finally{await b.close();await new Promise(ok=>S.serveur.close(ok));}})().catch(e=>{console.error(e);process.exitCode=1;});

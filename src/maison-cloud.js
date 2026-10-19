/* Réception privée : parents autorisés par un lien individuel, enseignante authentifiée. */
"use strict";
const MaisonCloud = (() => {
  const AUTH="fluence-cloud-auth-v1", QUEUE="fluence-parents-envois-v1";
  const ecoutes=new Set(); let session=null, file=[], chargee=false, stockageBloque=false, envoi=null, reception=null, actualisation=null, demarre=false, generation=0, ecrituresSession=Promise.resolve();
  let infos={message:"",recu:0,nonAssocies:0};
  const signale=()=>ecoutes.forEach(f=>{try{f();}catch(e){}});
  const config=()=>window.BANC_MAISON||{};
  const configure=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config().url||"")&&typeof config().publishableKey==="string"&&config().publishableKey.length>20;
  function litRetourConnexion(){
    const p=new URLSearchParams(location.hash.slice(1));
    if(Banc.ROLE==="parents"){
      let nettoie=false;
      for(const k of ["access_token","refresh_token","expires_in","expires_at","token_type","error","error_code","error_description","error_uri"]){if(p.has(k)){p.delete(k);nettoie=true;}}
      if(["magiclink","email"].includes(p.get("type"))){p.delete("type");nettoie=true;}
      if(nettoie){const fragment=p.toString();history.replaceState(null,"",location.pathname+location.search+(fragment?"#"+fragment:""));}
      return null;
    }
    if(!["access_token","refresh_token","error","error_code"].some(k=>p.has(k)))return null;
    // Retirer les secrets du navigateur avant toute requête ou ouverture d'écran.
    history.replaceState(null,"",location.pathname+location.search);
    const erreur="Ce lien de connexion est incomplet ou expiré. Demande un nouveau lien par e-mail.";
    const access_token=p.get("access_token"),refresh_token=p.get("refresh_token"),type=p.get("type"),expires_in=Number(p.get("expires_in")||3600);
    if(p.has("error")||p.has("error_code")||["access_token","refresh_token","type","expires_in"].some(k=>p.getAll(k).length>1)||!["magiclink","email"].includes(type)||![access_token,refresh_token].every(t=>typeof t==="string"&&/^[A-Za-z0-9._~-]{1,8192}$/.test(t))||!Number.isSafeInteger(expires_in)||expires_in<1||expires_in>604800)return {erreur};
    return {access_token,refresh_token,expires_in};
  }
  let retourConnexion=litRetourConnexion();
  function tokenLien(){const t=new URLSearchParams(location.hash.slice(1)).get("famille");return /^[a-f0-9]{64}$/.test(t||"")?t:"";}
  const parentActif=()=>Banc.ROLE==="parents"&&configure()&&!!tokenLien();
  const etat=id=>{const r=file.find(x=>x.paquet.bilan.id===id);return r?{etat:r.etat,message:r.message}:null;};
  function chargeFile(){
    if(chargee)return;chargee=true;
    try {const t=localStorage.getItem(QUEUE);if(!t)return;const d=JSON.parse(t);
      if(!Array.isArray(d)||d.some(x=>!x||!/^[a-f0-9]{64}$/.test(x.token||"")||!x.paquet?.bilan?.id||!["attente","erreur","recu"].includes(x.etat)))throw Error();
      file=d;
    }catch(e){stockageBloque=true;}
  }
  function sauveFile(){if(stockageBloque)return false;try {localStorage.setItem(QUEUE,JSON.stringify(file));return true;}catch(e){return false;}}
  async function requete(path,options={},bearer){
    if(!configure())throw new Error("La réception automatique n'est pas encore configurée.");
    const controle=new AbortController(),delai=setTimeout(()=>controle.abort(),15000);
    try {const r=await fetch(config().url+path,{...options,signal:controle.signal,headers:{apikey:config().publishableKey,"Content-Type":"application/json",...(bearer?{Authorization:"Bearer "+bearer}:{}),...(options.headers||{})}});
      const d=await r.json().catch(()=>null);if(!r.ok){const e=new Error(r.status===401||r.status===403?"Accès refusé. Reconnectez-vous ou demandez un nouveau lien personnel.":r.status===429?"Le service est occupé. Réessayez dans quelques minutes.":"Le service n'a pas pu enregistrer la demande.");e.status=r.status;throw e;}return d;
    }finally{clearTimeout(delai);}
  }
  async function videFile(){
    if(envoi)return envoi;if(Banc.ROLE!=="parents"||!configure())return;
    envoi=(async()=>{for(const item of file){
      if(item.etat==="recu"||item.prochain>Date.now())continue;
      try {const d=await requete("/functions/v1/fluence-bilan",{method:"POST",body:JSON.stringify({token:item.token,paquet:item.paquet})});
        if(!d||typeof d.id!=="string"||!Number.isFinite(Date.parse(d.received_at)))throw new Error("Le service n'a pas confirmé la réception.");
        item.etat="recu";item.message="Bilan reçu dans l'espace privé de l'enseignante.";item.recu=d.received_at;delete item.prochain;
      }catch(e){item.etat=e.status===401||e.status===403||e.status===409?"erreur":"attente";
        item.message=item.etat==="erreur"?"Bilan non transmis. Demandez à l'enseignante de vérifier votre lien personnel.":"Bilan en attente. L'envoi sera réessayé quand cette page sera ouverte et connectée.";item.prochain=Date.now()+(e.status===429?300000:30000);
      }
      const durable=sauveFile();if(!durable&&item.etat!=="recu")item.message+=" Le stockage de cet appareil est indisponible : gardez cette page ouverte pour réessayer.";
      signale();
    }})();try {await envoi;}finally{envoi=null;}
  }
  async function envoie(r){
    if(Banc.ROLE!=="parents")throw new Error("Cet envoi est réservé à l'espace parents.");chargeFile();
    let item=file.find(x=>x.paquet.bilan.id===r.id);
    if(!item){if(!parentActif())throw new Error("Ouvrez le lien personnel donné par l'enseignante.");
      item={token:tokenLien(),paquet:EnvoiMaison.paquet(r),etat:"attente",message:"Envoi du bilan à l'enseignante…"};file.push(item);
    }
    delete item.prochain;sauveFile();signale();await videFile();return etat(r.id);
  }
  function ecritSession(suivante,version){
    const tache=ecrituresSession.then(async()=>{if(version!==generation)return false;await Plateforme.Stock.set(AUTH,JSON.stringify(suivante));if(version!==generation)return false;session=suivante;return true;});
    ecrituresSession=tache.catch(()=>{});return tache;
  }
  async function gardeSession(d,version){
    if(!d?.access_token||!d?.refresh_token||!d?.user?.id)throw new Error("Connexion incomplète. Réessayez.");
    const suivante={access_token:d.access_token,refresh_token:d.refresh_token,user:{id:d.user.id,email:d.user.email||""},expire:Date.now()+(d.expires_in||3600)*1000};
    if(!await ecritSession(suivante,version))throw new Error("Cette connexion a été annulée.");
  }
  async function jeton(){
    if(!session)throw new Error("Connectez l'espace de l'enseignante.");
    if(session.expire>Date.now()+60000)return session.access_token;
    if(!actualisation){const version=generation,refresh_token=session.refresh_token;actualisation=(async()=>{const d=await requete("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token})});await gardeSession(d,version);return session.access_token;})();}
    const courante=actualisation;try{return await courante;}finally{if(actualisation===courante)actualisation=null;}
  }
  async function api(path,options={}){return requete(path,options,await jeton());}
  async function demandeCode(email){
    if(Banc.ROLE==="parents")throw Error("Accès enseignante uniquement.");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Vérifie l'adresse e-mail.");
    await requete("/auth/v1/otp",{method:"POST",body:JSON.stringify({email,create_user:false})});
  }
  function verification(email,texte){
    const saisie=String(texte||"").trim();
    if(/^\d{6,10}$/.test(saisie)){
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Indique l'adresse e-mail qui a reçu le code.");
      return {email,token:saisie,type:"email"};
    }
    const erreur="Colle le lien de connexion complet reçu par e-mail, ou le code si ton message en contient un.";
    let u;try{u=new URL(saisie);}catch(e){throw new Error(erreur);}
    const fragment=new URLSearchParams(u.hash.slice(1));
    if(fragment.has("parents")||fragment.has("famille"))throw new Error("Ce lien est un accès parents. Demande un lien de connexion par e-mail pour ton espace enseignante.");
    const p=u.searchParams,hash=p.get("token_hash")||p.get("token");
    if(u.protocol!=="https:"||u.origin!==config().url||u.pathname!=="/auth/v1/verify"||u.username||u.password||u.hash||p.getAll("type").length!==1||!["magiclink","email"].includes(p.get("type"))||p.getAll("token").length+p.getAll("token_hash").length!==1||!hash||!/^[a-f0-9]{32,128}$/i.test(hash))throw new Error(erreur);
    // Ne jamais ouvrir l'URL collée, ni suivre son paramètre redirect_to.
    return {token_hash:hash,type:"email"};
  }
  function verifieGeneration(version){if(version!==generation)throw new Error("Cette connexion a été annulée.");}
  async function autoriseSession(d,version){
    verifieGeneration(version);
    if(!d?.access_token||!d?.refresh_token||!d?.user?.id)throw new Error("Connexion incomplète. Demande un nouveau lien par e-mail.");
    const permis=await requete("/rest/v1/rpc/fluence_teacher_enabled",{method:"POST",body:"{}"},d.access_token);
    verifieGeneration(version);
    if(permis!==true)throw new Error("Ce compte n'est pas autorisé comme enseignante de Fluence.");
    await gardeSession(d,version);verifieGeneration(version);infos.message="Connexion effectuée. Les bilans restent privés.";signale();
  }
  async function connecteCode(email,texte){
    if(Banc.ROLE==="parents")throw Error("Accès enseignante uniquement.");
    const corps=verification(email,texte);
    const version=++generation;actualisation=null;
    const d=await requete("/auth/v1/verify",{method:"POST",body:JSON.stringify(corps)});
    await autoriseSession(d,version);await recoit();
  }
  async function deconnecte(){
    if(Banc.ROLE==="parents")return;
    const token=session?.access_token,version=++generation;session=null;actualisation=null;infos={message:"Espace déconnecté.",recu:0,nonAssocies:0};signale();
    let erreur=null;try{await ecritSession(null,version);}catch(e){erreur=new Error("Impossible d'effacer la connexion enregistrée sur cet appareil. La déconnexion a aussi été demandée au service. Réessaie lorsque le stockage est disponible.");}
    if(token)try {await requete("/auth/v1/logout?scope=local",{method:"POST"},token);}catch(e){}
    if(erreur){if(version===generation){infos.message=erreur.message;signale();}throw erreur;}
  }
  const connectee=()=>Banc.ROLE!=="parents"&&!!session;
  async function invitations(){if(Banc.ROLE==="parents")throw Error("Accès enseignante uniquement.");return api("/rest/v1/fluence_accesses?select=id,child_ref,revoked,created_at&order=created_at.desc");}
  async function creeLien(eleveId){
    if(Banc.ROLE==="parents"||!Banc.Donnees.eleve(eleveId))throw new Error("Choisis un élève de la classe.");
    const token=Plateforme.rid(32),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,"0")).join("");
    const d=await api("/rest/v1/fluence_accesses",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({owner:session.user.id,child_ref:eleveId,token_hash:hash})});
    if(!Array.isArray(d)||!d[0]?.id)throw new Error("Le lien n'a pas pu être créé.");
    return {id:d[0].id,url:EnvoiMaison.lienParent(Banc.Donnees.nom(eleveId))+"&famille="+token};
  }
  async function revoque(id){if(Banc.ROLE==="parents")throw Error("Accès enseignante uniquement.");await api("/rest/v1/fluence_accesses?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({revoked:true})});}
  async function recoit(){
    if(Banc.ROLE==="parents"||!session||!configure())return;if(reception)return reception;
    const identite=session.user.id;
    reception=(async()=>{try{
      const acces=await invitations(),map=new Map(acces.map(a=>[a.id,a.child_ref]));let ajoutes=0,nonAssocies=0;
      for(let offset=0;offset<100000;offset+=500){
        const rows=await api("/rest/v1/fluence_results?select=id,access_id,payload,received_at&order=received_at.asc,id.asc&limit=500&offset="+offset);
        if(!Array.isArray(rows))throw new Error("La liste des bilans n'est pas lisible.");
        for(const row of rows){
          if(session?.user.id!==identite)return;
          const eleve=map.get(row.access_id);
          if(!eleve||!Banc.Donnees.eleve(eleve)){nonAssocies++;continue;}
          let r;try{r=EnvoiMaison.lit(JSON.stringify(row.payload));}catch(e){nonAssocies++;continue;}
          const id=EnvoiMaison.idLocal(r.id,eleve);
          if(Banc.Donnees.contientResultat(id)||Banc.Donnees.contientBilan(r.id,eleve))continue;
          const record={...r,id,sourceId:r.id,eleve,nomDeclare:r.prenom,reception:row.received_at,source:"automatique"};delete record.prenom;
          if(!await Banc.Donnees.ajoute(record))throw new Error("Un bilan est reçu en ligne mais ne peut pas encore être enregistré sur cet appareil.");ajoutes++;
        }
        if(rows.length<500)break;
      }
      infos={message:nonAssocies?`${nonAssocies} bilan(s) en ligne à vérifier : élève absent de cet appareil ou texte différent. Relie l'appareil à ta classe pour retrouver les élèves.`:"Réception à jour. Les nouveaux bilans arrivent automatiquement quand Fluence est ouvert.",recu:ajoutes,nonAssocies};
    }catch(e){infos.message=e.message||"Réception momentanément indisponible. Les bilans restent dans l'espace privé en ligne.";}finally{signale();}})();
    try{await reception;}finally{reception=null;}
  }
  async function init(){
    if(demarre)return;demarre=true;
    if(Banc.ROLE==="parents"){chargeFile();if(configure()){videFile();window.addEventListener("online",()=>videFile());setInterval(()=>{if(!document.hidden)videFile();},30000);}return;}
    if(!configure())return;
    const retour=retourConnexion;retourConnexion=null;
    if(retour){
      const version=++generation;actualisation=null;
      try{
        if(retour.erreur)throw new Error(retour.erreur);
        const user=await requete("/auth/v1/user",{},retour.access_token);
        await autoriseSession({...retour,user},version);
      }catch(e){if(version===generation){infos.message=e.message||"La connexion n'a pas abouti. Demande un nouveau lien par e-mail.";signale();}}
    }else{
      const version=generation;
      try{const d=JSON.parse(await Plateforme.Stock.get(AUTH)||"null");if(version===generation&&d?.access_token&&d?.refresh_token&&d?.user?.id)session=d;}catch(e){}
    }
    if(session)recoit();window.addEventListener("online",()=>recoit());setInterval(()=>{if(!document.hidden)recoit();},30000);
    if(retour)window.EnvoiMaison?.ouvre?.();
  }
  function vue(box){
    if(Banc.ROLE==="parents")return ()=>{};
    const {esc,Donnees}=Banc;let vivant=true,afficheConnectee=null;
    async function rend(){if(!vivant)return;
      afficheConnectee=connectee();
      if(!configure()){box.innerHTML="<h2>Réception automatique privée</h2><p>La connexion au service privé est en préparation. Les liens personnels seront disponibles ici après son activation.</p>";return;}
      if(!connectee()){
        box.innerHTML=`<h2>Connecter l'espace de l'enseignante</h2><p>Une seule connexion pour recevoir les résultats de tous tes élèves. Les bilans sont privés : seul ton compte autorisé peut les recevoir.</p><label class="label" for="cloud-email">Adresse e-mail</label><input id="cloud-email" type="email" autocomplete="email" style="width:100%"><div class="row start" style="margin-top:12px"><button class="btn primary" id="cloud-code">Recevoir un lien de connexion</button></div><p>Dans le navigateur, ouvre le lien du mail. Dans l’application iPhone : dans le mail reçu, fais un appui long sur le lien de connexion, choisis « Copier le lien », puis colle-le ici. Ne l’ouvre pas avant de le coller : il ne sert qu’une fois.</p><div id="cloud-verification"><label class="label" for="cloud-otp">Lien de connexion reçu par e-mail (ou code)</label><input id="cloud-otp" type="text" autocapitalize="off" spellcheck="false" autocomplete="off" aria-describedby="cloud-aide-lien" style="width:100%"><p class="muted" id="cloud-aide-lien">Les liens et QR codes des cartes sont réservés aux familles.</p><button class="btn primary" id="cloud-connexion" style="margin-top:10px">Se connecter</button></div><p id="cloud-info" role="status">${esc(infos.message)}</p>`;
        const info=box.querySelector("#cloud-info"),email=box.querySelector("#cloud-email"),code=box.querySelector("#cloud-code");
        code.onclick=async()=>{code.disabled=true;try{await demandeCode(email.value.trim());info.textContent="Le lien de connexion a été demandé. Consulte ta messagerie, puis ouvre le lien ou copie-le dans le champ ci-dessus.";}catch(e){info.textContent=e.message;}finally{code.disabled=false;}};
        box.querySelector("#cloud-connexion").onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await connecteCode(email.value.trim(),box.querySelector("#cloud-otp").value.trim());await rend();}catch(e){info.textContent=e.message;b.disabled=false;}};return;
      }
      box.innerHTML=`<h2>Réception automatique privée</h2><p>Connectée : ${esc(session.user.email)}. Chaque lien autorise une famille à envoyer des bilans pour un seul enfant.</p><div class="row start"><button class="btn" id="cloud-actualise">Actualiser les bilans</button><button class="btn" id="cloud-deconnexion">Déconnecter ce compte</button></div><p id="cloud-reception" role="status">${esc(infos.message)}</p><label class="label" for="cloud-eleve">Créer un lien personnel</label><select class="sel" id="cloud-eleve"><option value="">Choisir l'élève…</option>${Donnees.eleves().map(e=>`<option value="${esc(e.id)}">${esc(e.nom)}</option>`).join("")}</select><button class="btn primary" id="cloud-cree">Créer le lien parents</button><p id="cloud-info" role="status"></p><div id="cloud-lien" hidden><input id="cloud-url" readonly aria-label="Lien privé de la famille" style="width:100%"><div class="row start"><button class="btn primary" id="cloud-partage">Partager à cette famille</button><button class="btn" id="cloud-copie">Copier le lien privé</button></div><p class="muted">Transmets ce lien uniquement à la famille concernée. Garde-en une copie dans ton message : le service ne conserve pas le secret du lien.</p></div><h3>Liens créés</h3><div id="cloud-acces"></div>`;
      box.querySelector("#cloud-actualise").onclick=()=>recoit();box.querySelector("#cloud-deconnexion").onclick=async()=>{try{await deconnecte();}catch(e){const p=box.querySelector("#cloud-info");if(p&&!connectee())p.textContent=e.message;}};
      const info=box.querySelector("#cloud-info"),champ=box.querySelector("#cloud-url"),cible=box.querySelector("#cloud-acces");
      async function liste(){try{const rows=await invitations();if(!cible.isConnected)return;cible.innerHTML=rows.length?rows.map(a=>`<div class="row" style="margin-top:8px"><span>${esc(Donnees.nom(a.child_ref))} · ${esc(new Date(a.created_at).toLocaleDateString("fr-FR"))} · ${a.revoked?"désactivé":"actif"}</span>${a.revoked?"":`<button class="btn danger" data-revoque="${esc(a.id)}">Désactiver ce lien</button>`}</div>`).join(""):"<p>Aucun lien personnel créé.</p>";cible.querySelectorAll("[data-revoque]").forEach(b=>b.onclick=async()=>{if(!b.dataset.confirme){b.dataset.confirme="1";b.textContent="Confirmer ?";return;}b.disabled=true;try{await revoque(b.dataset.revoque);await liste();}catch(e){info.textContent=e.message;b.disabled=false;}});}catch(e){info.textContent=e.message;}}
      box.querySelector("#cloud-cree").onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{const d=await creeLien(box.querySelector("#cloud-eleve").value);champ.value=d.url;box.querySelector("#cloud-lien").hidden=false;info.textContent="Lien privé créé pour cet élève. Les parents peuvent imprimer le texte et envoyer leurs bilans directement dans Fluence.";await liste();}catch(e){info.textContent=e.message;}finally{b.disabled=false;}};
      box.querySelector("#cloud-copie").onclick=async()=>{try{await navigator.clipboard.writeText(champ.value);info.textContent="Lien privé copié.";}catch(e){champ.focus();champ.select();info.textContent="Copie le lien sélectionné.";}};
      box.querySelector("#cloud-partage").onclick=async()=>{try{const d={title:"Fluence à la maison",text:"Voici votre lien personnel pour imprimer les textes et transmettre les bilans de lecture à l'enseignante.",url:champ.value};if(Plateforme.partage)await Plateforme.partage.share(d);else if(navigator.share)await navigator.share(d);else box.querySelector("#cloud-copie").click();}catch(e){info.textContent=e?.name==="AbortError"?"Partage annulé.":"Le partage n'a pas abouti. Tu peux copier le lien.";}};
      liste();
    }
    const retire=surChange(()=>{if(connectee()!==afficheConnectee){rend();return;}const p=box.querySelector(connectee()?"#cloud-reception":"#cloud-info");if(p)p.textContent=infos.message;});rend();return ()=>{vivant=false;retire();};
  }
  function surChange(f){ecoutes.add(f);return ()=>ecoutes.delete(f);}
  return {init,configure,parentActif,etat,envoie,surChange,demandeCode,connecteCode,deconnecte,connectee,creeLien,invitations,revoque,recoit,vue};
})();
window.MaisonCloud=MaisonCloud;

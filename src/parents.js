/* Défis à la maison : aucun accès à la classe ni à la liaison de l'enseignante. */
"use strict";
const Parents = (() => {
  const { $, el, esc, motsDefi, calcule, motsDifficiles, bip } = Banc;
  const CLE = "fluence-parents-v1";
  let donnees = {version:1, prenom:"", vitesse:0.8, historique:[], profils:{}}, lectureImpossible = false, erreurStockage = "";
  let stopCloud = null, contexte = "", tokenSession = "", ecoutesInstallees = false, categorie = "entrainement";
  const tokenLien = ()=>{const t=new URLSearchParams(location.hash.slice(1)).get("famille");return /^[a-f0-9]{64}$/.test(t||"")?t:"";};
  const profil = ()=>contexte ? (donnees.profils[contexte] ||= {prenom:"",vitesse:0.8}) : donnees;
  const copieBilan = r=>{const {contexte, ...bilan}=r;return {...bilan,fautes:r.fautes.slice()};};

  function etatCloud(id){try{return window.MaisonCloud?.etat?.(id)||null;}catch(e){return null;}}
  function actualiseCloud(c){
    const e=etatCloud(c.dataset.maisonBilan), info=c.querySelector("[data-cloud-info]"), bouton=c.querySelector("[data-cloud-reessayer]");
    if(!info || !bouton)return;
    bouton.hidden=!e || !["attente","erreur"].includes(e.etat);
    info.classList.toggle("saved",e?.etat==="recu");
    info.textContent=e ? (e.etat==="recu" ? "Reçu par l’enseignante." : e.message || "Bilan en attente de transmission. Vous pouvez réessayer.") : "Pour un envoi direct, utilisez le lien personnel de l’enseignante. Vous pouvez aussi partager ce bilan.";
  }
  const enAttente=()=>donnees.historique.filter(r=>(r.contexte||"")===contexte && ["attente","erreur"].includes(etatCloud(r.id)?.etat));
  function actualiseAttente(){
    const panneau=$("#maison-attente");if(!panneau)return;
    const n=enAttente().length;panneau.hidden=!n;
    panneau.querySelector("span").textContent=n===1 ? "Un bilan attend d’être envoyé." : `${n} bilans attendent d’être envoyés.`;
  }
  function actualiseCartesCloud(){document.querySelectorAll("[data-maison-bilan]").forEach(actualiseCloud);actualiseAttente();}
  async function transmet(r,c){
    const info=c?.querySelector("[data-cloud-info]"), bouton=c?.querySelector("[data-cloud-reessayer]");
    if(bouton)bouton.disabled=true;
    if(info)info.textContent="Transmission du bilan…";
    try{await window.MaisonCloud.envoie(copieBilan(r));actualiseCartesCloud();}
    catch(e){if(info)info.textContent="La transmission n’a pas abouti. Le bilan reste disponible ici.";}
    finally{if(bouton)bouton.disabled=false;}
  }

  function afficheStockage(){
    const p = $("#maison-stockage"); if (!p) return;
    p.hidden = !erreurStockage; p.textContent = erreurStockage;
  }
  function decodeDonnees(texte){
    const d = JSON.parse(texte);
    const contexteValide = c=>c===undefined || c==="" || typeof c==="string" && /^[a-f0-9]{64}$/.test(c);
    if (!d || d.version !== 1 || !Array.isArray(d.historique) || !d.historique.every(r => r && r.origine === "maison" && typeof r.id === "string" && typeof r.prenom === "string" && typeof r.ep === "string" && typeof r.titre === "string" && contexteValide(r.contexte) && Number.isFinite(Date.parse(r.date)) && [r.mclm,r.lus,r.erreurs,r.secondes,r.dernier].every(n=>Number.isFinite(n) && n>=0) && Array.isArray(r.fautes) && r.fautes.every(n=>Number.isInteger(n) && n>=0))) throw new Error("historique non reconnu");
    if(d.profils!==undefined && (!d.profils || typeof d.profils!=="object" || Array.isArray(d.profils) || !Object.entries(d.profils).every(([c,p])=>/^[a-f0-9]{64}$/.test(c) && p && typeof p.prenom==="string"))) throw new Error("profils non reconnus");
    const historique = d.historique.map(r=>({id:r.id,formatVersion:1,origine:"maison",contexte:r.contexte||"",prenom:r.prenom,ep:r.ep,titre:r.titre,date:r.date,mclm:r.mclm,lus:r.lus,erreurs:r.erreurs,secondes:r.secondes,dernier:r.dernier,fautes:r.fautes.slice()}));
    const profils=Object.fromEntries(Object.entries(d.profils||{}).map(([c,p])=>[c,{prenom:p.prenom,vitesse:[0.6,0.8,1].includes(p.vitesse)?p.vitesse:0.8}]));
    return {version:1, prenom:typeof d.prenom === "string" ? d.prenom : "", vitesse:[0.6,0.8,1].includes(d.vitesse) ? d.vitesse : 0.8, historique, profils};
  }
  function charge(){
    try {
      const texte = localStorage.getItem(CLE); if (!texte) return;
      donnees = decodeDonnees(texte);
    } catch(e){
      lectureImpossible = true;
      erreurStockage = "Impossible de relire l’historique de cet appareil. Les données existantes ne sont pas modifiées. Les bilans de cette séance resteront disponibles ici, mais ne pourront pas être sauvegardés.";
    }
  }
  function sauve(){
    if (lectureImpossible){ afficheStockage(); return false; }
    try {
      // Un autre onglet familial peut avoir enregistré depuis notre ouverture.
      const texte=localStorage.getItem(CLE), actuelle=texte?decodeDonnees(texte):null;
      if(actuelle){
        const historique=new Map(actuelle.historique.map(r=>[r.id,r]));donnees.historique.forEach(r=>historique.set(r.id,r));
        const courant=contexte?profil():null;
        donnees={...donnees,historique:[...historique.values()],profils:{...donnees.profils,...actuelle.profils}};
        if(contexte){donnees.prenom=actuelle.prenom;donnees.vitesse=actuelle.vitesse;donnees.profils[contexte]=courant;}
      }
      localStorage.setItem(CLE, JSON.stringify(donnees)); erreurStockage = ""; afficheStockage(); return true;
    }
    catch(e){ erreurStockage = "Impossible d’enregistrer sur cet appareil. Le bilan reste disponible pendant cette séance : envoyez-le ou notez-le avant de fermer la page."; afficheStockage(); return false; }
  }
  function validePrenom(v){
    const s = String(v).normalize("NFC").trim().replace(/\s+/g," ");
    if (!s || s.length>80 || !/\p{L}/u.test(s) || /[<>\x00-\x1f\x7f]/.test(s)) throw new Error("Indiquez le prénom de l’enfant (80 caractères maximum).");
    return s;
  }
  function carte(r){
    const c = el("article", {class:"card maison-bilan","data-maison-bilan":r.id});
    const date = new Date(r.date).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"});
    const durs = motsDifficiles(r);
    c.innerHTML = `<div class="label">Résultat · ${esc(date)}</div>
      <h3>${esc(r.prenom)} — ${esc(r.titre)}</h3>
      <div class="big-num">${r.mclm}</div><div class="muted">mots lus correctement par minute</div>
      <dl class="res"><dt>Mots lus</dt><dd>${r.lus}</dd><dt>Erreurs</dt><dd>${r.erreurs}</dd><dt>Temps</dt><dd>${r.secondes} s</dd></dl>
      ${durs.length ? `<p class="label">Mots à retravailler</p><div class="hard">${durs.map(m=>`<span>${esc(m)}</span>`).join("")}</div>` : ""}
      <p data-cloud-info role="status"></p><button type="button" class="btn primary" data-cloud-reessayer hidden>Réessayer l’envoi</button>
      <div class="row start"><button type="button" class="btn" data-envoi-maison>Partager le bilan</button></div>
      <p data-envoi-info role="status"></p>`;
    const bouton = c.querySelector("[data-envoi-maison]"), info = c.querySelector("[data-envoi-info]");
    const automatique=!!window.MaisonCloud?.parentActif?.();bouton.hidden=automatique;bouton.parentElement.hidden=automatique;info.hidden=automatique;
    c.querySelector("[data-cloud-reessayer]").onclick=()=>{if(etatCloud(r.id))transmet(r,c);};
    actualiseCloud(c);
    bouton.onclick = async ()=>{
      if (bouton.disabled) return;
      if (!window.EnvoiMaison || typeof window.EnvoiMaison.partage !== "function"){
        info.textContent = "L’envoi du bilan n’est pas encore disponible. Vous pouvez le consulter ici et réessayer plus tard."; return;
      }
      bouton.disabled = true; info.textContent = "Préparation du bilan…";
      try {
        const retour = await window.EnvoiMaison.partage(copieBilan(r));
        info.textContent = retour && typeof retour.message === "string" ? retour.message : "Bilan préparé. Terminez l’envoi dans l’application choisie.";
      } catch(e){
        info.textContent = e && (e.name === "AbortError" || e.code === "cancelled") ? "Partage annulé. Le bilan reste disponible ici." : "Impossible de préparer l’envoi. Le bilan reste disponible ici : réessayez.";
      } finally { bouton.disabled = false; }
    };
    return c;
  }
  function accueil(view){
    view.innerHTML='<h1>Choisissez un texte</h1><nav class="maison-categories" aria-label="Catégories de textes"></nav><div id="maison-attente" class="card maison-attente" hidden><span role="status"></span><button type="button" class="btn" id="maison-reessayer">Réessayer l’envoi</button></div><section class="maison-categorie" id="maison-textes"><div class="maison-liste-textes"></div></section>';
    const categories=view.querySelector(".maison-categories"), liste=view.querySelector(".maison-liste-textes");
    [["entrainement","Textes d’entraînement"],["periode","Textes de la période"]].forEach(([id,titre])=>{
      const bouton=el("button",{class:"btn maison-choix-categorie",id:"maison-categorie-"+id,type:"button","data-categorie":id,"aria-pressed":String(categorie===id),"aria-controls":"maison-textes"});bouton.textContent=titre;
      bouton.onclick=()=>{categorie=id;accueil(view);view.querySelector("#maison-categorie-"+id).focus();};categories.appendChild(bouton);
    });
    view.querySelector("#maison-textes").setAttribute("aria-labelledby","maison-categorie-"+categorie);
    Banc.EPS.filter(E=>!!Banc.estTamallette(E)===(categorie==="periode")).forEach(E=>{
      const bouton=el("button",{class:"btn maison-choix-texte",type:"button","data-ep":E.id});bouton.textContent=E.titre;
      bouton.onclick=()=>Ecran.go({name:"episode",id:E.id,step:4});liste.appendChild(bouton);
    });
    const reessayer=view.querySelector("#maison-reessayer");reessayer.onclick=async()=>{reessayer.disabled=true;try{for(const r of enAttente())await transmet(r,null);}finally{reessayer.disabled=false;actualiseAttente();}};
    actualiseAttente();afficheStockage();
  }
  function defi(P,E){
    const duree = Banc.DUREE(), mots = motsDefi(E), fautes = new Set(), contexteDefi=contexte;
    let etat = "pret", depart = 0, ecoule = 0, timer = null, prenom = "";
    P.innerHTML = `<p class="lead">L’enfant lit. Touchez les mots mal lus.</p>
      <div class="maison-identite"><label for="maison-prenom">Prénom de l’enfant</label><input id="maison-prenom" autocomplete="off" autocapitalize="words" maxlength="80" value="${esc(profil().prenom)}"><p id="maison-prenom-erreur" class="maison-erreur" role="status" hidden></p></div>
      <div class="maison-pilotage"><div class="chrono"><div><strong class="big-num" id="maison-chrono">${duree}</strong> secondes</div>
      <div class="row"><button class="btn primary" id="maison-depart" type="button">Démarrer</button><button class="btn" id="maison-fini" type="button" hidden>Lecture terminée</button></div></div>
      <p id="maison-consigne" role="status">Démarrez quand l’enfant est prêt.</p></div>
      <div id="maison-resultat" tabindex="-1" hidden></div><div class="maison-texte"><div class="text" id="maison-texte" lang="fr"></div></div>`;
    const champ = P.querySelector("#maison-prenom"), erreur = P.querySelector("#maison-prenom-erreur"), bouton = P.querySelector("#maison-depart"), fini = P.querySelector("#maison-fini"), chrono = P.querySelector("#maison-chrono"), consigne = P.querySelector("#maison-consigne"), texte = P.querySelector("#maison-texte"), resultat = P.querySelector("#maison-resultat"), spans = [];
    // Un seul résultat replié par texte, avec sa transmission, sans liste sur l'accueil.
    const precedent=donnees.historique.filter(r=>(r.contexte||"")===contexte && r.ep===E.id).slice().reverse()[0];
    if(precedent){const detail=el("details",{id:"maison-bilan-precedent",class:"maison-bilan-precedent"});detail.appendChild(el("summary",{},"Dernier résultat"));detail.appendChild(carte(precedent));resultat.after(detail);}
    mots.forEach((mot,i)=>{
      if (mot.brk) texte.appendChild(el("br"));
      const span = el("span",{class:"w","data-index":String(i)}); span.textContent = mot.t;
      if (mot.w){
        span.setAttribute("role","button"); span.setAttribute("tabindex","0"); span.setAttribute("aria-pressed","false");
        span.onclick = ()=>touche(i);
        span.onkeydown = e=>{ if(e.key === " " || e.key === "Enter"){e.preventDefault();touche(i);} };
      }
      texte.appendChild(span); texte.appendChild(document.createTextNode(" ")); spans.push(span);
    });
    function actualise(){
      if (etat !== "lecture") return;
      const s = (performance.now()-depart)/1000;
      chrono.textContent = String(Math.max(0,Math.ceil(duree-s)));
      if (s >= duree) termineTemps(duree);
    }
    function termineTemps(s){
      if (etat !== "lecture") return;
      clearInterval(timer); timer=null; ecoule=Math.max(1,Math.min(duree,s)); etat="dernier";
      chrono.textContent=String(Math.max(0,Math.ceil(duree-ecoule))); fini.hidden=true; bouton.disabled=true;
      consigne.textContent="Touchez le dernier mot lu."; bip();
    }
    function touche(i){
      actualise();
      if (etat === "lecture"){
        if(fautes.has(i)) fautes.delete(i); else fautes.add(i);
        spans[i].classList.toggle("err",fautes.has(i)); spans[i].setAttribute("aria-pressed",String(fautes.has(i)));
      } else if (etat === "dernier") termine(i);
    }
    function termine(dernier){
      etat="fini"; Plateforme.eveille(false);
      P.querySelector(".maison-pilotage").classList.add("termine");
      const secondes = Math.max(1,Math.min(60,Math.round(ecoule)));
      const {eleve, ...mesures} = calcule(E,null,secondes,dernier,fautes);
      const r = {...mesures,formatVersion:1,origine:"maison",contexte:contexteDefi,prenom, titre:E.titre};
      donnees.historique.push(r); sauve();
      spans.forEach((s,i)=>{s.classList.toggle("after",i>dernier);s.classList.toggle("last",i===dernier);s.classList.toggle("err",r.fautes.includes(i));s.removeAttribute("aria-pressed");s.removeAttribute("role");s.removeAttribute("tabindex");});
      P.querySelector("#maison-bilan-precedent")?.remove();
      resultat.hidden=false; resultat.replaceChildren(carte(r));
      if(tokenLien()===tokenSession && window.MaisonCloud?.parentActif?.())transmet(r,resultat.querySelector(".maison-bilan"));
      consigne.textContent="Défi terminé.";
      bouton.disabled=false; bouton.textContent="Recommencer";
      resultat.scrollIntoView({block:"start"}); resultat.focus({preventScroll:true});
    }
    bouton.onclick = ()=>{
      if(etat === "fini") { Ecran.go({name:"episode",id:E.id,step:4}); return; }
      if(etat !== "pret") return;
      try {prenom=validePrenom(champ.value);} catch(e){erreur.hidden=false;erreur.textContent=e.message;champ.focus();return;}
      erreur.hidden=true; profil().prenom=prenom; sauve(); champ.value=prenom; champ.disabled=true;
      etat="lecture"; depart=performance.now(); bouton.disabled=true; fini.hidden=false;
      consigne.textContent="Touchez les mots mal lus. Un deuxième toucher annule.";
      bip(); Plateforme.eveille(true); timer=setInterval(actualise,100); actualise();
    };
    fini.onclick = ()=>termineTemps((performance.now()-depart)/1000);
    document.addEventListener("visibilitychange",actualise);
    return ()=>{clearInterval(timer);document.removeEventListener("visibilitychange",actualise);Plateforme.eveille(false);};
  }
  function prepareImpression(E){
    const feuille = $("#maison-impression");
    feuille.replaceChildren(); feuille.dataset.ep=E.id;
    feuille.classList.toggle("texte-long",E.nbMots>300);
    const titre=el("h1");titre.textContent=E.titre;feuille.appendChild(titre);
    let index=0;
    E.pages.slice(1).forEach((page,pi)=>{
      const p=el("p",{"data-page":String(pi+1)});
      page.toks.forEach((t,i)=>{
        if(i) p.appendChild(document.createTextNode(" "));
        const mot=el("span",{class:"impression-mot","data-index":String(index++)});mot.textContent=t[0];p.appendChild(mot);
      });
      feuille.appendChild(p);
    });
    if(E.source){const source=el("footer");source.textContent=E.source;feuille.appendChild(source);}
    document.documentElement.dataset.impression="texte";
  }
  function imprime(E){
    prepareImpression(E);
    window.print();
  }
  async function demarre(){
    if (Banc.ROLE !== "parents") return;
    charge();
    tokenSession=tokenLien();contexte="";
    if(tokenSession){
      try{contexte=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(tokenSession))),b=>b.toString(16).padStart(2,"0")).join("");}
      catch(e){contexte="indisponible";lectureImpossible=true;erreurStockage="Impossible d’isoler l’historique de ce lien personnel sur cet appareil. Les anciens bilans restent conservés. Aucun nouveau bilan ne sera sauvegardé ici.";}
    }
    const prenomDuLien = window.EnvoiMaison?.prenomLien?.();
    if (prenomDuLien){ try { profil().prenom=validePrenom(prenomDuLien); } catch(e){} }
    await window.MaisonCloud?.init?.(); // Relire la file avant de montrer les éventuels envois en attente.
    Ecran.demarreMaison({accueil,defi,imprime,vitesse:()=>profil().vitesse,fixeVitesse:v=>{if([0.6,0.8,1].includes(v)){profil().vitesse=v;sauve();}}});
    if(stopCloud)stopCloud();stopCloud=window.MaisonCloud?.surChange?.(actualiseCartesCloud)||null;
    if(!ecoutesInstallees){ecoutesInstallees=true;
      window.addEventListener("beforeprint",()=>{const r=Ecran.route();if(r.name==="episode"){const E=Banc.ep(r.id);if(E)prepareImpression(E);}});
      window.addEventListener("afterprint",()=>{delete document.documentElement.dataset.impression;});
      window.addEventListener("hashchange",()=>{if(tokenLien()!==tokenSession)location.reload();});
    }
    afficheStockage();
  }
  return {demarre};
})();
window.Parents = Parents;

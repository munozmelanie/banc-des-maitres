/* Progrès d'un seul enfant : réponse privée en mémoire, sans données de classe locales. */
"use strict";
const ParentsProgres = (() => {
  const {esc,el,ep,motsDifficiles,libelleLecture}=Banc;
  let generation=0,vue=null,donnees=null,origine="maison",texte="",prenom="",actif=false,tokenVue="";
  const token=()=>{const t=new URLSearchParams(location.hash.slice(1)).get("famille");return /^[a-f0-9]{64}$/.test(t||"")?t:"";};
  const date=(d,courte=false)=>new Date(d).toLocaleDateString("fr-FR",courte?{day:"2-digit",month:"2-digit"}:{day:"numeric",month:"long",year:"numeric"});
  const titre=r=>{const E=ep(r.ep);return E?.collection==="feuilleton"&&!Banc.ouvertFamille(E)?`Épisode ${E.num}`:E?.titre||"Texte de lecture";};
  function ferme(){generation++;actif=false;donnees=null;prenom="";tokenVue="";if(vue?.querySelector("#parents-progres"))vue.replaceChildren();vue=null;}
  function cadre(){
    if(!vue)return;
    vue.innerHTML=`<section id="parents-progres" class="maison-progres"><header class="maison-progres-entete"><p class="progression-surtitre">LECTURE APRÈS LECTURE</p><h1>Les progrès${prenom?` de ${esc(prenom)}`:""}</h1><p class="muted">Les lectures en classe et à la maison, dans votre espace personnel.</p></header><div id="parents-progres-contenu" aria-live="polite"></div></section>`;
  }
  function message(titreMessage,description,reessayer=false){
    cadre();const cible=vue?.querySelector("#parents-progres-contenu");if(!cible)return;
    cible.innerHTML=`<section class="progression-carte maison-progres-message"><h2>${esc(titreMessage)}</h2><p>${esc(description)}</p>${reessayer?'<button class="btn primary" type="button" id="parents-progres-reessayer">Réessayer</button>':""}</section>`;
    cible.querySelector("button")?.addEventListener("click",charge);
  }
  function erreur(e){
    if(e?.code==="offline")return ["Connexion indisponible","Les progrès ne sont pas disponibles hors connexion. Retrouvez une connexion internet, puis réessayez."];
    if(e?.code==="acces-refuse")return ["Ce lien ne permet plus de consulter les progrès","Demandez à l’enseignante de vérifier votre lien personnel."];
    if(e?.code==="non-configure")return ["Les progrès ne sont pas encore disponibles","Vous pouvez continuer les entraînements et revenir ici plus tard."];
    return ["Les progrès n’ont pas pu être chargés","Vérifiez votre connexion, puis réessayez. Aucun ancien résultat n’est affiché."];
  }
  async function charge(){
    const identifiant=token(),version=++generation;donnees=null;
    if(!actif||!vue)return;
    if(!identifiant){message("Votre lien personnel est nécessaire","Ouvrez le lien que l’enseignante a transmis à votre famille pour consulter les progrès de votre enfant.");return;}
    message("Chargement des progrès…","Les résultats de votre enfant vont apparaître ici.");
    try{
      if(typeof window.MaisonCloud?.progressionParents!=="function")throw {code:"non-configure"};
      const retour=await window.MaisonCloud.progressionParents();
      if(!actif||version!==generation||identifiant!==token())return;
      if(!retour||!Array.isArray(retour.lectures)||!retour.objectif)throw {code:"reponse-invalide"};
      // Le service valide le contenu ; la vue ne conserve que les champs qu'elle affiche.
      const lectures=retour.lectures.map(r=>({id:r.id,ep:r.ep,date:r.date,origine:r.origine,mclm:r.mclm,lus:r.lus,erreurs:r.erreurs,secondes:r.secondes,fautes:Array.isArray(r.fautes)?r.fautes.slice():[],...(["entrainement","defi"].includes(r.typeLecture)?{typeLecture:r.typeLecture}:{})}));
      donnees={objectif:{valeur:retour.objectif.valeur,mode:retour.objectif.mode},lectures};rend();
    }catch(e){if(!actif||version!==generation||identifiant!==token())return;donnees=null;message(...erreur(e),true);}
  }
  function graphique(rs,objectif){
    const petit=innerWidth<680,W=petit?360:760,H=petit?250:285,L=42,R=24,T=24,B=42;
    const plafond=Math.max(20,Number.isFinite(objectif)?objectif:0,...rs.map(r=>r.mclm)),pas=Math.max(5,Math.ceil(plafond/4/5)*5),max=pas*4;
    const x=i=>rs.length<2?L+(W-L-R)/2:L+i*(W-L-R)/(rs.length-1),y=v=>H-B-(H-B-T)*v/max;
    let h=`<svg id="parents-progres-graphe" class="maison-progres-graphe" viewBox="0 0 ${W} ${H}" role="group" aria-label="Mots lus correctement par minute, dans l’ordre des lectures"><defs><linearGradient id="parents-progres-degrade" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--green)" stop-opacity=".22"/><stop offset="100%" stop-color="var(--green)" stop-opacity=".015"/></linearGradient></defs>`;
    for(let i=0;i<=4;i++){const v=i*pas;h+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="progression-grille"/><text x="${L-10}" y="${y(v)+5}" text-anchor="end">${v}</text>`;}
    if(Number.isFinite(objectif))h+=`<line x1="${L}" x2="${W-R}" y1="${y(objectif)}" y2="${y(objectif)}" class="progression-ligne-objectif"/>`;
    const points=rs.map((r,i)=>`${x(i)},${y(r.mclm)}`).join(" ");
    if(rs.length>1)h+=`<polygon points="${x(0)},${H-B} ${points} ${x(rs.length-1)},${H-B}" fill="url(#parents-progres-degrade)"/><polyline points="${points}" class="progression-trace"/>`;
    const nombreLabels=Math.min(rs.length,petit?4:6),labels=new Set(Array.from({length:nombreLabels},(_,i)=>Math.round(i*(rs.length-1)/(nombreLabels-1||1))));
    rs.forEach((r,i)=>{h+=`<g class="progression-point" role="button" tabindex="0" data-parent-point="${esc(r.id)}" data-type-lecture="${r.typeLecture||"lecture"}" aria-label="${esc(`${libelleLecture(r)} · ${date(r.date)} · ${titre(r)} · ${r.mclm} mots corrects par minute. Consulter cette lecture.`)}"><circle cx="${x(i)}" cy="${y(r.mclm)}" r="20" fill="transparent"/>${r.typeLecture==="defi"?`<path class="maison-lecture-point-defi" d="M ${x(i)} ${y(r.mclm)-8} l 8 8 -8 8 -8 -8 Z"/>`:`<circle class="progression-point-visible" cx="${x(i)}" cy="${y(r.mclm)}" r="${i===rs.length-1?6:4.5}"/>`}</g>`;if(labels.has(i))h+=`<text x="${x(i)}" y="${H-14}" text-anchor="${i===0&&rs.length>1?"start":i===rs.length-1&&rs.length>1?"end":"middle"}">${esc(date(r.date,true))}</text>`;});
    return h+"</svg>";
  }
  function rend(){
    if(!actif||!vue||!donnees)return;
    cadre();const cible=vue.querySelector("#parents-progres-contenu"),lieu=origine==="maison"?"À la maison":"En classe";
    const rs=donnees.lectures.filter(r=>r.origine===origine&&(!texte||r.ep===texte)).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||String(a.id).localeCompare(String(b.id)));
    const objectif=donnees.objectif,dernier=rs.length?rs.at(-1).mclm:null,meilleur=rs.length?Math.max(...rs.map(r=>r.mclm)):null,evolution=rs.length>1?dernier-rs[0].mclm:null,score=v=>v===null?"—":String(v);
    cible.innerHTML=`<div class="progression-origines" role="group" aria-label="Lieu de lecture"><button type="button" data-parent-origine="classe" aria-pressed="${origine==="classe"}">En classe</button><button type="button" data-parent-origine="maison" aria-pressed="${origine==="maison"}">À la maison</button></div>
      <section class="progression-carte"><div class="progression-fiche-entete"><h2>${lieu}</h2><div class="progression-objectif" id="parents-progres-objectif"><span>Objectif${objectif.mode==="automatique"?" automatique":objectif.mode==="manuel"?" de lecture":""}</span>${Number.isFinite(objectif.valeur)?`<strong>${objectif.valeur} <small>mots/min</small></strong>`:'<strong class="progression-objectif-attente">Après la première lecture</strong>'}</div></div>
      <div class="progression-filtre"><label for="parents-progres-texte">Texte</label><select id="parents-progres-texte"><option value="">Tous les textes</option>${Banc.EPS.filter(e=>(Banc.estDisponible(e)&&(Banc.estTamallette(e)||Banc.ouvertFamille(e)))||donnees.lectures.some(r=>r.ep===e.id)).map(e=>`<option value="${esc(e.id)}"${texte===e.id?" selected":""}>${esc(titre({ep:e.id}))}</option>`).join("")}</select></div>
      <div class="progression-stats"><div><span>Dernière lecture</span><strong data-parent-stat="dernier">${score(dernier)}</strong><small>mots/min</small></div><div><span>Meilleur résultat</span><strong data-parent-stat="meilleur">${score(meilleur)}</strong><small>mots/min</small></div><div><span>Depuis la première</span><strong data-parent-stat="evolution" class="${evolution>0?"progression-hausse":""}">${evolution===null?"—":(evolution>0?"+":"")+evolution}</strong><small>mots/min</small></div><div><span>Lectures</span><strong data-parent-stat="lectures">${rs.length}</strong><small>${lieu.toLocaleLowerCase("fr")}</small></div></div>
      ${rs.length?`<div class="progression-legende"><span><i></i> Mots corrects par minute</span>${rs.some(r=>r.typeLecture==="defi")?'<span><i class="maison-lecture-losange"></i> Défi du 4ᵉ soir</span>':""}${Number.isFinite(objectif.valeur)?'<span><i class="progression-tiret"></i> Objectif</span>':""}</div>${graphique(rs,objectif.valeur)}`:`<div class="progression-vide"><span aria-hidden="true">↗</span><h3>Pas encore de lecture</h3><p>${texte?"Aucune lecture pour ce texte "+lieu.toLocaleLowerCase("fr")+".":"Les lectures "+lieu.toLocaleLowerCase("fr")+" apparaîtront ici."}</p></div>`}
      <p class="progression-note">${texte?"Lectures de ce texte, dans l’ordre chronologique.":"Les textes peuvent avoir des difficultés différentes. Choisissez un texte pour comparer ses lectures."}${origine==="maison"?" Les bilans à la maison sont déclarés par la famille.":""}</p></section>
      <section class="progression-carte progression-lectures maison-progres-lectures"><h2>Les lectures <span>${rs.length}</span></h2>${rs.length?rs.slice().reverse().map(r=>{const E=ep(r.ep),durs=E?.collection==="feuilleton"&&!Banc.ouvertFamille(E)?[]:motsDifficiles(r);return `<details class="progression-lecture" data-parent-lecture="${esc(r.id)}"><summary><span class="progression-lecture-texte">${esc(titre(r))}<span class="maison-lecture-badge${r.typeLecture==="defi"?" maison-lecture-defi":""}" data-type-lecture="${r.typeLecture||"lecture"}">${libelleLecture(r)}</span><small>${esc(date(r.date))}</small></span><span class="progression-lecture-score">${r.mclm}<small>mots/min</small></span></summary><div class="progression-lecture-detail"><dl><div><dt>Mots lus</dt><dd>${r.lus??"—"}</dd></div><div><dt>Erreurs</dt><dd>${r.erreurs??"—"}</dd></div><div><dt>Temps</dt><dd>${r.secondes??"—"} s</dd></div></dl>${durs.length?`<p class="label">Mots à retravailler</p><div class="hard">${durs.map(m=>`<span>${esc(m)}</span>`).join("")}</div>`:""}</div></details>`;}).join(""):'<p class="muted">Les prochaines lectures seront consultables ici.</p>'}</section>
      <p class="maison-progres-note muted">Seuls les résultats de votre enfant sont affichés. Les nouveaux résultats apparaissent après leur transmission par l’enseignante ou l’envoi du bilan maison.</p><button type="button" class="btn" id="parents-progres-actualiser">Actualiser les progrès</button>`;
    cible.querySelectorAll("[data-parent-origine]").forEach(b=>b.onclick=()=>{origine=b.dataset.parentOrigine;rend();vue.querySelector(`[data-parent-origine="${origine}"]`).focus({preventScroll:true});});
    cible.querySelector("#parents-progres-texte").onchange=e=>{texte=e.target.value;rend();vue.querySelector("#parents-progres-texte").focus({preventScroll:true});};
    cible.querySelector("#parents-progres-actualiser").onclick=charge;
    const ouvre=id=>{const d=[...vue.querySelectorAll("[data-parent-lecture]")].find(d=>d.dataset.parentLecture===id);if(d){d.open=true;d.querySelector("summary").focus({preventScroll:true});d.scrollIntoView({block:"nearest"});}};
    cible.querySelectorAll("[data-parent-point]").forEach(p=>{p.onclick=()=>ouvre(p.dataset.parentPoint);p.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();ouvre(p.dataset.parentPoint);}};});
  }
  function ouvre(view,options={}){
    ferme();if(Banc.ROLE!=="parents")return;
    vue=view;actif=true;tokenVue=token();origine="maison";texte="";prenom=String(options.prenom||"");charge();
  }
  window.addEventListener("hashchange",()=>{if(actif&&tokenVue!==token())ferme();});
  return {ouvre,ferme};
})();
window.ParentsProgres=ParentsProgres;

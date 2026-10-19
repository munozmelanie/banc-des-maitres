/* ---------- Le téléphone de la maîtresse ----------
   Écran : la télécommande (les boutons de l'écran de la classe, touchés à distance).
   Défi : le chrono et les erreurs notées en silence ; l'écran de la classe montre le chrono puis le résultat.
   Élèves et Progrès : les mêmes que sur l'écran, gardés aussi dans le téléphone. */
"use strict";
const Telephone = (() => {
  const { EPS, $, el, esc, ep, estTamallette, libelleEpisode, etapesEpisode, motsDefi, DUREE, Donnees, Lien, calcule, bilan, carteResultat, vueProgres, vueEleves, bip } = Banc;
  const L = Plateforme.Liaison, lsG = Plateforme.lsG, lsS = Plateforme.lsS;
  const main = $("#t-main");
  const ONGLETS = ["ecran","defi","eleves","progres"];
  let onglet = ONGLETS.includes(lsG("banc-des-maitres-onglet")) ? lsG("banc-des-maitres-onglet") : "ecran";
  let E = null; // ce que montre l'écran de la classe (dernier état reçu)

  function majLien(){
    const on = Lien.relie();
    $("#t-dot").classList.toggle("on", on);
    $("#t-lien-txt").textContent = !L.code() ? "Pas relié" : on ? "Écran relié" : "Écran absent";
  }
  function va(o){ if(o!=="defi"&&D.etat==="decompte")annuleDepart(false); onglet = o; lsS("banc-des-maitres-onglet", o); rend(); main.scrollTop = 0; }
  $("#t-tabs").addEventListener("click", e=>{ const b = e.target.closest("[data-tab]"); if (b) va(b.dataset.tab); });
  function rend(){
    document.querySelectorAll("#t-tabs [data-tab]").forEach(b=>b.setAttribute("aria-current", b.dataset.tab===onglet ? "page" : "false"));
    if (onglet==="ecran") rendEcran();
    else if (onglet==="defi") rendDefi();
    else if (onglet==="eleves") vueEleves(main);
    else vueProgres(main, true);
  }
  const cmd = d => Lien.emit("cmd", d);

  /* ---------- Écran : relier, puis télécommande ---------- */
  function carteLier(titre){
    return `<div class="card"><h2>${titre}</h2>
      <ol style="margin:8px 0 0;padding-left:1.3em"><li>Sur l'ordinateur de la classe, ouvre Fluence et touche <b>Relier le téléphone</b>.</li><li>Vise le QR code avec l'appareil photo de ce téléphone, puis touche le lien.</li><li>Ou tape le code affiché sous le QR code :</li></ol>
      <form class="champ" id="t-code"><input id="t-code-in" placeholder="XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code de liaison"><button class="btn primary">Relier</button></form>
      <p class="muted" id="t-code-err" role="status" style="margin:8px 0 0"></p></div>`;
  }
  function brancheLier(){
    const f = $("#t-code"); if (!f) return;
    f.onsubmit = async e=>{ e.preventDefault(); const c = Plateforme.normalise($("#t-code-in").value);
      if (!c){ $("#t-code-err").textContent = "Le code a 10 lettres ou chiffres, par exemple 7KQ2M-X9D4A."; return; }
      await L.fixe(c); history.replaceState(null, "", location.pathname+location.search); location.reload(); };
  }
  function carteEnvoi(){
    const url = L.code() ? L.lienEcran() : "";
    return `<div class="card" style="margin-top:12px"><button class="btn primary" id="t-envoi">Envoyer le lien à l’ordinateur</button>
      <p class="muted" style="margin:8px 0 0">Ouvre le lien sur l'ordinateur de la classe : il se reliera à ce téléphone.</p>
      <p id="t-envoi-info" role="status" style="margin:8px 0 0"></p>
      <p id="t-envoi-lien" style="margin:8px 0 0;overflow-wrap:anywhere"${url?"":" hidden"}>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`:""}</p></div>`;
  }
  function brancheEnvoi(){ const b = $("#t-envoi"); if (b) b.onclick = envoieLien; }
  async function envoieLien(){
    const b = $("#t-envoi"), avant = L.code(); if (!b || b.disabled) return;
    b.disabled = true;
    let cree = false;
    try {
      const code = await L.assure(), url = L.lienEcran(code); cree = !avant;
      if (!url){ $("#t-envoi-info").textContent = "L'adresse du site n'est pas encore disponible."; return; }
      const lien = $("#t-envoi-lien"); lien.hidden = false; lien.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
      const donnees = {title:"Fluence", text:"Ouvre ce lien sur l'ordinateur de la classe :", url};
      const annule = e => e && (e.name==="AbortError" || /cancel|annul|abort/i.test(String(e.code||"")+" "+String(e.message||"")));
      let partage = false;
      if (Plateforme.partage){
        try { await Plateforme.partage.share({...donnees, dialogTitle:"Envoyer le lien"}); partage = true; }
        catch(e){ if (annule(e)) return; }
      }
      if (!partage && navigator.share){
        try { await navigator.share(donnees); partage = true; }
        catch(e){ if (annule(e)) return; }
      }
      if (partage) $("#t-envoi-info").textContent = "Le lien est prêt. Ouvre-le sur l'ordinateur de la classe.";
      else {
        try { await navigator.clipboard.writeText(url); $("#t-envoi-info").textContent = "Lien copié. Colle-le dans un message ou dans le navigateur de l'ordinateur."; }
        catch(e){ $("#t-envoi-info").textContent = "Copie le lien ci-dessous pour l'ouvrir sur l'ordinateur de la classe."; }
      }
    } catch(e){ const info = $("#t-envoi-info"); if (info) info.textContent = "Le lien n'a pas pu être préparé. Réessaie."; }
    finally {
      if (cree){ history.replaceState(null, "", location.pathname+location.search+"#lien="+L.code()+"&tel"); location.reload(); }
      else if (b.isConnected) b.disabled = false;
    }
  }
  function astuce(){
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
    if (Plateforme.NATIF || !ios || navigator.standalone || lsG("banc-des-maitres-astuce")) return "";
    return `<div class="card astuce" id="t-astuce"><b>Pour que le téléphone garde les résultats</b><p style="margin:6px 0 10px">Ajoute Fluence à l'écran d'accueil : bouton <b>Partager</b> de Safari, puis <b>Sur l'écran d'accueil</b>. Ouvre-le ensuite depuis son icône.</p><button class="btn" id="t-astuce-ok">Compris</button></div>`;
  }
  function rendEcran(){
    if (!L.code()){ main.innerHTML = carteLier("Relie ce téléphone à l'écran de la classe") + carteEnvoi() + `<p class="muted" style="margin-top:14px">Sans écran relié, le défi, les élèves et les progrès marchent aussi sur le téléphone seul.</p><button class="btn" id="t-role" style="margin-top:6px">Lire les textes sur ce téléphone</button>`; brancheLier(); brancheEnvoi(); $("#t-role").onclick = ()=>{ Plateforme.changeRole("ecran"); location.reload(); }; return; }
    let h = astuce();
    if (!Lien.relie() || !E){
      h += `<div class="card"><h2>L'écran de la classe n'est pas là</h2><p style="margin:6px 0 0">Ouvre Fluence sur l'ordinateur de la classe : il se relie tout seul à ce téléphone, avec internet.</p><p class="muted" style="margin:8px 0 0">Code de liaison : <b>${esc(L.code())}</b></p></div>
        <details class="card" style="margin-top:12px"><summary style="font-weight:700;min-height:44px;display:flex;align-items:center;cursor:pointer">Relier un autre écran</summary>${carteLier("Nouveau code")}</details>` + carteEnvoi();
      main.innerHTML = h; brancheLier(); brancheAstuce(); brancheEnvoi(); return;
    }
    if (E.son===0) h += `<div class="card astuce"><b>Le son est bloqué sur l'ordinateur.</b> Touche une fois l'écran de la classe, puis réessaie.</div>`;
    if (E.vue==="episode" && Banc.estDisponible(ep(E.ep))){
      const X = ep(E.ep);
      h += `<div class="card"><div class="label">Sur l'écran</div><h2>${esc(libelleEpisode(X))} — ${esc(X.titre)}</h2>
        <div class="etapes">${etapesEpisode(X).map((s,i)=>`<button class="btn${i===E.etape?" primary":""}" data-nav="${i}">${i+1}. ${s}</button>`).join("")}</div></div>`;
      h += `<div class="card">`;
      if (E.etape===0) h += `<div class="label">Mot affiché</div><div style="font-size:30px;font-weight:700;margin:4px 0 2px">${esc(E.mot||"")}</div>`;
      if (E.etape>=1 && E.etape<=3) h += `<div class="label">${E.page ? `Page ${E.page} / ${E.pages}` : "Titre"}${E.lecture ? " · lecture en cours" : ""}${E.attente ? " · à vous !" : ""}</div>${X.audio?"":`<p class="noaudio">Voix à venir : lecture libre.</p>`}`;
      if (E.etape===4){ h += `<p style="margin:0">Le défi se mène dans l'onglet <b>Défi</b> : tu notes les erreurs, l'écran montre le chrono puis le résultat.</p><div class="tele"><button class="btn primary" id="t-vers-defi">Ouvrir le défi</button></div>`; }
      else if (E.etape===5) h += `<p style="margin:0">L'écran montre les progrès du groupe sur ce texte.</p>`;
      h += boutons(E.boutons) + `</div>`;
    } else if (E.vue==="home"){
      h += `<div class="card"><div class="label">Sur l'écran : les textes</div><h2>Quel texte ouvrir ?</h2>${[false,true].map(t=>{ const textes = Banc.textesDisponibles().filter(X=>!!estTamallette(X)===t); return textes.length ? `<h3 style="margin-top:16px">${t?"Tamallette · période 2":"Le feuilleton"}</h3><div class="liste">${textes.map(X=>`<button class="btn" data-ep="${X.id}"><span><b>${esc(libelleEpisode(X))} — ${esc(X.titre)}</b><small>${esc(X.semaine)}${X.audio?"":" · voix à venir"}</small></span></button>`).join("")}</div>` : ""; }).join("")}</div>`;
    } else {
      h += `<div class="card"><div class="label">Sur l'écran</div><h2>${E.vue==="students" ? "Les élèves" : "Les progrès"}</h2></div>`;
    }
    h += `<div class="row start" style="margin-top:14px"><button class="btn" data-vue="home">Textes</button><button class="btn" data-vue="students">Élèves</button><button class="btn" data-vue="progress">Progrès</button></div>
      <p class="muted" style="margin-top:14px">Code de liaison : ${esc(L.code())}</p>` + carteEnvoi();
    main.innerHTML = h; brancheAstuce(); brancheEnvoi();
    main.querySelectorAll("[data-nav]").forEach(b=>b.onclick = ()=>cmd({nav:{vue:"episode", ep:E.ep, etape:+b.dataset.nav}}));
    main.querySelectorAll("[data-ep]").forEach(b=>b.onclick = ()=>cmd({nav:{vue:"episode", ep:b.dataset.ep, etape:0}}));
    main.querySelectorAll("[data-vue]").forEach(b=>b.onclick = ()=>cmd({nav:{vue:b.dataset.vue}}));
    main.querySelectorAll("[data-clic]").forEach(b=>b.onclick = ()=>{ b.disabled = true; cmd({clic:b.dataset.clic}); setTimeout(()=>{ b.disabled = false; }, 1500); });
    const vd = $("#t-vers-defi"); if (vd) vd.onclick = ()=>{ D.ep = E.ep; va("defi"); };
  }
  function boutons(liste){
    if (!liste || !liste.length) return "";
    let h = `<div class="tele">`, g = null;
    liste.forEach(b=>{
      if (b.g!==g){ if (g) h += `</div>`; g = b.g; if (g) h += `<div class="seg" role="group" aria-label="${g==="vitesse"?"Vitesse de la voix":"Vitesse du flash"}">`; }
      h += g ? `<button data-clic="${esc(b.id)}" aria-pressed="${b.a?"true":"false"}"${b.d?" disabled":""}>${esc(b.t)}</button>`
             : `<button class="btn${b.p?" primary":""}" data-clic="${esc(b.id)}"${b.d?" disabled":""}>${esc(b.t)}</button>`;
    });
    if (g) h += `</div>`;
    return h + `</div>`;
  }
  function brancheAstuce(){ const b = $("#t-astuce-ok"); if (b) b.onclick = ()=>{ lsS("banc-des-maitres-astuce", "1"); $("#t-astuce").remove(); }; }

  /* ---------- Défi : mené depuis le téléphone ---------- */
  const D = {ep:lsG("banc-des-maitres-defi-ep") || null, eleve:null, etat:"choix", t0:0, tick:null, errs:new Set(), dernier:-1, ecoule:0, resultat:null, ok:true, nombre:3, annuleCompte:null, tour:Plateforme.rid(8), sequence:0};
  const envoie = (etat, plus) => Lien.emit("defi", Object.assign({etat, ep:D.ep, eleve:D.eleve, tour:D.tour, sequence:++D.sequence}, plus||{}));
  function epDefi(){ if (!Banc.estDisponible(ep(D.ep))) D.ep = (E && E.vue==="episode" && Banc.estDisponible(ep(E.ep)) ? E.ep : (Banc.textesDisponibles().find(x=>x.audio)||Banc.textesDisponibles()[0]).id); return ep(D.ep); }
  function rendDefi(){
    const X = epDefi(), DUR = DUREE(), toks = motsDefi(X);
    const ecranOccupe = E && E.defi && E.defi.local && Lien.relie();
    let h = "";
    if (D.etat==="choix"){
      h += `<div class="card"><label class="label" for="t-ep">Texte</label><select class="sel" id="t-ep" style="margin-top:6px">${[false,true].map(t=>{ const textes = Banc.textesDisponibles().filter(x=>!!estTamallette(x)===t); return textes.length ? `<optgroup label="${t?"Tamallette · période 2":"Le feuilleton"}">${textes.map(x=>`<option value="${x.id}"${x.id===X.id?" selected":""}>${esc(libelleEpisode(x))} — ${esc(x.titre)}</option>`).join("")}</optgroup>` : ""; }).join("")}</select>
        <div class="label" style="margin-top:14px">Qui lit ?</div><div class="who" id="t-who" style="margin-top:8px">${Donnees.eleves().map(s=>`<button type="button" data-eleve="${esc(s.id)}" aria-pressed="${s.id===D.eleve?"true":"false"}">${esc(s.nom)}</button>`).join("")}</div>
        <p class="muted" id="t-essai" style="margin:8px 0 0">${D.eleve ? `Essai n° ${Donnees.essaisDe(D.eleve, X.id).length+1} sur ce texte`+(Donnees.objectif(D.eleve)===null ? "" : ` · Objectif : ${Donnees.objectif(D.eleve)} MCLM`) : ""}</p>
        ${ecranOccupe ? `<p class="hint">Un défi est en cours sur l'écran de la classe.</p>` : ""}
        <div class="tele"><button class="btn primary" id="t-go"${D.eleve && !ecranOccupe ? "" : " disabled"}>Départ</button></div>
        <p class="muted" style="margin:6px 0 0">${Lien.relie() ? "Le texte s'affiche sur l'écran de la classe ; touche ici les mots mal lus." : "Sans écran relié : l'élève lit sur le texte imprimé ou au tableau."} ${DUR} secondes de lecture, après un décompte de 3 secondes avec un bip : 3, 2, 1.</p></div>`;
    } else if(D.etat==="decompte"){
      h+=`<div class="card"><div class="label">${esc(Donnees.nom(D.eleve))} · ${esc(libelleEpisode(X))}</div><div class="defi-compte-rebours" id="t-decompte" role="status" aria-live="polite"><span>Prêt ? La lecture commence dans</span><strong class="defi-compte-nombre" id="t-decompte-nombre">${D.nombre}</strong><span>secondes</span></div><p class="defi-consigne">La lecture commencera après 3 secondes.</p><button class="btn" id="t-annule-depart">Annuler le départ</button></div>`;
    } else if (D.etat!=="fini"){
      const reste = Math.max(0, Math.ceil(DUR-D.ecoule));
      h += `<div class="card"><div class="label">${esc(Donnees.nom(D.eleve))} · ${esc(libelleEpisode(X))}</div>
        <div class="chrono"><span class="big-num" id="t-reste">${D.etat==="lecture" ? reste : "0"}</span><span class="muted">secondes</span></div>
        <div class="timer"><i id="t-bar" style="width:${Math.min(100, D.ecoule/DUR*100)}%"></i></div>
        <p class="hint defi-consigne${D.etat==="dernier"?" etat-dernier":""}" id="t-hint" tabindex="-1" role="${D.etat==="dernier"?"alert":"status"}" style="margin:10px 0 0">${D.etat==="lecture" ? "Touche les mots mal lus (un deuxième toucher annule)." : "Temps écoulé ! Touche le dernier mot lu."}</p></div>`;
    } else {
      h += `<div class="card" id="t-res">${carteResultat(D.resultat, bilan(D.resultat), Donnees.nom(D.eleve), D.ok)}
        <div class="tele"><button class="btn primary" id="t-encore">Nouvel essai</button><button class="btn" id="t-autre">Autre élève</button><button class="btn danger" id="t-suppr">Supprimer cet essai</button></div></div>`;
    }
    h += `<div class="card tdefi"><div class="label">${D.etat==="choix" ? "Le texte" : "Touche les mots"}</div><div class="text" id="t-txt" lang="fr"></div></div>`;
    if (D.etat==="lecture") h += `<div class="collant"><button class="btn big primary" id="t-stop">Il a fini</button></div>`;
    if (D.etat==="dernier") h += `<div class="collant"><div class="defi-consigne etat-dernier" aria-hidden="true">Touche le dernier mot lu</div></div>`;
    main.innerHTML = h;
    const box = $("#t-txt"), spans = [];
    toks.forEach((x,i)=>{ Banc.ajouteRupture(box,x); const s = el("span",{class:"w"}); s.textContent = x.t; spans[i] = s; box.appendChild(s); box.appendChild(document.createTextNode(" ")); });
    const marque = () => spans.forEach((s,i)=>{ s.classList.toggle("err", D.errs.has(i) && (D.etat!=="fini" || i<=D.dernier)); s.classList.toggle("after", D.etat==="fini" && i>D.dernier); s.classList.toggle("last", D.etat==="fini" && i===D.dernier); });
    marque();box.classList.toggle("defi-attente-dernier",D.etat==="dernier");
    box.onclick = e=>{ const s = e.target.closest(".w"); if (!s) return; const i = spans.indexOf(s);
      if (D.etat==="lecture"){ if (!toks[i].w) return; D.errs.has(i) ? D.errs.delete(i) : D.errs.add(i); s.classList.toggle("err"); if (navigator.vibrate) navigator.vibrate(15); }
      else if (D.etat==="dernier"&&toks[i]?.w){ D.dernier = i; termine(); } };
    if (D.etat==="choix"){
      $("#t-ep").onchange = e=>{ D.ep = e.target.value; lsS("banc-des-maitres-defi-ep", D.ep); if (D.eleve) envoie("pret"); rendDefi(); };
      $("#t-who").onclick = e=>{ const b = e.target.closest("[data-eleve]"); if (!b) return; D.eleve = b.dataset.eleve; envoie("pret"); rendDefi(); };
      $("#t-go").onclick = depart;
    }
    if ($("#t-annule-depart")) $("#t-annule-depart").onclick=()=>annuleDepart();
    if ($("#t-stop")) $("#t-stop").onclick = ()=>finTemps();
    if ($("#t-encore")) $("#t-encore").onclick = ()=>{ D.etat = "choix"; D.resultat = null; envoie("pret"); rendDefi(); };
    if ($("#t-autre")) $("#t-autre").onclick = ()=>{ D.etat = "choix"; D.resultat = null; D.eleve = null; envoie("repos"); rendDefi(); };
    if ($("#t-suppr")) $("#t-suppr").onclick = async e=>{ const b = e.currentTarget; if (b.dataset.sur!=="1"){ b.dataset.sur = "1"; b.textContent = "Confirmer la suppression ?"; return; }
      await Donnees.supprime(D.resultat.id); D.etat = "choix"; D.resultat = null; envoie("repos"); rendDefi(); };
  }
  function annuleDepart(redessine=true){
    if(D.etat!=="decompte")return;
    D.annuleCompte?.();D.annuleCompte=null;clearInterval(D.tick);D.tick=null;D.etat="choix";D.ecoule=0;D.t0=0;
    Plateforme.eveille(false);envoie("repos");if(redessine&&onglet==="defi")rendDefi();
  }
  function depart(){
    if(D.etat!=="choix"||!D.eleve||(E?.defi?.local&&Lien.relie()))return;
    D.etat="decompte";D.nombre=3;D.errs=new Set();D.dernier=-1;D.ecoule=0;D.resultat=null;D.t0=0;
    clearInterval(D.tick);D.tick=null;lsS("banc-des-maitres-defi-ep",D.ep);Plateforme.eveille(true);
    D.annuleCompte=Banc.compteRebours({surNombre:n=>{if(D.etat!=="decompte")return;D.nombre=n;envoie("decompte",{nombre:n});if(onglet==="defi"){rendDefi();main.scrollTop=0;}},termine:()=>{
      if(D.etat!=="decompte")return;D.annuleCompte=null;D.etat="lecture";D.t0=performance.now();envoie("lecture",{depuis:0});
      D.tick=setInterval(()=>{D.ecoule=(performance.now()-D.t0)/1000;const DUR=DUREE();
        if(onglet==="defi"){const r=$("#t-reste"),b=$("#t-bar");if(r)r.textContent=Math.max(0,Math.ceil(DUR-D.ecoule));if(b)b.style.width=Math.min(100,D.ecoule/DUR*100)+"%";}
        if(D.ecoule>=DUR)finTemps(DUR);
      },200);
      if(onglet==="defi")rendDefi();
    }});
  }

  function finTemps(s){
    if (D.etat!=="lecture") return;
    clearInterval(D.tick); D.ecoule = Math.min(DUREE(), s!=null ? s : (performance.now()-D.t0)/1000);
    D.etat = "dernier"; bip(); if (navigator.vibrate) navigator.vibrate([200,80,200]);
    envoie("choix"); if (onglet!=="defi") va("defi"); else rendDefi();$("#t-hint")?.focus({preventScroll:true});
  }
  async function termine(){
    if(D.etat!=="dernier")return;D.etat="enregistrement";
    const X = epDefi();
    const r = calcule(X, D.eleve, D.ecoule, D.dernier, D.errs);
    D.ok = await Donnees.ajoute(r); D.resultat = r; D.etat = "fini";
    Plateforme.eveille(false);
    envoie("fini", {resultat:r});
    rendDefi(); main.scrollTop = 0;
  }

  document.addEventListener("visibilitychange",()=>{if(document.hidden)annuleDepart();});
  window.addEventListener("pagehide",()=>annuleDepart(false));

  async function demarre(){
    rend(); majLien();
    Donnees.surChange(q=>{ if (onglet==="progres" && (q==="resultats" || q==="classe")) rend(); else if (onglet==="eleves"){ if(q==="classe" && !document.activeElement?.closest("#f")) rend(); Banc.actualiseObjectifs(main); } else if (onglet==="defi" && (q==="classe" || q==="resultats") && (D.etat==="choix" || D.etat==="fini")) rend(); });
    const room = await Lien.init();
    /* l'adresse garde le lien : « Sur l'écran d'accueil » (iPhone) emporte ainsi la liaison dans l'icône */
    if (L.code() && !location.hash.includes("lien="+L.code())) history.replaceState(null, "", location.pathname+location.search+"#lien="+L.code()+"&tel");
    majLien();
    if (!room){ rend(); return; }
    Lien.on("ecran", m=>{ E = m.data; if(D.etat==="decompte"&&E?.defi?.local&&Lien.relie())annuleDepart(); if (onglet==="ecran") rendEcran(); });
    Lien.surEtat(on=>{ majLien(); if (on){cmd({etat:1});if(D.etat==="decompte")envoie("decompte",{nombre:D.nombre});else if(D.etat==="lecture")envoie("lecture",{depuis:Math.max(0,performance.now()-D.t0)});else if(D.etat==="dernier")envoie("choix");} else E = null; if (onglet==="ecran") rendEcran(); });
    room.onConnection(()=>majLien());
    rend();
  }
  return { demarre, etat:()=>E, defi:()=>D };
})();
window.Telephone = Telephone;

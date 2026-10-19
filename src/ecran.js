/* ---------- L'écran de la classe (TBI) ----------
   Un écran par moment de la séance : les mots, j'écoute, l'écho, le chœur, le défi, les progrès.
   Le téléphone relié sert de télécommande (il voit les boutons de l'écran et les touche à distance)
   et peut mener le défi : il compte les erreurs en silence, l'écran montre le chrono puis le résultat. */
"use strict";
const Ecran = (() => {
  const { EPS, $, el, esc, estMot, ep, estTamallette, libelleEpisode, etapesEpisode, motsDefi, DUREE, Donnees, Lien, calcule, bilan, carteResultat, courbe, vueProgres, vueEleves, bip } = Banc;
  const view = $("#view"), audio = $("#audio");
  const maison = Banc.ROLE === "parents";
  let optionsMaison = {}, reglagesLecteur = maison ? {vitesse:()=>0.8, fixeVitesse:()=>{}} : Donnees;
  let route = {name:"home"};
  let cleanup = ()=>{};

  function go(r){
    if (maison){
      const E = r && r.name === "episode" && ep(r.id);
      r = E ? {name:"episode",id:E.id,step:4} : {name:"home"};
    }
    stopAudio(); route = r; render(); $("#main").scrollTop = 0;
    if (maison) window.scrollTo(0,0);
  }
  document.querySelectorAll("#app-ecran [data-go]").forEach(b=>b.addEventListener("click", ()=>go({name:b.dataset.go})));
  $("#home-link").addEventListener("click", ()=>go({name:"home"}));
  $("#home-link").addEventListener("keydown", e=>{ if (e.key==="Enter") go({name:"home"}); });
  $("#fs").addEventListener("click", async ()=>{ try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch(e){} });
  function render(){
    document.querySelectorAll("#app-ecran [data-go]").forEach(b=>b.setAttribute("aria-current", (b.dataset.go===route.name || (route.name==="episode" && b.dataset.go==="home")) ? "page" : "false"));
    if (route.name==="home") renderHome();
    else if (route.name==="episode") renderEpisode();
    else if (route.name==="students") vueEleves(view);
    else if (route.name==="progress") vueProgres(view);
    annonce();
  }

  /* ---------- Accueil ---------- */
  function renderHome(){
    if(maison){ if(optionsMaison.accueil) optionsMaison.accueil(view); return; }
    view.innerHTML = `<h1 style="font-size:clamp(28px,3.4vw,46px)">${maison ? "Un moment de lecture ensemble" : "Le feuilleton de la période 2"}</h1>
    <p class="lead">${maison ? "Choisissez un texte. Préparez les mots, écoutez la voix et entraînez-vous à lire. Un adulte peut ensuite accompagner le défi d’une minute." : "Sept enquêtes de Maya, Sami, Jules et Romy. Chaque semaine, un papier écrit à l'encre verte attend la bande sous le banc des maîtres."}</p>
    ${maison ? '<h2 class="collection">Le banc des maîtres</h2>' : ""}
    <div class="eps" id="eps"></div>
    ${EPS.some(estTamallette)?`<section class="collection"><h2>Tamallette · période 2</h2><p class="lead">Les textes prévus pour la période : les mots à préparer, la lecture et le défi d'une minute.</p><div class="eps" id="eps-tamallette"></div></section>`:""}`;
    EPS.forEach(E=>{
      const n = E.pages.length-1, imgs = E.pages.slice(1).filter(p=>p.img).length, tamallette = estTamallette(E);
      const b = el("button",{class:"ep"+(tamallette ? " ep-texte" : ""), type:"button", "data-ep":E.id});
      b.innerHTML = (E.pages[1] && E.pages[1].img ? `<img class="vign" src="${esc(E.pages[1].img)}" alt="" loading="lazy">` : (tamallette ? "" : `<div class="vign"></div>`)) +
        `<span class="num">${esc(libelleEpisode(E))}</span><b>${esc(E.titre)}</b><span class="meta">${esc(E.semaine)} · ${esc(E.theme)}</span><span class="meta">${E.nbMots} mots</span>
        <span class="chips"><span class="chip ${E.audio?"ok":""}">${E.audio?"Voix enregistrée":"Voix à venir"}</span>${tamallette?"":`<span class="chip ${imgs===n?"ok":""}">${imgs===n?"Images prêtes":"Images "+imgs+"/"+n}</span>`}</span>`;
      b.addEventListener("click", ()=>go({name:"episode", id:E.id, step:0}));
      $(tamallette ? "#eps-tamallette" : "#eps").appendChild(b);
    });
    if (maison && optionsMaison.accueil) optionsMaison.accueil(view);
  }

  /* ---------- Séance ---------- */
  let EP = null, page = 1, wordSpans = [], sentSpans = [], cur = -1, raf = 0, playing = false, stopAt = null, onStop = ()=>{}, echoSent = null, waiting = false, mode = "listen";
  function renderEpisode(){
    EP = ep(route.id);
    const step = route.step||0;
    if(maison){
      view.innerHTML=`<div class="ephead maison-entete"><button class="btn" id="back" type="button">Retour aux textes</button><h1>${esc(EP.titre)}</h1><button class="btn" id="maison-imprimer" type="button">Imprimer le texte</button></div><div class="panel" id="panel"></div>`;
      $("#back").onclick=()=>go({name:"home"});
      $("#maison-imprimer").onclick=()=>optionsMaison.imprime?.(EP);
      cleanup=optionsMaison.defi?.($("#panel"),EP) || (()=>{});
      return;
    }
    view.innerHTML = `<div class="ephead"><button class="btn" id="back" aria-label="Retour aux textes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><h2>${esc(libelleEpisode(EP))} — ${esc(EP.titre)}</h2><nav class="steps" id="steps" aria-label="Étapes de la séance"></nav></div><div class="panel" id="panel"></div>`;
    $("#back").onclick = ()=>go({name:"home"});
    if (maison){
      const imprimer = el("button",{class:"btn",id:"maison-imprimer",type:"button"},"Imprimer le texte");
      imprimer.onclick = ()=>{ if(optionsMaison.imprime) optionsMaison.imprime(EP); };
      $("#steps").before(imprimer);
    }
    let numero = 0;
    etapesEpisode(EP).forEach((s,i)=>{
      if (maison && (i===5 || (!EP.audio && (i===2 || i===3)))) return;
      const b = el("button",{class:"step", type:"button", "data-step":String(i)}, `<i>${++numero}</i>${s}`); if (i===step) b.setAttribute("aria-current","step"); b.onclick = ()=>go({name:"episode", id:EP.id, step:i}); $("#steps").appendChild(b);
    });
    const P = $("#panel");
    if (step===0) stepWords(P);
    else if (step>=1 && step<=3) stepReader(P, ["listen","echo","choir"][step-1]);
    else if (step===4){
      if (maison){ if (optionsMaison.defi) cleanup = optionsMaison.defi(P,EP) || (()=>{}); }
      else stepDefi(P);
    }
    else stepProgress(P);
  }

  /* 1. Les mots à préparer */
  function stepWords(P){
    let i = 0, timer = null, delay = 2000;
    P.innerHTML = `<div class="flash"><div class="count" id="wc"></div><div class="word" id="wd"></div>
      <div class="row"><button class="btn big" id="wp" data-tele="◀ Mot précédent" aria-label="Mot précédent">◀</button><button class="btn big primary" id="wn" data-tele>Mot suivant</button><button class="btn big" id="wa" data-tele>Flash</button>
      <div class="seg" id="wdel" role="group" aria-label="Vitesse du flash"><button id="wd30" data-tele="Lent" data-tele-g="flash" data-v="3000" aria-pressed="false">Lent</button><button id="wd20" data-tele="Moyen" data-tele-g="flash" data-v="2000" aria-pressed="true">Moyen</button><button id="wd10" data-tele="Rapide" data-tele-g="flash" data-v="1000" aria-pressed="false">Rapide</button></div>
      <button class="btn big" id="wall" data-tele>Tous les mots</button></div></div>`;
    const show = ()=>{ $("#wd").textContent = EP.mots[i]; $("#wc").textContent = `${i+1} / ${EP.mots.length}`; annonce(); };
    const next = ()=>{ i = (i+1)%EP.mots.length; show(); };
    $("#wn").onclick = ()=>{ stopFlash(); next(); };
    $("#wp").onclick = ()=>{ stopFlash(); i = (i-1+EP.mots.length)%EP.mots.length; show(); };
    const stopFlash = ()=>{ if (timer){ clearInterval(timer); timer = null; $("#wa").textContent = "Flash"; annonce(); } };
    $("#wa").onclick = ()=>{ if (timer){ stopFlash(); return; } $("#wa").textContent = "Arrêter"; timer = setInterval(next, delay); annonce(); };
    $("#wdel").onclick = e=>{ const b = e.target.closest("button"); if (!b) return; delay = +b.dataset.v; $("#wdel").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", String(x===b))); if (timer){ clearInterval(timer); timer = setInterval(next, delay); } annonce(); };
    $("#wall").onclick = ()=>{ stopFlash(); const f = P.querySelector(".flash"); const showing = f.dataset.all==="1"; f.dataset.all = showing ? "0" : "1";
      $("#wd").style.display = showing ? "" : "none"; $("#wc").style.display = showing ? "" : "none";
      let a = f.querySelector(".allwords"); if (!a){ a = el("div",{class:"allwords"}); EP.mots.forEach(w=>a.appendChild(el("span",{},esc(w)))); f.insertBefore(a, f.querySelector(".row")); }
      a.style.display = showing ? "none" : ""; $("#wall").textContent = showing ? "Tous les mots" : "Un par un"; annonce(); };
    show();
    cleanup = ()=>stopFlash();
  }

  /* 2-4. Le lecteur : écoute, écho, chœur */
  const LIB = {listen:"Écouter", echo:"Écouter la phrase", choir:"Lire avec la voix"};
  function stepReader(P, m){
    mode = m; page = 0; onStop = ()=>{};
    const hasAudio = !!EP.audio;
    P.innerHTML = `<div class="stage"><div class="pic" id="pic"></div><div class="textbox"><div class="text" id="txt" lang="fr"></div></div></div>
     <div class="controls">
       <div class="group"><button class="btn" id="prev" data-tele="◀ Page" aria-label="Page précédente">◀</button><span class="pageno" id="pno"></span><button class="btn" id="next" data-tele="Page ▶" aria-label="Page suivante">▶</button></div>
       <div class="group">${hasAudio?`<button class="btn big primary" id="play" data-tele>${LIB[m]}</button>`:`<span class="noaudio">Voix à venir : lis le texte toi-même pour l'instant.</span>`}</div>
       <div class="group">${hasAudio?`<span class="label">Vitesse</span><div class="seg" id="speed" role="group" aria-label="Vitesse de la voix"><button id="v06" data-tele="Lente" data-tele-g="vitesse" data-v="0.6">Lente</button><button id="v08" data-tele="Moyenne" data-tele-g="vitesse" data-v="0.8">Moyenne</button><button id="v10" data-tele="Normale" data-tele-g="vitesse" data-v="1">Normale</button></div>`:""}</div>
     </div>
     <div class="echobar" id="echobar" hidden><strong>À vous !</strong><button class="btn" id="again" data-tele>Réécouter</button><button class="btn primary" id="enext" data-tele>Phrase suivante</button></div>`;
    if (hasAudio){
      let sp = reglagesLecteur.vitesse(); if (m==="choir" && sp>0.8) sp = 0.8;
      $("#speed").onclick = e=>{ const b = e.target.closest("button"); if (b){ setSpeed(+b.dataset.v); reglagesLecteur.fixeVitesse(+b.dataset.v); } };
      $("#play").onclick = togglePlay;
      $("#again").onclick = ()=>{ if (echoSent!==null) playSentence(echoSent); };
      $("#enext").onclick = echoNext;
      if (audio.dataset.ep!==EP.id){ audio.src = EP.audio; audio.dataset.ep = EP.id; }
      setSpeed(sp);
    }
    // Le même élément audio est réutilisé : chaque mode reprend au début, en pause.
    try { audio.currentTime = 0; } catch(e){}
    const saute = d => { const w = playing && mode!=="echo"; stopAudio(); showPage(page+d); if (w && EP.pages[page].a!=null) playFrom(EP.pages[page].a, null); };
    $("#prev").onclick = ()=>saute(-1);
    $("#next").onclick = ()=>saute(1);
    showPage(0);
    cleanup = ()=>{};
  }
  function setSpeed(v){
    audio.defaultPlaybackRate = v; audio.playbackRate = v;
    audio.preservesPitch = true; audio.webkitPreservesPitch = true;
    const s = $("#speed");
    if (s) s.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed", String(+b.dataset.v===v)));
    // Actualiser la télécommande dès le changement, sans attendre une pause ou la page suivante.
    annonce();
  }
  function showPage(p){
    page = Math.max(0, Math.min(p, EP.pages.length-1));
    const P = EP.pages[page];
    $("#pno").textContent = page===0 ? "Titre" : `Page ${page} / ${EP.pages.length-1}`;
    $("#prev").disabled = page===0; $("#next").disabled = page===EP.pages.length-1;
    const pic = $("#pic"); pic.innerHTML = "";
    const img = P.img || (page===0 && EP.pages[1] && EP.pages[1].img);
    const texteSeul = estTamallette(EP) && !img;
    pic.hidden = texteSeul; pic.parentElement.classList.toggle("texte-seul", texteSeul);
    if (img) pic.appendChild(el("img",{src:img, alt:page===0 ? libelleEpisode(EP) : `Illustration de la page ${page}`}));
    else if (!texteSeul) pic.appendChild(el("div",{class:"ph"}, `<div><b>${EP.id}-${page===0?1:page}</b>Image à venir</div>`));
    const box = $("#txt"); box.className = "text"+(page===0 ? " title" : ""); box.innerHTML = "";
    if (page===0) box.appendChild(el("span",{class:"muted", style:"display:block;font-size:.42em;font-family:var(--font-read);font-weight:700"}, esc(libelleEpisode(EP))));
    wordSpans = []; sentSpans = [];
    P.sents.forEach((s,si)=>{
      const ss = el("span",{class:"s"});
      for (let i=s[0]; i<=s[1]; i++){ const w = el("span",{class:"w"}); w.textContent = P.toks[i][0]; w.onclick = ()=>playWord(i); ss.appendChild(w); wordSpans[i] = w; if (i<s[1]) ss.appendChild(document.createTextNode(" ")); }
      box.appendChild(ss); sentSpans[si] = ss; if (si<P.sents.length-1) box.appendChild(document.createTextNode(" "));
    });
    if (page===0 && EP.source) box.appendChild(el("small", {class:"muted", style:"display:block;margin-top:18px;font-size:15px;font-family:var(--font-read);font-weight:400;line-height:1.5"}, esc(EP.source)));
    cur = -1; if ($("#echobar")) $("#echobar").hidden = true; waiting = false; echoSent = null;
    fit(box, page===0 ? 0.09 : 0.058);
    annonce();
  }
  function fit(box, k){
    if (maison){ box.style.removeProperty("--fs"); return; }
    const holder = box.parentElement;
    const avail = holder.clientHeight-parseFloat(getComputedStyle(holder).paddingTop)*2;
    let fs = Math.max(18, Math.min(window.innerHeight*k, window.innerWidth*k*0.56));
    box.style.setProperty("--fs", fs+"px"); let g = 0;
    while (box.scrollHeight>avail && fs>15 && g++<60){ fs *= .95; box.style.setProperty("--fs", fs+"px"); }
  }
  window.addEventListener("resize", ()=>{ const b = $("#txt"); if (b && route.name==="episode") fit(b, route.step===4 ? 0.05 : (page===0 ? 0.09 : 0.058)); });
  function setPlayUI(on){ playing = on; const b = $("#play"); if (b) b.textContent = on ? "Pause" : LIB[mode]; annonce(); }
  /* premier toucher de l'écran : le navigateur autorise alors le son (commandes venues du téléphone) */
  let sonBloque = false;
  function bloque(on){ sonBloque = on; let b = $("#son-bloque"); if (on && !b){ b = el("div",{class:"banner", id:"son-bloque"}, "Touche une fois l'écran de la classe pour autoriser le son."); document.body.appendChild(b); } if (!on && b) b.remove(); annonce(); }
  document.addEventListener("pointerdown", ()=>{ if (sonBloque) bloque(false); }, true);
  async function playFrom(t, until){
    if (!EP.audio || t==null) return;
    stopAt = until ?? null;
    try { if (Math.abs(audio.currentTime-t)>0.04) audio.currentTime = t; await audio.play(); if (sonBloque) bloque(false); setPlayUI(true); loop(); }
    catch(e){ setPlayUI(false); if (e && e.name==="NotAllowedError") bloque(true); }
  }
  function stopAudio(){ try { audio.pause(); } catch(e){} setPlayUI(false); cancelAnimationFrame(raf); stopAt = null; waiting = false; echoSent = null; const eb = $("#echobar"); if (eb) eb.hidden = true; mark(-1); sentSpans.forEach(s=>s.classList.remove("echo")); cleanup(); cleanup = ()=>{}; }
  function mark(i){ if (i===cur) return; if (cur>=0 && wordSpans[cur]) wordSpans[cur].classList.remove("on"); cur = i; if (i>=0 && wordSpans[i]) wordSpans[i].classList.add("on"); }
  function loop(){
    cancelAnimationFrame(raf);
    const step = ()=>{
      if (audio.paused) return;
      const t = audio.currentTime, P = EP.pages[page];
      if (stopAt===null && P.b!=null && t>=P.b-0.02){ if (page<EP.pages.length-1) showPage(page+1); else { audio.pause(); setPlayUI(false); mark(-1); return; } }
      const Q = EP.pages[page]; let k = -1;
      for (let i=0; i<Q.toks.length; i++){ const x = Q.toks[i]; if (x[1]!=null && t>=x[1]-0.03 && t<x[2]+0.06){ k = i; break; } }
      mark(k);
      if (stopAt!==null && t>=stopAt){ audio.pause(); setPlayUI(false); mark(-1); const f = onStop; onStop = ()=>{}; f(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  audio.addEventListener("ended", ()=>{ setPlayUI(false); mark(-1); });
  function playWord(i){ const x = EP.pages[page].toks[i]; if (!EP.audio || x[1]==null) return; const was = echoSent; onStop = ()=>{ if (mode==="echo" && was!==null){ waiting = true; $("#echobar").hidden = false; annonce(); } }; playFrom(x[1]-0.02, x[2]+0.05); }
  function playSentence(si){ const s = EP.pages[page].sents[si]; if (!s || s[2]==null) return; echoSent = si; sentSpans.forEach((x,j)=>x.classList.toggle("echo", j===si)); $("#echobar").hidden = true; waiting = false;
    onStop = ()=>{ waiting = true; $("#echobar").hidden = false; $("#enext").focus({preventScroll:true}); annonce(); }; playFrom(s[2]-0.05, s[3]+0.08); }
  function echoNext(){
    const P = EP.pages[page];
    if (P.a==null){ if (page<EP.pages.length-1){ showPage(page+1); playSentence(0); } return; } // le titre n'est pas lu
    if (echoSent===null){ playSentence(0); return; }
    if (echoSent<P.sents.length-1){ playSentence(echoSent+1); return; }
    if (page<EP.pages.length-1){ showPage(page+1); playSentence(0); } else stopAudio();
  }
  function togglePlay(){
    if (playing){ audio.pause(); setPlayUI(false); return; }
    if (mode==="echo"){ if (waiting || echoSent===null) echoNext(); else playSentence(echoSent); return; }
    onStop = ()=>{};
    if (EP.pages[page].a==null && page<EP.pages.length-1) showPage(page+1); // le titre n'est pas lu : on commence à la page 1
    const P = EP.pages[page], t = audio.currentTime;
    playFrom(t>=P.a && t<P.b-0.1 ? t : P.a, null);
  }

  /* 5. Le défi d'une minute (mené ici, ou depuis le téléphone) */
  let Defi = null; // l'état du défi affiché, pour le téléphone et les messages reçus
  function stepDefi(P){
    const DUR = DUREE();
    let who = null, state = "idle", t0 = 0, tick = null, errs = new Set(), last = -1, elapsed = 0, distant = false, resultatAffiche = null;
    const toks = motsDefi(EP);
    P.innerHTML = `<div class="defi"><div class="textbox"><div class="text" id="txt" lang="fr"></div></div>
     <div class="side">
       <div class="card"><div class="label">Qui lit ?</div><div class="who" id="who" style="margin-top:8px"></div><div class="muted" id="essai" style="margin-top:8px"></div></div>
       <div class="card"><div class="timer"><i id="bar"></i></div><div class="row start" style="margin-top:10px"><button class="btn big primary" id="go" disabled>Départ</button><button class="btn" id="stop" hidden>Il a fini</button></div><p class="hint" id="hint" style="margin:10px 0 0"></p></div>
       <div class="card" id="res" hidden></div>
     </div></div>`;
    const box = $("#txt"), spans = [];
    toks.forEach((x,i)=>{ if (x.brk) box.appendChild(el("br")); const s = el("span",{class:"w"}); s.textContent = x.t; s.onclick = ()=>tapWord(i); box.appendChild(s); box.appendChild(document.createTextNode(" ")); spans[i] = s; });
    fit(box, 0.05);
    const conseil = () => Lien.relie() ? "Lance le défi depuis le téléphone, ou choisis l'élève ici." : "Choisis l'élève, puis appuie sur Départ.";
    $("#hint").textContent = conseil();
    const essaiNum = id => Donnees.essaisDe(id, EP.id).length;
    Donnees.eleves().forEach(s=>{ const b = el("button",{type:"button", "aria-pressed":"false", "data-eleve":s.id}); b.textContent = s.nom||"Élève";
      b.onclick = ()=>{ if (state==="run" || distant) return; choisit(s.id); reset(); }; $("#who").appendChild(b); });
    function afficheEssai(){ const objectif=Donnees.objectif(who); $("#essai").textContent = who ? `Essai n° ${essaiNum(who)+1} sur ce texte`+(objectif===null ? "" : ` · Objectif : ${objectif} MCLM`) : ""; }
    function choisit(id){ who = id; $("#who").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", String(x.dataset.eleve===id))); $("#go").disabled = false; afficheEssai(); }
    function reset(){ state = "idle"; resultatAffiche = null; afficheEssai(); errs.clear(); last = -1; spans.forEach(s=>s.className = "w"); $("#bar").style.width = "0"; $("#res").hidden = true; $("#hint").textContent = who ? "Appuie sur Départ quand l'élève est prêt." : conseil(); $("#go").textContent = "Départ"; $("#go").disabled = !who; $("#stop").hidden = true; publie(); }
    function tapWord(i){
      if (distant) return;
      if (state==="run"){ if (!toks[i].w) return; errs.has(i) ? errs.delete(i) : errs.add(i); spans[i].classList.toggle("err"); }
      else if (state==="pick"){ last = i; montreFin(i, null); finish(); }
    }
    function montreFin(i, fautes){ spans.forEach((s,j)=>{ s.classList.toggle("after", j>i); s.classList.toggle("last", j===i); if (fautes) s.classList.toggle("err", fautes.includes(j)); }); }
    function lanceChrono(debut){ clearInterval(tick); t0 = debut; tick = setInterval(()=>{ const s = (performance.now()-t0)/1000; $("#bar").style.width = Math.min(100, s/DUR*100)+"%"; if (s>=DUR && !distant) endTime(DUR); }, 200); }
    $("#go").onclick = ()=>{
      if (state==="run" || distant) return;
      if (state==="done" || state==="pick"){ reset(); return; }
      state = "run"; lanceChrono(performance.now()); $("#go").textContent = "En cours…"; $("#stop").hidden = false;
      $("#hint").textContent = "Touche les mots mal lus (un deuxième toucher annule)."; publie();
    };
    $("#stop").onclick = ()=>{ if (state==="run") endTime((performance.now()-t0)/1000); };
    function endTime(s){ clearInterval(tick); elapsed = Math.min(DUR, s); state = "pick"; $("#stop").hidden = true; $("#go").textContent = "Recommencer"; $("#hint").textContent = "Temps écoulé ! Touche le dernier mot lu."; bip(); publie(); }
    async function finish(){
      state = "done";
      const r = calcule(EP, who, elapsed, last, errs);
      const b = bilan(r);
      const ok = await Donnees.ajoute(r);
      montreResultat(r, b, ok);
      $("#hint").textContent = "Choisis un autre élève, ou appuie sur Recommencer.";
      afficheEssai(); publie();
    }
    function montreResultat(r, b, ok){ resultatAffiche={r,b,ok}; $("#res").hidden = false; $("#res").innerHTML = carteResultat(r, b, Donnees.nom(r.eleve), ok); P.querySelector(".side").scrollTop = 0; }
    function actualiseObjectif(){
      if (state==="run" || state==="pick") return;
      afficheEssai();
      if (state==="done" && resultatAffiche && !$("#res").hidden){ const {r,b,ok}=resultatAffiche; $("#res").innerHTML=carteResultat(r,b,Donnees.nom(r.eleve),ok); }
    }
    /* le téléphone mène le défi : l'écran suit */
    function recoit(d){
      if (d.etat==="repos"){ distant = false; clearInterval(tick); reset(); return; }
      distant = d.etat!=="fini";
      if (d.eleve && d.eleve!==who) choisit(d.eleve);
      $("#go").disabled = true; $("#stop").hidden = true;
      if (d.etat==="pret"){ clearInterval(tick); state = "idle"; spans.forEach(s=>s.className = "w"); $("#bar").style.width = "0"; $("#res").hidden = true; $("#hint").textContent = `${Donnees.nom(d.eleve)} se prépare. Départ sur le téléphone.`; }
      else if (d.etat==="lecture"){ if (state!=="run"){ state = "run"; spans.forEach(s=>s.className = "w"); $("#res").hidden = true; lanceChrono(performance.now()-Math.max(0, Math.min(5000, d.depuis||0))); } $("#go").textContent = "En cours…"; $("#hint").textContent = `${Donnees.nom(d.eleve)} lit. La maîtresse note sur son téléphone.`; }
      else if (d.etat==="choix"){ if (state==="run"){ clearInterval(tick); bip(); } state = "pick"; $("#bar").style.width = "100%"; $("#hint").textContent = "Temps écoulé !"; }
      else if (d.etat==="fini" && d.resultat){ clearInterval(tick); state = "done"; $("#bar").style.width = Math.min(100, d.resultat.secondes/DUR*100)+"%"; montreFin(d.resultat.dernier, d.resultat.fautes||[]);
        montreResultat(d.resultat, bilan(d.resultat), true); afficheEssai(); $("#go").textContent = "Recommencer"; $("#go").disabled = false; $("#hint").textContent = "Résultat enregistré sur le téléphone et ici."; distant = false; }
    }
    function publie(){ Defi = {ep:EP.id, etat:state, eleve:who, local:!distant && (state==="run" || state==="pick"), recoit, actualiseObjectif}; annonce(); }
    publie();
    cleanup = ()=>{ clearInterval(tick); Defi = null; };
  }

  /* 6. Les progrès sur cet épisode */
  function stepProgress(P){
    P.style.height = "auto";
    const box = el("div",{class:"grid2"});
    Donnees.eleves().forEach(st=>{
      const rs = Donnees.essaisDe(st.id, EP.id), c = el("div",{class:"card chart"});
      const durs = [...new Set(rs.flatMap(r=>Banc.motsDifficiles(r)))].slice(0,14);
      c.innerHTML = `<h3 style="font-size:20px">${esc(st.nom)}</h3><p class="muted" style="margin:2px 0 6px">${rs.length?`${rs.length} essai${rs.length>1?"s":""} sur ce texte`:"Aucun essai sur ce texte"}</p>`+
        courbe(rs.map(r=>({v:r.mclm, l:"essai "+r.essai})), Donnees.objectif(st.id), `Progrès de ${st.nom}`)+
        (durs.length?`<div class="label" style="margin-top:8px">Mots à retravailler</div><div class="hard">${durs.map(m=>`<span>${esc(m)}</span>`).join("")}</div>`:"");
      box.appendChild(c);
    });
    P.innerHTML = `<p class="lead">Les mots lus correctement par minute à chaque essai du défi, sur ce texte. Le point plein est le meilleur essai.</p>`; P.appendChild(box);
  }

  /* ---------- Clavier ---------- */
  document.addEventListener("keydown", e=>{
    if (route.name!=="episode" || !["ecran","parents"].includes(Banc.ROLE)) return;
    if (e.target.closest && e.target.closest("input")) return;
    const st = route.step||0;
    if (st>=1 && st<=3){
      if ((e.key===" " || e.key==="Enter") && e.target.closest && e.target.closest("button")) return;
      if (e.key===" "){ e.preventDefault(); if (mode==="echo" && waiting) echoNext(); else if (EP.audio) togglePlay(); }
      else if (e.key==="ArrowRight") $("#next") && $("#next").click();
      else if (e.key==="ArrowLeft") $("#prev") && $("#prev").click();
      else if (e.key==="Enter" && mode==="echo"){ e.preventDefault(); echoNext(); }
    }
  });

  /* ---------- Télécommande : ce que montre l'écran, pour le téléphone ---------- */
  let dernierEtat = "", tAnnonce = null;
  function etat(){
    const boutons = [...document.querySelectorAll("#view [data-tele], #echobar [data-tele]")].filter(b=>b.offsetParent!==null || b.closest("#echobar:not([hidden])")).map(b=>{
      const t = b.dataset.tele || b.textContent.trim();
      return {id:b.id, t, p:b.classList.contains("primary") ? 1 : 0, d:b.disabled ? 1 : 0, a:b.getAttribute("aria-pressed")==="true" ? 1 : 0, g:b.dataset.teleG||""};
    });
    const e = {vue:route.name, ep:route.id||null, etape:route.step||0, boutons, son:sonBloque ? 0 : 1};
    if (route.name==="episode" && (route.step||0)>=1 && (route.step||0)<=3) Object.assign(e, {page, pages:EP.pages.length-1, lecture:playing ? 1 : 0, attente:waiting ? 1 : 0});
    if (route.name==="episode" && route.step===0) e.mot = ($("#wd") && $("#wd").textContent) || "";
    if (Defi) e.defi = {etat:Defi.etat, eleve:Defi.eleve, local:Defi.local ? 1 : 0};
    return e;
  }
  function annonce(){ if (maison) return; clearTimeout(tAnnonce); tAnnonce = setTimeout(()=>{ const e = etat(), s = JSON.stringify(e); if (s===dernierEtat) return; dernierEtat = s; Lien.emit("ecran", e); }, 120); }
  const relance = () => { dernierEtat = ""; annonce(); };
  function commande(d){
    if (!d) return;
    if (d.nav){ const n = d.nav; if (n.vue==="episode" && ep(n.ep)) go({name:"episode", id:n.ep, step:Math.max(0, Math.min(5, n.etape|0))}); else if (["home","students","progress"].includes(n.vue)) go({name:n.vue}); return; }
    if (d.clic){ const b = document.getElementById(String(d.clic)); if (b && b.matches("[data-tele]") && !b.disabled) b.click(); return; }
    if (d.etat) relance();
  }
  function recoitDefi(d){
    if (!d || !ep(d.ep)) return;
    if (route.name!=="episode" || route.id!==d.ep || route.step!==4){ if (d.etat==="repos") return; go({name:"episode", id:d.ep, step:4}); }
    if (Defi && Defi.recoit) Defi.recoit(d);
  }

  /* ---------- Fenêtre « Relier le téléphone » ---------- */
  const L = Plateforme.Liaison;
  function majPastille(){ const on = Lien.relie(); $("#b-tel-dot").classList.toggle("on", on); $("#b-tel-txt").textContent = on ? "Téléphone relié" : "Relier le téléphone"; const f = $("#lier-etat"); if (f) f.innerHTML = on ? `<span class="dot on"></span>Téléphone relié !` : `<span class="dot"></span>En attente du téléphone…`; }
  function fenetre(){
    if (maison) return;
    const code = L.code(); if (!code) return;
    const lien = L.lienTel(code);
    const v = el("div",{class:"voile", id:"lier"});
    v.innerHTML = `<div class="fenetre" role="dialog" aria-modal="true" aria-labelledby="lier-t">
      ${lien?`<div class="qr" aria-label="QR code de liaison">${L.qr(lien, 320)}</div>`:""}
      <div><h2 id="lier-t" style="font-size:clamp(26px,3vw,38px)">Relier ton téléphone</h2>
        <ol>${lien?`<li>Vise ce QR code avec l'appareil photo du téléphone.</li><li>Touche le lien qui apparaît : la télécommande s'ouvre, déjà reliée.</li><li>Sans appareil photo : ouvre <b>${esc(lien.replace(/#.*$/,""))}</b> sur le téléphone et tape ce code :</li>`:`<li>Sur le téléphone, ouvre le site Fluence.</li><li>Tape ce code :</li>`}</ol>
        <div class="code" style="margin-top:8px">${esc(code)}</div>
        <div class="etat-lien" id="lier-etat" role="status"></div>
        <p class="muted" style="margin:14px 0 0">Les messages entre les deux appareils sont chiffrés avec ce code. Les prénoms et les résultats restent dans l'ordinateur et le téléphone.</p>
        <div class="row start" style="margin-top:16px"><button class="btn primary" id="lier-ok">Fermer</button><button class="btn" id="lier-neuf">Changer de code</button></div></div></div>`;
    document.body.appendChild(v); majPastille();
    const ferme = ()=>v.remove();
    v.addEventListener("click", e=>{ if (e.target===v) ferme(); });
    v.querySelector("#lier-ok").onclick = ferme;
    v.querySelector("#lier-neuf").onclick = async e=>{ const b = e.currentTarget; if (b.dataset.sur!=="1"){ b.dataset.sur = "1"; b.textContent = "Le téléphone devra se relier à nouveau : confirmer ?"; return; } await L.nouveau(); location.hash = ""; location.reload(); };
    v.querySelector("#lier-ok").focus();
  }
  if (!maison) $("#b-tel").addEventListener("click", fenetre);
  document.addEventListener("keydown", e=>{ if (e.key==="Escape" && $("#lier")) $("#lier").remove(); });

  async function demarre(){
    if (maison) return demarreMaison(optionsMaison);
    Donnees.surChange(q=>{ if (q==="classe" || q==="resultats"){ if (route.name==="students"){ if(q==="classe" && !document.activeElement?.closest("#f")) vueEleves(view); Banc.actualiseObjectifs(view); } else if (route.name==="progress") vueProgres(view); else if (route.name==="episode" && route.step===5) renderEpisode(); else if (route.name==="episode" && route.step===4){ if(q==="classe" && !Defi?.etat?.match(/run|pick/)) renderEpisode(); else if(q==="resultats") Defi?.actualiseObjectif?.(); } } });
    render();
    const room = await Lien.init();
    if (room){
      Lien.on("cmd", m=>commande(m.data));
      Lien.on("defi", m=>recoitDefi(m.data));
      Lien.surEtat(on=>{ majPastille(); if (on) relance(); });
      majPastille();
    } else $("#b-tel").hidden = true;
  }
  function demarreMaison(options={}){
    if (!maison) return;
    optionsMaison = options;
    reglagesLecteur = {vitesse:options.vitesse || (()=>0.8), fixeVitesse:options.fixeVitesse || (()=>{})};
    $("#app-tel").hidden = true; $("#app-ecran").hidden = false;
    document.title = "Fluence à la maison";
    $("#home-link span").textContent = "Fluence à la maison";
    document.querySelectorAll("#app-ecran [data-enseignant]").forEach(b=>b.hidden=true);
    go({name:"home"});
  }
  return { demarre, demarreMaison, go, etat, route:()=>route };
})();
window.Ecran = Ecran;

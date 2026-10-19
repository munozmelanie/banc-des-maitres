/* ---------- Le banc des maîtres : ce qui sert à l'écran de la classe comme au téléphone ---------- */
"use strict";
const Banc = (() => {
  const DATA = window.__BANC, EPS = DATA.episodes;
  const ROLE = Plateforme.role();
  document.documentElement.dataset.role = ROLE;
  const $ = s => document.querySelector(s);
  const el = (tag, attrs={}, html="") => { const e = document.createElement(tag); for (const k in attrs){ if (k==="class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html) e.innerHTML = html; return e; };
  const esc = s => String(s==null ? "" : s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const estMot = t => /[0-9A-Za-zÀ-ÖØ-öø-ÿœŒ]/.test(t);
  const nu = t => String(t).replace(/^[«“(\s ]+|[\s »”).,;:!?…]+$/g, ""); // le mot sans la ponctuation autour
  const ep = id => EPS.find(e=>e.id===id) || null;
  const estTamallette = E => E && E.collection==="tamallette-p2";
  const libelleEpisode = E => `${estTamallette(E) ? "Tamallette · texte" : "Épisode"} ${E.num}`;
  const codeEpisode = id => String(id).replace(/^E/, "É");
  const etapesEpisode = E => ["Les mots", E.audio ? "J'écoute" : "Je lis", "L'écho", "Le chœur", "Le défi", "Les progrès"];
  /* les mots du défi : toutes les pages du texte (sans le titre), dans l'ordre */
  function motsDefi(E){ const t = []; E.pages.slice(1).forEach((p,pi)=>p.toks.forEach((x,i)=>t.push({t:x[0], w:estMot(x[0]), pi, brk:i===0 && pi>0}))); return t; }
  const DUREE = () => /essai-rapide/.test(location.hash) ? 8 : 60;

  /* ---------- Données : la classe, les résultats, les réglages ----------
     Enregistrées sur l'appareil (et recopiées sur l'autre appareil à chaque liaison).
     banc/classe    : {eleves:[{id, nom, objectif}], maj}
     banc/resultats : {liste:[{id, eleve, ep, date, mclm, lus, erreurs, secondes, dernier, fautes:[n° des mots]} ou {id, suppr:true}]}
     banc/reglages  : {vitesse, maj} */
  const Donnees = (() => {
    let db = null, classe = null, resultats = {liste:[]}, reglages = {vitesse:0.8, maj:0};
    const ecoutes = new Set();
    const signale = quoi => ecoutes.forEach(f=>{ try { f(quoi); } catch(e){ console.error(e); } });
    const DEFAUT = () => ({eleves:[1,2,3,4].map(i=>({id:"e"+i, nom:"Élève "+i, objectif:""})), maj:0});
    const docs = {};
    /* sauvegarde de la première version (fichier « HORS LIGNE » de septembre, même navigateur) */
    function depuisV1(d){
      if (!d || !Array.isArray(d.students)) return null;
      const cl = {eleves:d.students.slice(0,12).map((s,i)=>({id:String(s.id||("e"+(i+1))), nom:String(s.name||("Élève "+(i+1))).slice(0,40), objectif:String(s.goal||"").replace(/[^0-9]/g,"")})), maj:Date.now()};
      const li = (Array.isArray(d.results) ? d.results : []).map(r=>({id:"v1-"+String(r.sid)+"-"+String(r.ep)+"-"+String(r.date), eleve:String(r.sid), ep:String(r.ep), date:String(r.date),
        mclm:+r.mclm||0, lus:+r.read||0, erreurs:+r.err||0, secondes:+r.secs||0}));
      return {classe:cl, resultats:{liste:li}, vitesse:+d.speed||0.8};
    }
    async function init(){
      db = await window.claude.use("db");
      docs.c = db.doc("banc/classe"); docs.r = db.doc("banc/resultats"); docs.g = db.doc("banc/reglages");
      let c = (await docs.c.get()).data(), r = (await docs.r.get()).data(), g = (await docs.g.get()).data();
      if (!c){ let v1 = null; try { v1 = depuisV1(JSON.parse(localStorage.getItem("banc-des-maitres:v1")||"null")); } catch(e){}
        if (v1 && v1.resultats.liste.length){ c = v1.classe; r = Plateforme.fusionResultats(r, v1.resultats); await docs.c.set(c); await docs.r.set(r); } }
      classe = c && Array.isArray(c.eleves) ? c : DEFAUT();
      resultats = r && Array.isArray(r.liste) ? r : {liste:[]};
      reglages = g && g.vitesse ? g : {vitesse:0.8, maj:0};
      docs.c.onSnapshot(s=>{ if (s.distant && s.exists){ classe = s.data(); signale("classe"); } });
      docs.r.onSnapshot(s=>{ if (s.distant && s.exists){ resultats = s.data(); signale("resultats"); } });
      docs.g.onSnapshot(s=>{ if (s.distant && s.exists){ reglages = s.data(); signale("reglages"); } });
    }
    const vivants = () => resultats.liste.filter(r=>!r.suppr && r.eleve && r.ep);
    /* les essais, avec leur numéro (par élève et par épisode, dans l'ordre des dates) */
    function essais(){
      const n = {};
      return vivants().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(r=>{ const k = r.eleve+"|"+r.ep; n[k] = (n[k]||0)+1; return Object.assign({essai:n[k]}, r); });
    }
    async function ecritResultats(){ try { await docs.r.set(resultats); return true; } catch(e){ return false; } }
    return { init,
      eleves:()=>classe.eleves, eleve:id=>classe.eleves.find(e=>e.id===id)||null,
      nom:id=>{ const e = classe.eleves.find(x=>x.id===id); return e ? e.nom : "Élève"; },
      async enregistreEleves(liste){ classe = {eleves:liste, maj:Date.now()}; try { await docs.c.set(classe); signale("classe"); return true; } catch(e){ return false; } },
      essais, essaisDe:(eleve, epId)=>essais().filter(r=>r.eleve===eleve && (!epId || r.ep===epId)),
      record:(eleve, sauf)=>{ const l = vivants().filter(r=>r.eleve===eleve && r.id!==sauf); return l.length ? Math.max(...l.map(r=>r.mclm)) : null; },
      async ajoute(r){ if (resultats.liste.some(x=>x.id===r.id)) return true; resultats = {liste:resultats.liste.concat([r])}; const ok = await ecritResultats(); signale("resultats"); return ok; },
      async supprime(id){ resultats = {liste:resultats.liste.filter(x=>x.id!==id).concat([{id, suppr:true, date:new Date().toISOString()}])}; const ok = await ecritResultats(); signale("resultats"); return ok; },
      vitesse:()=>reglages.vitesse||0.8,
      async fixeVitesse(v){ reglages = {vitesse:v, maj:Date.now()}; try { await docs.g.set(reglages); } catch(e){} },
      surChange(f){ ecoutes.add(f); return ()=>ecoutes.delete(f); },
      sauvegarde:()=>({format:"banc-des-maitres/sauvegarde", version:2, date:new Date().toISOString(), classe, resultats, reglages}),
      /* importer une sauvegarde : la classe du fichier remplace celle-ci, les essais s'ajoutent à ceux qui sont déjà là */
      async importe(d){
        let cl = null, re = null, vi = null;
        if (d && d.format==="banc-des-maitres/sauvegarde"){ cl = d.classe; re = d.resultats; vi = d.reglages && d.reglages.vitesse; }
        else { const v1 = depuisV1(d); if (v1){ cl = v1.classe; re = v1.resultats; vi = v1.vitesse; } }
        if (!cl || !Array.isArray(cl.eleves) || !re || !Array.isArray(re.liste)) return false;
        classe = {eleves:cl.eleves, maj:Date.now()}; resultats = Plateforme.fusionResultats(resultats, re);
        await docs.c.set(classe); await ecritResultats(); if (vi) await this.fixeVitesse(vi);
        signale("classe"); signale("resultats"); return true;
      } };
  })();

  /* ---------- liaison avec l'autre appareil ---------- */
  const Lien = (() => {
    let room = null, autres = 0;
    const etats = new Set();
    const signale = () => etats.forEach(f=>{ try { f(autres>0); } catch(e){} });
    async function init(){
      room = await window.claude.use("room");
      if (!room) return null;
      room.presence({role:ROLE});
      room.onPeers(({peers})=>{ const n = peers.filter(p=>!p.isMe && p.presence && p.presence.role && p.presence.role!==ROLE).length; if (n!==autres){ autres = n; signale(); } });
      return room;
    }
    return { init, room:()=>room, relie:()=>autres>0,
      emit:(t,d)=>room ? room.emit(t,d) : Promise.resolve(), on:(t,f)=>room ? room.on(t,f) : ()=>{},
      surEtat(f){ etats.add(f); return ()=>etats.delete(f); } };
  })();

  /* ---------- résultat d'un défi ---------- */
  function calcule(E, eleve, elapsed, dernier, fautes){
    const toks = motsDefi(E);
    const lus = toks.slice(0, dernier+1).filter(x=>x.w).length;
    const err = [...fautes].filter(i=>i<=dernier && toks[i] && toks[i].w);
    const mclm = Math.round(Math.max(0, lus-err.length)*60/Math.max(elapsed,1));
    return {id:Plateforme.rid(8), eleve, ep:E.id, date:new Date().toISOString(), mclm, lus, erreurs:err.length, secondes:Math.round(elapsed), dernier, fautes:err.sort((a,b)=>a-b)};
  }
  /* ce qu'on affiche avec un résultat : record battu, essai précédent */
  function bilan(r){
    const avant = Donnees.essais().filter(x=>x.eleve===r.eleve && x.id!==r.id && x.date<=r.date);
    const record = avant.length ? Math.max(...avant.map(x=>x.mclm)) : null;
    const memes = avant.filter(x=>x.ep===r.ep);
    return {record, precedent:memes.length ? memes[memes.length-1].mclm : null, essai:memes.length+1, nouveau:record!==null && r.mclm>record, premier:record===null};
  }
  function motsDifficiles(r){
    const E = ep(r.ep); if (!E || !Array.isArray(r.fautes)) return [];
    const toks = motsDefi(E), vus = new Set(), res = [];
    r.fautes.forEach(i=>{ const m = toks[i] && nu(toks[i].t); if (m && !vus.has(m.toLowerCase())){ vus.add(m.toLowerCase()); res.push(m); } });
    return res;
  }
  function carteResultat(r, b, nomEleve, ok){
    const objectif = (Donnees.eleve(r.eleve)||{}).objectif;
    const durs = motsDifficiles(r);
    return `<div class="label">${esc(nomEleve)} · essai ${b.essai}</div><div class="big-num">${r.mclm}</div><div class="muted">mots lus correctement par minute</div>
      ${b.nouveau?`<div class="stamp">Nouveau record !</div>`:(b.premier?`<div class="stamp">Premier essai !</div>`:"")}
      <dl class="res"><dt>Mots lus</dt><dd>${r.lus}</dd><dt>Erreurs</dt><dd>${r.erreurs}</dd><dt>Temps</dt><dd>${r.secondes} s</dd>${b.precedent!==null?`<dt>Essai précédent</dt><dd>${b.precedent}</dd>`:""}${b.record!==null?`<dt>Record avant</dt><dd>${b.record}</dd>`:""}${objectif?`<dt>Objectif</dt><dd>${esc(objectif)}</dd>`:""}</dl>
      ${durs.length?`<div class="label" style="margin-top:10px">Mots à retravailler</div><div class="hard">${durs.map(m=>`<span>${esc(m)}</span>`).join("")}</div>`:""}
      ${ok===false?`<p class="muted" style="margin:10px 0 0">Impossible d'enregistrer sur cet appareil : note le résultat.</p>`:""}`;
  }

  /* ---------- courbe des progrès ---------- */
  function courbe(points, objectif, titre){
    const W=520,H=230,L=40,R=16,T=26,B=34;
    const maxV = Math.max(60, objectif||0, ...points.map(p=>p.v))*1.15;
    const x = i => points.length<2 ? L+(W-L-R)/2 : L+i*(W-L-R)/(points.length-1);
    const y = v => T+(H-T-B)*(1-v/maxV);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}">`;
    [0, Math.round(maxV/2/10)*10, Math.round(maxV*0.9/10)*10].forEach(v=>{ s += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`; });
    if (objectif) s += `<line x1="${L}" x2="${W-R}" y1="${y(objectif)}" y2="${y(objectif)}" stroke="var(--wood)" stroke-width="2" stroke-dasharray="6 5"/><text x="${W-R}" y="${y(objectif)-6}" text-anchor="end" style="fill:var(--wood)">objectif ${objectif}</text>`;
    if (points.length){
      s += `<polyline fill="none" stroke="var(--green)" stroke-width="3" stroke-linejoin="round" points="${points.map((p,i)=>x(i)+","+y(p.v)).join(" ")}"/>`;
      const best = Math.max(...points.map(p=>p.v)), dense = points.length>9;
      points.forEach((p,i)=>{ s += `<circle cx="${x(i)}" cy="${y(p.v)}" r="${p.v===best?7:5}" fill="${p.v===best?"var(--green)":"var(--paper)"}" stroke="var(--green)" stroke-width="2.5"/>`+
        (!dense || p.v===best || i===points.length-1 ? `<text class="val" x="${x(i)}" y="${y(p.v)-12}" text-anchor="middle">${p.v}</text>` : "")+
        (!dense || i%Math.ceil(points.length/8)===0 ? `<text x="${x(i)}" y="${H-12}" text-anchor="middle">${esc(p.l)}</text>` : ""); });
    } else s += `<text x="${W/2}" y="${H/2}" text-anchor="middle">Pas encore de défi</text>`;
    return s+"</svg>";
  }

  /* ---------- vues partagées : progrès, élèves ---------- */
  function vueProgres(box, compacte){
    const es = Donnees.essais(), eleves = Donnees.eleves();
    box.innerHTML = `<h1 style="font-size:clamp(24px,3vw,40px)">Les progrès</h1><p class="lead">Le meilleur résultat de chaque élève au défi d'une minute, texte par texte (en mots lus correctement par minute). É : feuilleton · T : Tamallette P2.</p>
      <div class="tablewrap card" style="margin-top:16px"><table class="t" id="tab"></table></div><div class="grid2" id="charts"></div>
      <details class="all card" id="tous"><summary>Tous les essais (${es.length})</summary><div class="tablewrap"><table class="t" id="tab2"></table></div></details>
      <div class="row start" style="margin-top:18px"><button class="btn" id="exp">Exporter une sauvegarde</button><label class="btn" for="imp">Importer une sauvegarde</label><input type="file" id="imp" accept="application/json,.json" hidden><span class="muted" id="ioinfo"></span></div>
      <p class="muted" style="margin-top:10px">Les résultats sont enregistrés sur cet appareil${ROLE==="ecran"?" et recopiés dans le téléphone relié":" et recopiés sur l'écran de la classe relié"}. La sauvegarde est un fichier à garder en lieu sûr (clé USB, Drive).</p>`;
    const epsVus = EPS.filter(e=>!compacte || es.some(r=>r.ep===e.id));
    let h = `<thead><tr><th>Élève</th>${epsVus.map(e=>`<th class="n" title="${esc(libelleEpisode(e)+" — "+e.titre)}">${esc(codeEpisode(e.id))}</th>`).join("")}<th class="n">Objectif</th></tr></thead><tbody>`;
    eleves.forEach(st=>{ h += `<tr><td>${esc(st.nom)}</td>`+epsVus.map(e=>{ const rs = es.filter(r=>r.eleve===st.id && r.ep===e.id); return `<td class="n">${rs.length?Math.max(...rs.map(r=>r.mclm)):"—"}</td>`; }).join("")+`<td class="n">${st.objectif?esc(st.objectif):"—"}</td></tr>`; });
    box.querySelector("#tab").innerHTML = h+"</tbody>";
    eleves.forEach(st=>{
      const rs = es.filter(r=>r.eleve===st.id), c = el("div",{class:"card chart"});
      c.innerHTML = `<h3 style="font-size:20px">${esc(st.nom)}</h3><p class="muted" style="margin:2px 0 6px">Tous les défis, dans l'ordre</p>`+courbe(rs.map(r=>({v:r.mclm, l:codeEpisode(r.ep)+"·"+r.essai})), +st.objectif||0, `Progrès de ${st.nom}`);
      box.querySelector("#charts").appendChild(c);
    });
    let h2 = `<thead><tr><th>Date</th><th>Élève</th><th>Texte</th><th class="n">Essai</th><th class="n">Mots/min</th><th class="n">Erreurs</th><th></th></tr></thead><tbody>`;
    es.slice().reverse().forEach(r=>{ const d = new Date(r.date);
      h2 += `<tr><td>${d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</td><td>${esc(Donnees.nom(r.eleve))}</td><td>${esc(codeEpisode(r.ep))}</td><td class="n">${r.essai}</td><td class="n">${r.mclm}</td><td class="n">${r.erreurs}</td><td class="n"><button class="btn danger" data-suppr="${esc(r.id)}" style="min-height:40px">Supprimer</button></td></tr>`; });
    box.querySelector("#tab2").innerHTML = h2+"</tbody>";
    box.querySelector("#tab2").addEventListener("click", async e=>{ const b = e.target.closest("[data-suppr]"); if (!b) return;
      if (b.dataset.sur!=="1"){ b.dataset.sur = "1"; b.textContent = "Confirmer ?"; return; }
      await Donnees.supprime(b.dataset.suppr); vueProgres(box, compacte); box.querySelector("#tous").open = true; });
    box.querySelector("#exp").onclick = async ()=>{ const info = box.querySelector("#ioinfo");
      try { const dl = await window.claude.use("downloads"); const j = new Date().toISOString().slice(0,10);
        await dl.save({filename:`banc-des-maitres-sauvegarde-${j}.json`, data:JSON.stringify(Donnees.sauvegarde(), null, 1)}); info.textContent = "Sauvegarde enregistrée."; }
      catch(e){ info.textContent = e && e.code==="cancelled" ? "" : "La sauvegarde n'est pas possible ici."; } };
    box.querySelector("#imp").onchange = async e=>{ const f = e.target.files[0]; if (!f) return; const info = box.querySelector("#ioinfo");
      try { const ok = await Donnees.importe(JSON.parse(await f.text())); if (!ok) throw 0; vueProgres(box, compacte); box.querySelector("#ioinfo").textContent = "Sauvegarde importée."; }
      catch(err){ info.textContent = "Ce fichier n'est pas une sauvegarde de Fluence."; } };
  }
  function vueEleves(box){
    const liste = Donnees.eleves().map(e=>Object.assign({}, e));
    box.innerHTML = `<h1 style="font-size:clamp(24px,3vw,40px)">Les élèves du groupe</h1><p class="lead">Tape le prénom de chaque élève et, si tu veux, son objectif en mots par minute. Les prénoms restent dans tes appareils (l'ordinateur de la classe et ton téléphone) : ils ne sont écrits nulle part dans l'appli ni sur internet.</p>
      <form class="form" id="f" autocomplete="off"></form><div class="row start" style="margin-top:16px"><button class="btn primary" id="sv" type="button">Enregistrer</button><button class="btn" id="add" type="button">Ajouter un élève</button><span class="saved" id="ok" role="status"></span></div>`;
    const f = box.querySelector("#f");
    const lit = () => liste.forEach((s,i)=>{ s.nom = (f.querySelector("#n"+i).value.trim().slice(0,40) || `Élève ${i+1}`); s.objectif = f.querySelector("#g"+i).value.replace(/[^0-9]/g,"").slice(0,3); });
    const dessine = () => { f.innerHTML = ""; liste.forEach((s,i)=>{ f.appendChild(el("label",{for:"n"+i, class:"label"}, `Élève ${i+1}`));
      const n = el("input",{id:"n"+i, "aria-label":`Prénom de l'élève ${i+1}`, autocapitalize:"words", spellcheck:"false"}); n.value = s.nom; f.appendChild(n);
      const g = el("input",{id:"g"+i, class:"goal", inputmode:"numeric", placeholder:"objectif (mots/min)", "aria-label":`Objectif de l'élève ${i+1}`}); g.value = s.objectif||""; f.appendChild(g); }); };
    dessine();
    box.querySelector("#sv").onclick = async ()=>{ lit(); box.querySelector("#ok").textContent = await Donnees.enregistreEleves(liste) ? "Enregistré." : "Impossible d'enregistrer sur cet appareil."; };
    box.querySelector("#add").onclick = ()=>{ lit(); if (liste.length>=12) return; liste.push({id:"e"+Plateforme.rid(4), nom:`Élève ${liste.length+1}`, objectif:""}); dessine(); f.querySelector("#n"+(liste.length-1)).select(); };
  }

  let actx = null;
  function bip(){ try { actx = actx || new (window.AudioContext||window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime+.6); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime+.6); } catch(e){} }

  async function demarre(){
    await Donnees.init();
    if (ROLE==="tel"){ document.getElementById("app-tel").hidden = false; await Telephone.demarre(); }
    else { document.getElementById("app-ecran").hidden = false; await Ecran.demarre(); }
  }
  return { DATA, EPS, ROLE, $, el, esc, estMot, nu, ep, estTamallette, libelleEpisode, etapesEpisode, motsDefi, DUREE, Donnees, Lien, calcule, bilan, carteResultat, motsDifficiles, courbe, vueProgres, vueEleves, bip, demarre };
})();
window.Banc = Banc;

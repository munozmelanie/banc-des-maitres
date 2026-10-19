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
  const estDisponible = E => !!E && E.fluence!==false;
  const textesDisponibles = () => EPS.filter(estDisponible);
  const textesFamille = () => textesDisponibles().filter(E=>E.collection==="tamallette-p2" || (E.collection==="feuilleton" && Number.isFinite(Date.parse(E.ouvertureFamille))));
  const ouvertFamille = (E,maintenant=Date.now()) => estDisponible(E) && (E.collection==="tamallette-p2" || (E.collection==="feuilleton" && Number.isFinite(Date.parse(E.ouvertureFamille)) && (window.Parents?.apercuEpisodes?.()===true || maintenant>=Date.parse(E.ouvertureFamille))));
  const dateFamille = E => new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",weekday:"long",day:"numeric",month:"long"}).format(new Date(E.ouvertureFamille))+" · 16 h 30";
  const estTamallette = E => E && E.collection==="tamallette-p2";
  const libelleEpisode = E => `${estTamallette(E) ? "Tamallette · texte" : "Épisode"} ${E.num}`;
  const codeEpisode = id => String(id).replace(/^E/, "É");
  const etapesEpisode = E => ["Les mots", E.audio ? "J'écoute" : "Je lis", "L'écho", "Le chœur", "Le défi", "Les progrès"];
  /* les mots du défi : toutes les pages du texte (sans le titre), dans l'ordre */
  function motsDefi(E){
    const t = [], ruptures = new Map((E.layout?.breaks||[]).map(b=>[b.at,b.kind]));
    E.pages.slice(1).forEach((p,pi)=>p.toks.forEach((x,i)=>{
      const rupture = E.layout ? (t.length ? ruptures.get(t.length)||null : null) : (i===0 && pi>0 ? "paragraph" : null);
      t.push({t:x[0], w:estMot(x[0]), pi, brk:!!rupture, rupture});
    }));
    return t;
  }
  function ajouteRupture(box, mot){
    const genre = mot.rupture || (mot.brk ? "paragraph" : null);
    if (!genre) return;
    box.appendChild(el("br",{class:"texte-retour", "data-rupture":genre}));
    if (genre==="paragraph" || genre==="stanza") box.appendChild(el("span",{class:"texte-espace", "aria-hidden":"true"}));
  }
  const DUREE = () => /essai-rapide/.test(location.hash) ? 8 : 60;

  /* Import de classe : lecture locale uniquement ; aucun identifiant du fichier n'est repris. */
  const ImportClasse = (() => {
    const MAX_OCTETS = 1024 * 1024, MAX_ELEVES = 100;
    const cleNom = s => String(s).normalize("NFC").trim().replace(/\s+/g," ").toLocaleLowerCase("fr");
    const cleColonne = s => cleNom(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[ _-]/g,"");
    const inactif = v => v === false || v === 0 || /^(false|non|no|0|inactif)$/i.test(String(v).trim());
    function nomValide(v){
      if (typeof v !== "string") throw new Error("Chaque élève doit avoir un prénom ou un nom sous forme de texte.");
      const s = v.normalize("NFC").trim().replace(/\s+/g," ");
      if (s.length > 80) throw new Error("Un nom dépasse 80 caractères. Raccourcis-le avant d'importer.");
      if (s && (!/\p{L}/u.test(s) || /[<>\uFFFD\x00-\x1f\x7f]/.test(s))) throw new Error("Un nom contient des caractères non valides. Vérifie le fichier.");
      return s;
    }
    function objectifValide(v){
      if (v == null || String(v).trim() === "") return "";
      const s = String(v).trim();
      if (!/^\d{1,3}$/.test(s)) throw new Error("L'objectif doit être un nombre entier entre 0 et 999, ou rester vide.");
      return String(+s);
    }
    function objet(x){
      if (typeof x === "string") return {nom:nomValide(x), objectif:""};
      if (!x || typeof x !== "object" || Array.isArray(x)) throw new Error("Le fichier doit contenir une liste de noms ou d'élèves.");
      const d = {}; Object.keys(x).forEach(k => { d[cleColonne(k)] = x[k]; });
      if (inactif(d.actif) || inactif(d.active)) return null;
      if (!["prenom","nom","name"].some(k => Object.prototype.hasOwnProperty.call(d,k))) throw new Error("Une ligne n'a pas de colonne Prénom ou Nom.");
      const prenom = d.prenom == null ? "" : nomValide(d.prenom);
      const nom = d.nom == null ? "" : nomValide(d.nom);
      const complet = prenom ? nomValide(prenom + (nom ? " " + nom : "")) : (nom || (d.name == null ? "" : nomValide(d.name)));
      return {nom:complet, objectif:complet ? objectifValide(d.objectif ?? d.goal) : ""};
    }
    function nettoie(lignes){
      const eleves = [], vus = new Set(); let ignores = 0, doublons = 0;
      for (const ligne of lignes){
        const e = objet(ligne);
        if (!e || !e.nom){ ignores++; continue; }
        const cle = cleNom(e.nom); if (vus.has(cle)){ doublons++; continue; }
        vus.add(cle); eleves.push(e);
        if (eleves.length > MAX_ELEVES) throw new Error("La liste dépasse 100 élèves. Réduis-la avant d'importer.");
      }
      if (!eleves.length) throw new Error("Aucun élève actif avec un nom n'a été trouvé dans ce fichier.");
      return {eleves, ignores, doublons};
    }
    function csv(texte, sep){
      const lignes = []; let ligne = [], champ = "", cite = false, ferme = false;
      const ajoute = () => { ligne.push(champ); champ = ""; ferme = false; };
      for (let i=0; i<texte.length; i++){
        const c = texte[i];
        if (cite){ if (c==='"'){ if (texte[i+1]==='"'){ champ+='"'; i++; } else { cite=false; ferme=true; } } else champ+=c; continue; }
        if (c===sep){ ajoute(); continue; }
        if (c==='\r' || c==='\n'){ if (c==='\r' && texte[i+1]==='\n') i++; ajoute(); lignes.push(ligne); ligne=[]; continue; }
        if (ferme){ if (/\s/.test(c)) continue; throw new Error("CSV non valide : un caractère suit un guillemet fermé."); }
        if (c==='"'){ if (champ.trim()) throw new Error("CSV non valide : vérifie les guillemets."); champ=""; cite=true; }
        else champ+=c;
      }
      if (cite) throw new Error("CSV non valide : un guillemet n'est pas fermé.");
      ajoute(); lignes.push(ligne);
      return lignes.filter(l=>l.some(c=>c.trim()));
    }
    function lit(texte, fichier=""){
      if (typeof texte !== "string" || new TextEncoder().encode(texte).length > MAX_OCTETS) throw new Error("Le fichier doit faire au maximum 1 Mo.");
      const ext = fichier.split(".").pop().toLowerCase();
      if (fichier && !["csv","tsv","txt","json"].includes(ext)) throw new Error("Choisis un fichier CSV, TXT, TSV ou JSON. Exporte d'abord les fichiers Excel ou PDF dans l'un de ces formats.");
      const t = texte.replace(/^\uFEFF/,"").replace(/^(?:[ \t]*(?:\r\n|\n|\r))+/g,""), contenu = t.trim();
      if (!contenu) throw new Error("Le fichier est vide.");
      if (ext === "json" || /^[\[{]/.test(contenu)){
        let d; try { d=JSON.parse(contenu); } catch(e){ throw new Error("JSON non valide : vérifie le fichier ou refais son export."); }
        const lignes = Array.isArray(d) ? d : (d && d.classe && d.classe.eleves) || (d && d.eleves);
        if (!Array.isArray(lignes)) throw new Error("Ce JSON ne contient pas de liste d'élèves (tableau de noms ou classe.eleves).");
        return nettoie(lignes);
      }
      if (/^</.test(contenu) || /\uFFFD/.test(t)) throw new Error("Ce fichier n'est pas une liste de classe lisible. Exporte-le en texte UTF-8.");
      let cite = false; const counts = {";":0, ",":0, "\t":0};
      for (let i=0;i<t.length;i++){ const c=t[i]; if(c==='"'){ if(cite && t[i+1]==='"') i++; else cite=!cite; } else if(!cite){ if(c==='\r'||c==='\n') break; if(c in counts) counts[c]++; } }
      const sep = Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
      const lignes = csv(t, counts[sep] ? sep : "\u0000");
      const entetes = lignes[0].map(cleColonne), connus = ["prenom","nom","name"];
      const aEntete = entetes.some(c=>connus.includes(c));
      if (!aEntete){
        if (lignes.some(l=>l.length!==1)) throw new Error("Pour plusieurs colonnes, ajoute une première ligne Prénom, Nom et éventuellement Objectif.");
        return nettoie(lignes.map(l=>l[0]));
      }
      if (new Set(entetes).size!==entetes.length) throw new Error("Deux colonnes ont le même titre. Vérifie la première ligne.");
      return nettoie(lignes.slice(1).map(l=>{
        if(l.length!==entetes.length) throw new Error("Une ligne n'a pas le même nombre de colonnes que l'en-tête.");
        const d={};entetes.forEach((k,i)=>{d[k]=l[i];});return d;
      }));
    }
    function estDefaut(liste){ return liste.length>0 && liste.every((e,i)=>e.id==="e"+(i+1) && e.nom==="Élève "+(i+1) && String(e.objectif ?? "").trim()===""); }
    function fusion(existants, importes, options={}){
      const candidats = nettoie(importes).eleves, remplaceDefaut = !!options.remplaceDefaut && estDefaut(existants);
      const eleves = (remplaceDefaut ? [] : existants).map(e=>({...e}));
      const noms = new Set(eleves.map(e=>cleNom(e.nom))), ids = new Set(eleves.map(e=>e.id)); let ajoutes=0, reconnus=0;
      candidats.forEach(e=>{
        if(noms.has(cleNom(e.nom))){ reconnus++; return; }
        let id; do { id="e"+Plateforme.rid(8); } while(ids.has(id));
        eleves.push({id,nom:e.nom,objectif:e.objectif}); ids.add(id); noms.add(cleNom(e.nom)); ajoutes++;
      });
      if(eleves.length>MAX_ELEVES) throw new Error("L'import porterait la classe à plus de 100 élèves. Aucun changement n'a été enregistré.");
      return {eleves,ajoutes,reconnus,remplaceDefaut};
    }
    return {lit, fusion, nettoie, estDefaut, valideNom:nomValide, valideObjectif:objectifValide, MAX_OCTETS, MAX_ELEVES};
  })();

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
      const cl = {eleves:d.students.map((s,i)=>({id:String(s.id||("e"+(i+1))), nom:String(s.name||("Élève "+(i+1))), objectif:String(s.goal??"").replace(/[^0-9]/g,"")})), maj:Date.now()};
      const li = (Array.isArray(d.results) ? d.results : []).map(r=>({id:"v1-"+String(r.sid)+"-"+String(r.ep)+"-"+String(r.date), eleve:String(r.sid), ep:String(r.ep), date:String(r.date),
        mclm:+r.mclm||0, lus:+r.read||0, erreurs:+r.err||0, secondes:+r.secs||0}));
      return {classe:cl, resultats:{liste:li}, vitesse:+d.speed||0.8};
    }
    async function init(){
      if (ROLE==="parents") throw new Error("Les données de classe ne sont pas accessibles dans l'espace parents.");
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
    const valides = () => resultats.liste.filter(r=>!r.suppr && r.eleve && r.ep);
    const vivants = () => valides().filter(r=>r.origine!=="maison");
    /* Un champ vide signifie automatique. Calcul pur : aucune écriture de classe,
       aucun effet sur les essais ; les mêmes résultats donnent le même objectif. */
    function objectifInfo(id, manuel){
      const eleve = classe?.eleves.find(e=>e.id===id);
      if (!eleve) return {valeur:null, mode:"attente", reference:null};
      const saisie = String(manuel===undefined ? (eleve.objectif ?? "") : manuel).trim();
      if (saisie!=="" && /^\d+$/.test(saisie) && Number.isSafeInteger(+saisie)) return {valeur:+saisie, mode:"manuel", reference:null};
      const meilleur = valides().filter(r=>r.eleve===id && typeof r.id==="string" && ep(r.ep) && (r.origine==null || r.origine==="classe" || r.origine==="maison") && Number.isSafeInteger(r.mclm) && r.mclm>=0 && r.mclm<=60000 && typeof r.date==="string" && Number.isFinite(Date.parse(r.date)))
        .sort((a,b)=>b.mclm-a.mclm || Date.parse(a.date)-Date.parse(b.date) || (a.id<b.id ? -1 : a.id>b.id ? 1 : 0))[0];
      if (!meilleur) return {valeur:null, mode:"attente", reference:null};
      return {valeur:meilleur.mclm+Math.max(5,Math.ceil(meilleur.mclm/10)), mode:"automatique", reference:{id:meilleur.id,date:meilleur.date,mclm:meilleur.mclm}};
    }
    /* les essais, avec leur numéro (par élève et par épisode, dans l'ordre des dates) */
    function essais(){
      const n = {};
      return vivants().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(r=>{ const k = r.eleve+"|"+r.ep; n[k] = (n[k]||0)+1; return Object.assign({essai:n[k]}, r); });
    }
    /* La vue Progrès ne mélange jamais les lectures de classe et de maison.
       L'objectif, lui, reste celui de l'élève, toutes origines confondues. */
    function progres(eleve, origine="classe", texte=""){
      const temps = r => Number.isFinite(Date.parse(r.date)) ? Date.parse(r.date) : Number.MAX_SAFE_INTEGER;
      const n = Object.create(null);
      const lectures = valides().filter(r=>r.eleve===eleve && (origine==="maison" ? r.origine==="maison" : r.origine==null || r.origine==="classe"))
        .sort((a,b)=>temps(a)-temps(b) || (String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0))
        .map(r=>({...r,essai:n[r.ep]=(n[r.ep]||0)+1})).filter(r=>!texte || r.ep===texte);
      const mesures = lectures.filter(r=>Number.isSafeInteger(r.mclm) && r.mclm>=0 && Number.isFinite(Date.parse(r.date)));
      return {lectures,mesures,nombre:lectures.length,dernier:mesures.length?mesures[mesures.length-1].mclm:null,
        meilleur:mesures.length?Math.max(...mesures.map(r=>r.mclm)):null,
        evolution:mesures.length>1?mesures[mesures.length-1].mclm-mesures[0].mclm:null,objectif:objectifInfo(eleve)};
    }
    async function ecritResultats(suivants=resultats){
      try {
        await docs.r.set(suivants);
        const confirmes=(await docs.r.get()).data();
        resultats=Plateforme.fusionResultats(resultats,confirmes);
        return true;
      } catch(e){ return false; }
    }
    return { init, progres, objectifInfo, objectif:id=>objectifInfo(id).valeur,
      eleves:()=>classe.eleves, eleve:id=>classe.eleves.find(e=>e.id===id)||null,
      nom:id=>{ const e = classe.eleves.find(x=>x.id===id); return e ? e.nom : "Élève"; },
      async enregistreEleves(liste){ const nouvelle = {eleves:liste, maj:Date.now()}; try { await docs.c.set(nouvelle); classe = nouvelle; signale("classe"); return true; } catch(e){ return false; } },
      sansEssais:()=>resultats.liste.length===0,
      essais, essaisDe:(eleve, epId)=>essais().filter(r=>r.eleve===eleve && (!epId || r.ep===epId)),
      essaisMaison:()=>valides().filter(r=>r.origine==="maison").sort((a,b)=>String(a.date).localeCompare(String(b.date))),
      contientResultat:id=>resultats.liste.some(r=>r.id===id),
      contientBilan:(sourceId,eleve)=>resultats.liste.some(r=>r.origine==="maison"&&r.sourceId===sourceId&&(eleve===undefined||r.eleve===eleve)),
      record:(eleve, sauf)=>{ const l = vivants().filter(r=>r.eleve===eleve && r.id!==sauf); return l.length ? Math.max(...l.map(r=>r.mclm)) : null; },
      async ajoute(r){ if (resultats.liste.some(x=>x.id===r.id)) return true; const ok = await ecritResultats({liste:resultats.liste.concat([r])}); if(ok) signale("resultats"); return ok; },
      async supprime(id){ const avant=resultats.liste.find(x=>x.id===id), marque={id,suppr:true,date:new Date().toISOString()}; if(avant?.origine==="maison")Object.assign(marque,{origine:"maison",sourceId:avant.sourceId,eleve:avant.eleve}); const ok = await ecritResultats({liste:resultats.liste.filter(x=>x.id!==id).concat([marque])}); if(ok) signale("resultats"); return ok; },
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
        classe = {eleves:cl.eleves, maj:Date.now()}; const suivants = Plateforme.fusionResultats(resultats, re);
        await docs.c.set(classe); if(!await ecritResultats(suivants)){signale("classe");return false;} if (vi) await this.fixeVitesse(vi);
        signale("classe"); signale("resultats"); return true;
      } };
  })();

  /* ---------- liaison avec l'autre appareil ---------- */
  const Lien = (() => {
    let room = null, autres = 0;
    const etats = new Set();
    const signale = () => etats.forEach(f=>{ try { f(autres>0); } catch(e){} });
    async function init(){
      if (ROLE==="parents") return null;
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
    const cible = Donnees.objectifInfo(r.eleve), objectif = cible.valeur;
    const durs = motsDifficiles(r);
    return `<div class="label">${esc(nomEleve)} · essai ${b.essai}</div><div class="big-num">${r.mclm}</div><div class="muted">mots lus correctement par minute</div>
      ${b.nouveau?`<div class="stamp">Nouveau record !</div>`:(b.premier?`<div class="stamp">Premier essai !</div>`:"")}
      <dl class="res"><dt>Mots lus</dt><dd>${r.lus}</dd><dt>Erreurs</dt><dd>${r.erreurs}</dd><dt>Temps</dt><dd>${r.secondes} s</dd>${b.precedent!==null?`<dt>Essai précédent</dt><dd>${b.precedent}</dd>`:""}${b.record!==null?`<dt>Record avant</dt><dd>${b.record}</dd>`:""}${objectif!==null?`<dt>Objectif${cible.mode==="automatique"?" automatique":""}</dt><dd>${esc(objectif)}</dd>`:""}</dl>
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
    if (Number.isFinite(objectif) && objectif>=0) s += `<line x1="${L}" x2="${W-R}" y1="${y(objectif)}" y2="${y(objectif)}" stroke="var(--wood)" stroke-width="2" stroke-dasharray="6 5"/><text x="${W-R}" y="${y(objectif)-6}" text-anchor="end" style="fill:var(--wood)">objectif ${objectif}</text>`;
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
  const etatsProgres = new WeakMap();
  const dateProgres = (date, courte=false) => Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString("fr-FR",courte?{day:"numeric",month:"numeric"}:{day:"numeric",month:"long",year:"numeric"}) : "Date non précisée";
  const titreProgres = r => ep(r.ep)?.titre || r.ep;
  function grapheProgres(rs, objectif, petit){
    const W=petit?360:760,H=petit?250:285,L=42,R=24,T=24,B=42;
    const plafond=Math.max(20,Number.isFinite(objectif)?objectif:0,...rs.map(r=>r.mclm));
    const pas=Math.max(5,Math.ceil(plafond/4/5)*5),max=pas*4;
    const x=i=>rs.length<2?L+(W-L-R)/2:L+i*(W-L-R)/(rs.length-1),y=v=>H-B-(H-B-T)*v/max;
    let h=`<svg id="progression-graphe" viewBox="0 0 ${W} ${H}" role="group" aria-label="Progression en mots lus correctement par minute, dans l’ordre des lectures"><defs><linearGradient id="progression-degrade" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--green)" stop-opacity=".22"/><stop offset="100%" stop-color="var(--green)" stop-opacity=".015"/></linearGradient></defs>`;
    for(let i=0;i<=4;i++){const v=i*pas;h+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" class="progression-grille"/><text x="${L-10}" y="${y(v)+5}" text-anchor="end">${v}</text>`;}
    if(Number.isFinite(objectif))h+=`<line x1="${L}" x2="${W-R}" y1="${y(objectif)}" y2="${y(objectif)}" class="progression-ligne-objectif"/>`;
    if(rs.length){
      const points=rs.map((r,i)=>`${x(i)},${y(r.mclm)}`).join(" ");
      if(rs.length>1)h+=`<polygon points="${x(0)},${H-B} ${points} ${x(rs.length-1)},${H-B}" fill="url(#progression-degrade)"/><polyline points="${points}" class="progression-trace"/>`;
      const intervalles=Math.min(rs.length-1,petit?3:5),etiquettes=new Set(Array.from({length:intervalles+1},(_,i)=>intervalles?Math.round(i*(rs.length-1)/intervalles):0));
      rs.forEach((r,i)=>{
        const label=`${dateProgres(r.date)} · ${titreProgres(r)} · ${r.mclm} MCLM`;
        h+=`<g class="progression-point" role="button" tabindex="0" data-progress-point="${esc(r.id)}" aria-label="${esc(label+". Consulter cette lecture.")}"><title>${esc(label)}</title><circle cx="${x(i)}" cy="${y(r.mclm)}" r="20" fill="transparent"/><circle class="progression-point-visible" cx="${x(i)}" cy="${y(r.mclm)}" r="${i===rs.length-1?6:4.5}"/></g>`;
        if(etiquettes.has(i))h+=`<text x="${x(i)}" y="${H-14}" text-anchor="${i===0&&rs.length>1?"start":i===rs.length-1&&rs.length>1?"end":"middle"}">${esc(dateProgres(r.date,true))}</text>`;
      });
    }
    return h+"</svg>";
  }
  function vueProgres(box, compacte){
    if(ROLE==="parents")return;
    const ancien=box.querySelector("#progression"),scroller=box.closest("main"),scroll=scroller?.scrollTop||0;
    const actif=box.contains(document.activeElement)?document.activeElement:null;
    const focus=actif&&["progression-recherche","progression-texte"].includes(actif.id)?{id:actif.id,debut:actif.selectionStart,fin:actif.selectionEnd}:null;
    const etat=etatsProgres.get(box)||{origine:"classe",eleve:"",texte:"",recherche:"",ouverts:new Set(),tous:true};
    if(ancien){etat.ouverts=new Set([...box.querySelectorAll("[data-progress-lecture][open]")].map(d=>d.dataset.progressLecture));etat.tous=box.querySelector("#tous")?.open??etat.tous;}
    etatsProgres.set(box,etat);
    const eleves=Donnees.eleves(),st=eleves.find(e=>e.id===etat.eleve);
    if(!st)etat.eleve="";
    const foyer=etat.origine==="maison",lieu=foyer?"À la maison":"En classe",p=st?Donnees.progres(st.id,etat.origine,etat.texte):null;
    const lettres=nom=>Array.from(String(nom).trim()).slice(0,1).join("").toLocaleUpperCase("fr");
    const score=v=>v===null?"—":String(v);
    const normalise=t=>String(t).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr");
    box.innerHTML=`<section id="progression" class="progression${st?" progression-selection":""}">
      <div class="progression-entete"><div><p class="progression-surtitre">SUIVI DES LECTURES</p><h1>Les progrès</h1><p class="muted">La progression de chaque élève, lecture après lecture.</p></div><div id="progression-acces"></div></div>
      <div class="progression-origines" role="group" aria-label="Lieu de lecture"><button type="button" data-progress-origine="classe" aria-pressed="${!foyer}"><span aria-hidden="true">${'<svg viewBox="0 0 24 24"><path d="M3 9 12 3l9 6M5 8v12h14V8M9 20v-6h6v6M10 9h4"/>'}</svg></span>En classe</button><button type="button" data-progress-origine="maison" aria-pressed="${foyer}"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 11 9-8 9 8M5 9v12h14V9M9 21v-7h6v7"/></svg></span>À la maison</button></div>
      <div class="progression-contenu"><aside class="progression-liste"><div class="progression-liste-titre"><h2>Les élèves</h2><span>${eleves.length}</span></div><label class="progression-recherche" for="progression-recherche"><span class="sr-only">Rechercher un élève</span><input id="progression-recherche" type="search" autocomplete="off" placeholder="Rechercher un élève" value="${esc(etat.recherche)}"></label><div id="progression-eleves">
      ${eleves.map(e=>{const a=Donnees.progres(e.id,etat.origine);return `<button type="button" class="progression-eleve" data-progress-eleve="${esc(e.id)}" aria-pressed="${etat.eleve===e.id}"${normalise(e.nom).includes(normalise(etat.recherche))?"":" hidden"}><span class="progression-avatar" aria-hidden="true">${esc(lettres(e.nom))}</span><span class="progression-eleve-nom">${esc(e.nom)}<small>${a.nombre?`${a.nombre} lecture${a.nombre>1?"s":""}`:"Aucune lecture"}</small></span><span class="progression-eleve-score">${score(a.dernier)}${a.dernier!==null?"<small>MCLM</small>":""}</span></button>`;}).join("")}
      </div><p class="muted progression-aucun-eleve" id="progression-recherche-vide" hidden>Aucun élève trouvé.</p>${!eleves.length?'<p class="muted">Ajoute les élèves depuis l’onglet Élèves.</p>':""}</aside>
      <div class="progression-detail" id="progression-detail">${st?`<button class="btn progression-retour" id="progression-retour" type="button">← Tous les élèves</button><section class="progression-carte"><div class="progression-fiche-entete"><div><p class="progression-surtitre">${lieu}</p><h2 id="progression-titre" tabindex="-1">${esc(st.nom)}</h2></div><div class="progression-objectif" id="progression-objectif">${p.objectif.valeur!==null?`<span>Objectif${p.objectif.mode==="automatique"?" automatique":" manuel"}</span><strong><span data-progress-objectif-valeur>${esc(p.objectif.valeur)}</span> <small>MCLM</small></strong>`:"<span>Objectif automatique</span><strong class=\"progression-objectif-attente\">Après la première lecture</strong>"}</div></div>
      <div class="progression-filtre"><label for="progression-texte">Texte</label><select id="progression-texte"><option value="">Tous les textes</option>${EPS.filter(e=>estDisponible(e)||Donnees.progres(st.id,etat.origine).lectures.some(r=>r.ep===e.id)).map(e=>`<option value="${esc(e.id)}"${etat.texte===e.id?" selected":""}>${esc(e.titre)}</option>`).join("")}</select></div>
      <div class="progression-stats"><div><span>Dernière lecture</span><strong data-progress-stat="dernier">${score(p.dernier)}</strong><small>MCLM</small></div><div><span>Meilleur résultat</span><strong data-progress-stat="meilleur">${score(p.meilleur)}</strong><small>MCLM</small></div><div><span>Depuis la première</span><strong data-progress-stat="evolution" class="${p.evolution>0?"progression-hausse":""}">${p.evolution===null?"—":(p.evolution>0?"+":"")+p.evolution}</strong><small>MCLM</small></div><div><span>Lectures</span><strong data-progress-stat="lectures">${p.nombre}</strong><small>${lieu.toLocaleLowerCase("fr")}</small></div></div>
      <div class="progression-graphique"><div class="progression-legende"><span><i></i> Mots corrects par minute</span>${p.objectif.valeur!==null?'<span><i class="progression-tiret"></i> Objectif</span>':""}</div>${p.mesures.length?grapheProgres(p.mesures,p.objectif.valeur,compacte||innerWidth<680):`<div class="progression-vide"><span aria-hidden="true">↗</span><h3>${p.nombre?"Pas encore de mesure à tracer":"Pas encore de lecture"}</h3><p>${etat.texte?"Aucune lecture pour ce texte":"Les lectures "+(foyer?"faites à la maison":"faites en classe")} ${p.nombre?"avec un score et une date valides.":etat.texte?" "+lieu.toLocaleLowerCase("fr")+".":"apparaîtront ici."}</p></div>`}</div><p class="progression-note">${etat.texte?"Lectures de ce texte, dans l’ordre chronologique.":"Plusieurs textes peuvent avoir des difficultés différentes. Choisis un texte pour comparer ses lectures."}${foyer?" Bilans déclarés par la famille.":""}</p>
      </section><details class="progression-carte progression-lectures" id="tous"${etat.tous?" open":""}><summary>Les lectures <span>${p.nombre}</span></summary><div id="progression-lectures">${p.lectures.length?p.lectures.slice().reverse().map(r=>{const durs=motsDifficiles(r);return `<details class="progression-lecture" data-progress-lecture="${esc(r.id)}"${etat.ouverts.has(r.id)?" open":""}><summary><span class="progression-lecture-texte">${esc(titreProgres(r))}<small>${esc(dateProgres(r.date))} · lecture ${r.essai}</small></span><span class="progression-lecture-score">${Number.isSafeInteger(r.mclm)&&r.mclm>=0?r.mclm:"—"}<small>MCLM</small></span></summary><div class="progression-lecture-detail"><dl><div><dt>Mots lus</dt><dd>${esc(r.lus??"—")}</dd></div><div><dt>Erreurs</dt><dd>${esc(r.erreurs??"—")}</dd></div><div><dt>Temps</dt><dd>${esc(r.secondes??"—")} s</dd></div></dl>${durs.length?`<p class="label">Mots à retravailler</p><div class="hard">${durs.map(m=>`<span>${esc(m)}</span>`).join("")}</div>`:""}<button type="button" class="btn danger" data-suppr="${esc(r.id)}">Supprimer cette lecture</button><p class="muted progression-suppression-info" role="status"></p></div></details>`;}).join(""):'<p class="muted">Les prochaines lectures seront consultables ici.</p>'}</div></details>`:`<section class="progression-carte progression-bienvenue"><div class="progression-bienvenue-icone" aria-hidden="true"><svg viewBox="0 0 80 80"><path d="M14 60h54M18 54V38m18 16V27m18 27V15"/><path class="progression-fleche" d="m17 28 18-13 15 3 17-12m-10 0h10v10"/></svg></div><h2>Choisis un élève</h2><p>Retrouve ses lectures ${foyer?"à la maison":"en classe"},<br>ses progrès et son objectif.</p></section>`}</div></div>
      <details class="progression-sauvegarde"><summary>Sauvegarder ou restaurer les données</summary><div class="row start"><button class="btn" id="exp" type="button">Exporter une sauvegarde</button><button class="btn" id="progression-importer" type="button">Importer une sauvegarde</button><input type="file" id="imp" accept="application/json,.json" hidden></div><p class="muted" id="ioinfo" role="status"></p><p class="muted">La sauvegarde contient tous les élèves et toutes les lectures, en classe et à la maison.</p></details></section>`;
    box.querySelectorAll("[data-progress-origine]").forEach(b=>b.onclick=()=>{etat.origine=b.dataset.progressOrigine;vueProgres(box,compacte);box.querySelector(`[data-progress-origine="${etat.origine}"]`).focus({preventScroll:true});});
    box.querySelectorAll("[data-progress-eleve]").forEach(b=>b.onclick=()=>{etat.eleve=b.dataset.progressEleve;vueProgres(box,compacte);box.querySelector("#progression-titre")?.focus({preventScroll:true});if(innerWidth<760)scroller?.scrollTo({top:0});});
    const retour=box.querySelector("#progression-retour");if(retour)retour.onclick=()=>{const id=etat.eleve;etat.eleve="";vueProgres(box,compacte);[...box.querySelectorAll("[data-progress-eleve]")].find(b=>b.dataset.progressEleve===id)?.focus();};
    const filtre=box.querySelector("#progression-texte");if(filtre)filtre.onchange=()=>{etat.texte=filtre.value;vueProgres(box,compacte);box.querySelector("#progression-texte").focus({preventScroll:true});};
    const recherche=box.querySelector("#progression-recherche"),cherche=()=>{etat.recherche=recherche.value;let visibles=0;box.querySelectorAll("[data-progress-eleve]").forEach(b=>{b.hidden=!normalise(Donnees.nom(b.dataset.progressEleve)).includes(normalise(etat.recherche));if(!b.hidden)visibles++;});box.querySelector("#progression-recherche-vide").hidden=visibles>0 || !eleves.length;};
    recherche.oninput=cherche;cherche();
    function ouvreLecture(id){const d=[...box.querySelectorAll("[data-progress-lecture]")].find(d=>d.dataset.progressLecture===id);if(!d)return;box.querySelector("#tous").open=true;d.open=true;d.querySelector("summary").focus({preventScroll:true});d.scrollIntoView({block:"nearest",behavior:"smooth"});}
    box.querySelectorAll("[data-progress-point]").forEach(point=>{point.onclick=()=>ouvreLecture(point.dataset.progressPoint);point.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();ouvreLecture(point.dataset.progressPoint);}};});
    box.querySelectorAll("[data-suppr]").forEach(b=>b.onclick=async()=>{
      if(b.dataset.sur!=="1"){b.dataset.sur="1";b.textContent="Confirmer la suppression ?";return;}
      b.disabled=true;const ok=await Donnees.supprime(b.dataset.suppr);
      if(!ok){b.disabled=false;b.dataset.sur="";b.textContent="Supprimer cette lecture";b.nextElementSibling.textContent="La suppression n’a pas été enregistrée. Réessaie.";return;}
      if(box.querySelector("#progression"))vueProgres(box,compacte);
    });
    box.querySelector("#exp").onclick=async()=>{const info=box.querySelector("#ioinfo");try{const dl=await window.claude.use("downloads"),j=new Date().toISOString().slice(0,10);await dl.save({filename:`banc-des-maitres-sauvegarde-${j}.json`,data:JSON.stringify(Donnees.sauvegarde(),null,1)});info.textContent="Sauvegarde enregistrée.";}catch(e){info.textContent=e?.code==="cancelled"?"":"La sauvegarde n’est pas possible ici.";}};
    box.querySelector("#progression-importer").onclick=()=>box.querySelector("#imp").click();
    box.querySelector("#imp").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(!await Donnees.importe(JSON.parse(await f.text())))throw Error();vueProgres(box,compacte);box.querySelector(".progression-sauvegarde").open=true;box.querySelector("#ioinfo").textContent="Sauvegarde importée.";}catch(e){const info=box.querySelector("#ioinfo");if(info)info.textContent="Ce fichier n’a pas pu être importé. Vérifie la sauvegarde et le stockage de cet appareil.";}};
    EnvoiMaison.ajouteBouton(box);
    const acces=box.querySelector("#acces-parents");if(acces)box.querySelector("#progression-acces").appendChild(acces);
    if(ancien&&scroller)scroller.scrollTop=scroll;
    if(focus){const champ=box.querySelector("#"+focus.id);if(champ){champ.focus({preventScroll:true});if(focus.debut!==null)champ.setSelectionRange?.(focus.debut,focus.fin);}}
  }
  function actualiseObjectifs(box){
    box.querySelectorAll("[data-objectif-info]").forEach(info=>{
      const champ=box.querySelector("#"+info.dataset.champ), cible=Donnees.objectifInfo(info.dataset.objectifInfo,champ.value);
      info.textContent=champ.value.trim()!=="" ? "Objectif manuel" : cible.valeur===null ? "Après la première lecture" : `Automatique : ${cible.valeur} MCLM`;
      info.title=cible.reference ? `Meilleur score valide : ${cible.reference.mclm} MCLM, le ${new Date(cible.reference.date).toLocaleDateString("fr-FR")}` : "";
      champ.placeholder=cible.mode==="automatique" ? `Auto : ${cible.valeur}` : "Automatique";
    });
  }
  function vueEleves(box){
    /* Une copie reçue du téléphone ne doit pas effacer une prévisualisation en cours. */
    if (box.querySelector("#import-classe-apercu:not([hidden])")) return;
    const liste = Donnees.eleves().map(e=>Object.assign({}, e));
    const originaux = new Map(liste.map(e=>[e.id,{...e}]));
    box.innerHTML = `<h1 style="font-size:clamp(24px,3vw,40px)">Les élèves de la classe</h1><p class="lead">Tape le prénom de chaque élève. Laisse son objectif vide pour le calcul automatique, ou saisis une valeur manuelle. Les prénoms sont enregistrés dans tes appareils et échangés par une liaison chiffrée ; ils ne sont pas publiés.</p>
      <div class="row start" style="margin-top:16px"><button class="btn" id="import-classe-choisir" type="button">Importer une liste de classe</button><input type="file" id="import-classe-file" accept=".csv,.txt,.tsv,.json,text/csv,text/plain,application/json" hidden></div>
      <p class="muted" style="margin:8px 0 0">CSV, TXT ou JSON, jusqu'à 100 élèves et 1 Mo. Le fichier est lu sur cet appareil. Tu pourras vérifier la liste avant de l'enregistrer.</p>
      <p id="import-classe-info" role="status" style="margin:8px 0 0"></p>
      <form class="card" id="import-classe-apercu" hidden autocomplete="off" style="margin-top:16px"><h2 style="font-size:24px">Vérifier la liste à importer</h2><p id="import-classe-compte" class="muted"></p>
        <p class="muted">Corrige les noms si besoin ; efface un nom pour l'écarter. Les élèves déjà présents conservent leur identifiant, leur objectif et leurs résultats. Pour distinguer deux élèves de même prénom, ajoute leur nom.</p>
        <div class="form" id="import-classe-champs"></div><div class="row start" style="margin-top:16px"><button class="btn primary" id="import-classe-confirme" type="submit">Importer et enregistrer</button><button class="btn" id="import-classe-annule" type="button">Annuler</button></div></form>
      <p class="muted" style="margin-top:14px">Objectif automatique : meilleur score valide, en classe ou à la maison, + 10 %, avec au moins 5 MCLM de plus. Il augmente à chaque nouveau record et ne baisse pas après une lecture moins réussie. Tu peux saisir un objectif manuel à tout moment.</p><form class="form" id="f" autocomplete="off"></form><div class="row start" style="margin-top:16px"><button class="btn primary" id="sv" type="button">Enregistrer</button><button class="btn" id="add" type="button">Ajouter un élève</button><span class="saved" id="ok" role="status"></span></div>`;
    const f = box.querySelector("#f");
    box.querySelector("#import-classe-choisir").onclick=()=>box.querySelector("#import-classe-file").click();
    f.onsubmit = e=>e.preventDefault();
    const lit = () => { const suivants=liste.map((s,i)=>({nom:ImportClasse.valideNom(f.querySelector("#n"+i).value) || `Élève ${i+1}`,objectif:ImportClasse.valideObjectif(f.querySelector("#g"+i).value)})); suivants.forEach((s,i)=>Object.assign(liste[i],s)); };
    const dessine = () => { f.innerHTML = ""; liste.forEach((s,i)=>{ f.appendChild(el("label",{for:"n"+i, class:"label"}, `Élève ${i+1}`));
      const n = el("input",{id:"n"+i, "aria-label":`Prénom de l'élève ${i+1}`, maxlength:"80", autocapitalize:"words", spellcheck:"false"}); n.value = s.nom; f.appendChild(n);
      const zone=el("div",{class:"goal",style:"min-width:0"}), g = el("input",{id:"g"+i, inputmode:"numeric", maxlength:"3", placeholder:"Automatique", "aria-label":`Objectif de l'élève ${i+1}`, "aria-describedby":"objectif-info-"+i}); g.value = s.objectif ?? "";
      const info=el("small",{id:"objectif-info-"+i,class:"muted","data-objectif-info":s.id,"data-champ":"g"+i,style:"display:block;margin-top:4px;line-height:1.3"});
      zone.appendChild(g);zone.appendChild(info);f.appendChild(zone);g.oninput=()=>actualiseObjectifs(box); }); actualiseObjectifs(box); };
    dessine();
    box.querySelector("#sv").onclick = async ()=>{ try { box.querySelector("#ok").textContent = await Donnees.enregistreEleves(baseActuelle()) ? "Enregistré." : "Impossible d'enregistrer sur cet appareil."; } catch(e){ box.querySelector("#ok").textContent=e.message; } };
    box.querySelector("#add").onclick = ()=>{ try { lit(); if (liste.length>=ImportClasse.MAX_ELEVES){ box.querySelector("#ok").textContent="La classe contient déjà 100 élèves."; return; } liste.push({id:"e"+Plateforme.rid(4), nom:`Élève ${liste.length+1}`, objectif:""}); dessine(); f.querySelector("#n"+(liste.length-1)).select(); } catch(e){ box.querySelector("#ok").textContent=e.message; } };
    const apercu=box.querySelector("#import-classe-apercu"), info=box.querySelector("#import-classe-info"); let lecture=0;
    /* Reprend les nouvelles données reçues entre-temps, avec les modifications locales explicites. */
    const baseActuelle = () => {
      lit(); const locaux=new Map(liste.map(e=>[e.id,e]));
      const base=Donnees.eleves().map(e=>{ const avant=originaux.get(e.id), local=locaux.get(e.id); if(!avant || !local) return {...e}; return {...e, nom:local.nom!==avant.nom ? local.nom:e.nom, objectif:local.objectif!==avant.objectif ? local.objectif:e.objectif}; });
      const ids=new Set(base.map(e=>e.id)); liste.filter(e=>!originaux.has(e.id) && !ids.has(e.id)).forEach(e=>base.push({...e}));
      return base;
    };
    const prepare = eleves => ImportClasse.fusion(baseActuelle(),eleves,{remplaceDefaut:Donnees.sansEssais()});
    const affiche = resultat => {
      const plan=prepare(resultat.eleves), champs=box.querySelector("#import-classe-champs"); champs.innerHTML="";
      resultat.eleves.forEach((e,i)=>{
        const id="import-classe-nom-"+i; champs.appendChild(el("label",{for:id,class:"label"},String(i+1)));
        const n=el("input",{id,"data-import-nom":String(i),maxlength:"80","aria-label":`Nom importé ${i+1}`,autocapitalize:"words",spellcheck:"false"});n.value=e.nom;champs.appendChild(n);
        const g=el("input",{class:"goal","data-import-objectif":String(i),inputmode:"numeric",maxlength:"3",placeholder:"objectif (mots/min)","aria-label":`Objectif importé ${i+1}`});g.value=e.objectif;champs.appendChild(g);
      });
      box.querySelector("#import-classe-compte").textContent=`${resultat.eleves.length} élève(s) dans la liste : ${plan.ajoutes} à ajouter, ${plan.reconnus} déjà présent(s).`+(resultat.ignores?` ${resultat.ignores} ligne(s) vide(s) ou inactive(s) ignorée(s).`:"")+(resultat.doublons?` ${resultat.doublons} doublon(s) regroupé(s).`:"")+(plan.remplaceDefaut?" Les fiches « Élève n » de départ seront remplacées.":"");
      apercu.hidden=false; info.textContent="Liste prête à vérifier. Rien n'a encore été enregistré.";
    };
    box.querySelector("#import-classe-file").onchange=async e=>{
      const fichier=e.target.files[0], numero=++lecture; if(!fichier) return; apercu.hidden=true; info.textContent="Lecture du fichier…";
      try {
        if(fichier.size>ImportClasse.MAX_OCTETS) throw new Error("Le fichier doit faire au maximum 1 Mo.");
        const texte=await new Promise((resolve,reject)=>{ const lecteur=new FileReader();lecteur.onload=()=>resolve(lecteur.result);lecteur.onerror=()=>reject(new Error("Impossible de lire ce fichier. Réessaie avec une copie locale."));lecteur.readAsText(fichier,"UTF-8"); });
        if(numero!==lecture || !apercu.isConnected) return;
        affiche(ImportClasse.lit(texte,fichier.name));
      } catch(err){ if(numero===lecture && info.isConnected) info.textContent=err.message||"Ce fichier n'est pas une liste de classe valide."; }
      finally { e.target.value=""; }
    };
    box.querySelector("#import-classe-annule").onclick=()=>{
      try { const base=baseActuelle();liste.splice(0,liste.length,...base);originaux.clear();Donnees.eleves().forEach(e=>originaux.set(e.id,{...e}));dessine();info.textContent="Import annulé. Aucun changement enregistré."; }
      catch(err){ info.textContent="Import annulé. "+err.message; }
      apercu.hidden=true;
    };
    apercu.onsubmit=async e=>{
      e.preventDefault(); const bouton=box.querySelector("#import-classe-confirme"); if(bouton.disabled) return;
      try {
        const noms=[...apercu.querySelectorAll("[data-import-nom]")], objectifs=[...apercu.querySelectorAll("[data-import-objectif]")];
        const plan=prepare(noms.map((n,i)=>({nom:n.value,objectif:objectifs[i].value}))); bouton.disabled=true;
        if(!await Donnees.enregistreEleves(plan.eleves)) throw new Error("Impossible d'enregistrer sur cet appareil. La classe précédente est conservée.");
        apercu.hidden=true;vueEleves(box);box.querySelector("#ok").textContent=`Import enregistré : ${plan.ajoutes} élève(s) ajouté(s), ${plan.reconnus} déjà présent(s).`;
      } catch(err){ info.textContent=err.message||"Impossible d'importer cette liste.";bouton.disabled=false; }
    };
    EnvoiMaison.ajouteBouton(box);
  }

  function prepareImpression(E){
    if(!estDisponible(E)||(ROLE==="parents"&&!ouvertFamille(E)))return false;
    const feuille = $("#maison-impression");
    feuille.replaceChildren(); feuille.dataset.ep=E.id;
    feuille.classList.toggle("texte-long",E.nbMots>300);
    const titre=el("h1");titre.textContent=E.titre;feuille.appendChild(titre);
    feuille.classList.toggle("texte-vers",E.layout?.type==="vers");
    const corps=el("div",{class:"impression-corps"});feuille.appendChild(corps);
    let p=null;
    motsDefi(E).forEach((t,i)=>{
      if(!p || ["paragraph","stanza"].includes(t.rupture)){
        p=el("p",{"data-debut":String(i)});corps.appendChild(p);
      } else if(t.rupture) ajouteRupture(p,t);
      else p.appendChild(document.createTextNode(" "));
      const mot=el("span",{class:"impression-mot","data-index":String(i)});mot.textContent=t.t;p.appendChild(mot);
    });
    if(E.source){const source=el("footer");source.textContent=E.source;feuille.appendChild(source);}
    document.documentElement.dataset.impression="texte";
    return true;
  }
  function imprimeTexte(E){
    if(prepareImpression(E)) window.print();
  }

  let actx = null;
  function bip(duree=.6){
    let annule=false, joue=false, o=null, g=null;
    const nettoie=()=>{try{o?.disconnect();g?.disconnect();}catch(e){}o=null;g=null;};
    const arrete=()=>{annule=true;try{o?.stop();}catch(e){}nettoie();};
    try {
      // Safari/WKWebView utilisent sinon « ambient » : les voix restent audibles,
      // mais le commutateur silencieux coupe WebAudio (WebKit 237322, iOS 17+).
      try{const session=window.navigator?.audioSession;if(session&&session.type!=="playback")session.type="playback";}catch(e){}
      if(!actx || actx.state==="closed")actx=new (window.AudioContext||window.webkitAudioContext)();
      const contexte=actx;
      const emet=()=>{
        if(annule || joue || contexte!==actx || contexte.state!=="running" || document.hidden)return;
        joue=true;
        try{
          const t=contexte.currentTime;o=contexte.createOscillator();g=contexte.createGain();
          o.frequency.value=880;g.gain.setValueAtTime(.25,t);g.gain.exponentialRampToValueAtTime(.001,t+duree);
          o.connect(g);g.connect(contexte.destination);o.onended=nettoie;o.start();o.stop(t+duree);
        }catch(e){nettoie();}
      };
      // Le resume reste dans le geste du clic, y compris après interruption iOS.
      // Aucun son n'est mis en attente dans un contexte encore suspendu.
      if(contexte.state!=="running"){
        const reprise=contexte.resume();reprise?.then(emet).catch(()=>{});
      }
      emet();
    } catch(e){}
    return arrete;
  }
  function compteRebours({surNombre,termine}){
    let actif=true, nombre=3, timer=null, arreteBip=()=>{};
    const suivant=()=>{
      if(!actif) return;
      arreteBip();
      if(nombre===0){actif=false;termine();return;}
      arreteBip=bip(.18);surNombre(nombre--);
      if(actif) timer=setTimeout(suivant,1000);
    };
    suivant();
    return ()=>{actif=false;clearTimeout(timer);arreteBip();};
  }

  async function demarre(){
    window.addEventListener("afterprint",()=>{delete document.documentElement.dataset.impression;});
    if (ROLE==="parents"){ await MaisonCloud.init(); await Parents.demarre(); return; }
    await Donnees.init();
    if (ROLE==="tel"){ document.getElementById("app-tel").hidden = false; await Telephone.demarre(); }
    else { document.getElementById("app-ecran").hidden = false; await Ecran.demarre(); }
    await MaisonCloud.init(); EnvoiMaison.recoitLien();
  }
  return { DATA, EPS, ROLE, $, el, esc, estMot, nu, ep, estDisponible, textesDisponibles, textesFamille, ouvertFamille, dateFamille, estTamallette, libelleEpisode, etapesEpisode, motsDefi, ajouteRupture, DUREE, ImportClasse, Donnees, Lien, calcule, bilan, carteResultat, motsDifficiles, courbe, vueProgres, vueEleves, actualiseObjectifs, prepareImpression, imprimeTexte, bip, compteRebours, demarre };
})();
window.Banc = Banc;

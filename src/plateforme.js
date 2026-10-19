/* ---------- Le banc des maîtres : sauvegarde sur l'appareil et liaison écran de la classe ↔ téléphone ----------
   Repris de la version autonome du Bateau-école (src/autonome/plateforme.js), même interface que window.claude.use() :
   - db : documents enregistrés sur l'appareil (Preferences dans l'appli du téléphone, localStorage sinon) ;
   - room : liaison chiffrée de bout en bout avec le code de liaison, par des relais publics gratuits
     (Nostr sur le port 443, MQTT en secours) ; les relais ne voient que des messages illisibles ;
   - downloads : fichier téléchargé dans le navigateur, feuille de partage dans l'appli.
   Les deux appareils gardent chacun la classe et tous les résultats, et se les échangent à chaque liaison :
   un ordinateur remis à zéro retrouve tout dès que le téléphone se relie (et inversement). */
"use strict";
const Plateforme = (() => {
  const CAP = window.Capacitor;
  const NATIF = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const plug = n => { if (!NATIF) return null; try { return (CAP.Plugins && CAP.Plugins[n]) || (CAP.registerPlugin && CAP.registerPlugin(n)) || null; } catch(e){ return null; } };
  const Prefs = plug("Preferences");
  const P = "banc-des-maitres-"; // préfixe de tout ce qui est rangé sur l'appareil
  const lsG = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const lsS = (k,v) => { try { localStorage.setItem(k,v); } catch(e){} };
  const lsD = k => { try { localStorage.removeItem(k); } catch(e){} };
  /* stockage durable : Preferences dans l'appli (iOS peut vider le localStorage d'une vue web), localStorage sinon */
  const Stock = {
    async get(k){ if (Prefs){ try { const r = await Prefs.get({key:k}); if (r && r.value!=null) return r.value; } catch(e){} } return lsG(k); },
    async set(k,v){ if (Prefs){ await Prefs.set({key:k, value:v}); lsS(k,v); } else localStorage.setItem(k,v); },
    async del(k){ lsD(k); if (Prefs){ try { await Prefs.remove({key:k}); } catch(e){} } }
  };
  const te = new TextEncoder(), td = new TextDecoder();
  const hex = u => Array.from(u, b=>b.toString(16).padStart(2,"0")).join("");
  const rid = n => hex(crypto.getRandomValues(new Uint8Array(n||8)));
  const cat = (...a) => { let n=0; a.forEach(x=>n+=x.length); const o=new Uint8Array(n); let p=0; a.forEach(x=>{ o.set(x,p); p+=x.length; }); return o; };
  const b64 = u => { let s=""; for (let i=0;i<u.length;i+=0x8000) s += String.fromCharCode.apply(null, u.subarray(i,i+0x8000)); return btoa(s); };
  const deb64 = s => { const b=atob(s); const u=new Uint8Array(b.length); for (let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; };

  /* ---------- rôle de l'appareil : « ecran » (ordinateur de la classe) ou « tel » (télécommande de la maîtresse) ---------- */
  const PARENTS = /[#&]parents\b/.test(location.hash);
  const petit = () => Math.min(screen.width||innerWidth, screen.height||innerHeight) < 600;
  function role(){
    const h = location.hash;
    // Un lien famille ne lit ni ne remplace le rôle de l'espace enseignant.
    if (PARENTS) return "parents";
    if (/[#&]tel\b/.test(h)) lsS(P+"role", "tel");
    else if (/[#&]ecran\b/.test(h)) lsS(P+"role", "ecran");
    const r = lsG(P+"role");
    if (r==="tel" || r==="ecran") return r;
    return petit() ? "tel" : "ecran";
  }
  const changeRole = r => { if(!PARENTS) lsS(P+"role", r); };

  /* ---------- code de liaison : 10 caractères (base 32 de Crockford), affiché XXXXX-XXXXX ---------- */
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function nouveauCode(){ const b = crypto.getRandomValues(new Uint8Array(10)); let s=""; for (const x of b) s += ALPHA[x & 31]; return s.slice(0,5)+"-"+s.slice(5); }
  function normalise(c){
    c = String(c||"").toUpperCase().replace(/[^0-9A-Z]/g,"").replace(/[IL]/g,"1").replace(/O/g,"0").replace(/U/g,"V");
    if (c.length!==10 || [...c].some(x=>ALPHA.indexOf(x)<0)) return null;
    return c.slice(0,5)+"-"+c.slice(5);
  }

  /* ---------- chiffrement : clé AES-GCM et étiquette de salon tirées du code (PBKDF2) ---------- */
  const SUBTLE = !!(window.crypto && crypto.subtle); // absent si la page n'est pas « sécurisée » : on chiffre alors en JavaScript
  async function cles(code){
    const mot = te.encode(code.replace("-","")), sel = te.encode("banc-des-maitres/liaison/v1");
    let bits;
    if (SUBTLE){ const base = await crypto.subtle.importKey("raw", mot, "PBKDF2", false, ["deriveBits"]);
      bits = new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2", salt:sel, iterations:120000, hash:"SHA-256"}, base, 384)); }
    else bits = await NostrLite.derive(mot, sel, 120000, 48);
    const tag = hex(bits.slice(32,48)), brute = bits.slice(0,32);
    return {tag, aad:te.encode("banc-des-maitres:"+tag), cle: SUBTLE ? await crypto.subtle.importKey("raw", brute, "AES-GCM", false, ["encrypt","decrypt"]) : brute};
  }
  async function chiffre(k, u){ const iv = crypto.getRandomValues(new Uint8Array(12));
    const c = SUBTLE ? new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv, additionalData:k.aad}, k.cle, u)) : NostrLite.aesGcm(k.cle, iv, k.aad).encrypt(u);
    return b64(cat(iv, c)); }
  async function dechiffre(k, s){ const u = deb64(s), iv = u.slice(0,12), c = u.slice(12);
    return SUBTLE ? new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM", iv, additionalData:k.aad}, k.cle, c)) : NostrLite.aesGcm(k.cle, iv, k.aad).decrypt(c); }
  async function gzip(u, compresse){
    const flux = new Blob([u]).stream().pipeThrough(compresse ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  /* ---------- relais (repris tels quels du Bateau-école) ---------- */
  const KIND = 25555; // événements Nostr éphémères : relayés en direct, jamais stockés
  const RELAIS_DEFAUT = ["nostr:wss://relay.primal.net","nostr:wss://nostr.mom","nostr:wss://relay.snort.social","nostr:wss://relay.nostr.net",
    "mqtt:wss://test.mosquitto.org:8081/mqtt","mqtt:wss://broker.hivemq.com:8884/mqtt"];
  function listeRelais(){
    const q = /[?&#]relais=([^&#]+)/.exec(location.href);
    if (q) return decodeURIComponent(q[1]).split(",").map(s=>s==="local"?"local:":s);
    try { const l = JSON.parse(lsG(P+"relais")||"null"); if (Array.isArray(l) && l.length) return l; } catch(e){}
    return RELAIS_DEFAUT;
  }
  function transportNostr(url, k, recoit, change){
    let ws=null, pret=false, fini=false, attente=1500, minuteur=null, jetons=5, remplie=Date.now(), pompe=null, direct=false, tDirect=null;
    const sub = "bm"+rid(6), sk = NostrLite.cleSecrete(), pk = NostrLite.clePublique(sk), file = [];
    /* les relais Nostr limitent le débit : au plus ~1 message/s en continu (5 d'un coup), et un message d'état
       remplace le précédent du même genre encore en attente */
    function envoieBrut(txt){ try { ws.send(JSON.stringify(["EVENT", NostrLite.signe({pubkey:pk, created_at:Math.floor(Date.now()/1000), kind:KIND, tags:[["t",k.tag]], content:txt}, sk)])); } catch(e){} }
    function pompeFile(){
      if (pompe) return;
      pompe = setTimeout(()=>{ pompe = null; if (!pret) return;
        const t = Date.now(); jetons = Math.min(5, jetons+(t-remplie)/1100); remplie = t;
        while (file.length && file[0].t < t-20000) file.shift(); // trop vieux : les autres relais l'ont porté
        while (file.length && jetons>=1){ const it = file[0]; envoieBrut(it.txts.shift()); jetons--; it.cle = null; if (!it.txts.length) file.shift(); }
        if (file.length) pompeFile(); }, file.length && jetons<1 ? 400 : 0);
    }
    function ouvre(){
      clearTimeout(minuteur); minuteur=null;
      try { ws = new WebSocket(url); } catch(e){ return plusTard(); }
      const moi = ws;
      /* certains relais gardent les événements « éphémères » et les renvoient à l'abonnement :
         tout ce qui arrive avant la fin des événements stockés (EOSE) est ignoré */
      ws.onopen = ()=>{ if (moi!==ws) return; pret=true; attente=1500; direct=false; clearTimeout(tDirect); tDirect = setTimeout(()=>{ direct=true; }, 3000);
        ws.send(JSON.stringify(["REQ", sub, {kinds:[KIND], "#t":[k.tag]}])); change(); pompeFile(); };
      ws.onmessage = e=>{ let m; try { m = JSON.parse(e.data); } catch(x){ return; }
        if (m[0]==="EOSE" && m[1]===sub){ direct = true; clearTimeout(tDirect); return; }
        if (m[0]==="EVENT" && m[1]===sub && m[2] && typeof m[2].content==="string"){
          if (!direct || (m[2].created_at||0) < Date.now()/1000-900) return;
          recoit(m[2].content); }
        else if (m[0]==="OK" && m[2]===false) console.warn("relais", url, m[3]); };
      ws.onclose = ()=>{ if (moi!==ws) return; pret=false; change(); if (!fini) plusTard(); };
      ws.onerror = ()=>{ try { moi.close(); } catch(e){} };
    }
    function plusTard(){ if (minuteur||fini) return; minuteur = setTimeout(()=>{ minuteur=null; if (!fini) ouvre(); }, attente); attente = Math.min(30000, attente*2); }
    ouvre();
    return { nom:url.replace(/^wss:\/\//,""), pret:()=>pret,
      envoie(txts, cle){ if (cle){ const i = file.findIndex(x=>x.cle===cle); if (i>=0) file.splice(i,1); } file.push({cle, txts:txts.slice(), t:Date.now()}); if (file.length>60) file.shift(); pompeFile(); },
      reveille(){ if (!pret && !fini){ attente=1500; if (ws){ try { ws.onclose=null; ws.close(); } catch(e){} } ws=null; ouvre(); } },
      ferme(){ fini=true; clearTimeout(minuteur); try { ws && ws.close(); } catch(e){} } };
  }
  function transportMqtt(url, k, recoit, change){
    if (!window.mqtt) return null;
    const sujet = "banc-des-maitres/"+k.tag;
    let c = null;
    try { c = mqtt.connect(url, {clientId:"bm_"+rid(8), clean:true, keepalive:30, reconnectPeriod:6000, connectTimeout:10000, protocolVersion:4}); } catch(e){ return null; }
    c.on("connect", ()=>{ c.subscribe(sujet, {qos:0}); change(); });
    c.on("close", change); c.on("offline", change); c.on("error", ()=>{});
    c.on("message", (t,p)=>{ if (t===sujet) recoit(td.decode(p)); });
    return { nom:url.replace(/^wss:\/\//,"").replace(/\/mqtt$/,""), pret:()=>c.connected,
      envoie(txts){ if (c.connected) txts.forEach(txt=>c.publish(sujet, txt, {qos:0})); },
      reveille(){ if (!c.connected){ try { c.reconnect(); } catch(e){} } },
      ferme(){ try { c.end(true); } catch(e){} } };
  }
  function transportLocal(k, recoit, change){ // même navigateur (tests, deux onglets)
    const bc = new BroadcastChannel("banc-des-maitres-"+k.tag); bc.onmessage = e=>recoit(e.data); setTimeout(change,0);
    return { nom:"local", pret:()=>true, envoie(txts){ txts.forEach(txt=>bc.postMessage(txt)); }, reveille(){}, ferme(){ bc.close(); } };
  }
  function creeRelais(k){
    const vus = new Map(), morceaux = new Map(), ecoute = new Set(), surChange = new Set();
    const change = () => surChange.forEach(f=>{ try { f(); } catch(e){} });
    async function recoit(txt){
      let u; try { u = await dechiffre(k, txt); } catch(e){ return; } // pas pour nous, ou abîmé
      if (u[0]===2){ // message coupé en morceaux : [2][id 8 o][rang][nombre][données]
        const id = "m"+hex(u.subarray(1,9)), i = u[9], n = u[10]; if (vus.has(id)) return;
        let p = morceaux.get(id); if (!p){ p = {n, m:[], t:Date.now()}; morceaux.set(id,p); }
        if (!p.m[i]) p.m[i] = u.slice(11);
        for (let j=0;j<p.n;j++) if (!p.m[j]) return;
        morceaux.delete(id); vus.set(id, Date.now()); u = cat(...p.m);
      }
      let m; try { m = JSON.parse(td.decode(u[0]===1 ? await gzip(u.subarray(1), false) : u.subarray(1))); } catch(e){ return; }
      if (!m || typeof m!=="object" || !m.id || vus.has(m.id)) return;
      vus.set(m.id, Date.now());
      if (Math.abs(Date.now()-(m.t||0)) > 15*60*1000) return; // vieux message rejoué
      ecoute.forEach(f=>{ try { f(m); } catch(e){ console.error(e); } });
    }
    const trs = listeRelais().map(s=>{
      if (s.startsWith("local:")) return transportLocal(k, recoit, change);
      if (s.startsWith("nostr:")) return window.NostrLite ? transportNostr(s.slice(6), k, recoit, change) : null;
      if (s.startsWith("mqtt:")) return transportMqtt(s.slice(5), k, recoit, change);
      return null;
    }).filter(Boolean);
    setInterval(()=>{ const lim = Date.now()-20*60*1000; vus.forEach((t,id)=>{ if (t<lim) vus.delete(id); }); morceaux.forEach((p,id)=>{ if (p.t<lim) morceaux.delete(id); }); }, 60000);
    document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState==="visible") trs.forEach(t=>t.reveille()); });
    addEventListener("online", ()=>trs.forEach(t=>t.reveille()));
    let file = Promise.resolve();
    function publie(m, cle){
      m.id = m.id || rid(9); m.t = Date.now(); vus.set(m.id, Date.now());
      const tache = file.then(async ()=>{
        const brut = te.encode(JSON.stringify(m)); let corps = brut, drapeau = 0;
        if (brut.length > 900 && window.CompressionStream){ try { corps = await gzip(brut, true); drapeau = 1; } catch(e){ corps = brut; drapeau = 0; } }
        const plein = cat(Uint8Array.of(drapeau), corps), MAX = 20000, trames = [];
        if (plein.length <= MAX) trames.push(plein);
        else { const id = crypto.getRandomValues(new Uint8Array(8)), n = Math.ceil(plein.length/MAX); if (n>250) throw new Error("trop gros");
          for (let i=0;i<n;i++) trames.push(cat(Uint8Array.of(2), id, Uint8Array.of(i,n), plein.subarray(i*MAX,(i+1)*MAX))); }
        const txts = []; for (const tr of trames) txts.push(await chiffre(k, tr));
        trs.forEach(t=>t.envoie(txts, cle));
      });
      file = tache.catch(()=>{});
      return tache;
    }
    return { publie, ecoute:f=>{ ecoute.add(f); return ()=>ecoute.delete(f); }, surChange:f=>{ surChange.add(f); return ()=>surChange.delete(f); },
      etat:()=>trs.map(t=>({nom:t.nom, ok:t.pret()})), connecte:()=>trs.some(t=>t.pret()) };
  }

  /* ---------- sauvegarde (même interface que la capacité db) ---------- */
  const DB = (() => {
    const cache = new Map(), ecoutes = new Map();
    let ecrituresResultats = Promise.resolve();
    const cle = p => "banc-db:"+p;
    async function lit(p){ if (cache.has(p)) return cache.get(p); let v = null; try { v = JSON.parse(await Stock.get(cle(p))||"null"); } catch(e){} cache.set(p, v); return v; }
    const snap = (p, v, distant) => ({ id:p.split("/").pop(), path:p, exists:!!(v && v.data!=null), distant:!!distant,
      data:()=> v && v.data!=null ? JSON.parse(JSON.stringify(v.data)) : undefined });
    function notifie(p, v, distant){ (ecoutes.get(p)||new Set()).forEach(f=>{ try { f(snap(p,v,distant)); } catch(e){ console.error(e); } }); }
    function ecrit(p, data, distant){
      const estResultats = p==="banc/resultats";
      if(estResultats) data=JSON.parse(JSON.stringify(data));
      const execute = async()=>{
        // Preferences est asynchrone : fusionner seulement au moment d'écrire,
        // après toute écriture locale ou distante déjà engagée.
        const contenu = estResultats ? fusionResultats((await lit(p))?.data, data) : data;
        const v = {data:contenu, rev:Date.now()}; await Stock.set(cle(p), JSON.stringify(v)); cache.set(p, v);
        if (!distant) Sync.change(p); notifie(p, v, distant); return v;
      };
      if(!estResultats)return execute();
      const tache=ecrituresResultats.then(execute);
      ecrituresResultats=tache.catch(()=>{}); // Un échec n'empêche pas la sauvegarde suivante.
      return tache;
    }
    function doc(p){ return { id:p.split("/").pop(), path:p,
      async get(){ return snap(p, await lit(p)); },
      async set(data){ await ecrit(p, JSON.parse(JSON.stringify(data)), false); },
      async update(patch){ const v = await lit(p); await ecrit(p, Object.assign({}, v && v.data, JSON.parse(JSON.stringify(patch))), false); },
      async delete(){ cache.set(p, null); await Stock.del(cle(p)); notifie(p, null, false); },
      onSnapshot(f){ if (!ecoutes.has(p)) ecoutes.set(p, new Set()); ecoutes.get(p).add(f); lit(p).then(v=>f(snap(p,v,false))); return ()=>ecoutes.get(p).delete(f); } }; }
    return { doc, _lit:lit, _ecritDistant:(p,d)=>ecrit(p,d,true) };
  })();

  /* ---------- les deux appareils gardent chacun la classe et tous les résultats ----------
     banc/classe et banc/reglages : la version la plus récente gagne (champ maj) ;
     banc/resultats : les deux listes sont réunies (chaque essai a son identifiant ; un essai supprimé le reste partout). */
  // Égalité pédagogique stricte : les informations de transport restent locales.
  const memeBilanMaison = (a,b) => {
    if(!a||!b||a.suppr||b.suppr||a.origine!=="maison"||b.origine!=="maison"||typeof a.sourceId!=="string"||!a.sourceId||a.sourceId!==b.sourceId||typeof a.eleve!=="string"||!a.eleve||a.eleve!==b.eleve||a.ep!==b.ep||!Number.isFinite(Date.parse(a.date))||Date.parse(a.date)!==Date.parse(b.date))return false;
    if(!["mclm","lus","erreurs","secondes","dernier"].every(k=>typeof a[k]==="number"&&Number.isFinite(a[k])&&a[k]===b[k]))return false;
    return Array.isArray(a.fautes)&&Array.isArray(b.fautes)&&a.fautes.length===a.erreurs&&b.fautes.length===b.erreurs&&[a.fautes,b.fautes].every(f=>new Set(f).size===f.length&&f.every(i=>Number.isSafeInteger(i)&&i>=0&&i<=a.dernier))&&JSON.stringify(a.fautes.slice().sort((x,y)=>x-y))===JSON.stringify(b.fautes.slice().sort((x,y)=>x-y));
  };
  const fusionResultats = (a, b) => {
    const m = new Map();
    for (const l of [a && a.liste, b && b.liste]) for (const r of (Array.isArray(l) ? l : [])){
      if (!r || typeof r.id!=="string") continue;
      const x = m.get(r.id);
      if (!x || (r.suppr && !x.suppr)) m.set(r.id, r);
      else if(!Object.hasOwn(x,"typeLecture")&&["entrainement","defi"].includes(r.typeLecture)&&memeBilanMaison(x,r))m.set(r.id,{...x,typeLecture:r.typeLecture});
    }
    return {liste:[...m.values()].sort((x,y)=>String(x.date||"").localeCompare(String(y.date||"")) || x.id.localeCompare(y.id))};
  };
  const sigResultats = d => JSON.stringify((d && Array.isArray(d.liste) ? d.liste : []).map(r=>[r.id,!!r.suppr,r.suppr?null:["entrainement","defi"].includes(r.typeLecture)?r.typeLecture:null]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const plusRecent = (a, b) => !b ? a : (!a || (b.maj||0) > (a.maj||0)) ? b : a;
  const sigMaj = d => d ? String(d.maj||0)+":"+JSON.stringify(d).length : "";
  const Sync = (() => {
    const REGLES = {
      "banc/classe":   {fusion:plusRecent, sig:sigMaj, delai:500},
      "banc/reglages": {fusion:plusRecent, sig:sigMaj, delai:900},
      "banc/resultats":{fusion:fusionResultats, sig:sigResultats, delai:300}
    };
    const DOCS = Object.keys(REGLES);
    let room = null; const minuteurs = {};
    const pairsLa = () => room && room._pairs().length>0;
    async function envoieDoc(p){ const v = await DB._lit(p); if (!v || v.data==null || !room) return; room._publie({k:"db", path:p, data:v.data}, "db:"+p).catch(e=>console.warn("copie", e)); }
    function change(p, delai){
      if (!REGLES[p] || !pairsLa()) return;
      clearTimeout(minuteurs[p]); minuteurs[p] = setTimeout(()=>envoieDoc(p), delai!=null ? delai : REGLES[p].delai);
    }
    async function recoit(m){
      const R = m.k==="db" && REGLES[m.path];
      if (!R || !m.data || typeof m.data!=="object") return;
      const v = await DB._lit(m.path), ici = v && v.data, f = R.fusion(ici, m.data);
      if (R.sig(f)!==R.sig(ici)) await DB._ecritDistant(m.path, f); // ce qui manquait ici
      if (R.sig(f)!==R.sig(m.data)) change(m.path, 400);          // ce qui manquait là-bas
    }
    return { branche(r){ room = r; }, change, recoit, nouveauPair(){ DOCS.forEach((p,i)=>change(p, 300+i*250)); } };
  })();

  /* ---------- liaison (même interface que la capacité room) ---------- */
  function creeRoom(rel){
    const moi = {peer:rid(12), presence:{}};
    const pairs = new Map(), ecPairs = new Set(), ecSujets = new Map(), ecCo = new Set();
    const vue = p => ({peer:p.peer, isMe:p.peer===moi.peer, presence:JSON.parse(JSON.stringify(p.presence||{}))});
    const tous = () => [vue(moi)].concat([...pairs.values()].map(vue));
    const signale = (j,l) => { const ch = {peers:tous(), joined:j.map(vue), left:l.map(vue)}; ecPairs.forEach(f=>{ try { f(ch); } catch(e){ console.error(e); } }); };
    let rep = null;
    const coucou = () => rel.publie({k:"hb", f:moi.peer, p:moi.presence}, "hb").catch(()=>{});
    const ETATS = {ecran:1, defi:1}; // sujets qui décrivent un état complet : le dernier suffit
    rel.ecoute(m=>{
      if (m.f===moi.peer) return;
      if (m.k==="hb"){ const neuf = !pairs.has(m.f), p = pairs.get(m.f) || {peer:m.f}, avant = JSON.stringify(p.presence||null);
        p.presence = m.p && typeof m.p==="object" ? m.p : {}; p.vu = Date.now(); pairs.set(m.f, p);
        if (neuf){ signale([p],[]); clearTimeout(rep); rep = setTimeout(coucou, 150+Math.random()*350); Sync.nouveauPair(); }
        else if (avant!==JSON.stringify(p.presence)) signale([],[]);
        return; }
      if (m.k==="bye"){ const p = pairs.get(m.f); if (p){ pairs.delete(m.f); signale([],[p]); } return; }
      if (m.k==="ev" && typeof m.topic==="string"){ const s = ecSujets.get(m.topic); if (s){ const msg = {topic:m.topic, data:m.data, peer:m.f, isMe:false}; s.forEach(f=>{ try { f(msg); } catch(e){ console.error(e); } }); } return; }
      Sync.recoit(m);
    });
    setInterval(coucou, 8000);
    setInterval(()=>{ const lim = Date.now()-26000, partis = []; pairs.forEach((p,id)=>{ if (p.vu<lim){ pairs.delete(id); partis.push(p); } }); if (partis.length) signale([],partis); }, 2000);
    let co = false; rel.surChange(()=>{ const c = rel.connecte(); if (c && !co) coucou(); if (c!==co){ co = c; ecCo.forEach(f=>{ try { f(c); } catch(e){} }); } });
    addEventListener("pagehide", ()=>{ rel.publie({k:"bye", f:moi.peer}).catch(()=>{}); });
    coucou();
    const r = {
      presence(patch){ for (const k in patch||{}){ if (patch[k]===null) delete moi.presence[k]; else moi.presence[k] = patch[k]; } coucou(); return Promise.resolve(); },
      onPeers(f){ ecPairs.add(f); setTimeout(()=>{ if (ecPairs.has(f)){ const t = tous(); f({peers:t, joined:t, left:[]}); } }, 0); return ()=>ecPairs.delete(f); },
      emit(topic, data){ return rel.publie({k:"ev", f:moi.peer, topic, data}, ETATS[topic] ? "ev:"+topic : null).catch(()=>{}); },
      on(topic, f){ if (!ecSujets.has(topic)) ecSujets.set(topic, new Set()); ecSujets.get(topic).add(f); return ()=>ecSujets.get(topic).delete(f); },
      connected:()=>rel.connecte(),
      onConnection(f){ ecCo.add(f); return ()=>ecCo.delete(f); },
      leave(){ rel.publie({k:"bye", f:moi.peer}).catch(()=>{}); },
      _pairs:()=>[...pairs.values()].map(vue), _publie:(m,cle)=>rel.publie(Object.assign(m, {f:moi.peer}), cle), _etat:()=>rel.etat()
    };
    Sync.branche(r);
    return r;
  }

  /* ---------- code de liaison : créé par l'écran ou le téléphone, partagé par QR code, lien ou saisie ---------- */
  const Liaison = (() => {
    let code = null, promesse = null, assurance = null, room = null;
    const CLE = P+"liaison";
    async function litCode(){
      const m = /[#&?]lien=([0-9A-Za-z-]+)/.exec(location.href);
      if (m){ const c = normalise(m[1]); if (c){ await Stock.set(CLE, c); return c; } }
      return normalise(await Stock.get(CLE));
    }
    function assure(){
      if (role()==="parents") return Promise.resolve(null);
      if (assurance) return assurance;
      assurance = (async()=>{
        await ouvre();
        if (!code){ code = nouveauCode(); await Stock.set(CLE, code); }
        return code;
      })().finally(()=>{ assurance = null; });
      return assurance;
    }
    function ouvre(){
      if (role()==="parents") return Promise.resolve(null);
      if (promesse) return promesse;
      promesse = (async()=>{
        code = await litCode();
        if (!code && role()==="ecran"){ code = nouveauCode(); await Stock.set(CLE, code); }
        if (!code) return null;
        room = creeRoom(creeRelais(await cles(code)));
        return room;
      })().catch(e=>{ console.error("liaison", e); return null; });
      return promesse;
    }
    /* adresse du site pour le téléphone : celle de la page, ou celle du site publié (page ouverte depuis un fichier, appli) */
    const WEB = () => (/^https?:$/.test(location.protocol) && !NATIF) ? location.href.replace(/[?#].*$/,"") : (window.BANC_WEB || "");
    return { ouvre, assure, code:()=>code, normalise, WEB,
      lienTel:c=>WEB() ? WEB() + "#lien=" + (c||code) + "&tel" : "",
      lienEcran:c=>WEB() && (c||code) ? WEB() + "#lien=" + (c||code) + "&ecran" : "",
      async fixe(c){ if (role()==="parents") return false; c = normalise(c); if (!c) return false; await Stock.set(CLE, c); return true; },
      async oublie(){ if (role()==="parents") return; await Stock.del(CLE); },
      async nouveau(){ if (role()==="parents") return null; const c = nouveauCode(); await Stock.set(CLE, c); return c; },
      etat:()=>room ? room._etat() : [], pairs:()=>room ? room._pairs() : [],
      qr(texte, taille){ if (!window.qrcode || !texte) return ""; const q = qrcode(0,"M"); q.addData(texte); q.make();
        return q.createSvgTag({cellSize:Math.max(2, Math.floor((taille||240)/(q.getModuleCount()+8))), margin:4, scalable:true}); } };
  })();

  /* ---------- téléchargements : fichier dans le navigateur, feuille de partage dans l'appli ---------- */
  const Telechargements = {
    async save({filename, data}){
      const nom = String(filename||"banc-des-maitres.json").replace(/[\\/:*?"<>|]/g,"-");
      if (NATIF){ const FS = plug("Filesystem"), Partage = plug("Share");
        if (FS && Partage){ const texte = typeof data==="string" ? data : JSON.stringify(data);
          const r = await FS.writeFile({path:nom, data:texte, directory:"CACHE", encoding:"utf8"});
          try { await Partage.share({title:nom, files:[r.uri]}); } catch(e){ throw {code:"cancelled", message:String(e && e.message || e)}; }
          return; } }
      const blob = data instanceof Blob ? data : new Blob([typeof data==="string" ? data : JSON.stringify(data)], {type:"application/json"});
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    }
  };

  /* ---------- garder l'écran du téléphone allumé pendant le défi ---------- */
  let verrou = null;
  async function eveille(on){
    const KA = plug("KeepAwake");
    if (KA){ try { on ? await KA.keepAwake() : await KA.allowSleep(); } catch(e){} return; }
    try { if (on && navigator.wakeLock && !verrou) verrou = await navigator.wakeLock.request("screen"); else if (!on && verrou){ await verrou.release(); verrou = null; } } catch(e){}
  }

  window.claude = { use: async name => {
    if (role()==="parents" && (name==="db" || name==="room")) return null;
    if (name==="db") return DB;
    if (name==="room") return await Liaison.ouvre();
    if (name==="downloads") return Telechargements;
    return null;
  } };
  return { NATIF, Liaison, Stock, partage:plug("Share"), eveille, rid, normalise, role, changeRole, fusionResultats, memeBilanMaison, lsG, lsS };
})();
window.Plateforme = Plateforme;

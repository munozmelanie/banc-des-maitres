// Pour les tests : le site www/ servi en local (avec les requêtes « Range », comme GitHub Pages)
// et un petit relais Nostr local, pour relier l'écran et le téléphone sans passer par internet.
const http = require("http"), fs = require("fs"), path = require("path");
const { WebSocketServer } = require("ws");
const WWW = path.resolve(__dirname, "../www");
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".webp":"image/webp", ".mp3":"audio/mpeg", ".json":"application/json", ".png":"image/png", ".webmanifest":"application/manifest+json" };

function site(){
  return new Promise(ok=>{
    const s = http.createServer((q, r)=>{
      const f = path.join(WWW, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"));
      if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ r.writeHead(404); return r.end(); }
      const taille = fs.statSync(f).size, type = TYPES[path.extname(f)] || "application/octet-stream", m = /bytes=(\d*)-(\d*)/.exec(q.headers.range||"");
      if (m){ const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : taille-1;
        r.writeHead(206, {"content-type":type, "content-range":`bytes ${a}-${b}/${taille}`, "accept-ranges":"bytes", "content-length":b-a+1}); return fs.createReadStream(f, {start:a, end:b}).pipe(r); }
      r.writeHead(200, {"content-type":type, "accept-ranges":"bytes", "content-length":taille}); fs.createReadStream(f).pipe(r);
    });
    s.listen(0, ()=>ok({serveur:s, base:`http://localhost:${s.address().port}/`}));
  });
}

function relais(){
  return new Promise(ok=>{
    const wss = new WebSocketServer({port:0}), abos = new Set();
    let messages = 0;
    wss.on("connection", ws=>{
      ws.on("message", buf=>{ let m; try { m = JSON.parse(buf); } catch(e){ return; }
        if (m[0]==="REQ"){ abos.add({ws, sub:m[1], tags:(m[2]||{})["#t"]||[]}); ws.send(JSON.stringify(["EOSE", m[1]])); }
        else if (m[0]==="EVENT" && m[1]){ messages++; const tag = ((m[1].tags||[]).find(t=>t[0]==="t")||[])[1];
          ws.send(JSON.stringify(["OK", m[1].id, true, ""]));
          abos.forEach(a=>{ if (a.ws.readyState===1 && a.tags.includes(tag)) a.ws.send(JSON.stringify(["EVENT", a.sub, m[1]])); }); }
        else if (m[0]==="CLOSE"){ abos.forEach(a=>{ if (a.ws===ws && a.sub===m[1]) abos.delete(a); }); } });
      ws.on("close", ()=>abos.forEach(a=>{ if (a.ws===ws) abos.delete(a); }));
    });
    wss.on("listening", ()=>ok({wss, url:`ws://localhost:${wss.address().port}`, messages:()=>messages}));
  });
}
module.exports = { site, relais };

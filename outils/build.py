"""Assemble l'appli.

Usage :
  python3 outils/build.py               crée www/ : le site (envoyé sur GitHub Pages par outils/publier.sh)
  python3 outils/build.py --hors-ligne  crée aussi « hors-ligne/Le banc des maîtres - HORS LIGNE.html » : un seul fichier
                                        à ouvrir sur l'ordinateur de la classe sans internet (voix et images comprises)

Rien que la bibliothèque standard de Python. Le calage des voix sur le texte est refait à chaque assemblage
(outils/alignement.py), à partir des transcriptions de contenu/transcriptions/ (faites par outils/voix.py).
"""
import base64, json, os, pathlib, re, shutil, subprocess, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from textes import ROOT, episodes, tokens, phrases, est_mot
from alignement import cale_episode

S = ROOT / "src"
W = ROOT / "www"
lire = lambda p: p.read_text(encoding="utf-8")


def adresse_web():
    """Adresse du site publié (pour le QR code quand la page est ouverte depuis un fichier)."""
    depot = os.environ.get("GITHUB_REPOSITORY")
    if not depot:
        try:
            url = subprocess.run(["git", "-C", str(ROOT), "config", "--get", "remote.origin.url"], capture_output=True, text=True).stdout.strip()
            m = re.search(r"github\.com[:/]([^/]+)/([^/.]+?)(?:\.git)?$", url)
            depot = m and f"{m.group(1)}/{m.group(2)}"
        except Exception:
            depot = None
    if not depot: return ""
    proprio, nom = depot.split("/", 1)
    return f"https://{proprio.lower()}.github.io/{nom}/"


def donnees():
    eps = []; rapport = []
    for e in episodes():
        audio = S / "audio" / (e["id"] + ".mp3"); tr = ROOT / "contenu" / "transcriptions" / (e["id"] + ".json")
        pages = None
        if audio.exists() and tr.exists():
            try:
                pages = cale_episode(e["pages"], json.loads(lire(tr)))
                rapport.append(f'{e["id"]} : voix calée (mots reconnus par page : ' + ", ".join(f'{round(p["reconnus"]*100)} %' for p in pages[1:]) + ")")
            except Exception as x:
                rapport.append(f'{e["id"]} : calage impossible ({x}), voix laissée de côté'); pages = None
        if pages is None:
            pages = [dict(a=None, b=None, toks=[[t, None, None] for t in tokens(p)], sents=[[a, b, None, None] for a, b in phrases(tokens(p))]) for p in e["pages"]]
        sortie = []; offset = 0
        for k, p in enumerate(pages):
            img = S / "img" / f'{e["id"]}-{k}.webp'
            layout = None
            if k and e["layout"]:
                layout = dict(type=e["layout"]["type"], breaks=[dict(at=r["at"]-offset, kind=r["kind"]) for r in e["layout"]["breaks"] if offset <= r["at"] < offset + len(p["toks"])])
            sortie.append(dict(img=f'img/{e["id"]}-{k}.webp' if k and img.exists() else None, a=p["a"], b=p["b"], toks=p["toks"], sents=p["sents"], layout=layout))
            if k: offset += len(p["toks"])
        eps.append(dict(id=e["id"], num=e["num"], titre=e["titre"], semaine=e["semaine"], theme=e["theme"], mots=e["mots"],
                        collection=e["collection"], source=e["source"], fluence=e["fluence"], ouvertureFamille=e["ouvertureFamille"], layout=e["layout"],
                        audio=f'audio/{e["id"]}.mp3' if sortie[1]["a"] is not None else None,
                        nbMots=sum(1 for p in sortie[1:] for t in p["toks"] if est_mot(t[0])), pages=sortie))
    return eps, rapport


POLICES = [("Andika", "400", "normal", "andika-400-normal"), ("Andika", "700", "normal", "andika-700-normal"), ("Grandstander", "100 900", "normal", "grandstander")]
SCRIPTS = ["maison-cloud-config.js", "parents-acces.js", "plateforme.js", "commun.js", "ecran.js", "telephone.js", "parents-progres.js", "installation-animation.js", "parents-installation.js", "parents.js", "envoi-maison.js", "maison-cloud.js"]
VENDOR = ["nostr-lite.js", "mqtt.min.js", "qrcode.js"]


def verifie_config_maison():
    """Refuse de publier une clé serveur à la place de la clé publique."""
    try:
        contenu = lire(S / "maison-cloud-config.js").split("window.BANC_MAISON =", 1)[1].strip().removesuffix(";")
        config = json.loads(contenu)
        if set(config) != {"url", "publishableKey"}: raise ValueError()
        url, cle = config["url"], config["publishableKey"]
        if url == "" and cle == "": return
        if not isinstance(cle, str) or not isinstance(url, str) or not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url): raise ValueError()
        if re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", cle): return
        morceaux = cle.split(".")
        if len(morceaux) == 3:
            payload = json.loads(base64.urlsafe_b64decode(morceaux[1] + "=" * (-len(morceaux[1]) % 4)))
            if payload.get("role") == "anon": return
        raise ValueError()
    except Exception:
        raise SystemExit("Configuration maison refusée : utiliser uniquement l'URL Supabase et sa clé publique publishable/anon. Aucune clé secrète ne peut être publiée.")


def page(eps, web, en_ligne, media=None):
    ff = "".join('@font-face{font-family:"%s";font-style:%s;font-weight:%s;font-display:swap;src:url(data:font/woff2;base64,%s) format("woff2")}\n'
                 % (n, st, w, base64.b64encode((S / "polices" / (f + ".woff2")).read_bytes()).decode()) for n, w, st, f in POLICES)
    tete = ('<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icones/icone-192.png?v=2">\n<link rel="apple-touch-icon" href="icones/icone-180.png?v=2">'
            if en_ligne else "")
    data = dict(episodes=eps)
    if media:  # version hors ligne : voix et images dans la page
        for e in data["episodes"]:
            if e["audio"]: e["audio"] = media(e["audio"])
            for p in e["pages"]:
                if p["img"]: p["img"] = media(p["img"])
    js = lambda s: s.replace("</script", "<\\/script")
    def script(nom):
        contenu = lire(S / nom)
        if media and nom == "installation-animation.js":
            contenu = re.sub(r'([\"\'])(img/installation-(?:ios|android)-[0-9]+\.png)\1',
                             lambda m: json.dumps(media(m.group(2))), contenu)
        return js(contenu)
    donnees = "window.__BANC=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + ";\nwindow.BANC_WEB=" + json.dumps(web) + ";"
    if en_ligne:
        scripts = "".join(f'<script src="vendor/{v}"></script>\n' for v in VENDOR)
    else:
        scripts = "".join(f"<script>\n{js(lire(S / 'vendor' / v))}\n</script>\n" for v in VENDOR)
    scripts += f"<script>\n{donnees}\n</script>\n" + "".join(f"<script>\n{script(f)}\n</script>\n" for f in SCRIPTS) + "<script>Banc.demarre();</script>\n"
    logo = media("icones/icone-192.png") if media else "icones/icone-192.png?v=2"
    return lire(S / "shell.html").replace("__TETE__", tete).replace("__LOGO__", logo).replace("__POLICES__", ff).replace("__SCRIPTS__", scripts)


def main():
    verifie_config_maison()
    eps, rapport = donnees()
    web = adresse_web()
    if W.exists(): shutil.rmtree(W)
    W.mkdir()
    (W / "index.html").write_text(page(json.loads(json.dumps(eps)), web, True), encoding="utf-8")
    for d in ("img", "audio", "vendor", "icones"):
        if (S / d).is_dir(): shutil.copytree(S / d, W / d, ignore=shutil.ignore_patterns(".*", "*.md"))
    (W / "manifest.webmanifest").write_text(json.dumps({
        "name": "Fluence", "short_name": "Fluence", "lang": "fr", "display": "standalone",
        "background_color": "#F2F4EF", "theme_color": "#1D7F48",
        "icons": [{"src": "icones/icone-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icones/icone-512.png", "sizes": "512x512", "type": "image/png"},
                  {"src": "icones/icone-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}, ensure_ascii=False, indent=1), encoding="utf-8")
    # Une seule identité publique pour toutes les familles Android. L'accès
    # personnel reste dans le stockage du téléphone, jamais dans le WebAPK.
    parents = json.loads((W / "manifest.webmanifest").read_text(encoding="utf-8"))
    parents.update(id="./parents-app", start_url="./#parents&app=1", scope="./")
    (W / "parents.webmanifest").write_text(json.dumps(parents, ensure_ascii=False, indent=1), encoding="utf-8")
    (W / ".nojekyll").write_text("")
    for l in rapport: print(l)
    taille = sum(f.stat().st_size for f in W.rglob("*") if f.is_file())
    print("www/ :", (W / "index.html").stat().st_size // 1024, "Ko pour index.html,", round(taille / 1e6, 1), "Mo en tout", ("; adresse publiée : " + web) if web else "")
    if "--hors-ligne" in sys.argv:
        types = {".mp3": "audio/mpeg", ".webp": "image/webp", ".png": "image/png"}
        media = lambda chemin: f"data:{types[pathlib.Path(chemin).suffix]};base64," + base64.b64encode((S / chemin).read_bytes()).decode()
        H = ROOT / "hors-ligne"; H.mkdir(exist_ok=True)
        f = H / "Le banc des maîtres - HORS LIGNE.html"
        f.write_text(page(json.loads(json.dumps(eps)), web, False, media), encoding="utf-8")
        print(f.relative_to(ROOT), ":", round(f.stat().st_size / 1e6, 1), "Mo")


if __name__ == "__main__":
    main()

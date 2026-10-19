"""Prépare les enregistrements de la maîtresse pour l'appli.

Usage : python3 outils/voix.py                 traite tous les enregistrements de contenu/enregistrements/ (E1.m4a, « Épisode 2.m4a »…)
        python3 outils/voix.py T1             prépare un texte Tamallette (T1.m4a…T6.m4a)
        python3 outils/voix.py E5 --refaire    retraite un épisode déjà prêt (son et coupes), avec la transcription déjà faite
        python3 outils/voix.py E5 --retranscrire   refait aussi la transcription (après un nouvel enregistrement)

Pour chaque enregistrement (un fichier par épisode, une pause d'environ 2 secondes entre les pages) :
1. transcription mot à mot avec faster-whisper (modèle « small », sur l'ordinateur ; `pip install faster-whisper`) ;
2. reprises : quand la lectrice revient en arrière pour relire un passage, on garde la dernière lecture
   et on coupe la précédente du son ;
3. son nettoyé (volume égalisé, mono, MP3 64 kb/s) dans src/audio/E1.mp3 ;
4. transcription recalée sur le son nettoyé, avec ses silences, dans contenu/transcriptions/E1.json.
Le calage du texte lui-même (pages, phrases, mots) est refait à chaque assemblage par outils/build.py.
Il faut ffmpeg (brew install ffmpeg).
"""
import difflib, functools, json, pathlib, re, subprocess, sys, tempfile, unicodedata
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from textes import ROOT, episodes, tokens, norm

ENR = ROOT / "contenu" / "enregistrements"
TR = ROOT / "contenu" / "transcriptions"
AUDIO = ROOT / "src" / "audio"


def duree(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout)


def silences(f, n="-38dB", d=0.18):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(f), "-af", f"silencedetect=n={n}:d={d}", "-f", "null", "-"], capture_output=True, text=True).stderr
    dur = duree(f); sil = []; cur = None
    for line in err.splitlines():
        a = re.search(r"silence_start: (-?[\d.]+)", line); b = re.search(r"silence_end: ([\d.]+)", line)
        if a: cur = max(0.0, float(a.group(1)))
        if b: sil.append([round(cur if cur is not None else 0.0, 3), round(float(b.group(1)), 3)]); cur = None
    if cur is not None: sil.append([round(cur, 3), round(dur, 3)])
    return dur, sil


_modele = None
def transcrit(f):
    global _modele
    import numpy as np
    from faster_whisper import WhisperModel
    if _modele is None:
        _modele = WhisperModel("small", device="cpu", compute_type="int8")
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
    segs, _ = _modele.transcribe(np.frombuffer(pcm, np.float32), language="fr", word_timestamps=True, beam_size=5, condition_on_previous_text=False)
    return [[w.word, round(float(w.start), 3), round(float(w.end), 3), round(float(w.probability), 3)] for s in segs for w in s.words]


def groupes(words, sil, pause=0.5):
    """Morceaux de lecture : les mots entre deux pauses d'au moins 0,5 s (la transcription étire souvent
    le mot d'avant jusque dans la pause : on regarde donc si la pause tombe entre les débuts de deux mots)."""
    grands = [(a + b) / 2 for a, b in sil if b - a >= pause]
    res = []; cur = []
    for w in words:
        if cur and any(cur[-1][1] + 0.1 < m < w[1] for m in grands):
            res.append(cur); cur = []
        cur.append(w)
    if cur: res.append(cur)
    return res


@functools.lru_cache(maxsize=None)
def _sim(a, b):
    return 2 if a == b else (1 if difflib.SequenceMatcher(None, a, b).ratio() >= 0.6 else -1)


def place(texte, morceau):
    """Où se trouve ce morceau de lecture dans le texte (alignement local, mot à mot) : (début, fin, score) ou None."""
    m = [norm(w[0]) for w in morceau]; m = [x for x in m if x]
    if not m: return None
    T = texte; n, k = len(T), len(m)
    sim = _sim
    H = [[0] * (k + 1) for _ in range(n + 1)]; best = (0, 0, 0)
    for i in range(1, n + 1):
        for j in range(1, k + 1):
            v = max(0, H[i - 1][j - 1] + sim(T[i - 1], m[j - 1]), H[i - 1][j] - 1, H[i][j - 1] - 1)
            H[i][j] = v
            if v > best[0]: best = (v, i, j)
    sc, i, j = best
    if sc < max(4, k):  # moins d'un mot sur deux retrouvé : bruit, ou transcription inventée
        return None
    fin = i - 1
    while i > 0 and j > 0 and H[i][j] > 0:  # remonte jusqu'au début de l'alignement
        d = H[i - 1][j - 1] + sim(T[i - 1], m[j - 1])
        if H[i][j] == d: i, j = i - 1, j - 1
        elif H[i][j] == H[i - 1][j] - 1: i -= 1
        else: j -= 1
    return (i, fin, sc)


def analyse(texte, words, sil):
    """Passages relus : on garde la dernière lecture. Rend les intervalles de temps à couper, la fin de la lecture
    et, si la lectrice a continué après le dernier mot du texte, le moment où le son doit s'arrêter."""
    gardes = []  # (morceau, début, fin dans le texte)
    coupes = []
    suite = None
    for g in groupes(words, sil):
        p = place(texte, g)
        if gardes and gardes[-1][2] >= len(texte) - 1 and not p:
            # Une reprise finale encore reconnue doit passer par la détection des reprises ci-dessous.
            suite = g[0][1]  # seul un passage hors du texte marque la suite à laisser de côté
            break
        if not p: continue  # bruit, ou transcription inventée dans un silence
        d, f, _ = p
        if gardes and d <= gardes[-1][2] - 2:  # retour en arrière d'au moins trois mots : une reprise
            jetes = []
            while gardes and gardes[-1][1] >= d - 1:
                jetes.append(gardes.pop())
            if jetes:  # du début de la première lecture jusqu'au début de la reprise
                premier = min(x[0][0][1] for x in jetes)
                coupes.append((round(max(0.0, premier - 0.15), 3), round(g[0][1] - 0.15, 3)))
        gardes.append((g, d, f))
    fin = max((x[0][-1][2] for x in gardes), default=None)
    arret = None if fin is None or suite is None else round(max(fin + 0.15, min(fin + 1.2, suite - 0.12)), 3)
    return coupes, fin, arret


def coupe(src, dst, coupes, fin_parole, arret=None):
    """Son nettoyé : passages coupés, silence final raccourci (ou arrêt avant la suite lue en trop), volume égalisé, MP3 mono 64 kb/s."""
    dur = duree(src)
    garde = []; t = 0.0
    for a, b in sorted(coupes):
        if a > t: garde.append((t, a))
        t = max(t, b)
    garde.append((t, min(dur, arret if arret is not None else fin_parole + 1.2)))
    parts = "".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[p{i}];" for i, (a, b) in enumerate(garde))
    filtre = parts + "".join(f"[p{i}]" for i in range(len(garde))) + f"concat=n={len(garde)}:v=0:a=1,highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11[s]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", filtre, "-map", "[s]", "-ac", "1", "-ar", "44100",
                    "-c:a", "libmp3lame", "-b:a", "64k", str(dst)], check=True)
    return garde


def decale(words, garde):
    """Temps de la transcription d'origine → temps du son nettoyé (les mots coupés disparaissent)."""
    res = []; pos = []; acc = 0.0
    for a, b in garde: pos.append((a, b, acc)); acc += b - a
    for w in words:
        for a, b, o in pos:
            if a - 0.02 <= w[1] < b:
                res.append([w[0], round(w[1] - a + o, 3), round(min(w[2], b) - a + o, 3), w[3] if len(w) > 3 else 1.0]); break
    return res


def fichier_de(eid):
    n = eid[1:]
    motif = rf"(^E|pisode\s*){n}\b" if eid.startswith("E") else rf"^T{n}\b"
    for f in sorted(ENR.iterdir()) if ENR.exists() else []:
        if f.suffix.lower() in (".m4a", ".mp3", ".wav", ".aac", ".caf", ".mp4") and re.search(motif, unicodedata.normalize("NFC", f.stem), re.I):
            return f
    return None


def main():
    retranscrire = "--retranscrire" in sys.argv
    refaire = retranscrire or "--refaire" in sys.argv
    voulus = [a for a in sys.argv[1:] if re.fullmatch(r"[ET]\d+", a)]
    TR.mkdir(parents=True, exist_ok=True); AUDIO.mkdir(parents=True, exist_ok=True)
    for ep in episodes():
        if voulus and ep["id"] not in voulus: continue
        src = fichier_de(ep["id"])
        out = TR / (ep["id"] + ".json")
        if not src:
            continue
        if out.exists() and not refaire and (AUDIO / (ep["id"] + ".mp3")).exists():
            print(ep["id"], ": déjà prêt (--refaire pour recommencer)"); continue
        brut = TR / (ep["id"] + ".brut.json")
        if brut.exists() and not retranscrire and json.loads(brut.read_text(encoding="utf-8")).get("taille") == src.stat().st_size:
            b = json.loads(brut.read_text(encoding="utf-8"))
        else:
            print(ep["id"], ": transcription de", src.name, "…", flush=True)
            dur, sil = silences(src)
            b = dict(source=src.name, taille=src.stat().st_size, dur=dur, sil=sil, words=transcrit(src))
            brut.write_text(json.dumps(b, ensure_ascii=False), encoding="utf-8")
        texte = [norm(t) for p in ep["pages"] for t in tokens(p)]
        texte = [x for x in texte if x]
        cps, fin_parole, arret = analyse(texte, b["words"], b["sil"])
        if fin_parole is None: print(ep["id"], ": enregistrement méconnaissable, laissé de côté"); continue
        dst = AUDIO / (ep["id"] + ".mp3")
        garde = coupe(src, dst, cps, fin_parole, arret)
        dur, sil = silences(dst)
        words = decale(b["words"], garde)
        out.write_text(json.dumps(dict(source=src.name, coupes=cps, dur=dur, sil=sil, words=words), ensure_ascii=False), encoding="utf-8")
        print(ep["id"], ": prêt,", round(dur, 1), "s", ("; reprise coupée : " + ", ".join(f"{a:.1f}–{b:.1f} s" for a, b in cps)) if cps else "",
              f"; lecture arrêtée à {arret:.1f} s (la suite dépasse le texte)" if arret is not None else "", flush=True)


if __name__ == "__main__":
    main()

"""Lecture des épisodes (contenu/episodes.txt et contenu/infos.json), découpage en mots et en phrases, typographie française.

Format de contenu/episodes.txt : un épisode commence par « ## E1 Titre », suivi d'une ligne par page.
Les mots sont découpés comme le surligneur les montre : la ponctuation reste collée au mot qui la précède
(avec une espace insécable devant « : ; ! ? » et à l'intérieur des guillemets).
"""
import json, pathlib, re, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
NB = " "  # espace insécable
LETTRE = r"[0-9A-Za-zÀ-ÖØ-öø-ÿœŒ]"


def norm(s):
    """Forme sans accents ni ponctuation, pour comparer le texte et la transcription."""
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.replace("œ", "oe").replace("æ", "ae"))


def typo(t):
    """Typographie française : apostrophes courbes, espaces insécables, guillemets."""
    t = t.replace("'", "’").replace(" ", " ").replace(NB, " ")
    t = re.sub(r",\s*»", " »,", t)
    t = re.sub(r"«\s*", "« ", t)
    t = re.sub(r"\s*»", " »", t)
    t = re.sub(r"(?<=[^\s!?:;«(])([:;?!])", r" \1", t)
    t = re.sub(r"\s+([:;?!])", r" \1", t)
    t = re.sub(r"([?!])\s+([?!])", r"\1\2", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    t = re.sub(r" ([:;?!»])", NB + r"\1", t)
    t = re.sub(r"« ", "«" + NB, t)
    return t


def tokens(text):
    raw = text.replace(NB, " ").split()
    out = []; pend = ""
    for r in raw:
        if not re.search(LETTRE, r):
            if r in ("«", "“", "(", "—", "–", "-"):
                pend += r + NB; continue
            if out: out[-1] += NB + r if r[0] in "»:;!?”)" else r
            else: pend += r + NB
            continue
        out.append(pend + r); pend = ""
    if pend and out: out[-1] += pend.rstrip(NB)
    return out


def phrases(toks):
    """Découpe en phrases : (premier mot, dernier mot). « ? » ou « ! » suivi d'une minuscule ne coupe pas (« Venez voir ! » appelle-t-elle)."""
    res = []; st = 0
    for i, t in enumerate(toks):
        core = t.rstrip("»”)" + NB + " ")
        fin = i == len(toks) - 1
        if not fin and re.search(r"[.!?…]$", core):
            nxt = toks[i + 1].lstrip("«“(" + NB + " ")
            if core.endswith(".") or core.endswith("…") or nxt[:1].isupper() or toks[i + 1].startswith("«"):
                fin = True
        if fin:
            res.append((st, i)); st = i + 1
    return res


def est_mot(t):
    return bool(re.search(LETTRE, t))


def episodes():
    """Liste des épisodes : id, numéro, titre, infos (semaine, thème, mots à préparer) et pages (la page 0 est le titre)."""
    infos = json.loads((ROOT / "contenu" / "infos.json").read_text(encoding="utf-8"))
    brut = (ROOT / "contenu" / "episodes.txt").read_text(encoding="utf-8")
    eps = []
    for bloc in brut.split("## ")[1:]:
        lignes = [l.strip() for l in bloc.strip().split("\n") if l.strip()]
        eid, titre = lignes[0].split(" ", 1)
        pages = [typo(titre)] + [typo(l) for l in lignes[1:]]
        info = infos.get(eid, {})
        eps.append(dict(id=eid, num=int(eid[1:]), titre=typo(titre), pages=pages,
                        semaine=info.get("semaine", ""), theme=info.get("theme", ""),
                        mots=[typo(m) for m in info.get("mots", [])]))
    return eps

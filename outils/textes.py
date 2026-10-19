"""Lecture des épisodes (contenu/episodes.txt et contenu/infos.json), découpage en mots et en phrases, typographie française.

Format de contenu/episodes.txt : un épisode commence par « ## E1 Titre », suivi d'une ligne par page.
Les retours visuels attestés par les sources sont séparés dans mise-en-page.json :
ils ne modifient ni ce découpage historique, ni les tokens, ni leur indexation.
Les mots sont découpés comme le surligneur les montre : la ponctuation reste collée au mot qui la précède
(avec une espace insécable devant « : ; ! ? » et à l'intérieur des guillemets).
"""
import hashlib, json, pathlib, re, unicodedata

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


def mise_en_page(eid, pages, metadonnees):
    """Ruptures visuelles, indexées sur les mots existants hors page de titre.

    La signature interdit qu'un texte modifié réutilise silencieusement des
    repères périmés. Aucun caractère du texte ni calage audio n'est modifié.
    """
    meta = metadonnees.get(eid)
    if meta is None:
        return None
    mots = [mot for page in pages[1:] for mot in tokens(page)]
    signature = hashlib.sha256(json.dumps(mots, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    if not isinstance(meta, dict) or meta.get("tokens_sha256") != signature:
        raise ValueError(f"{eid} : les repères de mise en page ne correspondent plus aux mots ; vérifier la source et actualiser les repères.")
    ruptures = meta.get("breaks")
    if meta.get("type") not in ("prose", "vers") or not isinstance(ruptures, list) or not ruptures:
        raise ValueError(f"{eid} : mise en page invalide.")
    precedent = -1
    for rupture in ruptures:
        if not isinstance(rupture, dict) or set(rupture) != {"at", "kind"} or type(rupture["at"]) is not int or not precedent < rupture["at"] < len(mots) or rupture["kind"] not in ("line", "paragraph", "dialogue", "stanza"):
            raise ValueError(f"{eid} : rupture de mise en page invalide.")
        precedent = rupture["at"]
    if ruptures[0]["at"] != 0:
        raise ValueError(f"{eid} : la mise en page doit commencer au premier mot.")
    return dict(type=meta["type"], breaks=[dict(r) for r in ruptures])


def episodes():
    """Liste des épisodes : id, numéro, titre, infos (semaine, thème, mots à préparer) et pages (la page 0 est le titre)."""
    infos = json.loads((ROOT / "contenu" / "infos.json").read_text(encoding="utf-8"))
    disposition = json.loads((ROOT / "contenu" / "mise-en-page.json").read_text(encoding="utf-8"))
    if disposition.get("version") != 1 or not isinstance(disposition.get("episodes"), dict):
        raise ValueError("Format des repères de mise en page inconnu.")
    brut = (ROOT / "contenu" / "episodes.txt").read_text(encoding="utf-8")
    eps = []
    for bloc in brut.split("## ")[1:]:
        lignes = [l.strip() for l in bloc.strip().split("\n") if l.strip()]
        eid, titre = lignes[0].split(" ", 1)
        pages = [typo(titre)] + [typo(l) for l in lignes[1:]]
        info = infos.get(eid, {})
        fluence = info.get("fluence", True)
        if not isinstance(fluence, bool):
            raise ValueError(f"{eid} : disponibilité fluence invalide.")
        eps.append(dict(id=eid, num=int(eid[1:]), titre=typo(titre), pages=pages,
                        semaine=info.get("semaine", ""), theme=info.get("theme", ""),
                        collection=info.get("collection", "feuilleton"), source=info.get("source", ""),
                        fluence=fluence, ouvertureFamille=info.get("ouvertureFamille"), layout=mise_en_page(eid, pages, disposition["episodes"]),
                        mots=[typo(m) for m in info.get("mots", [])]))
    return eps

"""Calage du texte exact sur l'enregistrement (repris de la bibliothèque sonore de septembre 2026).

Entrée : la transcription mot à mot de l'enregistrement d'un épisode (contenu/transcriptions/E1.json, faite par outils/voix.py)
et le texte des pages. Sortie : pour chaque page, son début et sa fin dans l'enregistrement, et les temps de chaque mot
et de chaque phrase. Les pages sont séparées par les grandes pauses ; les phrases par les silences ; les mots
par la transcription (quand elle reconnaît le mot), sinon au prorata de leur longueur.
Rien que la bibliothèque standard de Python : l'assemblage du site refait ce calage à chaque fois, donc une
correction du texte ne demande pas de refaire la transcription.
"""
import difflib
from textes import norm, tokens, phrases


def ilots(dur, sil):
    """Moments où l'on parle (entre les silences)."""
    sil = sorted(sil); isl = []; t = 0.0
    for a, b in sil:
        if a > t + 0.02: isl.append((t, a))
        t = max(t, b)
    if dur > t + 0.02: isl.append((t, dur))
    isl = [(a, b) for a, b in isl if b - a >= 0.08] or isl
    return isl or [(0.0, dur)]


class TempsParole:
    """Temps « en parole seule » (sans les silences), pour répartir les mots là où l'on parle."""
    def __init__(s, isl):
        s.isl = isl; s.cum = [0]
        for a, b in isl: s.cum.append(s.cum[-1] + (b - a))
    def vers_p(s, t):
        for k, (a, b) in enumerate(s.isl):
            if t < a: return s.cum[k]
            if t <= b: return s.cum[k] + (t - a)
        return s.cum[-1]
    def vers_r(s, u, suivant=True):
        n = len(s.isl)
        for k, (a, b) in enumerate(s.isl):
            lim = s.cum[k + 1]
            if (u < lim - 1e-9) or (not suivant and u <= lim + 1e-9) or k == n - 1:
                return min(b, a + max(0.0, u - s.cum[k]))
        return s.isl[-1][1]


def temps_transcription(toks, words):
    """Pour chaque mot du texte, (début, fin) selon la transcription, ou None s'il n'y est pas reconnu."""
    T = ""; owner = []
    for i, t in enumerate(toks):
        n = norm(t); T += n; owner += [i] * len(n)
    W = ""; wt = []
    for w in words:
        n = norm(w[0]); s, e = w[1], w[2]
        for j in range(len(n)):
            W += n[j]; wt.append((s + (e - s) * j / len(n), s + (e - s) * (j + 1) / len(n)))
    sm = difflib.SequenceMatcher(None, T, W, autojunk=False)
    got = {}
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            got.setdefault(owner[a + k], []).append(wt[b + k])
    res = [None] * len(toks)
    for i, t in enumerate(toks):
        L = len(norm(t)); g = got.get(i, [])
        if L and len(g) >= max(1, 0.5 * L):
            res[i] = (min(x for x, _ in g), max(y for _, y in g))
    return res


def cale_page(toks, dur, sil, words):
    """Une page lue seule, de 0 à dur : temps de chaque mot [mot, début, fin] et de chaque phrase [i0, i1, début, fin]."""
    if not toks: return [], []
    sents = phrases(toks)
    isl = ilots(dur, sil)
    a0, b0 = isl[0][0], isl[-1][1]
    internes = [(a, b) for a, b in sil if a > a0 + 0.01 and b < b0 - 0.01]
    K = len(sents) - 1
    wl = [max(1, len(norm(t))) + 1 for t in toks]
    wt = temps_transcription(toks, words)
    TP = TempsParole(isl); tot = TP.vers_p(b0)
    spans = None
    if K == 0: spans = [(a0, b0)]
    else:
        gaps = [g for g in internes if g[1] - g[0] >= 0.2]
        cum = 0; allw = sum(wl); preds = []
        for k, (i0, i1) in enumerate(sents[:-1]):
            cum += sum(wl[i0:i1 + 1])
            pp = TP.vers_r(tot * cum / allw)
            e = wt[i1]; nx = wt[sents[k + 1][0]]
            if e and nx and nx[0] >= e[1] - 0.3: p = (e[1] + nx[0]) / 2; src = 1
            elif e: p = e[1] + 0.2; src = 1
            elif nx: p = nx[0] - 0.2; src = 1
            else: p = pp; src = 0
            preds.append((p, src))
        bounds = []; start = 0; last = a0
        for k, (p, src) in enumerate(preds):
            cands = []
            for j in range(start, len(gaps)):
                g = gaps[j]; mid = (g[0] + g[1]) / 2
                if g[0] <= last: continue
                if src:
                    if not (g[0] - 0.3 <= p <= g[1] + 0.3 or abs(mid - p) <= 0.5): continue
                    sc = -abs(mid - p) * 1.6 + 0.9 * min(g[1] - g[0], 1.2)
                else:
                    sc = -abs(mid - p) * 0.6 + 0.9 * min(g[1] - g[0], 1.2)
                cands.append((sc, j))
            if cands:
                sc, j = max(cands); g = gaps[j]; bounds.append((g[0], g[1])); start = j + 1; last = g[1]
            else:
                q = max(p, last + 0.05); bounds.append((q, q)); last = q
        edges = [a0] + [x for g in bounds for x in g] + [b0]
        spans = [(edges[2 * k], edges[2 * k + 1]) for k in range(K + 1)]
        if any(b <= a for a, b in spans): spans = None
    times = [None] * len(toks)
    spans_iter = [((0, len(toks) - 1), (a0, b0))] if spans is None else list(zip(sents, spans))

    def remplit(i0, i1, sa, sb, ancres):
        idx = list(range(i0, i1 + 1)); anch = {}; last = sa - 0.01
        if ancres:
            for i in idx:
                w = wt[i]
                if w and sa - 0.15 <= w[0] <= sb + 0.15 and w[0] >= last:
                    anch[i] = w; last = w[0]
        us = TP.vers_p(sa); ue = TP.vers_p(sb)
        start_u = {}
        for i, w in anch.items(): start_u[i] = min(max(TP.vers_p(max(w[0], sa)), us), ue)
        start_u[i0] = us
        keys = sorted(start_u); clean = []; prev = -1
        for k in keys:
            if start_u[k] >= prev: clean.append(k); prev = start_u[k]
        keys = clean
        def interp(i_from, i_to, u_from, u_to):
            ws = wl[i_from:i_to]; tt = sum(ws) or 1; acc = 0
            for j, i in enumerate(range(i_from, i_to)):
                start_u[i] = u_from + (u_to - u_from) * acc / tt; acc += ws[j]
        for k, kn in zip(keys, keys[1:] + [i1 + 1]):
            u_to = start_u[kn] if kn <= i1 else ue
            if kn - k > 1 or kn > i1: interp(k, kn, start_u[k], u_to)
        out = {}
        for i in idx:
            s_ = start_u[i]; e = start_u[i + 1] if i < i1 else ue
            out[i] = [TP.vers_r(s_, True), TP.vers_r(max(s_, e), False)]
        return out

    def defauts(res):
        bad = 0
        for i, (x, y) in res.items():
            L = len(norm(toks[i]))
            if L > 2 and y - x < 0.08: bad += 1
            if L and (y - x) / L > 0.45: bad += 1
        return bad

    for (i0, i1), (sa, sb) in spans_iter:
        A = remplit(i0, i1, sa, sb, True); B = remplit(i0, i1, sa, sb, False)
        res = A if defauts(A) <= defauts(B) else B
        for i, v in res.items(): times[i] = v
    # les mots très courts reçoivent une durée minimale, prise au voisin
    for _ in range(3):
        for i in range(len(times) - 1):
            a, b = times[i]; c, d = times[i + 1]
            if abs(b - c) > 0.02: continue
            need_i = min(0.07 + 0.035 * len(norm(toks[i])), 0.35); need_n = min(0.07 + 0.035 * len(norm(toks[i + 1])), 0.35)
            if b - a < need_i and d - c > need_n:
                m = min(a + need_i, d - need_n); times[i][1] = m; times[i + 1][0] = m
            elif d - c < need_n and b - a > need_i:
                m = max(d - need_n, a + need_i); times[i][1] = m; times[i + 1][0] = m
    # un mot commence au début de la parole s'il tombait dans un silence, et finit avant le silence suivant
    for i, t in enumerate(times):
        s, e = t
        need = min(0.07 + 0.035 * len(norm(toks[i])), 0.3)
        for k, (a, b) in enumerate(isl):
            if s < a and e > a: s = a
            if a <= s <= b:
                if e > b + 0.05:
                    if b - s >= need: e = b
                    elif k + 1 < len(isl):
                        gap = isl[k + 1][0] - b
                        if gap >= 0.4:
                            s = isl[k + 1][0]; e = max(min(e, isl[k + 1][1]), s + need)
                break
        times[i] = [round(s, 3), round(max(e, s + 0.05), 3)]
    for i in range(1, len(times)):
        if times[i][0] < times[i - 1][1] - 0.001:
            times[i - 1][1] = max(times[i - 1][0] + 0.05, min(times[i - 1][1], times[i][0]))
    sent_out = [[i0, i1, times[i0][0], times[i1][1]] for i0, i1 in sents]
    return [[t, times[i][0], times[i][1]] for i, t in enumerate(toks)], sent_out


def cale_episode(pages, tr):
    """pages : textes des pages (la 0 est le titre) ; tr : {dur, sil, words}.
    Rend une liste par page : {a, b, toks, sents, reconnus} (a = b = None pour un titre qui n'est pas lu)."""
    dur, sil, words = tr["dur"], [tuple(x) for x in tr["sil"]], tr["words"]
    toks_p = [tokens(p) for p in pages]
    tous = [t for tk in toks_p for t in tk]
    owner = [k for k, tk in enumerate(toks_p) for _ in tk]
    wt = temps_transcription(tous, words)
    par_page = [[wt[i] for i in range(len(tous)) if owner[i] == k] for k in range(len(pages))]
    reconnus = [sum(1 for x in pp if x) / max(1, len(pp)) for pp in par_page]
    lues = [k for k in range(len(pages)) if reconnus[k] >= (0.5 if k == 0 else 0.2)]
    if not lues: raise ValueError("enregistrement méconnaissable")
    # bornes des pages lues : la plus grande pause entre la fin d'une page et le début de la suivante
    debut = {}; fin = {}
    for k in lues:
        xs = [x for x in par_page[k] if x]
        debut[k] = min(x[0] for x in xs); fin[k] = max(x[1] for x in xs)
    coupes = {}
    for k, kn in zip(lues, lues[1:]):
        e, s = fin[k], debut[kn]
        cand = [g for g in sil if g[1] > e - 0.3 and g[0] < s + 0.3]
        if cand:
            g = max(cand, key=lambda g: g[1] - g[0])
            coupes[kn] = max(g[0] + 0.05, g[1] - 0.3)
        else:
            coupes[kn] = (e + s) / 2
    res = []
    for k in range(len(pages)):
        if k not in lues:
            res.append(dict(a=None, b=None, toks=[[t, None, None] for t in toks_p[k]], sents=[[a, b, None, None] for a, b in phrases(toks_p[k])], reconnus=reconnus[k]))
            continue
        i = lues.index(k)
        A = coupes.get(k, max(0.0, debut[k] - 0.4))
        B = coupes[lues[i + 1]] if i + 1 < len(lues) else dur
        s_loc = [(max(0.0, a - A), min(B, b) - A) for a, b in sil if b > A and a < B]
        w_loc = [(w[0], w[1] - A, w[2] - A) for w in words if A - 0.05 <= w[1] < B]
        tk, se = cale_page(toks_p[k], B - A, s_loc, w_loc)
        tk = [[t, round(s + A, 3), round(e + A, 3)] for t, s, e in tk]
        se = [[i0, i1, round(s + A, 3), round(e + A, 3)] for i0, i1, s, e in se]
        res.append(dict(a=round(A, 3), b=round(B, 3), toks=tk, sents=se, reconnus=round(reconnus[k], 2)))
    return res

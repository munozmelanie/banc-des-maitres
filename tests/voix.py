"""Contrôles ciblés des coupes audio, sans transcription ni écriture de fichiers.

Usage : python3 -B tests/voix.py
"""
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "outils"))
from textes import episodes, norm, tokens
from voix import analyse, decale


def mots(texte, debut):
    return [[mot, round(debut + i * 0.3, 3), round(debut + i * 0.3 + 0.2, 3), 1]
            for i, mot in enumerate(texte)]


class CoupesVoix(unittest.TestCase):
    def test_reprise_de_la_derniere_phrase(self):
        texte = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]
        parole = mots(texte[:3], 1) + mots(texte[3:], 3) + mots(texte[3:], 5)
        self.assertEqual(analyse(texte, parole, [[1.8, 3], [3.8, 5]]),
                         ([(2.85, 4.85)], 5.8, None))

    def test_suite_hors_extrait(self):
        texte = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"]
        parole = mots(texte, 1) + mots(["hibou", "kangourou", "zebre", "quartz"], 5)
        self.assertEqual(analyse(texte, parole, [[2.7, 5]]), ([], 2.7, 3.9))

    def test_t1_garde_exactement_le_calage_existant(self):
        episode = next(e for e in episodes() if e["id"] == "T1")
        texte = [norm(t) for page in episode["pages"] for t in tokens(page) if norm(t)]
        dossier = ROOT / "contenu" / "transcriptions"
        brut = json.loads((dossier / "T1.brut.json").read_text(encoding="utf-8"))
        pret = json.loads((dossier / "T1.json").read_text(encoding="utf-8"))
        self.assertEqual(analyse(texte, brut["words"], brut["sil"]),
                         ([(48.05, 52.69)], 91.18, 91.88))
        self.assertEqual(decale(brut["words"], [(0, 48.05), (52.69, 91.88)]), pret["words"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

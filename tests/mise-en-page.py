"""Repères PDF : ne jamais déplacer les indices des scores et de l'audio.

Exécution : python3 tests/mise-en-page.py. Aucune dépendance PDF nécessaire :
les pages sources ont été relues visuellement avant établissement des repères.
"""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "outils"))
from textes import ROOT, episodes, mise_en_page, tokens
from build import donnees


# Séquences exactes avant l'ajout des seules métadonnées (base d66eda2).
# Elles incluent les titres, la ponctuation et les anciennes limites de pages.
SIGNATURES = {
    'E1': '8497f3d36ff8991113193f63a488b53812f7cc0b26090652faaf75b103c7fb4c',
    'E2': '79f91b87461517386148a126eef77a66d9df6e118682e095b20ca77291bd805d',
    'E3': 'a965f5d5c084ef664ba5a266f628a912ad78e2ccce970ee98776be27b7b1ed00',
    'E4': '6bf532c5f205a37b0aaf98fdf2632251ce30d266d00b3050574c80b53cc24b14',
    'E5': 'b32a5fed4e0484db7634b4fc979685ae245ebec71016c397594e42012fa6399b',
    'E6': '7710da4dd729d7157cf6fe3a6f1d627cd7cf50a6fdeb0c89abfdf03c6663518a',
    'E7': 'f8c10291705088b4a37a3f064b93c2812e4529476a4fb10a1ab86dfc8a8126de',
    'T1': '190e66f74e6ba101b01f2866a921981105726ec5bcc108fa36ae1f3ad07010f5',
    'T2': '9c544b232586142a03f21c96ff1c042c3ae68019b5f6c46ad99c1a5b8706ba16',
    'T3': '7f44fa82deca5dd83047bf671d35d694b8b385017996ff75b7c44fbaa2750c46',
    'T4': 'c5b7a418bcbf6b72f0918ec1606fb786bc4c7c830833320ab1d5dfe8a9026d40',
    'T5': '5459f78d42700b3cfb2774cbbc96b862c106ed6bc940bc56f4ae8535135405e9',
    'T6': '80f8d0774b4c769dd10bfa293795ef459cdaaad6511c071746d7e5b7a011d117',
}


class MiseEnPage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = {e['id']: e for e in episodes()}
        cls.data = {e['id']: e for e in donnees()[0]}
        cls.meta = json.loads((ROOT / 'contenu/mise-en-page.json').read_text())['episodes']

    def test_textes_indices_et_pages_historiques_inchanges(self):
        self.assertEqual(set(self.data), set(SIGNATURES))
        for eid, expected in SIGNATURES.items():
            with self.subTest(eid=eid):
                pages = [[t[0] for t in p['toks']] for p in self.data[eid]['pages']]
                actual = hashlib.sha256(json.dumps(pages, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
                self.assertEqual(actual, expected)

    def test_reperes_relatifs_recomposent_exactement_le_texte_entier(self):
        for eid in self.meta:
            e = self.data[eid]
            self.assertIsNone(e['pages'][0]['layout'])
            offset, rebuilt = 0, []
            for p in e['pages'][1:]:
                self.assertEqual(p['layout']['type'], e['layout']['type'])
                for r in p['layout']['breaks']:
                    self.assertLess(r['at'], len(p['toks']))
                    self.assertGreaterEqual(r['at'], 0)
                    rebuilt.append({'at': r['at'] + offset, 'kind': r['kind']})
                offset += len(p['toks'])
            self.assertEqual(rebuilt, e['layout']['breaks'])

    def test_aucune_rupture_inventee_aux_changements_de_page(self):
        e = self.data['T1']
        offset = sum(len(p['toks']) for p in e['pages'][1:3])
        self.assertFalse(any(r['at'] == offset for r in e['layout']['breaks']))
        self.assertFalse(any(r['at'] == 0 for r in e['pages'][3]['layout']['breaks']))

    def test_vers_et_strophes_attestes(self):
        for eid, lines, stanzas in [('T4', 47, 8), ('T5', 30, 7)]:
            with self.subTest(eid=eid):
                e = self.data[eid]
                self.assertEqual(e['layout']['type'], 'vers')
                self.assertEqual(len(e['layout']['breaks']), lines)
                self.assertEqual(sum(r['kind'] == 'stanza' for r in e['layout']['breaks']), stanzas)
        e = self.data['T5']
        words = [t[0] for p in e['pages'][1:] for t in p['toks']]
        starts = [words[r['at']] for r in e['layout']['breaks'] if r['kind'] == 'stanza']
        self.assertEqual(starts, ['Quand', 'Comme', 'Quelque', 'La', 'Couché,', 'Le', 'Ses'])

    def test_dialogues_et_paragraphes(self):
        for eid in ('T1', 'T3'):
            e = self.data[eid]
            words = [t[0] for p in e['pages'][1:] for t in p['toks']]
            turns = [r for r in e['layout']['breaks'] if r['kind'] == 'dialogue']
            self.assertGreater(len(turns), 4)
            self.assertTrue(all(words[r['at']].startswith('-') for r in turns))
        self.assertEqual(sum(r['kind'] == 'paragraph' for r in self.data['T6']['layout']['breaks']), 2)

    def test_bd_archivee_et_pas_de_structure_inventee_pour_feuilleton(self):
        self.assertFalse(self.data['T2']['fluence'])
        self.assertEqual(self.data['T2']['nbMots'], 336)
        self.assertEqual(sum(e['fluence'] for e in self.data.values()), 12)
        for i in range(1, 8):
            self.assertIsNone(self.data['E'+str(i)]['layout'])

    def test_signature_refuse_reperes_perimes(self):
        pages = self.sources['T5']['pages'][:]
        pages[1] += ' changement'
        with self.assertRaisesRegex(ValueError, 'repères'):
            mise_en_page('T5', pages, self.meta)

    def test_reperes_invalides_refuses(self):
        for bad in [[], [{'at': True, 'kind': 'line'}], [{'at': 1, 'kind': 'line'}], [{'at': 0, 'kind': 'other'}], [{'at': 0, 'kind': 'line'}, {'at': 0, 'kind': 'line'}], [{'at': 0, 'kind': 'line'}, {'at': 9999, 'kind': 'line'}]]:
            with self.subTest(bad=bad):
                meta = copy.deepcopy(self.meta)
                meta['T5']['breaks'] = bad
                with self.assertRaises(ValueError):
                    mise_en_page('T5', self.sources['T5']['pages'], meta)


if __name__ == '__main__':
    unittest.main(verbosity=2)

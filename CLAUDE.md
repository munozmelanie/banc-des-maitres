# Règles du dépôt (pour Claude, Codex et tout assistant de code)

Le dépôt est partagé par Mélanie (l'enseignante, propriétaire) et Alexandre. Le `README.md` décrit l'appli et les commandes.
C'est une appli séparée du Bateau-école, construite sur le même principe (site de l'écran de la classe + téléphone relié, données gardées dans les appareils). La couche « sauvegarde et liaison » (`src/plateforme.js`) est reprise de `bateau-ecole/src/autonome/plateforme.js`.

## Chaque modification

1. Modifier `src/`, `contenu/` ou `outils/`, jamais `www/` ni `hors-ligne/` : ils sont générés et ignorés par Git.
2. Assembler et tester :
   ```
   python3 outils/build.py
   npm test
   ```
3. Publier : `sh outils/publier.sh`. Le script fait le commit et le push sur `main` (la seule branche des sources). Il assemble ensuite le site et le pousse sur la branche `gh-pages`, servie par GitHub Pages (en une à deux minutes). Il refait aussi le fichier hors ligne et le copie dans le dossier « Le banc des maîtres » des Ressources Trans. Il faut une connexion GitHub déjà enregistrée par Git sur le Mac, avec accès en écriture au dépôt. `gh` n’est pas nécessaire.

## Nouveaux enregistrements ou nouvelles images

- Voix : un fichier par épisode dans `contenu/enregistrements/` (`E8.m4a`, ou « Épisode 8.m4a »), puis `python3 outils/voix.py` (il faut `pip install faster-whisper` et ffmpeg). Une reprise (passage relu) est coupée automatiquement : on garde la dernière lecture. Vérifier ensuite le rapport de `outils/build.py` (pourcentage de mots reconnus par page).
- Images : `python3 outils/images.py <dossier>` convertit `E1-1.png`… en `src/img/E1-1.webp` (il faut Pillow). Les originaux restent hors du dépôt.
- Nouveau feuilleton : ajouter les épisodes à `contenu/episodes.txt` et leurs infos (semaine, thème, mots à préparer) à `contenu/infos.json`.

## Git et publication

- Tout faire par le terminal ou les outils GitHub directs, pas par des clics dans GitHub Desktop. Pour Mélanie, `outils/Publier sur GitHub.command` (double-clic) lance `outils/publier.sh`. La première fois, il crée le dépôt public `banc-des-maitres` et active GitHub Pages sur la branche `gh-pages`.
- Pas de GitHub Actions : la publication se fait depuis le Mac, comme pour le Bateau-école (`outils/publier.sh`).

## À ne jamais faire

- Committer des prénoms d'élèves, une sauvegarde de classe (`banc-des-maitres-sauvegarde-*.json`) ou des résultats : le dépôt et le site sont publics. Dans le code, les tests et les exemples, seulement des prénoms inventés (« Test A », ou les personnages du feuilleton).
- Perdre les données de la classe. Les documents `banc/classe`, `banc/resultats` et `banc/reglages` vivent dans les appareils ; tout changement de format doit reprendre les anciennes données (comme `depuisV1()` dans `src/commun.js`) et rester compatible entre le téléphone et l'écran (un essai n'est jamais effacé : il est marqué `suppr`).
- Changer l'identifiant d'un épisode (`E1`…) : les résultats y sont rattachés.

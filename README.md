# Le banc des maîtres

Appli de fluence pour les APC de CM1 : un feuilleton en épisodes d'environ 250 mots, sur les thèmes de la période, lu par la maîtresse. On l'affiche au TBI et on le travaille en six temps : **les mots** à préparer, **j'écoute** (la voix et le surligneur mot à mot), **l'écho** (une phrase écoutée, une phrase répétée), **le chœur** (lire avec la voix, plus lente), **le défi d'une minute** (mots lus correctement par minute) et **les progrès**.

Les personnages (Maya, Sami, Jules, Romy, Gaspard, Marcel le cuisinier et la maîtresse) sont inventés. Chaque semaine, un papier écrit à l'encre verte attend la bande sous le banc des maîtres, le banc de la cour où s'assoient les enseignants.

L'appli est séparée du Bateau-école, mais construite sur le même principe :

- **l'écran de la classe** : le site, ouvert dans le navigateur de l'ordinateur du TBI ;
- **le téléphone de la maîtresse**, relié à l'écran : une télécommande, et surtout le **défi mené depuis le téléphone**. La maîtresse touche en silence les mots mal lus et, à la fin, le dernier mot lu ; l'élève lit au tableau, l'écran montre le chrono puis le résultat (record, mots à retravailler) ;
- **les données restent dans les appareils** : les prénoms et les résultats sont enregistrés dans l'ordinateur et dans le téléphone, jamais sur internet ni dans ce dépôt.

## Utiliser l'appli

1. Sur l'ordinateur de la classe, ouvrir le site (adresse ci-dessous). Avec le bouton **Plein écran**, il remplit le TBI.
2. **Élèves** : taper les prénoms du groupe et leur objectif en mots par minute (facultatif).
3. **Relier le téléphone** : viser le QR code avec l'appareil photo de l'iPhone et toucher le lien. Sans appareil photo, ouvrir le site sur le téléphone et taper le code de l'écran (10 lettres ou chiffres).
4. Sur l'iPhone, ajouter la page à l'écran d'accueil (Safari › Partager › **Sur l'écran d'accueil**) et l'ouvrir ensuite depuis son icône. Elle reste ainsi reliée, et l'iPhone garde les résultats durablement.

Le téléphone a quatre onglets : **Écran** (choisir l'épisode et l'étape, et toucher à distance les boutons de l'écran : écouter, pause, page suivante, phrase suivante, vitesse…), **Défi**, **Élèves** et **Progrès**. Sans écran relié, le défi marche aussi sur le téléphone seul : l'élève lit alors sur le texte imprimé.

Les deux appareils se recopient la classe et tous les résultats à chaque liaison. Un ordinateur remis à zéro retrouve donc tout dès que le téléphone se relie, et inversement. Pour la classe, la version la plus récente gagne. Les essais s'additionnent, et un essai supprimé l'est sur les deux appareils. **Progrès › Exporter une sauvegarde** donne en plus un fichier à garder (clé USB, Drive). **Importer une sauvegarde** remet la classe et ajoute les essais, y compris ceux de la première version (fichier « HORS LIGNE » de septembre).

**Sans internet** : `hors-ligne/Le banc des maîtres - HORS LIGNE.html` est un seul fichier avec les voix et les images, à copier sur l'ordinateur de la classe (dossier « Le banc des maîtres » des Ressources Trans). Le téléphone ne peut s'y relier que si l'ordinateur a internet.

## Comment ça marche

| | |
|---|---|
| `contenu/episodes.txt` | le texte des épisodes : `## E1 Titre`, puis une ligne par page (5 pages) |
| `contenu/infos.json` | semaine, thème et mots à préparer de chaque épisode |
| `contenu/enregistrements/` | les enregistrements de la maîtresse, un fichier par épisode (gardés sur l'ordinateur, hors du dépôt public) |
| `contenu/transcriptions/` | la transcription mot à mot de chaque enregistrement (`E1.brut.json`) et sa version recalée sur le son nettoyé (`E1.json`) |
| `contenu/prompts-chatgpt.txt` | les prompts des illustrations (un par page, même style et mêmes personnages) |
| `src/shell.html` | la page et sa mise en forme |
| `src/plateforme.js` | sauvegarde dans l'appareil et liaison chiffrée écran ↔ téléphone (reprise du Bateau-école) |
| `src/commun.js` | les données (classe, résultats), le calcul du défi, les progrès, les élèves |
| `src/ecran.js` | l'écran de la classe : épisodes, les six étapes, télécommande reçue |
| `src/telephone.js` | le téléphone : liaison, télécommande, défi, élèves, progrès |
| `src/audio/`, `src/img/` | les voix (MP3) et les illustrations (WebP) prêtes pour le site |
| `outils/build.py` | assemble `www/` (le site) et, avec `--hors-ligne`, le fichier unique |
| `outils/voix.py` | prépare un enregistrement : transcription, reprises coupées, son nettoyé |
| `outils/alignement.py` | cale le texte sur la voix (pages, phrases, mots), à chaque assemblage |
| `outils/images.py` | convertit les images de ChatGPT pour le site |
| `outils/publier.sh` | enregistre, envoie sur GitHub et publie le site (branche `gh-pages`) ; `Publier sur GitHub.command` le lance d'un double-clic |

**La voix.** Un enregistrement par épisode, fait au téléphone, avec une pause d'environ deux secondes entre les pages. Une erreur de lecture ? Il suffit de reprendre la phrase ou la page : `outils/voix.py` repère la reprise et garde la dernière lecture. La transcription (faster-whisper, modèle « small ») sert à caler le texte exact sur la voix : chaque page commence après la grande pause, chaque phrase sur un silence, chaque mot sur la transcription quand elle le reconnaît, sinon au prorata de sa longueur. L'assemblage refait ce calage à chaque fois : une correction du texte ne demande pas de réenregistrer, sauf si elle change ce que dit la voix.

**La liaison.** L'écran crée un code de liaison. Le téléphone le reçoit par le QR code (lien `…#lien=CODE&tel`) ou en le tapant. Les messages passent par des relais publics gratuits (Nostr sur le port 443, MQTT en secours), chiffrés de bout en bout (AES-GCM, clé tirée du code) : les relais ne voient que des messages illisibles. L'écran annonce au téléphone ce qu'il montre (épisode, étape, page, boutons). Le téléphone envoie des commandes (`cmd`) et l'état du défi (`defi`). Les documents `banc/classe`, `banc/resultats` et `banc/reglages` se recopient tout seuls.

**Le défi.** Mots lus correctement par minute = (mots lus − erreurs) × 60 ÷ secondes. Le temps est d'une minute ; « Il a fini » arrête plus tôt pour un élève qui finit le texte. Le résultat garde la place des erreurs : l'appli en tire les **mots à retravailler**.

## Commandes

Il faut Python 3 et Node. Lancer `npm install` une fois.

```
python3 outils/build.py                 # crée www/ (le site)
python3 outils/build.py --hors-ligne    # et le fichier unique pour un ordinateur sans internet
npm test                                # assemble et teste dans Chromium : écran seul, téléphone relié par un relais local, petits écrans
python3 outils/voix.py                  # prépare les nouveaux enregistrements (pip install faster-whisper ; ffmpeg)
python3 outils/voix.py E5 --refaire     # recoupe un épisode avec sa transcription déjà faite
python3 outils/images.py ~/Desktop/Images   # convertit les images E1-1.png… (pip install pillow)
python3 outils/icones.py                # redessine les icônes
sh outils/publier.sh                    # enregistre, envoie et publie (voir plus bas)
```

`tests/app.js` fait 34 vérifications. Il essaie l'écran seul : la voix et le surligneur, la page qui se tourne, l'écho, le défi et son calcul. Il essaie ensuite le téléphone relié : code tapé, télécommande, défi mené depuis le téléphone, résultat sur l'écran, essai recopié. Il vérifie enfin qu'un ordinateur tout neuf retrouve la classe et les essais auprès du téléphone, que la suppression d'un essai se propage, et qu'une sauvegarde de la première version s'importe. `#essai-rapide` à la fin de l'adresse ramène le défi à 8 secondes, pour les essais.

## Publier

Double-cliquer sur `outils/Publier sur GitHub.command` (ou `sh outils/publier.sh` dans le Terminal). Le script :

1. enregistre les changements et les envoie sur la branche `main` ;
2. assemble le site et le met sur la branche `gh-pages`, que GitHub Pages publie en une à deux minutes ;
3. refait le fichier hors ligne et le copie dans le dossier « Le banc des maîtres » des Ressources Trans.

La première fois, il crée le dépôt `banc-des-maitres` sur le compte GitHub connecté (`gh auth login`) et active GitHub Pages. Le site est alors à l'adresse `https://<compte>.github.io/banc-des-maitres/`. Le dépôt est public, comme le site du Bateau-école : il contient les textes, la voix et les images, mais aucun prénom ni résultat d'élève.

## Plus tard : l'appli de l'iPhone

Le site ajouté à l'écran d'accueil suffit au téléphone. Une appli Capacitor, comme celle du Bateau-école, garderait les données dans les réglages de l'appli (`Preferences`) plutôt que dans le navigateur. `src/plateforme.js` sait déjà s'en servir, et `capacitor.config.json` est prêt (`com.pookee.bancdesmaitres`). Sur le Mac :

```
npm install
python3 outils/build.py
npx cap add ios
npx cap sync ios
```

Il reste ensuite à compiler et installer comme pour le Bateau-école (`xcodebuild`, puis `xcrun devicectl`, voir son README). Dans l'appli, il faut aussi pouvoir lire le QR code ou taper le code (le lien du QR code ouvre Safari).

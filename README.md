# Fluence

Site : https://munozmelanie.github.io/banc-des-maitres/

L’application s’appelle **Fluence**. « Le banc des maîtres » reste le titre du feuilleton. L’adresse du site, l’identifiant iPhone et les clés de sauvegarde sont conservés pour que les liaisons et les résultats existants restent utilisables.

Appli de fluence pour les APC de CM1 : un feuilleton en épisodes d'environ 250 mots, sur les thèmes de la période, lu par la maîtresse. On l'affiche au TBI et on le travaille en six temps : **les mots** à préparer, **j'écoute** (la voix et le surligneur mot à mot), **l'écho** (une phrase écoutée, une phrase répétée), **le chœur** (lire avec la voix, plus lente), **le défi d'une minute** (mots lus correctement par minute) et **les progrès**.

Les personnages (Maya, Sami, Jules, Romy, Gaspard, Marcel le cuisinier et la maîtresse) sont inventés. Chaque semaine, un papier écrit à l'encre verte attend la bande sous le banc des maîtres, le banc de la cour où s'assoient les enseignants.

Une seconde collection contient les six textes Tamallette prévus dans le plan P2 de Claude. Les textes se lisent dès maintenant, avec les mots à préparer et le défi d'une minute ; les enregistrements seront ajoutés plus tard.

| Identifiant | Semaine | Texte |
|---|---|---|
| T1 | 2 au 6 novembre | Le trafiquant d’ombres |
| T2 | 9 au 13 novembre | Le grimoire d’Elfie |
| T3 | 16 au 20 novembre | Le choulame |
| T4 | 23 au 27 novembre | Le pouvoir des fleurs |
| T5 | 30 novembre au 4 décembre | La fée qui ne voulait pas être remerciée |
| T6 | 7 au 11 décembre | Le feuilleton d’Hermès |

Les cinq extraits de fluence viennent du fichier fourni « 9 - Fluence - textes de la P2.pdf » (textes 7 à 11). Pour **Le grimoire d’Elfie**, absent de ce livret de fluence, l'application reprend les dialogues et le journal des trois pages de BD prévues en lecture (« 11 - Textes de la P2 pour la maison.pdf », pages 2 à 4), sans les bruitages ni les inscriptions décoratives. Cette transcription est identifiée comme telle. Les références, les pages et les crédits sont conservés dans `contenu/tamallette-p2-sources.json`. Le comptage des mots suit la règle habituelle de l'application ; il peut différer du compteur du livret imprimé.

Pour ajouter les voix de Tamallette, placer `T1.m4a` à `T6.m4a` dans `contenu/enregistrements/`, puis lancer `python3 outils/voix.py` et publier. Les résultats du feuilleton restent rattachés aux identifiants E1 à E7 ; ceux de Tamallette utilisent T1 à T6.

L'appli est séparée du Bateau-école, mais construite sur le même principe :

- **l'écran de la classe** : le site, ouvert dans le navigateur de l'ordinateur du TBI ;
- **le téléphone de la maîtresse**, relié à l'écran : une télécommande, et surtout le **défi mené depuis le téléphone**. La maîtresse touche en silence les mots mal lus et, à la fin, le dernier mot lu ; l'élève lit au tableau, l'écran montre le chrono puis le résultat (record, mots à retravailler) ;
- **les données restent dans les appareils** : les prénoms et les résultats sont enregistrés dans l'ordinateur et dans le téléphone. La liaison les transmet chiffrés entre les deux appareils ; ils ne sont publiés ni sur le site ni dans ce dépôt.

## Utiliser l'appli

1. Sur l'ordinateur de la classe, ouvrir le site (adresse ci-dessous). Avec le bouton **Plein écran**, il remplit le TBI.
2. **Élèves** : taper les prénoms du groupe et leur objectif en mots par minute (facultatif).
3. Depuis l'iPhone, toucher **Envoyer le lien à l’ordinateur**, puis ouvrir ce lien sur l'ordinateur de la classe : les deux appareils sont reliés. On peut aussi utiliser **Relier le téléphone** sur l'ordinateur : viser le QR code avec l'appareil photo de l'iPhone ou taper le code de l'écran (10 lettres ou chiffres) dans l'application.
4. Sur l'iPhone, ajouter la page à l'écran d'accueil (Safari › Partager › **Sur l'écran d'accueil**) et l'ouvrir ensuite depuis son icône. Elle reste ainsi reliée, et l'iPhone garde les résultats durablement.

Le téléphone a quatre onglets : **Écran** (choisir l'épisode et l'étape, et toucher à distance les boutons de l'écran : écouter, pause, page suivante, phrase suivante, vitesse…), **Défi**, **Élèves** et **Progrès**. Sans écran relié, le défi marche aussi sur le téléphone seul : l'élève lit alors sur le texte imprimé.

### Importer une liste de classe

Dans **Élèves › Importer une liste de classe**, choisir un fichier **TXT** (un nom par ligne), **CSV/TSV** (colonnes `Prénom`, `Nom`, `Objectif` facultatif, séparées par virgule, point-virgule ou tabulation), ou **JSON**. Le JSON accepte un tableau de noms ou d'objets, `eleves`, et `classe.eleves` des sauvegardes Fluence ou Bateau-école. Les fiches inactives ou vides sont ignorées. Le fichier est lu localement, sans téléversement ; limite de 1 Mo et de 100 élèves.

La prévisualisation permet de corriger un nom ou un objectif et d'écarter une ligne en effaçant son nom. Seul **Importer et enregistrer** valide les changements. Les noms identiques (casse et espaces ignorés, accents conservés) sont regroupés : leurs identifiants, objectifs et résultats existants restent inchangés. Les autres élèves sont ajoutés. Pour deux élèves de même prénom, inclure aussi le nom. Les fiches initiales « Élève n » sont remplacées seulement si elles sont intactes et qu'aucun essai, même supprimé, n'existe. Les autres élèves de la classe ne sont jamais supprimés par cet import.

Les deux appareils se recopient la classe et tous les résultats à chaque liaison. Un ordinateur remis à zéro retrouve donc tout dès que le téléphone se relie, et inversement. Pour la classe, la version la plus récente gagne. Les essais s'additionnent, et un essai supprimé l'est sur les deux appareils. **Progrès › Exporter une sauvegarde** donne en plus un fichier à garder (clé USB, Drive). **Importer une sauvegarde** remet la classe et ajoute les essais, y compris ceux de la première version (fichier « HORS LIGNE » de septembre).

**Sans internet** : `hors-ligne/Le banc des maîtres - HORS LIGNE.html` est un seul fichier avec les voix et les images, à copier sur l'ordinateur de la classe (dossier « Le banc des maîtres » des Ressources Trans). Le téléphone ne peut s'y relier que si l'ordinateur a internet.

## Comment ça marche

| | |
|---|---|
| `contenu/episodes.txt` | les textes : `## E1 Titre` ou `## T1 Titre`, puis une ligne par page |
| `contenu/infos.json` | collection, semaine, thème, source et mots à préparer de chaque texte |
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

**La liaison.** L'écran ou le téléphone crée un code de liaison, conservé pour les prochains partages. Le bouton **Envoyer le lien à l’ordinateur** ouvre la feuille de partage de l'iPhone avec le lien `…#lien=CODE&ecran`. Dans le navigateur, il utilise le partage, puis la copie du lien si le partage est indisponible ; le lien reste aussi visible. Dans l'autre sens, le téléphone reçoit le code par le QR code (lien `…#lien=CODE&tel`) ou en le tapant. Les messages passent par des relais publics gratuits (Nostr sur le port 443, MQTT en secours), chiffrés de bout en bout (AES-GCM, clé tirée du code) : les relais ne voient que des messages illisibles. L'écran annonce au téléphone ce qu'il montre (texte, étape, page, boutons). Le téléphone envoie des commandes (`cmd`) et l'état du défi (`defi`). Les documents `banc/classe`, `banc/resultats` et `banc/reglages` se recopient tout seuls.

**Le défi.** Mots lus correctement par minute = (mots lus − erreurs) × 60 ÷ secondes. Le temps est d'une minute ; « Il a fini » arrête plus tôt pour un élève qui finit le texte. Le résultat garde la place des erreurs : l'appli en tire les **mots à retravailler**.

## Commandes

Il faut Python 3 et Node. Lancer `npm install` une fois.

```
python3 outils/build.py                 # crée www/ (le site)
python3 outils/build.py --hors-ligne    # et le fichier unique pour un ordinateur sans internet
npm test                                # assemble et teste dans Chromium : écran seul, téléphone relié par un relais local, petits écrans
python3 outils/voix.py                  # prépare les nouveaux enregistrements (pip install faster-whisper ; ffmpeg)
python3 outils/voix.py E5 --refaire     # recoupe un épisode avec sa transcription déjà faite
python3 outils/voix.py T1               # prépare la voix du premier texte Tamallette
python3 outils/images.py ~/Desktop/Images   # convertit les images E1-1.png… (pip install pillow)
python3 outils/icones.py                # décline le nouveau logo en icônes web et iPhone
sh outils/publier.sh                    # enregistre, envoie et publie (voir plus bas)
```

`tests/app.js` essaie l'écran seul : la voix et le surligneur, la page qui se tourne, l'écho, le défi et son calcul. Il essaie ensuite le téléphone relié : code tapé, télécommande, défi mené depuis le téléphone, résultat sur l'écran, essai recopié. Il vérifie qu'un ordinateur tout neuf retrouve la classe et les essais auprès du téléphone, que la suppression d'un essai se propage, et qu'une sauvegarde de la première version s'importe. Il couvre aussi les six textes Tamallette sans voix et le partage du lien depuis un téléphone neuf. `#essai-rapide` à la fin de l'adresse ramène le défi à 8 secondes, pour les essais.

## Publier

Double-cliquer sur `outils/Publier sur GitHub.command` (ou `sh outils/publier.sh` dans le Terminal). Le script :

1. enregistre les changements et les envoie sur la branche `main` ;
2. assemble le site et le met sur la branche `gh-pages`, que GitHub Pages publie en une à deux minutes ;
3. refait le fichier hors ligne et le copie dans le dossier « Le banc des maîtres » des Ressources Trans.

Aucune installation de `gh` n’est nécessaire : le script utilise la connexion déjà enregistrée par Git sur ce Mac. La première fois, il crée le dépôt `banc-des-maitres` sur le compte GitHub connecté (connexion Git déjà enregistrée sur le Mac) et active GitHub Pages. Le site est alors à l'adresse `https://<compte>.github.io/banc-des-maitres/`. Le dépôt est public, comme le site du Bateau-école : il contient les textes, la voix et les images, mais aucun prénom ni résultat d'élève.

## L’application de l’iPhone

La version native conserve la classe et les résultats dans les réglages de l’application. Les textes, les illustrations et les voix sont embarqués : les ressources de lecture sont disponibles hors ligne. La liaison avec l’écran de la classe demande internet. Pour relier l’application native, ouvrir **Écran**, puis **Envoyer le lien à l’ordinateur**. Ouvrir ce lien sur l’ordinateur de la classe : il est déjà appairé. On peut aussi saisir le code montré sur l’ordinateur ; le QR code ouvert avec l’appareil photo lance la version Safari.

L’identifiant de l’application est `com.pookee.bancdesmaitres`. Pour une mise à jour, conserver cet identifiant et la même équipe de signature, et installer par-dessus l’application existante sans la désinstaller, afin de garder les données.

Le dossier `ios/` contient le projet Xcode. Il faut Xcode, Python 3, Node 22 ou plus et `npm install`. Utiliser le profil de développement déjà présent sur le Mac : il doit couvrir cet identifiant (ou un identifiant générique `équipe.*`), cet iPhone et la date du jour, avec son certificat disponible. Le script ne crée ni certificat ni profil.

1. Copier `outils/iphone.env.example` en `.iphone.local.env`, à la racine du dépôt. Ce fichier personnel est ignoré par Git.
2. Y renseigner l’iPhone, l’équipe, le profil et le certificat existants. Les commandes de lecture utiles sont :
   ```sh
   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl list devices
   security find-identity -v -p codesigning
   codesign -d --verbose=4 chemin/vers/une/application/deja/signee.app
   ```
   Les profils existants sont dans `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` ; leur nom et leur équipe se lisent avec `security cms -D -i fichier.mobileprovision`.
3. Après les tests habituels (`npm test`), laisser l’iPhone déverrouillé sur le même Wi-Fi que le Mac et lancer :
   ```sh
   sh outils/installer-iphone.sh
   ```

Le script assemble le site, copie ses ressources dans le projet iOS, compile avec la signature manuelle existante, vérifie les fichiers embarqués, puis installe et ouvre l’application. Le journal de compilation est dans `build/iphone-build.log`. Les sorties de compilation et les réglages personnels restent hors du dépôt. Un premier échec de liaison Wi-Fi peut être transitoire : réessayer avant de demander un câble.

Le nouveau logo (livre ouvert sur un banc) a été créé avec l’outil intégré de génération d’images. Le fichier source et le prompt sont dans `contenu/logo/`. `outils/icones.py` prépare les tailles web et l’icône iPhone à partir de cette source.

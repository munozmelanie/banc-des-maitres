# Fluence

Site : https://munozmelanie.github.io/banc-des-maitres/

L’application s’appelle **Fluence**. « Le banc des maîtres » reste le titre du feuilleton. L’adresse du site, l’identifiant iPhone et les clés de sauvegarde sont conservés pour que les liaisons et les résultats existants restent utilisables.

Appli de fluence pour les APC de CM1 : un feuilleton en épisodes d'environ 250 mots, sur les thèmes de la période, lu par la maîtresse. On l'affiche au TBI et on le travaille en six temps : **les mots** à préparer, **j'écoute** (la voix et le surligneur mot à mot), **l'écho** (une phrase écoutée, une phrase répétée), **le chœur** (lire avec la voix, plus lente), **le défi d'une minute** (mots lus correctement par minute) et **les progrès**.

Les personnages (Maya, Sami, Jules, Romy, Gaspard, Marcel le cuisinier et la maîtresse) sont inventés. Chaque semaine, un papier écrit à l'encre verte attend la bande sous le banc des maîtres, le banc de la cour où s'assoient les enseignants.

Une seconde collection contient les cinq textes de fluence Tamallette prévus en P2. Les textes se lisent dès maintenant, avec les mots à préparer et le défi d'une minute. **T1, Le trafiquant d’ombres**, possède aussi son enregistrement, avec le surligneur, l'écho et le chœur. Les voix de T3 à T6 seront ajoutées plus tard.

| Identifiant | Semaine | Texte |
|---|---|---|
| T1 | 2 au 6 novembre | Le trafiquant d’ombres |
| T3 | 16 au 20 novembre | Le choulame |
| T4 | 23 au 27 novembre | Le pouvoir des fleurs |
| T5 | 30 novembre au 4 décembre | La fée qui ne voulait pas être remerciée |
| T6 | 7 au 11 décembre | Le feuilleton d’Hermès |

Les cinq extraits de fluence viennent du fichier fourni « 9 - Fluence - textes de la P2.pdf » (textes 7 à 11). La BD **Le grimoire d’Elfie** (T2) est retirée des textes proposés. Son identifiant reste réservé et ses éventuels anciens résultats restent consultables. Les références, les pages et les crédits sont conservés dans `contenu/tamallette-p2-sources.json`. Les paragraphes, dialogues et lignes des fiches sont conservés grâce à `contenu/mise-en-page.json` ; les vers et strophes de T4 et T5 suivent le manuel. Cette mise en page est indépendante des mots, des pages audio et des indices des anciens résultats. Les lignes longues se replient sur les petits écrans. Le comptage des mots suit la règle habituelle de l'application ; il peut différer du compteur du livret imprimé.

Pour ajouter les voix de Tamallette, placer `T1.m4a`, `T3.m4a` à `T6.m4a` dans `contenu/enregistrements/`, puis lancer `python3 outils/voix.py` et publier. Les résultats du feuilleton restent rattachés aux identifiants E1 à E7 ; ceux de Tamallette utilisent T1 à T6.

L'appli est séparée du Bateau-école, mais construite sur le même principe :

- **l'écran de la classe** : le site, ouvert dans le navigateur de l'ordinateur du TBI ;
- **le téléphone de la maîtresse**, relié à l'écran : une télécommande, et surtout le **défi mené depuis le téléphone**. La maîtresse touche en silence les mots mal lus et, à la fin, le dernier mot lu ; l'élève lit au tableau, l'écran montre le chrono puis le résultat (record, mots à retravailler) ;
- **les données de classe restent dans les appareils** : les prénoms et les résultats sont enregistrés dans l'ordinateur et dans le téléphone. La liaison les transmet chiffrés entre les deux appareils ; ils ne sont publiés ni sur le site ni dans ce dépôt. Les bilans envoyés par les familles peuvent aussi être conservés dans le service privé de réception décrit ci-dessous.

## Utiliser l'appli

1. Sur l'ordinateur de la classe, ouvrir le site (adresse ci-dessous). Avec le bouton **Plein écran**, il remplit le TBI.
2. **Élèves** : taper les prénoms du groupe. Laisser l’objectif vide pour le calcul automatique, ou saisir un objectif manuel.
3. Depuis l'iPhone, toucher **Envoyer le lien à l’ordinateur**, puis ouvrir ce lien sur l'ordinateur de la classe : les deux appareils sont reliés. On peut aussi utiliser **Relier le téléphone** sur l'ordinateur : viser le QR code avec l'appareil photo de l'iPhone ou taper le code de l'écran (10 lettres ou chiffres) dans l'application.
4. Sur l'iPhone, ajouter la page à l'écran d'accueil (Safari › Partager › **Sur l'écran d'accueil**) et l'ouvrir ensuite depuis son icône. Elle reste ainsi reliée, et l'iPhone garde les résultats durablement.

Chaque départ de défi est précédé d’un compte à rebours de trois secondes avec trois bips, hors du temps mesuré. À la fin, un grand bandeau invite à toucher le dernier mot lu. Quitter le défi ou masquer l’application pendant le compte à rebours annule le départ.

Le téléphone a quatre onglets : **Écran** (choisir l'épisode et l'étape, et toucher à distance les boutons de l'écran : écouter, pause, page suivante, phrase suivante, vitesse…), **Défi**, **Élèves** et **Progrès**. Sans écran relié, le défi marche aussi sur le téléphone seul : l'élève lit alors sur le texte imprimé.

Quand le champ Objectif est vide, la première lecture terminée et enregistrée sert de référence, en classe ou à la maison. L'objectif est **le score + 10 %, arrondis au supérieur, avec au moins 5 MCLM de plus** : 50 → 55, 51 → 57, 100 → 110. Il apparaît dans Élèves, le défi, les résultats et les courbes sur l'écran comme sur le téléphone. Avant la première lecture, aucun objectif n'est imposé. Un simple clic sur Enregistrer laisse le mode automatique actif ; saisir un nombre le remplace par un objectif manuel, et effacer ce nombre rétablit l'automatique.

La référence est le premier résultat encore valide dans l'ordre chronologique, tous textes confondus ; à date égale, l'identifiant départage les résultats de façon identique sur les appareils. Les lectures suivantes ne font pas monter l'objectif. Si la référence est supprimée, ou si une lecture plus ancienne est importée, la première lecture valide restante devient la référence ; sans résultat valide, l'objectif redevient en attente. Les résultats supprimés et les scores ou dates invalides sont exclus. Aucun champ n'est ajouté aux sauvegardes : les objectifs manuels et les identifiants existants sont conservés. Un objectif automatique peut dépasser 999 MCLM pour respecter la règle ; la saisie manuelle garde sa limite de 0 à 999.

### Lire les progrès

Dans **Progrès**, choisir **En classe** ou **À la maison**, puis un élève. La recherche retrouve rapidement un prénom ; sur téléphone, **Tous les élèves** revient à la liste. Le filtre **Tous les textes** peut être remplacé par un titre précis. Le graphique suit les lectures dans l'ordre chronologique ; toucher un point ouvre sa date, son texte, son score, ses erreurs et les mots à retravailler. Les textes peuvent avoir des difficultés différentes : choisir le même texte permet une comparaison plus directe.

La dernière lecture, le meilleur résultat, l'écart depuis la première lecture et le nombre de lectures concernent uniquement l'élève, le lieu et le texte sélectionnés. Les bilans maison restent déclarés par les familles et ne deviennent pas des records de classe. L'objectif affiché reste celui de l'élève, calculé selon la règle ci-dessus, quel que soit le filtre. La sélection et les filtres restent en place quand un résultat arrive ou qu'une lecture est supprimée. La suppression demande une confirmation et conserve un marqueur dans les sauvegardes pour empêcher une réapparition lors de la synchronisation.

**Sauvegarder ou restaurer les données**, en bas de Progrès, exporte toujours l'ensemble de la classe et des lectures, même lorsqu'un filtre est actif. **Accès parents et bilans maison** reste disponible en haut de la page pour connecter le compte, gérer les liens et importer un bilan reçu.

### Importer une liste de classe

Dans **Élèves › Importer une liste de classe**, choisir un fichier **TXT** (un nom par ligne), **CSV/TSV** (colonnes `Prénom`, `Nom`, `Objectif` facultatif, séparées par virgule, point-virgule ou tabulation), ou **JSON**. Le JSON accepte un tableau de noms ou d'objets, `eleves`, et `classe.eleves` des sauvegardes Fluence ou Bateau-école. Les fiches inactives ou vides sont ignorées. Le fichier est lu localement, sans téléversement ; limite de 1 Mo et de 100 élèves.

La prévisualisation permet de corriger un nom ou un objectif et d'écarter une ligne en effaçant son nom. Seul **Importer et enregistrer** valide les changements. Les noms identiques (casse et espaces ignorés, accents conservés) sont regroupés : leurs identifiants, objectifs et résultats existants restent inchangés. Les autres élèves sont ajoutés. Pour deux élèves de même prénom, inclure aussi le nom. Les fiches initiales « Élève n » sont remplacées seulement si elles sont intactes et qu'aucun essai, même supprimé, n'existe. Les autres élèves de la classe ne sont jamais supprimés par cet import.

Les deux appareils se recopient la classe et tous les résultats à chaque liaison. Un ordinateur remis à zéro retrouve donc tout dès que le téléphone se relie, et inversement. Pour la classe, la version la plus récente gagne. Les essais s'additionnent, et un essai supprimé l'est sur les deux appareils. **Progrès › Sauvegarder ou restaurer les données › Exporter une sauvegarde** donne en plus un fichier à garder (clé USB, Drive). **Importer une sauvegarde** remet la classe et ajoute les essais, y compris ceux de la première version (fichier « HORS LIGNE » de septembre).

**Sans internet** : `hors-ligne/Le banc des maîtres - HORS LIGNE.html` est un seul fichier avec les voix et les images, à copier sur l'ordinateur de la classe (dossier « Le banc des maîtres » des Ressources Trans). Le téléphone ne peut s'y relier que si l'ordinateur a internet.

### S'entraîner à la maison et transmettre les bilans

L'[accès parents](https://munozmelanie.github.io/banc-des-maitres/#parents) propose **Textes d’entraînement** et **Textes de la période (facultatifs)**. Les épisodes E1 à E7 s’ouvrent les lundis du 2 novembre au 14 décembre 2026, à **16 h 30, heure de Paris**. Avant leur date, les cartes montrent seulement le numéro, un cadenas et la date ; les anciens épisodes restent ouverts. Les cinq textes Tamallette (T1, T3 à T6) restent disponibles à tout moment avec l’explication « Aucun entraînement obligatoire n’est demandé sur ces textes. Si vous souhaitez vous entraîner, libre à vous ! ».

Choisir un texte ouvre l’écoute de la voix lorsqu’elle est disponible, le défi et **Imprimer le texte**. Le parent peut écouter, mettre en pause, reprendre ou revenir au début. **Démarrer** arrête l’écoute puis affiche le décompte sonore **3, 2, 1** ; la minute ne commence qu’ensuite. L’adulte touche les mots mal lus, puis le dernier mot lu au signal. L’enfant recopie lui-même le score que le parent lui lit. Les bilans des liens personnels sont transmis automatiquement ; les QR codes restent inchangés. Les élèves sans smartphone peuvent faire le défi sur papier ou en classe.

Depuis le lien personnel, **Les progrès** affiche uniquement les lectures de l’enfant associé à ce lien, avec **En classe** et **À la maison**, une courbe, l’objectif, les statistiques et le filtre **Tous les textes** ou un texte précis. Les lectures de classe sont synchronisées lorsque l’application de l’enseignante est ouverte, connectée à son compte et à Internet. Les bilans maison sont consultables dès leur réception par le service privé. Les données distantes ne sont pas enregistrées dans le navigateur familial ; changer de lien efface la vue précédente, y compris si une ancienne requête se termine ensuite. Le lien commun sans accès individuel ne donne pas accès aux progrès.

Pour recevoir automatiquement les bilans, l'enseignante ouvre **Élèves** ou **Progrès › Accès parents et bilans maison**. Après activation du service privé, elle choisit **Recevoir un lien de connexion** à son adresse e-mail autorisée. Dans le navigateur, elle peut ouvrir le lien reçu ; pour connecter l'application iPhone, elle copie le lien complet du message dans le champ de connexion de Fluence, sans l'ouvrir auparavant : le lien ne sert qu'une fois. L'application vérifie le compte et son autorisation avant de conserver la session. Un code numérique reste accepté si le service en fournit un. Une fois connectée, l'enseignante choisit un élève et crée son lien personnel. Le parent peut corriger le prénom affiché avant le défi ; l'association à l'élève reste celle du lien créé par l'enseignante.

Chaque lien personnel contient un secret aléatoire de 256 bits. Il autorise l'envoi et la consultation des progrès pour un seul enfant et ne contient ni identifiant de classe, ni liste d'élèves, ni code de télécommande. Le service conserve l'empreinte du secret et vérifie l'accès à chaque consultation. Le lien doit être transmis à la famille concernée et peut être désactivé depuis Fluence. Il ne permet pas de lire les bilans d'autres familles. L'espace parents ne charge ni les données de classe présentes sur l'appareil ni la session privée de l'enseignante. Les réponses de progression ne contiennent aucun nom de classe, adresse e-mail ou identifiant de compte.

À la fin du défi, le bilan est gardé dans l'historique familial et placé dans une file locale d'envoi. Les historiques et les prénoms sont séparés par lien personnel sur un appareil partagé ; chaque bilan en attente garde le lien sous lequel il a été créé. Avec un lien personnel actif, Fluence tente de le transmettre au service privé. **Reçu** apparaît uniquement après un accusé de réception valide du serveur ; cela signifie que le bilan est disponible dans l'espace privé, même si l'application de l'enseignante est fermée. En cas de coupure, le bilan reste en attente et peut être réessayé. Les essais automatiques reprennent quand la page est ouverte et connectée. Si le navigateur refuse le stockage, un message demande de garder la page ouverte ; le bilan reste disponible en mémoire pendant la séance.

L'accueil reste centré sur le choix du texte. Un avis compact **Réessayer l’envoi** apparaît seulement si des bilans de ce lien familial attendent encore leur transmission, y compris après rechargement. L'historique complet reste enregistré localement ; le **Dernier résultat** de chaque texte est consultable dans son défi, avec son état d'envoi. Le partage manuel est disponible pour l'accès commun sans lien personnel ; les liens personnels transmettent automatiquement et proposent seulement Réessayer si nécessaire.

L'enseignante retrouve les nouveaux bilans en ouvrant Fluence avec son compte connecté ; elle peut aussi choisir **Actualiser les bilans**. Les bilans sont associés par le service au bon élève. Le score est recalculé à partir du dernier mot, des erreurs et du temps, et l'empreinte du texte est vérifiée. Un élève absent de l'appareil ou un texte différent est signalé pour vérification. Les bilans restent des lectures déclarées par la famille : ils apparaissent dans **Bilans maison enregistrés**, séparément des essais et records de classe. Une fois reçus dans l'application, ils sont inclus dans les sauvegardes et la liaison chiffrée entre les appareils de l'enseignante. Les identifiants empêchent les doublons ; une suppression confirmée n'est pas annulée lors de la réception suivante.

Le lien commun `#parents`, éventuellement accompagné du prénom prérempli, donne accès à la lecture et à l'impression sans activer la réception automatique. **Partager le bilan** par l'ENT ou la messagerie reste une solution de secours : le parent choisit le destinataire dans la feuille de partage. Sans partage disponible, le bilan et son lien sont copiés, ou un fichier JSON est téléchargé pour être joint au message. Fluence ne confirme pas la livraison de ce message. L'enseignante ouvre le lien reçu ou importe le fichier, vérifie l'élève associé et valide **Ajouter au suivi maison**.

La réception automatique nécessite un projet Supabase privé configuré et déployé, selon [le guide du service](supabase/README.md). `src/maison-cloud-config.js` contient uniquement l'URL du projet et sa clé publique ; aucune clé secrète n'y a sa place. Les règles d'accès et la fonction de réception sont dans `supabase/`. Aucun jeton familial, compte, prénom ni résultat réel ne doit entrer dans les sources ou le site public. Les bilans familiaux passent par ce service privé ; les relais de la télécommande restent réservés aux appareils de l'enseignante.

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
| `src/parents.js` | catégories de textes, défis familiaux, résultats locaux séparés |
| `src/parents-progres.js` | consultation privée des progrès du seul enfant associé au lien familial |
| `src/envoi-maison.js` | lien parents, partage explicite des bilans, import et suivi par l'enseignante |
| `src/maison-cloud.js` | file d'envoi familiale, connexion autorisée de l'enseignante et réception privée |
| `src/maison-cloud-config.js` | URL et clé publique du service, vides tant que la réception n'est pas activée |
| `supabase/` | règles d'accès aux données privées, fonction de réception et tests du service |
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
npm test                                # assemble et teste la classe, la maison et l'impression, sans envoi réel
npm run test:parents                    # contrôles ciblés des parcours familiaux et de la réception simulée
python3 outils/voix.py                  # prépare les nouveaux enregistrements (pip install faster-whisper ; ffmpeg)
python3 outils/voix.py E5 --refaire     # recoupe un épisode avec sa transcription déjà faite
python3 outils/voix.py T1               # prépare la voix du premier texte Tamallette
python3 outils/images.py ~/Desktop/Images   # convertit les images E1-1.png… (pip install pillow)
python3 outils/icones.py                # décline le nouveau logo en icônes web et iPhone
sh outils/publier.sh                    # enregistre, envoie et publie (voir plus bas)
```

`tests/app.js` essaie l'écran seul : la voix et le surligneur, la page qui se tourne, l'écho, le défi et son calcul. Il essaie ensuite le téléphone relié : code tapé, télécommande, défi mené depuis le téléphone, résultat sur l'écran, essai recopié. Il vérifie qu'un ordinateur tout neuf retrouve la classe et les essais auprès du téléphone, que la suppression d'un essai se propage, et qu'une sauvegarde de la première version s'importe. Il couvre aussi la voix et l'écho de T1, les textes T3 à T6 sans voix, le changement de source audio, et le partage du lien depuis un téléphone neuf. `#essai-rapide` à la fin de l'adresse ramène le défi à 8 secondes, pour les essais.

`tests/parents.js` vérifie l'isolation de la classe et de la liaison, les deux catégories, l'accès direct au défi, la persistance familiale et les échecs de partage/stockage. `tests/envoi-maison.js` couvre l'import explicite, les doublons, les suppressions et le suivi maison synchronisé. `tests/maison-cloud.js` vérifie la file persistante, les accusés de réception, l'isolation des liens de deux enfants, l'autorisation de l'enseignante et la réception avec une API simulée. `tests/parents-cloud-ui.js` contrôle les états visibles d'envoi et de réessai ; `tests/impression.js` vérifie les feuilles imprimables. Tous utilisent des élèves fictifs, des partages simulés et aucun véritable envoi vers un compte.

`tests/objectifs.js` vérifie le calcul automatique, les objectifs manuels, les lectures maison, les suppressions, les imports et la stabilité après rechargement ou synchronisation. `tests/objectifs-ui.js` vérifie les champs vides en mode automatique, leur modification manuelle et les affichages sur ordinateur et téléphone, avec des élèves fictifs.

`tests/progression.js` contrôle les filtres classe/maison et texte, l'ordre chronologique stable, les statistiques, les objectifs et les suppressions sans modifier les données consultées. `tests/progression-regression.js` vérifie le parcours sur ordinateur et téléphone, les points du graphique, l'arrivée d'un bilan, les sauvegardes et la conservation des filtres. Les captures utilisent uniquement des élèves fictifs et restent dans un dossier temporaire privé.

`tests/progres-cloud.js` vérifie la consultation paginée, le rejet de réponses contenant des champs privés, le changement de lien pendant une requête et la synchronisation enseignante par lots, y compris les suppressions et la reprise après coupure. `tests/parents-progres.js` couvre les vues familiales sur petits et grands écrans, les filtres, les erreurs et l'isolation entre deux enfants sans accès au stockage de classe. Les tests SQL du service vérifient séparément les droits de deux enseignants et de deux familles, ainsi que les liens révoqués.

`tests/concurrence-resultats.js` simule les délais et les erreurs de stockage natif : les ajouts simultanés, les suppressions et les réceptions distantes doivent conserver tous les résultats confirmés sans ressusciter un essai supprimé.

Les contrôles du service privé se lancent séparément avec **Node 24 ou plus** : `npm --prefix supabase/tests install --ignore-scripts`, puis `npm run test:backend`. Ils exécutent les règles SQL dans un PostgreSQL local embarqué et la fonction de réception avec des requêtes simulées. Aucun projet Supabase en ligne n'est utilisé. Les dépendances de ces tests restent séparées de celles de l'application.

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

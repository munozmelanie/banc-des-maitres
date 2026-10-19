# Réception privée des bilans Fluence

Ce backend reçoit les bilans déclarés à la maison et les rend accessibles au compte enseignant autorisé. Le lien personnel d’une famille permet aussi de consulter les progrès de son seul enfant, en classe et à la maison. Le site public ne contient aucun élève, résultat, secret d’invitation ou identifiant de compte enseignant. La clé publique du projet peut être utilisée dans le site ; la clé serveur reste exclusivement dans l’environnement de la fonction Supabase.

## Contrat avec l’application

L’enseignante se connecte à un compte Supabase Auth préalablement créé. `/auth/v1/otp` reçoit `{email, create_user:false}` et envoie l’email standard de connexion. Avec le fournisseur gratuit par défaut, ce mail contient un lien : l’application accepte le lien complet copié depuis ce mail, sans promettre un code chiffré. Le lien attendu appartient exactement au projet configuré, avec le chemin `/auth/v1/verify`, le paramètre `token` et le type `magiclink`. Le client extrait ce token puis appelle `POST /auth/v1/verify` avec `{token_hash:token, type:"email"}` ; il ne suit pas une URL arbitraire. Un code reste utilisable avec `{email, token, type:"email"}` si le fournisseur email en fournit un. Un retour de connexion web doit être vérifié puis retiré de l’URL pour ne pas laisser les jetons dans l’historique.

Après obtention de la session, la RPC `fluence_teacher_enabled()` retourne seulement un booléen pour le compte courant. Elle n’est exécutable que par un utilisateur authentifié. Un compte Auth absent de `private.fluence_teachers`, ou désactivé dans cette table, ne peut lire ni modifier les données Fluence. Les liens de connexion et les sessions sont des secrets temporaires : ne pas les publier, les journaliser ou les confondre avec les liens individuels destinés aux familles.

Pour un élève, le client enseignant génère 32 octets aléatoires avec `crypto.getRandomValues`, encodés en 64 caractères hexadécimaux minuscules. Il crée une ligne dans `fluence_accesses` avec `child_ref` (identifiant local opaque), le SHA-256 des caractères UTF-8 de ce secret et, facultativement, son `id` UUID. `owner` est son `auth.uid()` par défaut. Le secret original ne va jamais dans la base : il est placé dans le fragment du lien individuel destiné à cette famille. Ne pas le mettre dans la query string, les journaux ou une URL raccourcie.

La famille envoie `POST /functions/v1/fluence-bilan` avec `Content-Type: application/json` et le corps :

```json
{
  "token": "secret-hex64-généré-par-l-application",
  "paquet": {
    "format": "fluence/bilan-maison",
    "version": 1,
    "texte": "1234abcd",
    "bilan": {
      "id": "identifiant-local-du-bilan",
      "origine": "maison",
      "prenom": "Test Parent",
      "ep": "T1",
      "titre": "Texte fictif",
      "date": "2026-10-19T10:00:00.000Z",
      "secondes": 60,
      "dernier": 39,
      "fautes": [3],
      "lus": 40,
      "erreurs": 1,
      "mclm": 39
    }
  }
}
```

L’exemple de secret est volontairement invalide : aucun secret utilisable n’est publié. Les valeurs du bilan sont fictives. Les champs sont strictement limités à ce schéma. `owner`, `child_ref` et `access_id` ne sont jamais acceptés du parent : la fonction retrouve l’invitation active par le hash du secret et déduit son propriétaire. Le corps entier doit faire au plus 32 Kio. L’Edge Function et la base vérifient les bornes, la date, les erreurs, les doublons d’indices et le calcul du score. L’application enseignante vérifie aussi l’empreinte et les indices avec sa version exacte du texte. Le bilan reste une déclaration de la famille, distincte des essais de classe.

Le champ facultatif `bilan.typeLecture` vaut exactement `entrainement` ou `defi`. Il est capturé avant de démarrer la lecture et reste attaché à cet essai lors d’un réessai d’envoi. Une lecture ancienne conserve l’absence du champ : aucun entraînement ni défi ne lui est attribué rétroactivement. Toutes les tentatives sont enregistrées et participent au calcul du meilleur score et de l’objectif.

Chaque succès d’envoi, y compris une retransmission strictement identique, retourne HTTP 200 et seulement `{"id":"UUID","received_at":"horodatage serveur"}`. Ce reçu ne contient ni prénom, résultat, identifiant d’enfant, propriétaire, invitation ou données d’autres élèves. Le contrat d’envoi existant reste inchangé.

| Statut | `error` | Sens |
|---|---|---|
| 400 | `invalid_json`, `invalid_request`, `invalid_payload` | Corriger la requête ou le bilan. |
| 401 | `invalid_access` | Secret mal formé, inconnu, révoqué ou enseignante désactivée ; distinction non exposée. |
| 403 | `origin_not_allowed` | Origine navigateur absente de la configuration autorisée. |
| 405 | `method_not_allowed` | Seuls POST et OPTIONS existent. |
| 409 | `idempotency_conflict` | Même `bilan.id` pour cette invitation avec un autre contenu ; aucune écriture. |
| 413 | `too_large` | Corps supérieur à 32 Kio, même sans Content-Length. |
| 415 | `json_required` | Content-Type JSON requis. |
| 429 | `rate_limited` | Envoi : 60 nouveaux bilans par invitation sur 24 heures glissantes. Consultation : 120 pages par invitation et minute. |
| 503 | `service_unavailable` | Configuration, réseau ou serveur indisponible ; ne pas afficher un envoi confirmé. |

La clé d’idempotence est `(access_id, bilan.id)`. Le quota et l’insertion sont protégés par un verrou PostgreSQL sur l’invitation ; les requêtes simultanées sont sérialisées. Un rejeu identique ne consomme pas le quota. Une invitation révoquée refuse même les rejeux. Un nouvel accès est nécessaire après révocation : le client ne peut réactiver l’ancien, changer son propriétaire ou le rattacher à un autre enfant.

Le client enseignant peut lire ses invitations, les créer et les révoquer par PATCH `{"revoked":true}`. Il lit ses bilans avec `select=id,access_id,payload,received_at&order=received_at.asc` et doit paginer si nécessaire. Les politiques RLS filtrent toujours sur `auth.uid()` et l’allowlist, même si le filtre `owner` est absent du client. Les bilans reçus sont immuables par les clients ; les tombstones de suppression locale restent dans Fluence pour empêcher une nouvelle importation. Une purge distante éventuelle est réservée à l’administration, après sauvegarde.

## Consultation familiale des progrès

Le même lien individuel existant autorise cette lecture ; il constitue donc un secret donnant accès aux résultats de l’enfant. Ne pas le publier ni le partager hors de sa famille. Une révocation ou la désactivation de l’enseignante bloque immédiatement les nouvelles consultations. Aucun compte parent n’est nécessaire.

```json
{"token":"secret-hex64-généré-par-l-application","action":"progression","curseur":null,"limite":200}
```

La requête utilise le même POST `/functions/v1/fluence-bilan`. `curseur`, `limite` et `avecTypeLecture` sont facultatifs ; la limite vaut 200 par défaut, entre 1 et 200. Les champs supplémentaires, notamment `owner`, `child_ref` et `access_id`, sont refusés. Le serveur déduit l’unique enfant de l’invitation active, puis retourne :

```json
{
  "version": 1,
  "objectif": {"valeur":55,"mode":"automatique"},
  "lectures": [
    {"id":"11111111-1111-4111-8111-111111111111","origine":"classe","ep":"T1","date":"2025-01-02T10:00:00.000Z","mclm":50,"lus":50,"erreurs":0,"secondes":60}
  ],
  "suivant": null
}
```

Les valeurs ci-dessus sont fictives. Chaque `id` retourné est un UUID opaque, différent des identifiants locaux de classe. Aucun prénom, email, propriétaire, identifiant d’enfant, identifiant d’invitation, titre libre ou liste de classe n’est renvoyé. `dernier` et `fautes` sont facultatifs pour les anciennes lectures. Les dates sont en UTC avec `Z` et au plus trois décimales. Les pages sont ordonnées par date puis UUID ; passer `suivant` tel quel comme prochain `curseur`, jusqu’à `null`. Une actualisation recommence à la première page pour retrouver une lecture ancienne synchronisée depuis un autre appareil. Une pagination ne constitue pas un instantané figé de la base.

L’objectif manuel est prioritaire, y compris zéro. Sinon, le meilleur score actif, toutes origines confondues, fournit `score + max(5, ceil(score × 0,10))`. À scores égaux, la date puis l’identifiant local départagent les références, comme dans l’application ; un bilan maison utilise `maison:<child_ref>:<source_id>`. Sans lecture, la valeur est `null` et le mode `attente`. Une lecture moins réussie ne diminue pas l’objectif. Supprimer la référence fait utiliser le meilleur score encore actif. Appliquer également la migration `202610190003_fluence_best_progress_objective.sql` pour garder le calcul familial identique à celui de l’application. La valeur manuelle est bornée à 60000 ; l’objectif automatique à 66000.

Les bilans maison reçus sont visibles immédiatement, même si l’application enseignante est fermée. Leur projection après import ne crée pas de doublon. Les lectures de classe, objectifs manuels et suppressions apparaissent après synchronisation par une application enseignante connectée à son compte et à Internet. Jusqu’à cette synchronisation, les familles peuvent encore voir l’état précédent. Les suppressions reçues restent définitives, même si un appareil ancien renvoie ensuite sa sauvegarde. La consultation est sans cache et son quota est distinct de celui des envois (`Retry-After: 60` au lieu de 86400).

Le catalogue publié est explicitement limité à **E1–E7 et T1–T6**. Les anciennes projections ou les bilans hors catalogue restent conservés en base, mais ne sont ni affichés ni utilisés pour l’objectif familial. Lors de l’ajout d’un texte, étendre ensemble le filtre de `private.fluence_visible_progress`, le validateur `valideProgression` de l’Edge Function et le test de concordance avec `contenu/infos.json`.

## Projection par l’enseignante

`POST /rest/v1/rpc/fluence_sync_progress` exige une session Auth et un compte actif dans l’allowlist. Son corps contient exactement les paramètres `p_eleves`, `p_lectures` et `p_suppressions`, chacun un tableau de 200 éléments au plus. Le lot JSONB entier est limité à 32 Kio ; le client utilise des lots d’au plus 24 Kio pour tenir compte des espaces de sérialisation PostgreSQL. Les lots sont additifs : une absence dans un lot ne supprime rien.

- `p_eleves` : `{child_ref, objectif_manuel:null|entier, maj}`. La révision `maj` vient de la classe et seule une révision strictement plus récente modifie l’objectif. Aucun prénom n’est envoyé.
- `p_lectures` : `{id, child_ref, origine, ep, date, mclm, lus, erreurs, secondes, dernier?, fautes?, source_id?}`. `source_id` est obligatoire pour `maison` et interdit pour `classe`. Une projection est immuable : un rejeu identique est accepté, un contenu différent sous le même ID retourne 409. Un client doit écarter ses anciennes entrées invalides avant de former les lots ; un lot invalide est intégralement refusé.
- `p_suppressions` : `{id}` pour un ancien tombstone de classe, ou `{id, child_ref, source_id}` pour un bilan maison. La suppression d’un ID est enregistrée même si sa lecture n’a pas encore été projetée. Un tombstone maison masque aussi le bilan reçu directement du parent.

`id` local accepte `[A-Za-z0-9:_.%+-]` sur 1 à 240 caractères ; `child_ref`, `[A-Za-z0-9_-]` sur 1 à 80 ; `source_id`, le même alphabet sur 8 à 80. Score entier 0–60000, mots lus entiers 0–1000, erreurs entières 0–mots lus, durée 0–60 secondes. La durée zéro et l’absence d’indices sont admises pour les anciens résultats ; leur score enregistré n’est pas recalculé. Les indices présents sont uniques, cohérents avec le dernier mot et le nombre d’erreurs. Les dates valides vont de 2000 à maintenant plus un jour. `maj` est un entier de 0 à 9×10¹⁵.

La RPC retourne seulement `{"ok":true}` après la transaction. Elle ne prend aucun propriétaire en paramètre : celui-ci vient de `auth.uid()`. Les tables de projection vivent dans `private`, sans aucun accès direct des rôles clients ou Edge ; leurs RLS sont activées. Les fonctions privilégiées ont un `search_path` vide et des grants explicites. Seule l’Edge Function peut exécuter `fluence_read_progress`, et seule une session authentifiée autorisée peut synchroniser.

## Mise en service d’un projet dédié

1. Créer ou sélectionner un projet Supabase dédié, puis lier localement la CLI avec son project ref. Aucun compte ni projet n’est créé par ces sources.
2. Garder uniquement les schémas attendus dans les schémas exposés de la Data API. **Ne jamais exposer `private`.** Ne jamais accorder de grants supplémentaires à `anon`, notamment sur les tables ou les RPC serveur.
3. Exécuter les tests ci-dessous, puis appliquer les migrations dans l’ordre avec `supabase db push`. La migration `202610190002_fluence_family_progress.sql` ajoute la consultation sans modifier les invitations existantes ; `202610190003_fluence_best_progress_objective.sql` fait évoluer son objectif à chaque meilleur score, sans modifier les données ni les permissions. Cette troisième migration seule ne nécessite pas de redéploiement de l’Edge Function. Les grants par défaut sont explicitement retirés de chaque objet créé. Déployer ensuite l’Edge Function correspondante avant de publier le nouveau client.
4. Dans Supabase Auth, créer le compte de l’enseignante via l’administration, avec son adresse vérifiée, puis désactiver les inscriptions publiques. L’application ne fait pas de signup. Configurer le Site URL sur l’adresse publiée de Fluence. Conserver le sujet et le modèle d’email par défaut : le parcours accepte le lien complet et fonctionne sans personnaliser le mail ni ajouter de fournisseur SMTP. Supabase refuse actuellement cette personnalisation sur le projet Free avec son fournisseur par défaut. Si un fournisseur autorise ultérieurement un modèle à code, `{{ .Token }}` peut être utilisé ; ce réglage reste facultatif.
5. Dans le SQL Editor administrateur, ajouter **l’UUID Auth de ce compte existant** à l’allowlist. L’UUID doit rester dans la configuration privée du projet, pas dans une migration publique :

   ```sql
   insert into private.fluence_teachers(user_id)
   values ('UUID_DU_COMPTE_EXISTANT'::uuid);
   ```

   Pour retirer tous ses accès, y compris les envois associés à ses invitations : `update private.fluence_teachers set enabled=false where user_id=...;`. Aucun client ne peut s’ajouter à cette table.
6. Déployer la fonction. L’origine publique `https://munozmelanie.github.io` est déjà autorisée par défaut dans le code ; aucun secret Edge supplémentaire n’est nécessaire pour ce site. `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont des variables serveur fournies par Supabase. Ne jamais copier la service role key dans `src/`, la configuration publique, un `.env` versionné ou les réglages de l’iPhone.

   ```sh
   supabase functions deploy fluence-bilan --no-verify-jwt
   ```

   Le réglage équivalent `verify_jwt=false` est dans `supabase/config.toml` : les parents n’ont pas de compte Auth. **La fonction effectue elle-même l’autorisation forte avec le secret individuel.** Pour un autre site, les origines supplémentaires éventuelles peuvent être définies dans `FLUENCE_ALLOWED_ORIGINS`, séparées par des virgules, sans chemins ni slash final. La partie enseignante native utilise directement Auth et REST ; ce paramètre concerne l’envoi des familles sur le site. CORS n’est pas utilisé comme authentification : une requête sans Origin doit toujours présenter le secret valide.
7. Mettre seulement l’URL Supabase et la clé publishable publique dans `src/maison-cloud-config.js`, puis tester avec des élèves fictifs et deux comptes enseignants distincts. Ne fournir les liens réels aux familles qu’après ce contrôle en environnement déployé.

La fonction ne logue ni corps de requête, prénom, secret ou réponse de la base. Les paramètres sensibles et sauvegardes restent hors du dépôt. Les bilans sont stockés dans le projet Supabase avec contrôle d’accès ; ils ne sont pas servis par GitHub Pages.

## Compatibilité du type de lecture

Le nouveau client envoie `avecTypeLecture:true` à chaque page de progression. L’Edge Function ne retourne le champ optionnel `typeLecture` que pour cet opt-in explicite ; les anciens clients stricts reçoivent exactement leur ancien schéma. Une valeur de capacité autre qu’un booléen est refusée. Une lecture sans type reste sans type même pour un nouveau client.

La migration `202610190004_fluence_reading_type.sql` étend uniquement les validateurs, la projection privée et le rejeu de synchronisation. Elle ne réécrit aucun historique et ne change ni les règles d’accès, ni les objectifs, ni les tombstones. Un ancien client peut réémettre une projection typée sans son champ nouveau si tout le reste est identique : la base conserve son type. Une projection maison autrefois importée sans ce champ peut être enrichie uniquement si le bilan brut du même propriétaire, enfant et source prouve le même type et les mêmes mesures. Les changements de type et la rétroclassification d’un ancien bilan sans type restent des conflits.

L’appareil applique la même conservation aux imports déjà présents : même source, enfant, texte, date et mesures, type absent et aucune suppression. L’enrichissement n’altère que le type et sa signature de liaison ; les objectifs manuels et métadonnées existantes restent en place. Une erreur de sauvegarde apparaît comme un échec de réception et sera retentée.

Pour déployer progressivement : déployer d’abord `functions/fluence-bilan/index.ts`, appliquer ensuite la migration 0004, puis publier le nouveau client. Le fichier Edge est autonome et peut remplacer le code existant dans l’éditeur du Dashboard, puis **Deploy updates**, sans créer de jeton d’administration. Conserver la vérification JWT de passerelle désactivée : le secret individuel est vérifié par le handler et PostgreSQL. Contrôler après déploiement une lecture ancienne sans capacité et une lecture avec `avecTypeLecture:true`. Voir la [procédure officielle Dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard) et la [configuration des fonctions](https://supabase.com/docs/guides/functions/function-configuration).

## Tests

Sur un environnement Supabase local déjà démarré et migré :

```sh
supabase test db
```

Les tests pgTAP dans `tests/database/*.test.sql` passent dans des transactions annulées. Ils couvrent anon, un compte parent authentifié sans autorisation, deux enseignants isolés et deux enfants d’une même classe, un enseignant désactivé, immutabilité des identités, révocation, validation, déduction du propriétaire, idempotence et quotas. La progression vérifie aussi les objectifs, dates et IDs, suppressions avant et après projection, dédoublonnage des bilans maison, ancienne sauvegarde, pagination et champs minimaux.

Sans Docker, le même SQL peut aussi être testé dans PostgreSQL WASM (PGlite) avec pgTAP, entièrement localement :

```sh
npm --prefix supabase/tests install --ignore-scripts
npm --prefix supabase/tests test
```

Il faut Node 24 ou plus pour les tests TypeScript. Le runner crée uniquement les rôles et le schéma Auth synthétiques nécessaires à `auth.uid()`, applique la vraie migration, puis exécute les mêmes tests pgTAP. Cela teste réellement les permissions, RLS, contraintes et fonctions PostgreSQL ; cela ne remplace pas les contrôles de passerelle, lien de connexion, CORS déployé et persistance d’un projet Supabase réel. Les tests Edge exécutent le vrai handler et interceptent son unique appel RPC : aucun compte ni donnée réelle ne sont utilisés.

Références : [RLS et grants Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [autorisation des Edge Functions](https://supabase.com/docs/guides/functions/auth), [tests de base Supabase](https://supabase.com/docs/guides/local-development/testing/overview), [extensions PostgreSQL/PGlite et pgTAP](https://pglite.dev/extensions/), [vérification de lien par token hash](https://supabase.com/docs/reference/javascript/auth-verifyotp).

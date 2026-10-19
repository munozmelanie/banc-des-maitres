# Réception privée des bilans Fluence

Ce backend reçoit les bilans déclarés à la maison et les rend accessibles uniquement au compte enseignant autorisé. Le site public ne contient aucun élève, résultat, secret d’invitation ou identifiant de compte enseignant. La clé publique du projet peut être utilisée dans le site ; la clé serveur reste exclusivement dans l’environnement de la fonction Supabase.

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

Chaque succès, y compris une retransmission strictement identique, retourne HTTP 200 et seulement `{"id":"UUID","received_at":"horodatage serveur"}`. La réponse ne contient ni prénom, résultat, identifiant d’enfant, propriétaire, invitation ou données d’autres élèves. Aucun endpoint de lecture n’est offert aux parents.

| Statut | `error` | Sens |
|---|---|---|
| 400 | `invalid_json`, `invalid_request`, `invalid_payload` | Corriger la requête ou le bilan. |
| 401 | `invalid_access` | Secret mal formé, inconnu, révoqué ou enseignante désactivée ; distinction non exposée. |
| 403 | `origin_not_allowed` | Origine navigateur absente de la configuration autorisée. |
| 405 | `method_not_allowed` | Seuls POST et OPTIONS existent. |
| 409 | `idempotency_conflict` | Même `bilan.id` pour cette invitation avec un autre contenu ; aucune écriture. |
| 413 | `too_large` | Corps supérieur à 32 Kio, même sans Content-Length. |
| 415 | `json_required` | Content-Type JSON requis. |
| 429 | `rate_limited` | Déjà 60 nouveaux bilans reçus pour cette invitation sur 24 heures glissantes. |
| 503 | `service_unavailable` | Configuration, réseau ou serveur indisponible ; ne pas afficher un envoi confirmé. |

La clé d’idempotence est `(access_id, bilan.id)`. Le quota et l’insertion sont protégés par un verrou PostgreSQL sur l’invitation ; les requêtes simultanées sont sérialisées. Un rejeu identique ne consomme pas le quota. Une invitation révoquée refuse même les rejeux. Un nouvel accès est nécessaire après révocation : le client ne peut réactiver l’ancien, changer son propriétaire ou le rattacher à un autre enfant.

Le client enseignant peut lire ses invitations, les créer et les révoquer par PATCH `{"revoked":true}`. Il lit ses bilans avec `select=id,access_id,payload,received_at&order=received_at.asc` et doit paginer si nécessaire. Les politiques RLS filtrent toujours sur `auth.uid()` et l’allowlist, même si le filtre `owner` est absent du client. Les bilans reçus sont immuables par les clients ; les tombstones de suppression locale restent dans Fluence pour empêcher une nouvelle importation. Une purge distante éventuelle est réservée à l’administration, après sauvegarde.

## Mise en service d’un projet dédié

1. Créer ou sélectionner un projet Supabase dédié, puis lier localement la CLI avec son project ref. Aucun compte ni projet n’est créé par ces sources.
2. Garder uniquement les schémas attendus dans les schémas exposés de la Data API. **Ne jamais exposer `private`.** Ne jamais accorder de grants supplémentaires à `anon`, notamment sur les deux tables ou la RPC serveur.
3. Exécuter les tests ci-dessous, puis appliquer la migration avec `supabase db push`. Les grants par défaut sont explicitement retirés de chaque objet créé.
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

## Tests

Sur un environnement Supabase local déjà démarré et migré :

```sh
supabase test db
```

Les tests pgTAP dans `tests/database/fluence.test.sql` passent dans une transaction annulée. Ils couvrent anon, un compte parent authentifié sans autorisation, deux enseignants isolés, un enseignant désactivé, immutabilité des identités, révocation, validation, déduction du propriétaire, idempotence et quota.

Sans Docker, le même SQL peut aussi être testé dans PostgreSQL WASM (PGlite) avec pgTAP, entièrement localement :

```sh
npm --prefix supabase/tests install --ignore-scripts
npm --prefix supabase/tests test
```

Il faut Node 24 ou plus pour les tests TypeScript. Le runner crée uniquement les rôles et le schéma Auth synthétiques nécessaires à `auth.uid()`, applique la vraie migration, puis exécute les mêmes tests pgTAP. Cela teste réellement les permissions, RLS, contraintes et fonctions PostgreSQL ; cela ne remplace pas les contrôles de passerelle, lien de connexion, CORS déployé et persistance d’un projet Supabase réel. Les tests Edge exécutent le vrai handler et interceptent son unique appel RPC : aucun compte ni donnée réelle ne sont utilisés.

Références : [RLS et grants Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [autorisation des Edge Functions](https://supabase.com/docs/guides/functions/auth), [tests de base Supabase](https://supabase.com/docs/guides/local-development/testing/overview), [extensions PostgreSQL/PGlite et pgTAP](https://pglite.dev/extensions/), [vérification de lien par token hash](https://supabase.com/docs/reference/javascript/auth-verifyotp).

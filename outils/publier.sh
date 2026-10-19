#!/bin/sh
# Enregistre et envoie le banc des maîtres sur GitHub, puis publie le site sur GitHub Pages.
# Usage : sh outils/publier.sh   (ou double-clic sur « outils/Publier sur GitHub.command »)
# Il faut l'outil GitHub (gh) connecté à un compte GitHub : brew install gh, puis gh auth login.
# La première fois : crée le dépôt public « banc-des-maitres » sur ce compte et active GitHub Pages.
# Le site est la branche gh-pages du dépôt : rien que le site assemblé (www/), sans prénoms ni résultats d'élèves.
set -e
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v gh >/dev/null 2>&1; then echo "Il manque l'outil GitHub (gh). Dans le Terminal : brew install gh" >&2; exit 1; fi
if ! gh auth status >/dev/null 2>&1; then echo "Connexion à GitHub (une page s'ouvre dans le navigateur)…"; gh auth login --web --git-protocol https; fi
gh auth setup-git >/dev/null 2>&1 || true

# 1. les sources, sur la branche main
[ -d .git ] || git init -q -b main
git add -A
if git diff --cached --quiet; then echo "Rien de nouveau à enregistrer."
else git commit -q -m "Mise à jour du $(date '+%d/%m/%Y à %H:%M')"; echo "Changements enregistrés."; fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Création du dépôt banc-des-maitres sur GitHub…"
  gh repo create banc-des-maitres --public --source . --remote origin \
    --description "Le banc des maîtres : fluence CM1 au TBI, avec le téléphone de la maîtresse en télécommande"
fi
git push -q -u origin main
DEPOT=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# 2. le site assemblé, sur la branche gh-pages (une seule version, remplacée à chaque publication)
python3 outils/build.py --hors-ligne
D=$(mktemp -d)
cp -R www/. "$D"/
NOM=$(git config user.name || echo "Le banc des maîtres"); MEL=$(git config user.email || echo "banc-des-maitres@users.noreply.github.com")
git -C "$D" init -q -b gh-pages
git -C "$D" add -A
git -C "$D" -c user.name="$NOM" -c user.email="$MEL" commit -q -m "Publication du $(date '+%d/%m/%Y à %H:%M')"
git -C "$D" push -q -f "https://github.com/$DEPOT.git" gh-pages:gh-pages
rm -rf "$D"
if ! gh api "repos/$DEPOT/pages" >/dev/null 2>&1; then
  gh api -X POST "repos/$DEPOT/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null && echo "GitHub Pages activé."
fi

# 3. le fichier hors ligne, à jour, dans les Ressources Trans
RT="$HOME/Desktop/Orga CM1 - 2026/Ressources Trans/01 - Français/Fluence APC/Le banc des maîtres"
if [ -d "$RT" ]; then cp "hors-ligne/Le banc des maîtres - HORS LIGNE.html" "$RT/"; echo "Fichier hors ligne mis à jour dans les Ressources Trans."; fi

PROPRIO=$(echo "${DEPOT%%/*}" | tr '[:upper:]' '[:lower:]')
echo
echo "C'est publié. Le site sera à jour dans une à deux minutes :"
echo "https://$PROPRIO.github.io/${DEPOT#*/}/"

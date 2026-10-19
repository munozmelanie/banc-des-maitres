#!/bin/bash
# Double-clic : enregistre les changements du banc des maîtres, les envoie sur GitHub et publie le site.
# (La première fois : crée le dépôt public « banc-des-maitres » et active GitHub Pages.) Tout le travail est dans publier.sh.
cd "$(dirname "$0")" || exit 1
echo "Le banc des maîtres : publication"; echo
sh ./publier.sh; R=$?
[ $R -ne 0 ] && { echo; echo "La publication n'a pas abouti (voir le message ci-dessus)."; }
echo; read -n 1 -s -r -p "Appuie sur une touche pour fermer cette fenêtre."; echo
exit $R

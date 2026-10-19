#!/bin/sh
# Publication avec la connexion GitHub déjà enregistrée pour Git sur le Mac.
set -eu
cd "$(dirname "$0")/.."
exec python3 outils/publier.py

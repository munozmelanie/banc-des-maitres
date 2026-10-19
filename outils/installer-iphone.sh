#!/bin/sh
# Compile, signe avec le profil déjà présent sur le Mac et installe sans effacer les données.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
if [ -f "$ROOT/.iphone.local.env" ]; then
  . "$ROOT/.iphone.local.env"
fi
: "${BANC_IPHONE_DEVICE:?Renseigner BANC_IPHONE_DEVICE dans .iphone.local.env (voir outils/iphone.env.example).}"
: "${BANC_DEVELOPMENT_TEAM:?Renseigner BANC_DEVELOPMENT_TEAM dans .iphone.local.env.}"
: "${BANC_PROVISIONING_PROFILE:?Renseigner BANC_PROVISIONING_PROFILE dans .iphone.local.env.}"
: "${BANC_CODE_SIGN_IDENTITY:?Renseigner BANC_CODE_SIGN_IDENTITY dans .iphone.local.env.}"
BANC_NODE=${BANC_NODE:-$(command -v node)}
BANC_PYTHON=${BANC_PYTHON:-python3}
"$BANC_NODE" -e 'if (+process.versions.node.split(".")[0] < 22) { console.error("Capacitor demande Node 22 ou plus : renseigner BANC_NODE dans .iphone.local.env."); process.exit(1); }'
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
# Une valeur chargée depuis .iphone.local.env doit aussi atteindre xcodebuild/xcrun.
if [ -n "${DEVELOPER_DIR:-}" ]; then
  export DEVELOPER_DIR
fi
PATH="$(dirname "$BANC_NODE"):$PATH"
export PATH
BANC_IOS_BUILD_NUMBER=${BANC_IOS_BUILD_NUMBER:-$(date +%Y%m%d%H%M)}
BUILD_DIR="$ROOT/build/ios"
BUILD_LOG="$ROOT/build/iphone-build.log"
APP="$BUILD_DIR/Build/Products/Debug-iphoneos/App.app"
mkdir -p "$ROOT/build"
"$BANC_PYTHON" outils/build.py
"$BANC_NODE" node_modules/@capacitor/cli/bin/capacitor sync ios
printf '%s\n' 'Compilation et signature de l’application…'
if ! xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$BANC_IPHONE_DEVICE" -derivedDataPath "$BUILD_DIR" \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="$BANC_DEVELOPMENT_TEAM" \
  PROVISIONING_PROFILE_SPECIFIER="$BANC_PROVISIONING_PROFILE" \
  CODE_SIGN_IDENTITY="$BANC_CODE_SIGN_IDENTITY" \
  CURRENT_PROJECT_VERSION="$BANC_IOS_BUILD_NUMBER" build > "$BUILD_LOG" 2>&1; then
  tail -60 "$BUILD_LOG"
  exit 1
fi
"$BANC_PYTHON" - "$ROOT/www" "$APP/public" <<'PY'
from pathlib import Path
import sys
source, destination = map(Path, sys.argv[1:])
for source_file in source.rglob('*'):
    if source_file.is_file():
        copied_file = destination / source_file.relative_to(source)
        if not copied_file.is_file() or source_file.read_bytes() != copied_file.read_bytes():
            raise SystemExit(f'Ressource native différente : {source_file.relative_to(source)}')
print('Les ressources embarquées correspondent exactement au site assemblé.')
PY
printf '%s\n' 'Installation sur l’iPhone (le garder déverrouillé et joignable par le Mac)…'
xcrun devicectl device install app --device "$BANC_IPHONE_DEVICE" "$APP" --timeout 60
xcrun devicectl device process launch --device "$BANC_IPHONE_DEVICE" com.pookee.bancdesmaitres --timeout 30
xcrun devicectl device info apps --device "$BANC_IPHONE_DEVICE" \
  --filter "bundleIdentifier == 'com.pookee.bancdesmaitres'" --timeout 30
printf '%s\n' 'Fluence est installé et ouvert sur l’iPhone.'

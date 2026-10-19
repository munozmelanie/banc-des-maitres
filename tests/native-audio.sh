#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
temporary=$(mktemp -d "${TMPDIR:-/tmp}/fluence-audio-test.XXXXXX")
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
xcrun swiftc -module-cache-path "$temporary/cache" ios/App/App/FluenceAudioSupport.swift tests/native-audio.swift -o "$temporary/test"
"$temporary/test"

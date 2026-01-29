#!/usr/bin/env bash
set -euo pipefail

# Download Iosevka fonts based on .iosevka-version
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$PROJECT_ROOT/.iosevka-version"
BASE_FONTS_DIR="$PROJECT_ROOT/base-fonts"

if [[ ! -f "$VERSION_FILE" ]]; then
    echo "Error: $VERSION_FILE not found"
    exit 1
fi

VERSION=$(head -n1 "$VERSION_FILE" | tr -d '[:space:]')
if [[ -z "$VERSION" ]]; then
    echo "Error: Version file is empty"
    exit 1
fi

echo "Downloading Iosevka $VERSION..."
DOWNLOAD_URL="https://github.com/be5invis/Iosevka/releases/download/$VERSION/PkgTTF-Iosevka-${VERSION#v}.zip"
TEMP_ZIP="$BASE_FONTS_DIR/iosevka-temp.zip"

mkdir -p "$BASE_FONTS_DIR"

echo "Fetching from: $DOWNLOAD_URL"
curl -L -o "$TEMP_ZIP" "$DOWNLOAD_URL"

echo "Extracting fonts to $BASE_FONTS_DIR..."
unzip -q -o "$TEMP_ZIP" -d "$BASE_FONTS_DIR"

rm "$TEMP_ZIP"

echo "Downloaded and extracted Iosevka fonts to $BASE_FONTS_DIR"
ls -lh "$BASE_FONTS_DIR"/*.ttf | head -5

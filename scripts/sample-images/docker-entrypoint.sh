#!/bin/bash
set -euo pipefail

# Configuration
IOSEVKA_VERSION="${IOSEVKA_VERSION:-$(cat /build/.iosevka-version)}"
PLAN_FILE="${PLAN_FILE:-/build/private-build-plans.toml}"
PLAN_NAME="${PLAN_NAME:-IoseptaMono}"
OUT_DIR="${OUT_DIR:-/out}"
WORK_DIR="/tmp/sample-work"

echo "==> Cloning Iosevka ${IOSEVKA_VERSION}..."
git clone --depth 1 --branch "${IOSEVKA_VERSION}" \
    https://github.com/be5invis/Iosevka.git /tmp/iosevka

echo "==> Installing Iosevka dependencies..."
cd /tmp/iosevka && npm ci --ignore-scripts

echo "==> Downloading base fonts..."
DOWNLOAD_URL="https://github.com/be5invis/Iosevka/releases/download/${IOSEVKA_VERSION}/PkgTTF-Iosevka-${IOSEVKA_VERSION#v}.zip"
curl -fsSL "${DOWNLOAD_URL}" -o /tmp/iosevka-fonts.zip
unzip -q /tmp/iosevka-fonts.zip -d /tmp/base-fonts

echo "==> Generating sample config..."
mkdir -p "${WORK_DIR}"
cd /build/scripts/sample-images
npx tsx generate-config.ts \
    --iosevka-dir=/tmp/iosevka \
    --plan-file="${PLAN_FILE}" \
    --plan-name="${PLAN_NAME}" \
    --out-dir="${WORK_DIR}"

echo "==> Rendering SVGs..."
FONT_REGULAR="/tmp/base-fonts/Iosevka-Regular.ttf"
FONT_ITALIC="/tmp/base-fonts/Iosevka-Italic.ttf"

python3 render-outline-svg.py "${WORK_DIR}/iosepta-samples.json" "${FONT_REGULAR}" upright "${WORK_DIR}/iosepta-upright.light.svg"
python3 render-outline-svg.py "${WORK_DIR}/iosepta-samples.json" "${FONT_REGULAR}" upright "${WORK_DIR}/iosepta-upright.dark.svg"
python3 render-outline-svg.py "${WORK_DIR}/iosepta-samples.json" "${FONT_ITALIC}" italic "${WORK_DIR}/iosepta-italic.light.svg"
python3 render-outline-svg.py "${WORK_DIR}/iosepta-samples.json" "${FONT_ITALIC}" italic "${WORK_DIR}/iosepta-italic.dark.svg"

echo "==> Copying outputs to ${OUT_DIR}..."
mkdir -p "${OUT_DIR}"
cp "${WORK_DIR}/iosepta-samples.json" "${OUT_DIR}/"
cp "${WORK_DIR}/"*.svg "${OUT_DIR}/"

echo "==> Done!"
ls -lh "${OUT_DIR}"

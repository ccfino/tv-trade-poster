#!/usr/bin/env bash
# Download Poppins TTF files from Google Fonts static CDN
set -e

DIR="$(cd "$(dirname "$0")/../assets/fonts" && pwd)"
echo "Downloading Poppins fonts to $DIR …"

BASE="https://github.com/google/fonts/raw/main/ofl/poppins"

FILENAMES=(
  "Poppins-Regular.ttf"
  "Poppins-Bold.ttf"
  "Poppins-SemiBold.ttf"
  "Poppins-Light.ttf"
  "Poppins-Italic.ttf"
)

for FILENAME in "${FILENAMES[@]}"; do
  DEST="$DIR/$FILENAME"
  if [ -f "$DEST" ]; then
    echo "  ✓ $FILENAME already exists, skipping"
    continue
  fi
  echo "  Downloading $FILENAME …"
  curl -fsSL "$BASE/$FILENAME" -o "$DEST"
done

echo "Done."

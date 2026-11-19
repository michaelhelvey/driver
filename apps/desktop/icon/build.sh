#!/usr/bin/env bash
# Renders icon.svg to a 1024px PNG and a preview sheet, then regenerates the Tauri icon set.
# Usage: apps/desktop/icon/build.sh [out-dir]   (needs rsvg-convert and ImageMagick: brew install librsvg imagemagick)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-/tmp/driver-icon}"
mkdir -p "$out"

rsvg-convert -w 1024 -h 1024 "$here/icon.svg" -o "$out/icon-1024.png"

row() {
  local bg="$1" tiles=()
  for s in 16 32 64 128 512; do
    magick "$out/icon-1024.png" -filter Lanczos -resize "${s}x${s}" \
      -background "$bg" -gravity center -extent 560x560 "$out/tile-$s.png"
    tiles+=("$out/tile-$s.png")
  done
  magick "${tiles[@]}" +append "$out/row-$2.png"
  rm "${tiles[@]}"
}
row "#ecebe9" light
row "#2a2a2c" dark
magick "$out/row-light.png" "$out/row-dark.png" -append "$out/preview.png"
rm "$out/row-light.png" "$out/row-dark.png"

magick "$out/icon-1024.png" -filter Lanczos -resize 32x32 -scale 512x512 "$out/zoom-32.png"
magick "$out/icon-1024.png" -filter Lanczos -resize 16x16 -scale 512x512 "$out/zoom-16.png"

if [[ "${SKIP_TAURI:-}" != 1 ]]; then
  (cd "$here/.." && bun tauri icon "$out/icon-1024.png")
  icons="$here/../src-tauri/icons"
  rm -rf "$icons"/android "$icons"/ios "$icons"/Square*Logo.png "$icons"/StoreLogo.png "$icons"/64x64.png "$icons"/icon.ico
fi
echo "wrote $out/icon-1024.png $out/preview.png"

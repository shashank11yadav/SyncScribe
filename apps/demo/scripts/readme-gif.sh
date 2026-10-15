#!/usr/bin/env bash
# Stitches the frames from e2e/readme-media.spec.ts into docs/live-demo.gif.
# Run from apps/demo after: CAPTURE_MEDIA=1 npx playwright test readme-media
set -euo pipefail

frames="test-results/readme-media"
out="../../docs/live-demo.gif"
fps=9

# A palette built from every frame, and no dithering: the UI is flat colour,
# and dither noise would stop the GIF from reusing unchanged pixels.
ffmpeg -v error -y \
  -framerate "$fps" -i "$frames/left-%04d.png" \
  -framerate "$fps" -i "$frames/right-%04d.png" \
  -filter_complex "[0:v]pad=iw+4:ih:0:0:color=0xd9d4ca[l];[l][1:v]hstack=inputs=2,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  "$out"

ls -l "$out"

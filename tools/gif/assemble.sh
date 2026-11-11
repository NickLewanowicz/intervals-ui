#!/usr/bin/env bash
# Assemble captured frame takes into optimized GIFs for docs/gifs/.
# Resamples each take to a constant 12fps using the wall-clock receipt log,
# crops to the app column, scales to 720w, two-pass palette.
set -euo pipefail
ROOT=/tmp/gif-frames
OUT=/Users/nick/Documents/Projects/intervals-ui/docs/gifs
FPS=12
mkdir -p "$OUT"

for CLIP in calendar-tour coach-chat proposal-flow; do
  TSV="$ROOT/$CLIP.tsv"
  DIR="$ROOT/$CLIP"
  # build a constant-rate sequence via nearest-frame sampling from the tsv
  python3 - "$TSV" "$DIR" "$FPS" <<'PY'
import sys, os, shutil
tsv, d, fps = sys.argv[1], sys.argv[2], int(sys.argv[3])
rows = []
with open(tsv) as f:
    next(f)
    for line in f:
        s, ms = line.split()
        rows.append((int(s), int(ms)))
t0 = rows[0][1]
stamps = [(s, ms - t0) for s, ms in rows]
out = os.path.join(d, 'seq')
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    os.remove(os.path.join(out, f))
i = 0
for tick in range((stamps[-1][1] // (1000 // fps)) + 1):
    target = tick * (1000 // fps)
    while i + 1 < len(stamps) and abs(stamps[i + 1][1] - target) <= abs(stamps[i][1] - target):
        i += 1
    shutil.copy(os.path.join(d, f"{stamps[i][0]:05d}.jpg"), os.path.join(out, f"{tick:05d}.jpg"))
print(f"{os.path.basename(d)}: {tick + 1} ticks @ {fps}fps from {len(stamps)} frames")
PY
  ffmpeg -y -loglevel error -framerate $FPS -i "$DIR/seq/%05d.jpg" \
    -vf "crop=880:800:200:0,scale=720:-1:flags=lanczos,palettegen=max_colors=128" \
    "$ROOT/$CLIP.palette.png"
  ffmpeg -y -loglevel error -framerate $FPS -i "$DIR/seq/%05d.jpg" -i "$ROOT/$CLIP.palette.png" \
    -lavfi "crop=880:800:200:0,scale=720:-1:flags=lanczos[p];[p][1:v]paletteuse=dither=bayer:bayer_scale=4" \
    "$OUT/$CLIP.gif"
  ls -la "$OUT/$CLIP.gif" | awk '{print $9, $5}'
done

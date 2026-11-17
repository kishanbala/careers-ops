# Converts the captured PNGs to WebP, keeping each file under 300 KB. Usage: optimise.py <src-dir> <out-dir>
import glob, os, sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
LIMIT = 300 * 1024
for png in sorted(glob.glob(os.path.join(src, "*-*-*.png"))):
    name = os.path.basename(png)[:-4]
    if name.startswith("frame-"):
        continue
    im = Image.open(png).convert("RGB")
    dest = os.path.join(out, name + ".webp")
    for q in (90, 82, 74, 66, 58, 50):
        im.save(dest, "WEBP", quality=q, method=6)
        if os.path.getsize(dest) <= LIMIT:
            break
    if os.path.getsize(dest) > LIMIT:
        sys.exit(f"{dest} is over 300 KB even at the lowest quality")

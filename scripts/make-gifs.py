"""Turns the WebM recordings in media/raw/ into the GIFs in media/.

    python3 scripts/make-gifs.py /path/to/ffmpeg [regulars|puzzle|friends|all]
    (Playwright's bundled ffmpeg works)
"""
import glob, json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

FF = sys.argv[1]
ONLY = sys.argv[2] if len(sys.argv) > 2 else "all"
RAW = 'media/raw'
FPS_IN = 25

def frames(webm):
    d = tempfile.mkdtemp()
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-i', webm, f'{d}/f%05d.png'], check=True)
    return sorted(glob.glob(f'{d}/f*.png'))

def font(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def save_gif(imgs, path, fps):
    pal = imgs[len(imgs) // 2].quantize(colors=224, method=Image.Quantize.MEDIANCUT)
    q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in imgs]
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / fps), loop=0, optimize=True)
    print(path, len(imgs), 'frames', round(os.path.getsize(path) / 1e6, 1), 'MB')

# 1. a hand against the regulars, ending in Mind-read
if ONLY in ('all', 'regulars'):
    fs = frames(f'{RAW}/regulars.webm')
    fps = FPS_IN / 3
    fs = fs[int(1.6 * FPS_IN)::3][: int(45 * fps)]  # skip the page load; at most 45 s
    save_gif([Image.open(f).convert('RGB').resize((800, 500), Image.LANCZOS) for f in fs], 'media/regulars.gif', fps)

# 2. Spot the Bluff on a phone
if ONLY in ('all', 'puzzle'):
    fs = frames(f'{RAW}/puzzle.webm')
    fps = FPS_IN / 3
    fs = fs[int(1.4 * FPS_IN)::3]
    save_gif([Image.open(f).convert('RGB').resize((320, 688), Image.LANCZOS) for f in fs], 'media/puzzle.gif', fps)

# 3. host (laptop) and friend (phone) side by side, in step
if ONLY in ('all', 'friends'):
    off = json.load(open(f'{RAW}/times.json'))['guestOffsetMs'] / 1000
    hf, gf = frames(f'{RAW}/host.webm'), frames(f'{RAW}/guest.webm')
    W, H = 1000, 540
    F = font(18)
    out = []
    for i in range(int(1.0 * FPS_IN), len(hf), 5):
        t = i / FPS_IN
        j = int((t - off) * FPS_IN)
        if j >= len(gf):
            break  # the phone's recording ended
        canvas = Image.new('RGB', (W, H), (12, 11, 16))
        h = Image.open(hf[i]).convert('RGB').resize((700, 484), Image.LANCZOS)
        canvas.paste(h, (20, 40))
        if j >= 0:
            g = Image.open(gf[j]).convert('RGB').resize((249, 484), Image.LANCZOS)
            canvas.paste(g, (736, 40))
        d = ImageDraw.Draw(canvas)
        d.text((20, 10), 'Host · laptop', font=F, fill=(232, 195, 106))
        d.text((736, 10), 'Friend · phone', font=F, fill=(232, 195, 106))
        out.append(canvas)
    save_gif(out, 'media/friends.gif', FPS_IN / 5)

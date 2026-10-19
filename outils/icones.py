"""Icônes de l'appli (écran d'accueil du téléphone, onglet du navigateur) : src/icones/icone-*.png.
Usage : python3 outils/icones.py   (il faut Pillow : pip install pillow)
Le dessin : le banc des maîtres en bois, avec le papier vert coincé sous le siège, sur la cour claire."""
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "icones"; OUT.mkdir(parents=True, exist_ok=True)
VERT, BOIS, COUR, PAPIER = (29, 127, 72), (156, 107, 60), (242, 244, 239), (255, 255, 255)

def icone(n):
    k = 4; N = n * k  # dessin en grand, puis réduit (bords lisses)
    im = Image.new("RGB", (N, N), VERT); d = ImageDraw.Draw(im)
    m = N * 0.12; d.rounded_rectangle([m, m, N - m, N - m], radius=N * 0.16, fill=COUR)
    u = (N - 2 * m) / 44  # le banc du logo (viewBox 44 × 30), centré
    ox, oy = m, m + (N - 2 * m - 30 * u) / 2
    R = lambda x, y, w, h, r: d.rounded_rectangle([ox + x * u, oy + y * u, ox + (x + w) * u, oy + (y + h) * u], radius=r * u, fill=BOIS)
    R(2, 6, 40, 5, 2); R(2, 14, 40, 5, 2); R(6, 19, 4, 10, 1.5); R(34, 19, 4, 10, 1.5)
    import math
    cx, cy, a = ox + 22.5 * u, oy + 19 * u, math.radians(-8)
    pts = [(-4.5, -3), (4.5, -3), (4.5, 3), (-4.5, 3)]
    rot = [(cx + x * u * math.cos(a) - y * u * math.sin(a), cy + x * u * math.sin(a) + y * u * math.cos(a)) for x, y in pts]
    d.polygon(rot, fill=PAPIER, outline=VERT, width=int(1.5 * u))
    return im.resize((n, n), Image.LANCZOS)

for n in (180, 192, 512):
    icone(n).save(OUT / f"icone-{n}.png", optimize=True)
print("src/icones : icone-180.png, icone-192.png, icone-512.png")

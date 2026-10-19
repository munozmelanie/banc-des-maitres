"""Décline le logo fourni dans les formats web et iPhone, sans le redessiner.

Usage : python3 outils/icones.py (Pillow requis).
Source : contenu/logo/icone-source.png ; prompt conservé à côté de l'image.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "contenu/logo/icone-source.png"
OUT = ROOT / "src/icones"
OUT.mkdir(parents=True, exist_ok=True)
with Image.open(SOURCE) as source:
    if source.width != source.height:
        raise SystemExit("Le logo doit être carré.")
    image = source.convert("RGB")
    for size in (180, 192, 512):
        image.resize((size, size), Image.Resampling.LANCZOS).save(OUT / f"icone-{size}.png", optimize=True)
    native = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
    if native.parent.is_dir():
        image.resize((1024, 1024), Image.Resampling.LANCZOS).save(native, optimize=True)
print("Logo décliné pour le site et l’iPhone.")

"""Convertit les illustrations de ChatGPT pour le site : E1-1.png (ou .jpg, .webp) → src/img/E1-1.webp.

Usage : python3 outils/images.py [dossier]   (par défaut contenu/images/ ; il faut Pillow : pip install pillow)
Les noms reconnus : « E1-1 », « E1 - 1 », « e1_1 »… (épisode, puis page de 1 à 5). Une image déjà convertie
n'est refaite que si l'original est plus récent. Les originaux restent hors du dépôt (trop lourds).
"""
import pathlib, re, sys
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "img"
TAILLE = 900  # côté de l'image affichée (carrée), assez pour le TBI


def main():
    src = pathlib.Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else ROOT / "contenu" / "images"
    if not src.is_dir():
        print("Dossier introuvable :", src); return
    OUT.mkdir(parents=True, exist_ok=True)
    faits = 0
    for f in sorted(src.iterdir()):
        m = re.search(r"\bE\s*(\d+)\s*[-_ ]\s*(\d)\b", f.stem, re.I)
        if not m or f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".heic"):
            continue
        nom = f"E{int(m.group(1))}-{int(m.group(2))}.webp"
        dst = OUT / nom
        if dst.exists() and dst.stat().st_mtime >= f.stat().st_mtime:
            continue
        im = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
        c = min(im.size)  # recadrage carré au centre, comme dans l'appli
        im = im.crop(((im.width - c) // 2, (im.height - c) // 2, (im.width + c) // 2, (im.height + c) // 2)).resize((TAILLE, TAILLE), Image.LANCZOS)
        im.save(dst, "WEBP", quality=80, method=6)
        faits += 1
        print(f.name, "→", "src/img/" + nom, dst.stat().st_size // 1024, "Ko")
    print(faits, "image(s) convertie(s)." if faits else "Rien de nouveau.")


if __name__ == "__main__":
    main()

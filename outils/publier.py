"""Publie les sources et le site avec la connexion Git déjà enregistrée sur le Mac."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
ENV = dict(os.environ, GIT_TERMINAL_PROMPT="0")


def git(*args, cwd=ROOT, check=True):
    return subprocess.run(["git", *args], cwd=cwd, env=ENV, text=True,
                          capture_output=True, check=check)


def connexion():
    result = subprocess.run(["git", "credential", "fill"],
                            input="protocol=https\nhost=github.com\n\n", env=ENV,
                            text=True, capture_output=True)
    values = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if not values.get("password"):
        raise RuntimeError("Connexion GitHub introuvable. Connecte Git à GitHub sur ce Mac, puis relance la publication.")
    return values["password"]


def main():
    token = connexion()

    def api(path, method="GET", data=None):
        req = urllib.request.Request("https://api.github.com/" + path, method=method,
              data=None if data is None else json.dumps(data).encode(),
              headers={"Authorization": "Bearer " + token, "User-Agent": "banc-des-maitres",
                       "Accept": "application/vnd.github+json", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            message = json.loads(error.read()).get("message", str(error))
            raise RuntimeError(f"GitHub ({error.code}) : {message}") from error

    user = api("user")["login"]
    if not (ROOT / ".git").is_dir():
        git("init", "-q", "-b", "main")
    remote = git("remote", "get-url", "origin", check=False).stdout.strip()
    if remote:
        match = re.fullmatch(r"(?:https://github\.com/|git@github\.com:)([\w.-]+/[\w.-]+?)(?:\.git)?", remote)
        if not match:
            raise RuntimeError("Le dépôt origin doit être une adresse github.com reconnue.")
        repo = match.group(1)
    else:
        repo = user + "/banc-des-maitres"
        api("user/repos", "POST", {"name": "banc-des-maitres", "private": False,
            "description": "Le banc des maîtres : fluence CM1 au TBI et télécommande iPhone"})
        remote = "https://github.com/" + repo + ".git"
        git("remote", "add", "origin", remote)
    if git("branch", "--show-current").stdout.strip() != "main":
        raise RuntimeError("Reviens sur la branche main avant de publier.")
    # Assembler avant tout envoi : une erreur de contenu bloque la publication.
    subprocess.run([os.sys.executable, "outils/build.py", "--hors-ligne"], cwd=ROOT, check=True)
    git("add", "-A")
    staged = git("diff", "--cached", "--name-only").stdout.splitlines()
    if any("sauvegarde" in p.lower() or p == ".iphone.local.env" for p in staged):
        raise RuntimeError("La sélection contient un fichier personnel : retire-le avant de publier.")
    if staged:
        git("commit", "-q", "-m", "Mise à jour du Banc des maîtres")
    git("push", "-u", "origin", "main")
    print("Sources envoyées sur GitHub.", flush=True)
    with tempfile.TemporaryDirectory(prefix="banc-publication-") as tmp:
        target = Path(tmp)
        git("init", "-q", "-b", "gh-pages", cwd=target)
        git("remote", "add", "origin", remote, cwd=target)
        if git("ls-remote", "--heads", "origin", "gh-pages").stdout.strip():
            git("fetch", "-q", "--depth=1", "origin", "gh-pages", cwd=target)
            git("checkout", "-q", "-B", "gh-pages", "FETCH_HEAD", cwd=target)
        for p in target.iterdir():
            if p.name != ".git":
                shutil.rmtree(p) if p.is_dir() else p.unlink()
        shutil.copytree(ROOT / "www", target, dirs_exist_ok=True)
        git("add", "-A", cwd=target)
        if git("diff", "--cached", "--quiet", cwd=target, check=False).returncode:
            git("commit", "-q", "-m", "Publication du site de fluence", cwd=target)
            git("push", "origin", "gh-pages", cwd=target)
    # La première poussée gh-pages peut déjà avoir activé Pages automatiquement.
    try:
        pages = api("repos/" + repo + "/pages")
    except RuntimeError as error:
        if not isinstance(error.__cause__, urllib.error.HTTPError) or error.__cause__.code != 404:
            raise
        try:
            pages = api("repos/" + repo + "/pages", "POST", {"source": {"branch": "gh-pages", "path": "/"}})
        except RuntimeError as conflict:
            if not isinstance(conflict.__cause__, urllib.error.HTTPError) or conflict.__cause__.code != 409:
                raise
            pages = api("repos/" + repo + "/pages")
    if pages.get("source") != {"branch": "gh-pages", "path": "/"}:
        raise RuntimeError("GitHub Pages ne pointe pas sur gh-pages : vérifier les réglages du dépôt.")
    offline = Path.home() / "Desktop/Orga CM1 - 2026/Ressources Trans/01 - Français/Fluence APC/Le banc des maîtres"
    if offline.is_dir():
        shutil.copy2(ROOT / "hors-ligne/Le banc des maîtres - HORS LIGNE.html", offline)
    print("Envoi terminé. GitHub met le site à jour dans quelques minutes :")
    print(pages["html_url"])


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, urllib.error.URLError) as error:
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr or str(error))
        else:
            print(str(error))
        raise SystemExit(1)

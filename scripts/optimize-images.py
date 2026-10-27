#!/usr/bin/env python3
"""Incrementally convert PNG artwork into versioned WebP files.

Install once: python -m pip install -r requirements-assets.txt
Update:       python scripts/optimize-images.py
Validate:     python scripts/optimize-images.py --check
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets/webp"
CATALOG = OUTPUT / "catalog.json"
GROUPS = [
    ("cards", "imagedata/cards", {"quality": 86, "method": 4}),
    ("backcards", "imagedata/backcard", {"quality": 90, "method": 4}),
    ("boards", "imagedata/tabuleiros", {"quality": 87, "method": 4}),
    ("ui", "imagedata/ui", {"lossless": True, "method": 4}),
]


def checksum(file):
    h = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def optimize(check_only=False):
    state = {}
    if CATALOG.is_file():
        try:
            state = json.loads(CATALOG.read_text(encoding="utf-8")).get("entries", {})
        except (ValueError, OSError):
            pass
    current, stale = {}, []
    encoded = unchanged = original_size = webp_size = 0

    for group, folder, options in GROUPS:
        directory = ROOT / folder
        if not directory.is_dir():
            raise SystemExit(f"Source artwork directory missing: {folder}")
        for source in sorted(directory.rglob("*")):
            if source.suffix.lower() != ".png" or not source.is_file():
                continue
            relative = source.relative_to(directory).with_suffix(".webp")
            key = f"{group}/{relative.as_posix()}"
            target = OUTPUT / key
            fingerprint = checksum(source)
            settings = {"sha256": fingerprint, "options": options}
            old = state.get(key, {})
            valid = target.is_file() and all(old.get(k) == v for k, v in settings.items())
            if not valid and check_only:
                stale.append(key)
                continue
            if not valid:
                target.parent.mkdir(parents=True, exist_ok=True)
                temp = target.with_name(target.name + ".tmp")
                try:
                    with Image.open(source) as image:
                        image = ImageOps.exif_transpose(image)
                        image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
                        image.save(temp, format="WEBP", **options)
                    os.replace(temp, target)
                finally:
                    temp.unlink(missing_ok=True)
                encoded += 1
            else:
                unchanged += 1
            current[key] = {**settings, "bytes": target.stat().st_size}
            original_size += source.stat().st_size
            webp_size += target.stat().st_size

    obsolete = sorted(set(state) - set(current) - set(stale))
    if not current and not stale:
        raise SystemExit("No PNG assets found")
    if check_only:
        if stale or obsolete:
            print(f"WebP missing/changed: {stale[:25]}; obsolete: {obsolete[:25]}")
            return 1
        print(f"Verified {len(current)} optimized images")
        return 0

    for key in obsolete:
        (OUTPUT / key).unlink(missing_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    CATALOG.write_text(json.dumps({"version": 1, "entries": current}, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    saved = 100 * (1 - webp_size / original_size) if original_size else 0
    print(f"WebP assets: {encoded} encoded, {unchanged} reused, {len(obsolete)} removed; "
          f"{original_size / 1048576:.1f} MiB -> {webp_size / 1048576:.1f} MiB ({saved:.1f}% smaller)")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    raise SystemExit(optimize(args.check))

#!/usr/bin/env python3
"""Organize downloaded 3MF files from ~/Downloads/3mf_templates into categories/<cat>/<id>_<slug>/model/."""
import json, os, re, shutil, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/Users/jesusc/Downloads/3mf_templates/"
CATEGORIES = os.path.join(ROOT, "categories")

catalog = json.load(open(os.path.join(ROOT, "catalog.json")))
meta = {}
for cat, items in catalog.items():
    for m in items:
        meta[m["id"]] = (m["slug"], m["title"], cat)

moved = skipped = 0
for f in sorted(glob.glob(os.path.join(SRC, "*.3mf"))):
    base = os.path.basename(f)
    parts = base.split(".")
    if len(parts) < 3:
        print(f"  SKIP (no prefijo): {base}")
        skipped += 1
        continue
    cat, mid = parts[0], parts[1]
    name = ".".join(parts[2:])           # e.g. "Bulbasaur+Flower+Pot+-+Mono+X1.3mf"
    info = meta.get(mid)
    if info is None:
        # maybe category dir exists anyway
        print(f"  SKIP (id {mid} sin metadata): {base}")
        skipped += 1
        continue
    slug, title, real_cat = info
    dest_dir = os.path.join(CATEGORIES, real_cat, f"{mid}_{slug}", "model")
    if os.path.isdir(dest_dir):
        print(f"  SKIP (ya organizado): {mid}")
        skipped += 1
        continue
    os.makedirs(dest_dir, exist_ok=True)
    name = name.replace("+", "_")
    dest = os.path.join(dest_dir, f"{name}")
    n = 2
    while os.path.exists(dest):
        stem, ext = os.path.splitext(name)
        dest = os.path.join(dest_dir, f"{stem}-{n}{ext}")
        n += 1
    shutil.copy2(f, dest)
    print(f"  + {real_cat}/{mid}_{slug}/model/{os.path.basename(dest)}")
    moved += 1

print(f"\nmoved={moved} skipped={skipped}")
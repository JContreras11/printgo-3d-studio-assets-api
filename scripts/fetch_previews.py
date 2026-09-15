#!/usr/bin/env python3
"""Download every product image for each model into previews/<mid>/NN.<ext> (resumable).
NN is zero-padded page order. Uses the parsed w_1000 URLs from raw scrapes.

Usage: python3 scripts/fetch_previews.py [--for-downloaded]"""
import json, os, sys, re, glob, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "lib"))
from parse_meta import load_existing_metadata

def clean_url(url):
    url = re.sub(r"\?.*$", "", url)
    url = re.sub(r"/format,webp$", "", url)
    url = re.sub(r"/format,jpeg$", "", url)
    url = re.sub(r"/format,png$", "", url)
    return url

def ext_for(url):
    clean = clean_url(url)
    m = re.search(r"\.(\w+)$", clean)
    ext = (m.group(1) if m else "jpg").lower()
    if ext in ("jpeg",):
        ext = "jpg"
    return ext

def main():
    previews_dir = os.path.join(ROOT, "previews")
    meta = load_existing_metadata()
    if "--for-downloaded" in sys.argv:
        ids = set()
        for d in glob.glob(os.path.join(ROOT, "categories", "*", "*_*")):
            ids.add(os.path.basename(d).split("_")[0])
        targets = {mid: m for mid, m in meta.items() if mid in ids}
    else:
        targets = meta

    total = need = 0
    ok = fail = skip = 0
    for mid, m in sorted(targets.items()):
        imgs = (m or {}).get("images") or []
        total += len(imgs)
        os.makedirs(os.path.join(previews_dir, mid), exist_ok=True)
        for i, url in enumerate(imgs, start=1):
            ext = ext_for(url)
            out = os.path.join(previews_dir, mid, f"{i:02d}.{ext}")
            if os.path.exists(out) and os.path.getsize(out) > 2000:
                skip += 1
                continue
            need += 1
            clean = clean_url(url)
            try:
                req = urllib.request.Request(clean, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=40) as r:
                    data = r.read()
                if len(data) < 2000:
                    fail += 1
                    print(f"TINY {mid}/{i}: {len(data)}b"); continue
                open(out, "wb").write(data)
                ok += 1
            except Exception as e:
                fail += 1
                print(f"FAIL {mid}/{i}: {e}")
    print(f"models={len(targets)} images_total={total} fresh={need} ok={ok} skip={skip} fail={fail}")

if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Build the consumable API structure:
- copies previews into categories/<cat>/<id>_<slug>/previews/preview.jpg
- writes manifest.json per model (metadata + files + hashes)
- emits api/index.json, api/categories/<cat>.json, api/model/<id>.json

Layout (GitHub Pages friendly, deterministic):
  categories/<cat>/<id>_<slug>/
    model/*.3mf          original files
    previews/preview.jpg first product image
    manifest.json        metadata + provenance
  api/
    index.json           {meta, count, categories}
    categories.json      [{id, name, count}]
    categories/<cat>.json list of light models
    model/<id>.json      full model object (same as manifest minus files detail)
"""
import json, os, sys, glob, hashlib, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "lib"))
from parse_meta import load_existing_metadata

CATS = "automotive bathroom bedroom decor home-organization kitchen repair science".split()

def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    catalog = json.load(open(os.path.join(ROOT, "catalog.json")))
    by_id = {}
    for cat, items in catalog.items():
        for m in items:
            by_id[m["id"]] = m
    meta = load_existing_metadata()

    api_dir = os.path.join(ROOT, "api")
    api_cat = os.path.join(api_dir, "categories")
    api_model = os.path.join(api_dir, "model")
    os.makedirs(api_cat, exist_ok=True)
    os.makedirs(api_model, exist_ok=True)

    records = []
    per_cat = {}
    skipped = []
    valid_ids = set(os.path.basename(d).split("_")[0] for d in glob.glob(os.path.join(ROOT, "categories", "*", "*_*")))
    for f in glob.glob(os.path.join(api_model, "*.json")):
        mid = os.path.basename(f).replace(".json", "")
        if mid not in valid_ids:
            os.remove(f)
    for folder in sorted(glob.glob(os.path.join(ROOT, "categories", "*", "*_*"))):
        mid = os.path.basename(folder).split("_")[0]
        cat = os.path.basename(os.path.dirname(folder))
        info = by_id.get(mid, {})
        m = meta.get(mid, {})

        # preview: sync all staged images into the model folder
        prev_dir = os.path.join(folder, "previews")
        os.makedirs(prev_dir, exist_ok=True)
        staged = os.path.join(ROOT, "previews", mid)
        copied = []
        if os.path.isdir(staged):
            for src in sorted(glob.glob(os.path.join(staged, "*.jpg")) + glob.glob(os.path.join(staged, "*.png")) + glob.glob(os.path.join(staged, "*.webp"))):
                if os.path.basename(src).startswith("0-original"):
                    continue
                dst = os.path.join(prev_dir, os.path.basename(src))
                if not os.path.exists(dst):
                    os.system(f"cp '{src}' '{dst}'")
                copied.append(os.path.basename(dst))
        copied = sorted(copied)
        if not copied:
            for name in ("preview.jpg", "preview.png"):
                if os.path.exists(os.path.join(prev_dir, name)):
                    copied.append(name)

        # files (are stored xz-compressed on disk for transport)
        model_files = sorted(glob.glob(os.path.join(folder, "model", "*.3mf.xz")) + glob.glob(os.path.join(folder, "model", "*.3mf")))
        files_detail = []
        for f in model_files:
            rel = os.path.relpath(f, folder)
            is_xz = rel.endswith(".xz")
            files_detail.append({
                "path": rel.replace(os.sep, "/"),
                "size": os.path.getsize(f),
                "sha256": sha256(f),
                "compressed": is_xz,
                "decompress": "xz -d -k <filename>" if is_xz else None,
            })

        # manifest
        manifest = {
            "id": mid,
            "title": m.get("title") or info.get("title") or "",
            "slug": info.get("slug") or "",
            "url": info.get("url") or "",
            "author": m.get("author") or "",
            "category": cat,
            "source_category": m.get("category") or "",
            "description": m.get("description") or "",
            "tags": m.get("tags") or [],
            "license": m.get("license") or "",
            "release_date": m.get("release_date") or "",
            "preview": f"previews/{copied[0]}" if copied else None,
            "images": [f"previews/{p}" for p in copied],
            "files": files_detail,
            "source_preview_url": m.get("preview_url") or "",
            "storage": {
                "format": "xz",
                "note": "3MF files are stored as .3mf.xz to stay under GitHub's 100MB limit. Decompress with `xz -d -k <file>` before use; SHA-256 is computed on the compressed file.",
            },
        }
        with open(os.path.join(folder, "manifest.json"), "w") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)

        preview_file = manifest["preview"]
        images_list = [f"categories/{cat}/{mid}_{manifest['slug']}/{p}" for p in manifest["images"]]
        rec = {
            "id": mid,
            "title": manifest["title"],
            "slug": manifest["slug"],
            "category": cat,
            "author": manifest["author"],
            "license": manifest["license"],
            "release_date": manifest["release_date"],
            "description": (manifest["description"] or "")[:200],
            "tags": manifest["tags"],
            "file_count": len(model_files),
            "total_size": sum(x["size"] for x in files_detail),
            "preview": f"categories/{cat}/{mid}_{manifest['slug']}/{preview_file}" if preview_file else None,
            "images": images_list,
            "url": manifest["url"],
        }
        records.append(rec)
        per_cat.setdefault(cat, []).append(rec)

        # api/model/<id>.json
        with open(os.path.join(api_model, f"{mid}.json"), "w") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)

    # categories.json
    cat_list = []
    for c in CATS:
        items = per_cat.get(c, [])
        cat_list.append({"id": c, "name": c, "count": len(items), "size": sum(x["total_size"] for x in items)})
    with open(os.path.join(api_dir, "categories.json"), "w") as f:
        json.dump(cat_list, f, ensure_ascii=False, indent=1)

    # categories/<cat>.json
    for c, items in per_cat.items():
        with open(os.path.join(api_cat, f"{c}.json"), "w") as f:
            json.dump({"category": c, "count": len(items), "models": items}, f, ensure_ascii=False, indent=1)

    # index.json
    index = {
        "name": "PrintGo 3D Library",
        "version": "1.0.0",
        "generated": "2026-09-15",
        "total_models": len(records),
        "categories": [c for c in CATS if c in per_cat],
        "source": "MakerWorld",
        "license_policy": "Only models whose MakerWorld license allows redistribution (CC0 / CC BY / CC BY-SA).",
        "storage_note": "Every model file payload is stored as <name>.3mf.xz (transport compression to stay under GitHub 100MB/file). Decompress each file with `xz -d -k <file>` before importing into a slicer. SHA-256 in the manifests is computed over the compressed bytes.",
    }
    with open(os.path.join(api_dir, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    print(f"manifests written; models={len(records)}; no-meta={len([m for m in records if not m['tags']])}")
    print("per category:", {k: len(v) for k, v in per_cat.items()})

if __name__ == "__main__":
    main()
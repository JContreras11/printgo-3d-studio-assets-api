# PrintGo Library Assets

Acquisition pipeline and local catalogue for a **legal** 3D-library of printables
(3MF models + preview images + metadata) for PrintGo's future GitHub static library.

## Scope

This directory is **standalone**. It does not touch PrintGo Studio, PWA, server, or
service code. Its sole job is to (1) crawl public sources, (2) download only assets whose
license explicitly permits **download and redistribution**, (3) preserve full provenance
attribution, and (4) organize everything into a validated, reviewable local catalogue.

## Why only some models are eligible

PrintGo intends to redistribute assets inside a GitHub-hosted static library. That means
only models whose license **explicitly permits redistribution** can enter this catalogue.
MakerWorld, the current seed source, exposes per-model licenses. This pipeline only ever
stores models whose license string is on the allowlist (see `scripts/lib/licenses.js`),
e.g.:

- Public Domain / CC0
- CC BY 4.0 (attribution required)
- CC BY-SA 4.0 (attribution + share-alike)

EXCLUDED (never stored): Standard Digital File License, CC BY-NC/NC-SA/NC-ND (non-commercial),
BY-ND (no derivatives — cannot host as a modified/repackaged asset), and anything else that
restricts redistribution.

## Repository layout

```
library-assets/
  README.md                     this file
  package.json                  zero-dependency, Node >= 22 (node:test runner)
  LICENSE.md                    how licenses are handled (AGENTS-facing)
  categories/
    <category>/
      <maker-id>_<slug>/
        model/<variants>.3mf    original 3MF files (all variants)
        previews/01.<ext>       every product image from MakerWorld (02., 03., …)
        manifest.json           machine-readable provenance + hashes
  api/                          GitHub-Pages-consumable static API
    index.json                  global summary (name, counts, policy)
    categories.json             list of categories with counts + sizes
    categories/<category>.json  light model list per category
    model/<maker-id>.json       full metadata per model (== manifest)
  previews/                     staging: downloaded previews by maker-id
  raw/                          staging: page scrapes (markdown) per model
  scripts/
    lib/
      licenses.js               license allowlist + normalizer
      makerworld.js             orchestration helpers for the logged-in browser
      archives.js               3MF/ZIP structural checks (pure Node, no deps)
      misc.js                   hashing, slugs, safe filenames
      parse_meta.py             MakerWorld markdown -> normalized metadata
    crawl.js                    scrape MakerWorld search results / model pages (browser)
    fetch.js                    download one model (3MF + previews) via the browser session
    organize.js                 move a fetched model into categories/<category>/ and write manifest.json
    dl_mw.py                    bulk 3MF downloader via Brave UI (resumable, used for the seed)
    scrape_mw.py                Firecrawl scrape of ~80 model pages into raw/model-{id}.md
    fetch_previews.py           fetch previews/{maker-id}.{jpg|png} from parsed raw pages
    build_api.py                render categories manifest.json + api/ from raw + catalog
    validate.js                 validate every stored model: hashes, archives, manifest, provenance
    list.js                     print catalogue summary
  tests/                        node:test unit + integration tests
```

## Static API (GitHub Pages)

The `api/` directory is a deterministic, versioned JSON API for the library, consumable
by PrintGo's front-end or third parties via GitHub Pages / raw.githubusercontent.com.

- `GET api/index.json`                     → global summary + categories list
- `GET api/categories.json`                → per-category counts and byte sizes
- `GET api/categories/<category>.json`     → light model records for a category
- `GET api/model/<maker-id>.json`          → full model object (metadata + files + hashes)
- `GET categories/<category>/<id>_<slug>/model/*.3mf` → assets

Every model's `manifest.json` (== `api/model/<id>.json`) contains:
`id, title, slug, url, author, category, source_category, description, tags, license,
release_date, preview, images[{path}, ...], files[{path,size,sha256}], source_preview_url`.

`images` lists **every** product image from the MakerWorld page (W×1000 originals, page
order, numbered `01`, `02`, …). Licenses are taken from the MakerWorld page itself
(`#### License` block) and only CC0 / CC BY / CC BY-SA are ever stored.

### Extracted 3MF metadata (honest print facts)

`scripts/extract_3mf_meta.mjs` decompresses each real `.3mf.xz` and reads the
Bambu/Orca-style parts (`3D/3dmodel.model`, `Metadata/project_settings.config`,
`Metadata/slice_info.config`, `Metadata/plate_*.png`) to store **only facts that
actually appear in the file** as `files[].meta`: `printer`, `profile_title`,
`profile_notes`, `slicer`, `application`, `layer_height`, `infill`,
`support_type`, and per-plate `prediction_ms`, `weight_g`, `nozzle_diameters` and
`filaments` (PLA/PETG + hex colours).

It also writes a model-level `variant_hint` (es-CO) into `manifest.json`,
`api/model/*.json` and every `api/categories/<cat>.json` record, derived **only**
from filename tokens the creator chose (colored/mono → Multicolor/Monocromo,
X1/A1/mini/P1S → printer family). No print time, material or printer is invented:

- run order: `python scripts/build_api.py` then `node scripts/extract_3mf_meta.mjs`
  (the extractor augments the generated API files; keep it after any rebuild).
- files with no slicer metadata simply keep no `meta` — consumers must then tell
  the user that Studio calculates time/material after opening the model.

## Compression & usage

3MF files are stored **xz-compressed** (`.3mf.xz`) to keep GitHub under its 100MB/
file limit and cut transport size. Before importing into a slicer, decompress with:

```bash
xz -d -k <file>.3mf.xz        # produces <file>.3mf
```

- `SHA-256` in manifests is computed **over the compressed bytes**.
- The `storage` note on each manifest and the global `storage_note` in
  `api/index.json` document this so API consumers know to decompress.
- The one model whose 3MF exceeded 100MB even after compression (`Soap_Duck_Single.3mf`,
  115MB → 108MB) is **excluded** from the repo for now; its metadata lives in
  `excluded/duck-soap-dish-413656/` and the binary in the local Downloads staging area.

## Pipeline status

| Category          | Models | Notes |
|-------------------|--------|-------|
| automotive        | 19     | 1 pending (download limit today) |
| repair            | 2      | 18 pending |
| kitchen           | 2      | 18 pending |
| bathroom          | 16     | 3 pending + duck excluded (>100MB) |
| bedroom           | 20     | complete |
| home-organization | 18     | 2 pending (1 failed) |
| decor             | 18     | 2 pending |
| science           | 2      | 18 pending |
| **Total**         | **97** | of 158 in catalog (60 pending today) |

## Quick start

```bash
cd library-assets
npm test          # run validation & unit tests
node scripts/crawl.js --category kitchen --keyword kitchen --max 3
node scripts/fetch.js --url <model-url>
node scripts/organize.js --category kitchen
node scripts/validate.js
```

## Repeatability & scaling

See `docs/SCALING.md` (below). The crawler is fully parametrizable; the seed run is
deliberately small and human-reviewed before any bulk acquisition.

## Legal posture

- Every stored model retains its source URL, creator, exact license string, attribution
  text, retrieval timestamp, SHA-256 of every file, and all companion files.
- The crawling browser session is the user's own logged-in session; we never store or
  export credentials/cookies.
- If a model's license is missing/unparseable, the pipeline **rejects** it (fail-closed).
# PrintGo Library Assets

Biblioteca 3D de PrintGo (3MF por perfil de impresión + galería + metadatos en español) publicada como
API estática en GitHub. Fuente: modelos gratuitos de MakerWorld; cada modelo conserva autor, licencia y URL.

## Cómo usar el scraper

Scraper de MakerWorld rápido y configurable: Chrome **headless en segundo plano** (copia del perfil logueado,
no toca Brave ni el Chrome del dueño) controlado por CDP con `WebSocket` nativo de Node 22. No hace clics:
lee las APIs internas de MakerWorld (`design-service/design/<id>`, `search-service/select/design2`,
`design-service/instance/<id>/f3mf`) desde la pestaña y baja los archivos firmados con `fetch` en paralelo.

```bash
scripts/chrome.sh start                     # Chrome headless :9333 (resync si la sesión caduca)
node scripts/mw.mjs "https://makerworld.com/en/search/models?keyword=gta+6"   # toda la búsqueda
node scripts/mw.mjs "https://makerworld.com/en/models/951493-..."             # un modelo
node scripts/mw.mjs "gta 6" --only-new      # tópico: variantes del término, filtra relevancia y clasifica
node scripts/mw.mjs "lego" --category lego --label "Lego y bloques"           # categoría nueva
node scripts/mw.mjs "gta 6" --dry-run       # solo lista y clasifica
node scripts/mw.mjs --refresh-variants [ids...]   # completa perfiles que faltan en modelos existentes
node scripts/mw.mjs --resume                # sigue la cola (tras cuota/captcha)
scripts/chrome.sh captcha                   # ventana visible para resolver el captcha de MakerWorld
```

Opciones: `--limit N`, `--concurrency N` (3), `--batch N` (publica cada N modelos, 25), `--no-push`,
`MW_DL_GAP=ms` (pausa entre descargas, 3000), `MW_HEADFUL=1` (ventana fuera de pantalla si Cloudflare bloquea).

- **Todas las variantes**: cada perfil de impresión (`instances[]`) es un `files[]` con `instance_id`, `name`
  (español), `thumbnail`, `print_time_h`, `plates`, `rating`, `rating_count`, `by_designer`, `printers`, `default`.
- **Todas las fotos** de la galería, en orden, con `image_sizes` (ancho, alto reales).
- **Español saneado**: `scripts/lib/text_es.mjs` limpia HTML/emojis/URLs y traduce por código (Google gtx +
  glosario: iPhone, Switch, PS5, GTA VI… no se traducen). Si queda inglés, el campo no se publica.
- **Sin repetir**: dedupe por modelId + instanceId; lo bajado no se vuelve a pedir.
- **Cuota/captcha**: se detecta en la API de descarga, se para limpio, se publica lo bajado y la cola queda
  en `queue.json` (editable a mano). Historial de corridas en `.tmp/mw-runs.jsonl`.
- **Publicación**: `build_api.mjs` → `validate.js` → commit → push, por lotes y al final de cada corrida.
- Skill para OpenCode: `.opencode/skills/makerworld-scraper/SKILL.md` (enlazada en `~/.config/opencode/skills`).

Otros comandos: `npm run build` (api/ desde los manifests), `npm run validate`, `npm test`,
`npm run sanitize` (saneo global del texto publicado).

## Repository layout

```
library-assets/
  categories/<category>/<maker-id>_<slug>/
      model/<perfil>-<instanceId>.3mf.xz   un archivo por perfil de impresión
      previews/01.jpg …                     galería completa; previews/profiles/<instanceId>.jpg miniaturas
      manifest.json                         fuente de verdad del modelo
  api/                                      generado por scripts/build_api.mjs
  queue.json                                cola del scraper (pending/done/failed/skipped)
  categories_es.json                        etiquetas ES de categorías nuevas (opcional)
  scripts/
    chrome.sh            Chrome headless con perfil copiado (start|stop|status|resync|captcha)
    mw.mjs               CLI del scraper
    build_api.mjs        api/ + image_sizes + meta 3MF + label_es
    validate.js          hashes, imágenes, api == manifest, texto saneado en español
    sanitize_all.mjs     saneo global del texto publicado
    extract_3mf_meta.mjs lectura de metadatos reales del 3MF
    lib/cdp.mjs, lib/text_es.mjs, lib/mw_data.mjs, lib/misc.js
  tests/                 node:test
```

## Static API (GitHub Pages)

The `api/` directory is a deterministic, versioned JSON API for the library, consumable
by PrintGo's front-end or third parties via GitHub Pages / raw.githubusercontent.com.

- `GET api/index.json`                     → global summary + categories list
- `GET api/categories.json`                → per-category counts, byte sizes and `label_es`
- `GET api/categories/<category>.json`     → light model records for a category
- `GET api/model/<maker-id>.json`          → full model object (metadata + files + hashes)
- `GET categories/<category>/<id>_<slug>/model/*.3mf` → assets

Every model's `manifest.json` (== `api/model/<id>.json`) contains:
`id, title, slug, url, author, category, source_category, description, use_cases, tags, license,
release_date, preview, images[], image_sizes{path: [w, h]}, files[], source_preview_url, variant_hint`.

`files[]`: `path, size, sha256, compressed, decompress, instance_id, name, thumbnail, print_time_h,
plates, rating, rating_count, by_designer, printers[], default, meta` (los archivos antiguos sin
`instance_id` se completan con `--refresh-variants`).

`images` lists **every** gallery image from MakerWorld (resized to width 1000, page order,
numbered `01`, `02`, …).

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

- `scripts/build_api.mjs` calls the extractor for any `.3mf.xz` without `meta`.
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


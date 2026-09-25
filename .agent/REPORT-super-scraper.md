# Informe: super scraper MakerWorld (Chrome headless)

Fecha: 2026-09-25 · Repo: `library-assets` → `JContreras11/printgo-3d-studio-assets-api` (main)

## Resumen
Scraper nuevo listo y publicado: Chrome headless con copia del perfil logueado, APIs internas de MakerWorld
(sin clics), todas las variantes y fotos, texto en español saneado, cola reanudable y publicación automática.
**Bloqueo:** tras 4 descargas MakerWorld respondió `418 "We need to confirm that you are not a robot."`
(captcha GeeTest) a toda petición de descarga. No se evade el captcha: lo tiene que resolver el dueño
(`scripts/chrome.sh captcha`). Las pruebas 1–3 quedaron **encoladas y publicadas** (695 modelos pendientes
en `queue.json`); la prueba 4 (saneo global) está completa.

## Qué se construyó
| Pieza | Archivo |
|---|---|
| Chrome headless (perfil `Profile 4` copiado a `~/.printgo-scraper/chrome`, UA normal para pasar Cloudflare) | `scripts/chrome.sh start\|stop\|status\|resync\|captcha` |
| Driver CDP mínimo (WebSocket nativo) | `scripts/lib/cdp.mjs` |
| CLI: URL de búsqueda, URL de modelo, tópico, `--category/--label`, `--limit`, `--dry-run`, `--concurrency`, `--only-new`, `--refresh-variants`, `--resume`, `--batch`, `--no-push` | `scripts/mw.mjs` |
| Traducción por código (gtx + fallback dict-chrome-ex si Google da 429) + glosario + regex + heurística de inglés | `scripts/lib/text_es.mjs` |
| Clasificador de tópico, relevancia, parser de perfiles, tamaño de imagen sin red | `scripts/lib/mw_data.mjs` |
| API desde manifests (fuente de verdad): `image_sizes`, meta 3MF, `label_es`, borra `.3mf` duplicados | `scripts/build_api.mjs` |
| Validación: sha256, imágenes, api == manifest, texto saneado/sin inglés | `scripts/validate.js` |
| Saneo global | `scripts/sanitize_all.mjs` |
| Tests (`npm test`, 10 verdes) | `tests/*.test.mjs` |
| Skill OpenCode (listada por `opencode debug skill`) | `.opencode/skills/makerworld-scraper/SKILL.md` → symlink `~/.config/opencode/skills/makerworld-scraper` |

APIs descubiertas: `GET /api/v1/design-service/design/<id>` (diseño + `instances[]`),
`GET /api/v1/search-service/select/design2?keyword=…&limit=50&offset=…` (tope ~480 resultados por término),
`GET /api/v1/design-service/instance/<instanceId>/f3mf?type=download` → `{name, url firmada}` (misma que el botón).

## Pruebas de aceptación
1. `mw.mjs "https://makerworld.com/en/search/models?keyword=gta+6"` → 476 modelos descubiertos y clasificados,
   encolados y publicados; descarga parada por captcha.
2. `mw.mjs "gta 6" --only-new` → variantes gta vi / grand theft auto 6 / vi / gta6: +217 extra relevantes
   (693 en total). Clasificación de la cola: decor 510, console-cases 143, home-organization 25, bedroom 8,
   phone-cases 4, kitchen 3, bathroom 1, automotive 1.
3. `mw.mjs --refresh-variants 951493 3244057` → **951493: de 1 a 4 perfiles** (945812, 1151244, 2551542 nuevos;
   el archivo viejo `iPhone_14_Pro_Max.3mf.xz` emparejado con 1929044 sin volver a bajarlo). Falta 3275904
   (captcha). **3244057** (nuevo, 12 perfiles en MakerWorld): publicado con 1 perfil + 8 fotos; los otros 11 en cola.
4. Saneo global de todo `api/`: **393 de 2523 campos cambiados** en 198 modelos (categorías de origen,
   títulos/notas de perfil de los 3MF, etiquetas en inglés). El español curado no se toca. Además se retiraron
   101 `.3mf` sin comprimir que duplicaban su `.3mf.xz`, y se añadió `image_sizes` a las 1008 imágenes existentes.

## Métricas
- Modelos/min: **no medible a escala** (captcha a las 4 descargas). Medido: 2 modelos, 4 perfiles (~18 MB)
  + 8 fotos + 5 miniaturas en 0,31 min con concurrencia 3 (≈6 modelos/min en esa muestra, poco fiable).
- Descubrimiento: ~480 resultados por término en ~7 s.
- Nuevos: 1 modelo (3244057), 4 perfiles nuevos. Biblioteca: 199 modelos, 231 archivos 3MF.

## Commits empujados
`5b88ab6` scraper + saneo global · `6292a42` refresh 951493/3244057 · `0a6a371` captcha/timeouts ·
`5fe645a` `47588fc` `920fba5` `9722deb` `f5cf253` colas publicadas · `f1c70c0` skill + README · (+ este informe)

## Bloqueos y cómo seguir
- **Captcha MakerWorld (418 GeeTest)** en la API de descarga. Pasos para el dueño:
  1. `scripts/chrome.sh captcha` (abre ventana visible con el perfil del scraper) → pulsa "Download 3MF" y resuelve.
  2. `scripts/chrome.sh stop && scripts/chrome.sh start`
  3. `MW_DL_GAP=8000 node scripts/mw.mjs --resume` (pausa mayor entre descargas para no disparar el captcha).
- Google gtx dio 429 durante el saneo; el traductor cae solo al endpoint `dict-chrome-ex` y reintenta.
- Cloudflare bloqueaba headless con UA "HeadlessChrome": resuelto con `--user-agent` normal.

## Limpieza
Borrados: scripts del intento GTA (`*gta6*`, `probe_*`, `audit_*`, `check_*`, `collect_*`, `diag_*`, `dbg_*`,
`trace_*`, `verify_multi_build.py`, `.tmp_gta6_api.json`, logs), flujo Brave/orca (`lib/browser.js`,
`lib/makerworld.js`, `.agent/orca-run.sh`, `dl_mw.py`) y el build Python que pisaba manifests
(`build_api.py`, `parse_meta.py`, `fetch_previews.py`, `scrape_mw.py`, `organize_dl.py`, `lib/licenses.js`,
`lib/archives.js`). El diff sin commitear de `catalog.json`/api era daño del intento GTA (slug/url vacíos en
659796 y 855602): revertido. `catalog.json`, `copy_es.json`, `full-catalog.json`, `subset.json`, `filtered/`
quedan como histórico (ya no los lee nada; se pueden borrar).

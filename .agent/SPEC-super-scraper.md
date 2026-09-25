# Misión: super scraper MakerWorld con Chrome (reemplaza Brave)

Repo: `/Users/jesusc/Code/PrintGo/library-assets` (remote `git@github.com:JContreras11/printgo-3d-studio-assets-api.git`, rama main).
El Studio consume `api/` vía raw.githubusercontent. Lee `README.md` y `scripts/build_api.py` para el formato actual.
Responde y documenta en español. Sin dependencias npm nuevas (Node 22: `fetch`, `WebSocket` global, `node:test`). Python stdlib vale.

## Reglas del dueño (no negociables)
- Descargar TODAS las variantes (todos los perfiles de impresión / "Print Files") de cada modelo y TODAS las imágenes de la galería.
- Todo texto publicado en español, saneado: sin inglés, sin emojis, sin iconos raros, sin HTML, sin basura. Traducir con código (no con tokens de LLM): usa el endpoint gratuito `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=...` + glosario propio (iPhone, Switch, PS5, GTA VI no se traducen) + limpieza por regex. Si tras traducir queda inglés detectable (heurística de palabras comunes en inglés), reintenta/marca y no publiques ese campo en inglés.
- Modelos free de MakerWorld valen aunque la licencia no sea libre (decisión del dueño, ya documentada en la sesión anterior).
- `.3mf` se guarda como `.3mf.xz` (límite 100 MB de GitHub), igual que ahora.
- Cada prueba real se PUBLICA: build api + validate + commit + push. No repetir pruebas sobre los mismos IDs; lo descargado nunca se vuelve a bajar (dedupe por modelId + instanceId).
- Nada de dar vueltas: simple, rápido, que funcione.
- MakerWorld tiene cuota diaria de descarga: detectarla, parar limpio, dejar la cola guardada y reanudar después.

## 1. Navegador: Chrome en segundo plano (no Brave, no ventanas visibles, no `orca computer`)
- Brave es el navegador personal del dueño: no tocarlo.
- La sesión logueada de MakerWorld está en Chrome, perfil `~/Library/Application Support/Google/Chrome/Profile 4` (28 cookies de makerworld/bambulab).
- Chrome ≥136 no permite CDP sobre el user-data-dir por defecto → copia `Local State` + `Profile 4` a `~/.printgo-scraper/chrome/` (rsync, excluye caches) y lanza
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=$HOME/.printgo-scraper/chrome --profile-directory="Profile 4"`.
  Script `scripts/chrome.sh start|stop|status|resync`. Si la sesión expira: `resync` vuelve a copiar el perfil (el dueño se re-loguea en su Chrome normal).
- Driver CDP mínimo en `scripts/lib/cdp.mjs` (WebSocket nativo). Si Cloudflare bloquea headless, prueba con ventana fuera de pantalla (`--window-position=-2400,0`) antes de otra cosa.
- Velocidad: NO clicar UI. Usa los datos de la página (`__NEXT_DATA__` / JSON del design: `instances[]` = perfiles de impresión) y las APIs internas de MakerWorld que usa el botón "Download 3MF" (descúbrelas en Network vía CDP), llamadas con `fetch(..., {credentials:"include"})` desde el contexto de la página. Las URLs firmadas de archivo/imagen bájalas con Node `fetch` en paralelo.
- Objetivo: ≥5 modelos completos/minuto (con todas sus variantes e imágenes). Concurrencia configurable (default 3 pestañas/fetches), backoff en 429.

## 2. CLI configurable: `node scripts/mw.mjs <objetivo> [opciones]`
Objetivo puede ser:
- URL de búsqueda (`https://makerworld.com/en/search/models?keyword=gta+6` …): recorre TODA la paginación/scroll y trae todos los resultados.
- URL de modelo: solo ese.
- Tópico libre (`"gta 6"`): busca el término (y variantes útiles: "gta vi", "grand theft auto 6") y clasifica cada resultado en nuestras categorías (phone-cases, console-cases, home-organization, decor, kitchen, …) por título/tags/categoría de MakerWorld. Lo que no encaje va a la categoría más cercana o a una nueva si `--category` lo pide.
- Categoría (`--category <slug> --label "Etiqueta ES"`): permite crear categorías nuevas; `api/categories.json` debe incluir `label_es` por categoría.
Opciones: `--limit N`, `--dry-run` (solo lista y clasifica), `--concurrency N`, `--only-new`, `--refresh-variants` (re-audita modelos existentes cuyo nº de perfiles en MakerWorld > archivos locales y baja los que faltan), `--no-push`.
La cola vive en `queue.json` (editable a mano: añadir, quitar, reordenar); nada hardcodeado a un tema.

## 3. Datos por modelo (contrato con la UI — respétalo exacto)
`api/model/<id>.json` conserva los campos actuales y además:
```json
"files": [{
  "path": "model/<slug-perfil>.3mf.xz", "size": 0, "sha256": "…", "compressed": true, "decompress": "xz -d -k <filename>",
  "instance_id": "3675809", "name": "Flor (modelo moneda)", "thumbnail": "previews/profiles/3675809.jpg",
  "print_time_h": 2.4, "plates": 2, "rating": 5.0, "rating_count": 2, "by_designer": true,
  "printers": ["A1", "X1C", "P1S"], "default": true
}],
"images": ["previews/01.jpg", …],
"image_sizes": {"previews/01.jpg": [1000, 750]}
```
`name` traducido y saneado. `images`: todas las de la galería, en orden. `image_sizes` sirve para que la grilla reserve espacio (ancho, alto reales).
Modelos viejos: backfill de `image_sizes` para todas las imágenes ya en disco (sin red), y de metadatos de perfil cuando se re-auditen.

## 4. Skill para OpenCode
Crea la skill `makerworld-scraper` (formato SKILL.md con frontmatter name/description) en `library-assets/.opencode/skills/makerworld-scraper/SKILL.md` y enlázala (symlink) en `~/.config/opencode/skills/makerworld-scraper`. Verifica que opencode la lista. Debe enseñar: arrancar Chrome, lanzar `mw.mjs` con búsqueda/tópico/categoría/URL, revisar cuota, publicar, y el criterio (todas las variantes, fotos, español saneado, no repetir).

## 5. Limpieza
- Borra los scripts basura del intento GTA (`scripts/*gta6*`, `probe_*`, `audit_*variants*`, `check_*`, `collect_*`, `diag_*`, `dbg_*`, `trace_*`, `verify_multi_build.py`, `.tmp_gta6_api.json`, logs `.dl*_today.log`) y el código Brave/`orca computer` (`scripts/lib/browser.js`, `.agent/orca-run.sh`, `dl_mw.py`) una vez reemplazados. Revisa el diff sin commitear de `catalog.json`/api antes: si es contenido válido, publícalo; si es el daño del intento GTA, reviértelo.
- Actualiza README (sección "Cómo usar el scraper") y tests (`node --test tests/`): saneo/traducción, clasificador de tópico, parser de perfiles. `npm test` y `npm run validate` en verde.

## 6. Prueba de aceptación (publicada, no repetida)
1. `node scripts/mw.mjs "https://makerworld.com/en/search/models?keyword=gta+6"` → todo lo descargable, publicado.
2. `node scripts/mw.mjs "gta 6" --only-new` → encuentra extras en otras categorías (teléfonos, consolas, casa…).
3. `node scripts/mw.mjs --refresh-variants` sobre al menos `951493` (iPhone 16 Pro Max skeleton: 5 perfiles en MakerWorld, hoy solo 1) y `3244057` si aplica.
4. Saneo global: pasa el saneador sobre TODO `api/` existente y republica; reporta cuántos campos cambió.
Reporta: modelos/min medidos, nº modelos y variantes nuevos, commits empujados, y cualquier bloqueo (cuota, Cloudflare). Deja un resumen final en `.agent/REPORT-super-scraper.md`.

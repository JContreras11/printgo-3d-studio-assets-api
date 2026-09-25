---
name: makerworld-scraper
description: Descarga modelos de MakerWorld a la biblioteca de PrintGo (library-assets) con TODAS sus variantes (perfiles de impresión) y fotos, textos en español saneados, y los publica en GitHub. Usar para "baja/scrapea modelos de X", "busca en MakerWorld", "agrega esta URL/categoría", "completa las variantes", "revisa la cuota de MakerWorld".
---

# makerworld-scraper

Repo: `/Users/jesusc/Code/PrintGo/library-assets` (remote `JContreras11/printgo-3d-studio-assets-api`, rama `main`).
El Studio lee `api/` por raw.githubusercontent: lo que se empuja a `main` queda publicado.

## 1. Arrancar Chrome (segundo plano, nunca Brave)
```bash
scripts/chrome.sh start     # headless, puerto 9333, copia del perfil "Profile 4" en ~/.printgo-scraper/chrome
scripts/chrome.sh status
scripts/chrome.sh resync    # si la sesión caducó: el dueño se loguea en su Chrome normal y se vuelve a copiar
scripts/chrome.sh stop      # al terminar
```
Si Cloudflare bloquea headless: `scripts/chrome.sh stop && MW_HEADFUL=1 scripts/chrome.sh start` (ventana fuera de pantalla).

## 2. Lanzar el scraper
```bash
node scripts/mw.mjs "https://makerworld.com/en/search/models?keyword=gta+6"   # toda la búsqueda (paginación completa)
node scripts/mw.mjs "https://makerworld.com/en/models/951493-..."             # un modelo
node scripts/mw.mjs "gta 6" --only-new                                         # tópico: variantes del término + clasificación
node scripts/mw.mjs "lego" --category lego --label "Lego y bloques"            # categoría nueva (label_es)
node scripts/mw.mjs "gta 6" --dry-run                                          # solo lista y clasifica, no descarga
node scripts/mw.mjs --refresh-variants [ids...]                                # completa perfiles que faltan
node scripts/mw.mjs --resume                                                   # sigue la cola pendiente (tras cuota)
```
Opciones: `--limit N`, `--concurrency N` (def. 3), `--batch N` (publica cada N modelos, def. 25), `--no-push`.
La cola vive en `queue.json` (editable a mano: añadir `{"id": "...", "status": "pending"}`, quitar, reordenar).

## 3. Cuota de MakerWorld
El límite diario se detecta en la API de descarga (`/api/v1/design-service/instance/<id>/f3mf`). Al tocarlo el
scraper para limpio, publica lo bajado, deja la cola en `queue.json` y lo anota en `.tmp/mw-runs.jsonl`.
Revisar: `tail -3 .tmp/mw-runs.jsonl` y `grep -c '"pending"' queue.json`. Reanudar otro día con `--resume`.

## 4. Publicar
`mw.mjs` publica solo: `build_api.mjs` → `validate.js` → commit → push (por lotes y al final).
A mano: `npm run build && npm run validate && npm test`, luego commit + push.
Saneo global del texto ya publicado: `npm run sanitize`.

## Criterio (no negociable)
- TODAS las variantes: cada perfil de impresión (`instances[]`) es un `files[]` con `instance_id`, nombre en español,
  miniatura, horas, placas, valoración, impresoras y `default`. Guardados como `.3mf.xz`.
- TODAS las fotos de la galería, en orden, con `image_sizes` reales.
- Texto publicado en español saneado (sin inglés, emojis, HTML ni URLs). La traducción es por código
  (`scripts/lib/text_es.mjs`: Google gtx + glosario); si queda inglés el campo no se publica.
- No repetir: dedupe por modelId + instanceId; lo ya bajado nunca se vuelve a pedir.
- Modelos gratis valen aunque la licencia no sea libre; los de pago se saltan.
- Nada de clics en UI ni `orca computer`: todo por APIs internas desde la pestaña headless.

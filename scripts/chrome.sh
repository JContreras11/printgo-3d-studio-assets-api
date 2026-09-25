#!/usr/bin/env bash
# Chrome VISIBLE con copia del perfil logueado de MakerWorld (no toca el Chrome/Brave del dueño).
# Uso: scripts/chrome.sh start|stop|status|resync|captcha [url]
set -euo pipefail
SRC="$HOME/Library/Application Support/Google/Chrome"
PROFILE="${MW_PROFILE:-Profile 4}"
DIR="$HOME/.printgo-scraper/chrome"
PORT="${MW_CDP_PORT:-9333}"
BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PIDF="$HOME/.printgo-scraper/chrome.pid"
# Visible por defecto (el dueño ve el navegador y resuelve el captcha); MW_HEADLESS=1 para segundo plano.
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
MODE=(--window-position=80,40 --window-size=1280,900)
[ "${MW_HEADLESS:-0}" = 1 ] && MODE=(--headless=new)

running() { curl -s -m 2 "http://127.0.0.1:$PORT/json/version" >/dev/null; }

resync() {
  stop >/dev/null 2>&1 || true
  mkdir -p "$DIR"
  cp "$SRC/Local State" "$DIR/Local State"
  rsync -a --delete --exclude 'Cache' --exclude 'Code Cache' --exclude 'GPUCache' --exclude 'Service Worker/CacheStorage' \
    --exclude 'DawnGraphiteCache' --exclude 'DawnWebGPUCache' --exclude 'blob_storage' "$SRC/$PROFILE/" "$DIR/$PROFILE/"
  echo "perfil copiado en $DIR"
}

start() {
  running && { echo "Chrome ya activo en :$PORT"; return; }
  [ -d "$DIR/$PROFILE" ] || resync
  "$BIN" "${MODE[@]}" --user-agent="$UA" --remote-debugging-port="$PORT" --user-data-dir="$DIR" --profile-directory="$PROFILE" \
    --no-first-run --no-default-browser-check --disable-features=Translate --mute-audio about:blank >/dev/null 2>&1 &
  echo $! > "$PIDF"
  for _ in $(seq 40); do running && { echo "Chrome activo en :$PORT (pid $(cat "$PIDF"))"; return; }; sleep 0.25; done
  echo "Chrome no respondió en :$PORT" >&2; exit 1
}

stop() {
  local pid; pid="$(cat "$PIDF" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then
    # espera a que suelte puerto y perfil: stop; start seguidos no deben chocar
    for _ in $(seq 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    echo "Chrome detenido"
  else echo "no había Chrome del scraper"; fi
  rm -f "$PIDF"
}

# ponytail: alias histórico; start ya abre ventana visible.
captcha() { start; }

status() { running && curl -s "http://127.0.0.1:$PORT/json/version" | grep -E 'Browser|webSocket' || echo "detenido"; }

case "${1:-status}" in start|stop|status|resync|captcha) "$1" "$@" ;; *) echo "uso: $0 start|stop|status|resync|captcha [url]" >&2; exit 2 ;; esac

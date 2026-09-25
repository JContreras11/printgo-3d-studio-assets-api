# Cambio: Chrome VISIBLE y pausa en captcha (orden del dueño)

El dueño quiere ver el navegador y resolver él mismo el captcha de MakerWorld. Nada en segundo plano.

1. `scripts/chrome.sh start` abre Chrome **visible por defecto** (ventana normal, en pantalla, 1280x900) con el mismo perfil copiado y CDP en :9333. Headless solo si `MW_HEADLESS=1`. El modo `captcha` pasa a ser innecesario (déjalo como alias de `start`).
2. En `scripts/mw.mjs`, cuando llegue 418 / "not a robot" / captcha, **no pares**: 
   - abre (o trae al frente con CDP `Page.bringToFront`) una pestaña en la página del modelo que falló,
   - avisa al dueño: `osascript -e 'display notification "Resuelve el captcha en Chrome" with title "PrintGo scraper" sound name "Glass"'` y una línea clara en consola,
   - reintenta esa misma descarga cada 15 s hasta que pase (tope 30 min, `MW_CAPTCHA_WAIT_MIN`), y sigue con la cola.
   La cuota diaria real (mensaje distinto de captcha) sigue parando limpio como ahora.
3. `npm test` verde, commit + push.
4. NO arranques la descarga larga: al terminar tu turno, la terminal ejecuta sola `scripts/chrome.sh stop; scripts/chrome.sh start; MW_DL_GAP=8000 node scripts/mw.mjs --resume`. Asegúrate de que ese comando funciona (prueba corta con `--limit 1` vale, se publica).

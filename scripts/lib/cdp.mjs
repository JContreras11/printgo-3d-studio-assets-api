// Driver CDP mínimo (WebSocket nativo de Node 22, sin dependencias).
// Una conexión al navegador; cada pestaña es una sesión "flatten".
const PORT = process.env.MW_CDP_PORT || 9333;

export async function connect(port = PORT) {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`).catch(() => null);
  if (!res) throw new Error(`Chrome no responde en :${port}. Ejecuta: scripts/chrome.sh start`);
  const { webSocketDebuggerUrl } = await res.json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error("CDP: no conecta")); });
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, ko } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? ko(new Error(`${msg.error.message} ${msg.error.data || ""}`)) : ok(msg.result);
    } else for (const fn of listeners) fn(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, ko) => {
    const id = ++seq;
    pending.set(id, { ok, ko });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  async function newPage() {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    await s("Page.enable");
    await s("Runtime.enable");
    const waitLoad = (timeout = 45000) => new Promise((ok) => {
      const t = setTimeout(() => { listeners.delete(fn); ok(false); }, timeout);
      const fn = (m) => {
        if (m.sessionId === sessionId && m.method === "Page.loadEventFired") {
          clearTimeout(t); listeners.delete(fn); ok(true);
        }
      };
      listeners.add(fn);
    });
    const page = {
      send: s,
      async goto(url) {
        const loaded = waitLoad();
        await s("Page.navigate", { url });
        await loaded;
      },
      // Evalúa una expresión (puede ser async) en la página y devuelve su valor JSON.
      async eval(expression) {
        const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      },
      close: () => send("Target.closeTarget", { targetId }),
    };
    return page;
  }

  return { send, newPage, close: () => ws.close() };
}

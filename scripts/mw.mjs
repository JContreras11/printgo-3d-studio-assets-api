#!/usr/bin/env node
// Super scraper MakerWorld: Chrome visible (scripts/chrome.sh) + APIs internas, sin clics.
// Uso: node scripts/mw.mjs <url-búsqueda|url-modelo|"tópico"> [--category slug --label "Etiqueta"]
//        [--limit N] [--dry-run] [--concurrency N] [--only-new] [--refresh-variants] [--no-push]
//      node scripts/mw.mjs --refresh-variants [ids...]     re-audita perfiles de modelos existentes
//      node scripts/mw.mjs --resume                         procesa lo pendiente de queue.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { connect } from "./lib/cdp.mjs";
import { toEs, sanitize, saveCache } from "./lib/text_es.mjs";
import { classify, parseProfiles, relevant } from "./lib/mw_data.mjs";
import { slugify } from "./lib/misc.js";
import { build, labels, ROOT } from "./build_api.mjs";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    category: { type: "string" }, label: { type: "string" }, limit: { type: "string" },
    "dry-run": { type: "boolean" }, concurrency: { type: "string", default: "3" }, "only-new": { type: "boolean" },
    "refresh-variants": { type: "boolean" }, "no-push": { type: "boolean" }, resume: { type: "boolean" },
    "batch": { type: "string", default: "25" },
  },
});
const CONC = Math.max(1, +opt.concurrency);
const QUEUE = path.join(ROOT, "queue.json");
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

class QuotaError extends Error {}

// ---------- biblioteca local ----------
function library() {
  const map = new Map();
  const dir = path.join(ROOT, "categories");
  for (const cat of fs.readdirSync(dir)) {
    if (!fs.statSync(path.join(dir, cat)).isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(dir, cat))) {
      const id = name.split("_")[0];
      if (/^\d+$/.test(id)) map.set(id, path.join(dir, cat, name));
    }
  }
  return map;
}
const readQueue = () => (fs.existsSync(QUEUE) ? JSON.parse(fs.readFileSync(QUEUE, "utf8")) : { items: [] });
const writeQueue = (q) => fs.writeFileSync(QUEUE, JSON.stringify(q, null, 1) + "\n");

// ---------- sesión MakerWorld (una pestaña; todo es fetch desde la página) ----------
let browser, page;
async function session() {
  if (page) return page;
  browser = await connect();
  page = await browser.newPage();
  await page.goto("https://makerworld.com/en");
  for (let i = 0; i < 20 && /moment/i.test(await page.eval("document.title")); i++) await sleep(1000);
  const title = await page.eval("document.title");
  if (/moment/i.test(title)) throw new Error("Cloudflare bloquea Chrome. Resuelve la verificación en la ventana o prueba: scripts/chrome.sh stop && scripts/chrome.sh start (sin MW_HEADLESS)");
  return page;
}
async function api(url) {
  const p = await session();
  for (let attempt = 0; ; attempt++) {
    const r = await p.eval(`fetch(${JSON.stringify(url)}, {credentials: "include", signal: AbortSignal.timeout(30000)}).then(async r => ({ status: r.status, body: await r.text() }))`);
    if ((r.status === 429 || r.status >= 500) && attempt < 5) { await sleep(2000 * 2 ** attempt); continue; }
    let json = null;
    try { json = JSON.parse(r.body); } catch { /* texto */ }
    return { status: r.status, json, body: r.body };
  }
}

// ---------- descubrimiento ----------
async function search(keyword, max = Infinity) {
  const out = [];
  for (let off = 0; off < max; off += 50) {
    const r = await api(`/api/v1/search-service/select/design2?orderBy=score&designType=0&keyword=${encodeURIComponent(keyword)}&limit=50&offset=${off}`);
    const hits = r.json?.hits || [];
    out.push(...hits);
    if (!hits.length || off + 50 >= (r.json?.total ?? 0)) break;
  }
  return out;
}
const TOPIC_VARIANTS = { "gta 6": ["gta 6", "gta vi", "grand theft auto 6", "grand theft auto vi", "gta6"] };

async function discover(target) {
  const found = [];
  const add = (h, source) => found.push({ id: String(h.id), slug: h.slug || "", title: h.title || "", titleTranslated: h.titleTranslated || "", tags: h.tags || [], source });
  if (!target) return found;
  const model = target.match(/makerworld\.com\/[a-z-]*\/?models\/(\d+)/i);
  if (model) {
    const d = await api(`/api/v1/design-service/design/${model[1]}`);
    if (d.json?.id) add(d.json, target);
    return found;
  }
  let keywords;
  const isUrl = /^https?:/i.test(target);
  if (isUrl) {
    const kw = new URL(target).searchParams.get("keyword");
    if (!kw) throw new Error(`URL no soportada: ${target}`);
    keywords = [kw];
  } else {
    const t = target.toLowerCase().trim();
    keywords = TOPIC_VARIANTS[t] || [t];
  }
  const max = opt.limit ? +opt.limit : Infinity;
  for (const kw of keywords) {
    const hits = await search(kw, max);
    // URL de búsqueda: todo lo que devuelve MakerWorld. Tópico: solo lo relevante al término.
    const keep = isUrl ? hits : hits.filter((h) => relevant(h, keywords));
    log(`búsqueda "${kw}": ${hits.length} resultados${isUrl ? "" : `, ${keep.length} relevantes`}`);
    for (const h of keep) add(h, isUrl ? `search:${kw}` : `topic:${target}`);
  }
  const seen = new Set();
  return found.filter((x) => !seen.has(x.id) && seen.add(x.id));
}

// ---------- descarga ----------
async function download(url, dest) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(180000) }).catch(() => null);
    if (r?.ok) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(`${dest}.part`, Buffer.from(await r.arrayBuffer()));
      fs.renameSync(`${dest}.part`, dest);
      return true;
    }
    if (r && r.status < 500 && r.status !== 429) return false;
    await sleep(1500 * 2 ** attempt);
  }
  return false;
}
const extOf = (url, def = "jpg") => (url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i)?.[1] || def).toLowerCase().replace("jpeg", "jpg");

let quotaHit = null;
// Pausa mínima entre peticiones de descarga (ms). Perilla de calibración: MakerWorld pide captcha si se va muy rápido.
const DL_GAP = +(process.env.MW_DL_GAP ?? 3000);
let dlTurn = Promise.resolve();
const dlSlot = () => (dlTurn = dlTurn.then(() => sleep(DL_GAP)));
// Captcha: el dueño lo resuelve en la ventana visible; aquí solo se avisa y se reintenta.
const CAPTCHA_WAIT = +(process.env.MW_CAPTCHA_WAIT_MIN ?? 30) * 60000;
const CAPTCHA_RETRY = 15000;
let captchaTab = null, captchaSince = 0; // compartido: un solo aviso aunque haya varios workers
async function captchaPrompt(modelId) {
  if (captchaSince) return;
  captchaSince = Date.now();
  log(`>>> CAPTCHA de MakerWorld: resuélvelo en la ventana de Chrome (modelo ${modelId}, pulsa "Download 3MF"). Reintento cada ${CAPTCHA_RETRY / 1000} s, máx. ${CAPTCHA_WAIT / 60000} min.`);
  spawnSync("osascript", ["-e", 'display notification "Resuelve el captcha en Chrome" with title "PrintGo scraper" sound name "Glass"']);
  try {
    captchaTab ??= await browser.newPage();
    captchaTab.send("Page.navigate", { url: `https://makerworld.com/en/models/${modelId}` }).catch(() => {});
    await captchaTab.send("Page.bringToFront");
  } catch (e) { log(`no pude abrir la pestaña del captcha: ${e.message}`); }
}
// Pide la URL firmada del 3MF de un perfil (misma API que el botón "Download 3MF").
async function signed3mf(instanceId, modelId) {
  for (;;) {
    await dlSlot();
    const r = await api(`/api/v1/design-service/instance/${instanceId}/f3mf?type=download`);
    if (r.json?.url) {
      if (captchaSince) { log("captcha resuelto, sigo con la cola"); captchaSince = 0; }
      return r.json;
    }
    const msg = `${r.status} ${r.body.slice(0, 300)}`;
    if (r.status === 401) throw new QuotaError(`sesión caducada (${msg}); ejecuta scripts/chrome.sh resync`);
    if (r.status === 418 || /not a robot|captcha/i.test(r.body)) {
      await captchaPrompt(modelId);
      if (Date.now() - captchaSince > CAPTCHA_WAIT) throw new QuotaError(`captcha sin resolver tras ${CAPTCHA_WAIT / 60000} min (${msg.slice(0, 80)})`);
      await sleep(CAPTCHA_RETRY);
      continue;
    }
    if (r.status === 429 || /limit|quota|exceed|too many|verif/i.test(r.body)) throw new QuotaError(msg);
    return { error: msg };
  }
}

async function processModel(item, lib) {
  const d = (await api(`/api/v1/design-service/design/${item.id}`)).json;
  if (!d?.id) return { status: "failed", reason: "diseño no disponible" };
  if (d.paidSetting?.isPaid || (d.isPointRedeemable && !d.isAlreadyRedeemed)) return { status: "skipped", reason: "de pago" };
  const profiles = parseProfiles(d);
  if (!profiles.length) return { status: "skipped", reason: "sin perfiles de impresión" };

  const isNew = !lib.has(item.id);
  const cat = opt.category || item.category || classify({ ...d, categories: d.categories });
  const finalDir = lib.get(item.id) || path.join(ROOT, "categories", cat, `${item.id}_${(d.slug || slugify(d.title)).slice(0, 50)}`);
  // Modelos nuevos se arman en .tmp/work y se mueven al final: un commit por lotes nunca ve medio modelo.
  const folder = isNew ? path.join(ROOT, ".tmp", "work", path.basename(finalDir)) : finalDir;
  const mfPath = path.join(folder, "manifest.json");
  const m = fs.existsSync(mfPath) ? JSON.parse(fs.readFileSync(mfPath, "utf8")) : {};
  m.files ??= [];

  // Textos (solo modelos nuevos: los existentes conservan su copy curado; el saneo global los repasa).
  if (isNew) {
    const catNames = [...(d.categories || [])].reverse().map((c) => c.name).filter(Boolean);
    Object.assign(m, {
      id: String(d.id),
      title: (await toEs(d.titleTranslated || d.title)) || sanitize(d.title),
      slug: d.slug || slugify(d.title),
      url: `https://makerworld.com/en/models/${d.id}-${d.slug}`,
      author: d.designCreator?.handle || d.designCreator?.name || "",
      category: cat,
      source_category: await toEs(catNames.join(" > ")),
      description: await toEs(d.summaryTranslated || d.summary),
      use_cases: [],
      tags: [...new Set((await Promise.all((d.tagsTranslated?.length ? d.tagsTranslated : d.tags || []).slice(0, 12).map((t) => toEs(t)))).map((t) => t.toLowerCase()).filter(Boolean))],
      license: d.license || "",
      release_date: (d.createTime || "").slice(0, 10),
      source_preview_url: d.coverUrl || "",
    });
  }

  // Galería completa (solo si falta en disco).
  const prevDir = path.join(folder, "previews");
  const haveImgs = fs.existsSync(prevDir) && fs.readdirSync(prevDir).some((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
  if (!haveImgs) {
    const pics = d.designExtension?.design_pictures || [];
    const urls = pics.length ? pics.map((p) => p.url) : [d.coverUrl].filter(Boolean);
    m.images = [];
    await Promise.all(urls.map(async (u, i) => {
      const rel = `previews/${String(i + 1).padStart(2, "0")}.${extOf(u)}`;
      if (await download(`${u}?x-oss-process=image/resize,w_1000`, path.join(folder, rel))) m.images[i] = rel;
    }));
    m.images = m.images.filter(Boolean);
  }

  // Perfiles: dedupe por instance_id; archivos antiguos sin instance_id se emparejan por título de perfil o nombre.
  let added = 0;
  let quota = null;
  const errors = [];
  for (const p of profiles) {
    let file = m.files.find((f) => f.instance_id === p.instance_id);
    if (!file) {
      // el meta.profile_title de archivos viejos puede estar ya traducido por el saneo global
      const names = new Set([p.title, await toEs(p.title), await toEs(p.title, { curated: true })].map((t) => sanitize(t).toLowerCase()));
      file = m.files.find((f) => !f.instance_id && f.meta?.profile_title && names.has(sanitize(f.meta.profile_title).toLowerCase()));
    }
    let signed = null;
    if (!file) {
      try { signed = await signed3mf(p.instance_id, item.id); } catch (e) { if (e instanceof QuotaError) { quota = e; break; } throw e; }
      if (signed.error) { errors.push(`${p.instance_id}: ${signed.error}`); continue; }
      const base = signed.name.replace(/\.3mf$/i, "");
      file = m.files.find((f) => !f.instance_id && path.basename(f.path).replace(/\.3mf(\.xz)?$/i, "") === base);
    }
    if (!file) {
      const rel = `model/${slugify(p.title).slice(0, 50)}-${p.instance_id}.3mf`;
      const tmp = path.join(ROOT, ".tmp", "dl", `${item.id}-${p.instance_id}.3mf`);
      if (!(await download(signed.url, tmp))) { errors.push(`${p.instance_id}: descarga falló`); continue; }
      execFileSync("xz", ["-9", "-T0", "-f", tmp]);
      // GitHub rechaza archivos >100 MB: se omite ese perfil (queda anotado en la cola).
      if (fs.statSync(`${tmp}.xz`).size > 95 * 1024 * 1024) { fs.rmSync(`${tmp}.xz`); errors.push(`${p.instance_id}: >95 MB comprimido`); continue; }
      fs.mkdirSync(path.join(folder, "model"), { recursive: true });
      fs.renameSync(`${tmp}.xz`, path.join(folder, `${rel}.xz`));
      file = { path: `${rel}.xz` };
      m.files.push(file);
      added++;
    }
    // Miniatura del perfil y metadatos (contrato UI).
    const thumb = `previews/profiles/${p.instance_id}.jpg`;
    if (p.cover && !fs.existsSync(path.join(folder, thumb))) await download(`${p.cover}?x-oss-process=image/resize,w_600/format,jpg`, path.join(folder, thumb));
    Object.assign(file, {
      instance_id: p.instance_id,
      name: (await toEs(p.title)) || sanitize(p.title),
      thumbnail: fs.existsSync(path.join(folder, thumb)) ? thumb : null,
      print_time_h: p.print_time_h, plates: p.plates, rating: p.rating, rating_count: p.rating_count,
      by_designer: p.by_designer, printers: p.printers, default: p.default,
    });
  }
  if (quota && !m.files.length) throw quota; // la carpeta de trabajo queda para reanudar
  if (!m.files.length) {
    if (isNew) fs.rmSync(folder, { recursive: true, force: true });
    return { status: "failed", reason: errors.join("; ") || "sin archivos" };
  }
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(mfPath, JSON.stringify(m, null, 1) + "\n");
  if (isNew) { fs.mkdirSync(path.dirname(finalDir), { recursive: true }); fs.renameSync(folder, finalDir); }
  lib.set(item.id, finalDir);
  // Cuota a mitad de modelo: se publica lo bajado y queda pendiente para completar sus perfiles.
  if (quota) return { status: "pending", quota: quota.message, isNew, added, profiles: profiles.length, errors, category: path.basename(path.dirname(finalDir)) };
  return { status: "done", isNew, added, profiles: profiles.length, errors, category: path.basename(path.dirname(finalDir)) };
}

// ---------- publicación ----------
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} falló`);
}
async function publish(message) {
  saveCache();
  await build();
  run("node", ["scripts/validate.js"]);
  run("git", ["add", "-A", "categories", "api", "queue.json", ...(fs.existsSync(path.join(ROOT, "categories_es.json")) ? ["categories_es.json"] : [])]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT }).status === 0) return log("nada nuevo que publicar");
  run("git", ["commit", "-q", "-m", message]);
  if (!opt["no-push"]) run("git", ["push", "-q", "origin", "HEAD"]);
  log(`publicado: ${message}`);
}

// ---------- main ----------
async function main() {
  const ids = positionals.every((x) => /^\d+$/.test(x)) ? positionals : [];
  const target = ids.length ? "" : positionals.join(" ").trim();
  if (opt.category && opt.label) {
    const f = path.join(ROOT, "categories_es.json");
    const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
    if (labels()[opt.category] !== opt.label) fs.writeFileSync(f, JSON.stringify({ ...cur, [opt.category]: opt.label }, null, 1) + "\n");
  }
  const lib = library();
  const q = readQueue();
  const inQueue = new Map(q.items.map((x) => [x.id, x]));

  let discovered = [];
  if (opt["refresh-variants"] && !target) {
    discovered = (ids.length ? ids : [...lib.keys()]).map((id) => ({ id, source: "refresh" }));
  } else if (target) {
    discovered = await discover(target);
  }
  for (const x of discovered) {
    const cat = opt.category || (lib.has(x.id) ? path.basename(path.dirname(lib.get(x.id))) : classify(x));
    const prev = inQueue.get(x.id);
    const wantRefresh = opt["refresh-variants"] || !lib.has(x.id);
    if (opt["only-new"] && lib.has(x.id)) continue;
    if (prev && prev.status === "done" && !opt["refresh-variants"]) continue;
    if (prev && prev.status === "skipped") continue;
    if (!wantRefresh) continue; // existente sin --refresh-variants: nada que hacer
    const item = { id: x.id, slug: x.slug || prev?.slug || "", title: x.title || prev?.title || "", category: cat, source: x.source, status: "pending" };
    if (prev) Object.assign(prev, item); else { q.items.push(item); inQueue.set(x.id, item); }
  }
  if (!opt["dry-run"]) writeQueue(q);
  let todo = q.items.filter((x) => x.status === "pending" && (opt.resume || discovered.some((d) => d.id === x.id)));
  if (opt.limit) todo = todo.slice(0, +opt.limit);
  log(`descubiertos ${discovered.length} · en cola ${todo.length} (concurrencia ${CONC})`);
  if (opt["dry-run"]) {
    const byCat = {};
    for (const x of todo) (byCat[x.category] ??= []).push(`${x.id} ${x.title}`);
    for (const [c, xs] of Object.entries(byCat)) console.log(`\n[${c}] ${xs.length}\n  ${xs.slice(0, 15).join("\n  ")}${xs.length > 15 ? "\n  …" : ""}`);
    browser?.close();
    return;
  }

  const t0 = Date.now();
  const stats = { done: 0, newModels: 0, newFiles: 0, failed: 0, skipped: 0 };
  const batch = Math.max(1, +opt.batch);
  let sincePublish = 0;
  let idx = 0;
  let publishing = Promise.resolve();
  async function worker() {
    while (!quotaHit && idx < todo.length) {
      const item = todo[idx++];
      try {
        const r = await processModel(item, lib);
        Object.assign(item, { status: r.status, reason: r.reason || (r.errors?.length ? r.errors.join("; ") : undefined), category: r.category || item.category, at: new Date().toISOString() });
        if (r.quota) quotaHit = r.quota;
        if (r.status === "done" || r.quota) { stats.done += r.status === "done"; stats.newFiles += r.added; if (r.isNew) stats.newModels++; }
        else stats[r.status]++;
        const rate = (stats.done / ((Date.now() - t0) / 60000)).toFixed(1);
        log(`[${stats.done + stats.failed + stats.skipped}/${todo.length}] ${item.id} ${r.status}${r.added ? ` +${r.added} perfiles` : ""} ${r.reason || ""} · ${rate} modelos/min`);
        if (r.status === "done" && ++sincePublish >= batch) {
          sincePublish = 0;
          writeQueue(q);
          publishing = publishing.then(() => publish(`library: +${stats.newModels} modelos, +${stats.newFiles} perfiles (mw.mjs, lote)`));
          await publishing;
        }
      } catch (e) {
        if (e instanceof QuotaError) { quotaHit = e.message; item.status = "pending"; break; }
        Object.assign(item, { status: "failed", reason: String(e.message).slice(0, 200) });
        stats.failed++;
        log(`${item.id} falló: ${e.message}`);
      }
      writeQueue(q);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await publishing;
  const mins = (Date.now() - t0) / 60000;
  writeQueue(q);
  const summary = { ...stats, minutes: +mins.toFixed(2), models_per_min: +(stats.done / Math.max(mins, 0.01)).toFixed(2), quota: quotaHit, pending: q.items.filter((x) => x.status === "pending").length };
  log("resumen", JSON.stringify(summary));
  fs.mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
  fs.appendFileSync(path.join(ROOT, ".tmp", "mw-runs.jsonl"), JSON.stringify({ at: new Date().toISOString(), target: target || "(refresh/resume)", ...summary }) + "\n");
  if (quotaHit) log(`CUOTA/SESIÓN: ${quotaHit}. Cola guardada en queue.json; reanuda con: node scripts/mw.mjs --resume`);
  await publish(stats.newModels || stats.newFiles
    ? `library: +${stats.newModels} modelos, +${stats.newFiles} perfiles (${target || "refresh-variants"})`
    : `queue: ${summary.pending} pendientes (${target || "refresh/resume"})${quotaHit ? " · parado por cuota/captcha" : ""}`);
  browser?.close();
}

main().catch((e) => { console.error(e.message); saveCache(); browser?.close(); process.exit(1); });

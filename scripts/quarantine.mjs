#!/usr/bin/env node
// Retira de la API los modelos con licencia no publicable, por categoría y en fases
// (cuando su reemplazo de PrintGo Labs esté verificado y subido).
//
//   node scripts/quarantine.mjs --category halloween-2026            # dry-run (por defecto)
//   node scripts/quarantine.mjs --category halloween-2026 --apply    # lo ejecuta de verdad
//   node scripts/quarantine.mjs --category kitchen --model 123 --apply --no-push   # prueba puntual
//
// Qué hace --apply, en orden:
//   1. Archiva el manifiesto en quarantine/<cat>/<id>_<slug>.json (registro de lo retirado).
//   2. Quita categories/<cat>/<id>_<slug>/ del índice git (update-index --force-remove,
//      compatible con sparse-checkout y bits skip-worktree; no necesita el árbol en disco).
//   3. Borra api/model/<id>.json y regenera TODA la api/ desde los supervivientes (misma forma
//      de registro que build_api.mjs:87-93; incluidas categorías que queden vacías).
//   4. Refresca el reporte de auditoría y hace commit (+push salvo --no-push).
//
// gta-vi se mantiene publicada por decisión del dueño (2026-10-11); --include-kept la incluye.
// Nota: los blobs retirados siguen en el historial de git; el borrado total exigiría reescribir
// la historia del repo (decisión pendiente, ver api-license-report.json).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { normalizeLicense } from "./lib/license.mjs";
import { labels, LICENSE_POLICY, STORAGE, ROOT } from "./build_api.mjs";
import { audit } from "./license_audit.mjs";

const KEEP = new Set(["gta-vi"]); // decisión del dueño 2026-10-11

const { values: opt } = parseArgs({
  options: {
    category: { type: "string" }, model: { type: "string" },
    "dry-run": { type: "boolean" }, apply: { type: "boolean" }, "no-push": { type: "boolean" },
    "include-kept": { type: "boolean" },
  },
});
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} falló`);
};
const write = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 1) + "\n"); };

// ---------- estado ----------
// Carga TODOS los api/model/*.json. La retirada se decide solo sobre lo que cae en el filtro
// (--category/--model), pero la API se regenera desde el catálogo completo menos los retirados.
function loadModels() {
  const dir = path.join(ROOT, "api", "model");
  return fs.readdirSync(dir).filter((x) => x.endsWith(".json")).map((f) => {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const lic = normalizeLicense(m.license);
    const inTarget = (!opt.category || m.category === opt.category) && (!opt.model || String(m.id) === String(opt.model));
    const kept = !opt["include-kept"] && KEEP.has(m.category);
    return { m, lic, inTarget, remove: inTarget && !lic.publishable && !kept, kept: inTarget && kept };
  });
}

// Registro ligero de categoría: réplica exacta de build_api.mjs:87-93 (contrato de la UI).
// El nombre de carpeta sale del api/categories/<cat>.json vigente, no se reconstruye.
function lightRecord(m, folder) {
  const base = `categories/${m.category}/${folder}`;
  return {
    id: m.id, title: m.title, slug: m.slug, category: m.category, author: m.author, license: m.license,
    release_date: m.release_date, description: (m.description || "").slice(0, 200), use_cases: m.use_cases || [],
    tags: m.tags || [], file_count: (m.files || []).length, total_size: (m.files || []).reduce((s, f) => s + (f.size || 0), 0),
    preview: m.preview ? `${base}/${m.preview}` : null, preview_size: m.image_sizes?.[m.preview] || null,
    images: (m.images || []).map((p) => `${base}/${p}`), url: m.url, variant_hint: m.variant_hint,
  };
}

// Regenera la API desde los manifiestos supervivientes. No usa build(): build() recorre
// categories/ en disco (hoy excluido por sparse-checkout) y borraría lo no materializado.
function rebuildApi(survivors) {
  const LABELS = labels();
  const folders = new Map(); // id -> nombre de carpeta, desde el categories/<cat>.json vigente
  for (const cat of fs.readdirSync(path.join(ROOT, "api", "categories"))) {
    if (!cat.endsWith(".json")) continue;
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "categories", cat), "utf8"));
    for (const x of list.models || []) {
      const folder = x.preview?.match(`^categories/[^/]+/([^/]+)/`)?.[1] || x.images?.[0]?.match(`^categories/[^/]+/([^/]+)/`)?.[1];
      if (folder) folders.set(String(x.id), folder);
    }
  }
  const perCat = {};
  for (const m of survivors) (perCat[m.category] ??= []).push(lightRecord(m, folders.get(String(m.id)) || `${m.id}_${(m.slug || "").slice(0, 50)}`));
  for (const c of fs.readdirSync(path.join(ROOT, "api", "categories"))) {
    if (c.endsWith(".json") && !perCat[c.replace(/\.json$/, "")]) fs.rmSync(path.join(ROOT, "api", "categories", c)); // categoría vacía fuera
  }
  for (const [c, models] of Object.entries(perCat)) write(path.join(ROOT, "api", "categories", `${c}.json`), { category: c, label_es: LABELS[c] || c, count: models.length, models });
  const catList = [...Object.keys(LABELS), ...Object.keys(perCat).filter((c) => !LABELS[c])].filter((c) => perCat[c])
    .map((c) => ({ id: c, name: c, label_es: LABELS[c] || c, count: perCat[c].length, size: perCat[c].reduce((s, x) => s + x.total_size, 0) }));
  write(path.join(ROOT, "api", "categories.json"), catList);
  write(path.join(ROOT, "api", "index.json"), {
    name: "PrintGo 3D Library",
    version: "2.0.0",
    generated: new Date().toISOString().slice(0, 10),
    total_models: catList.reduce((s, c) => s + c.count, 0),
    total_files: survivors.reduce((s, m) => s + (m.files || []).length, 0),
    categories: catList.map((c) => c.id),
    source: "MakerWorld y PrintGo Labs",
    license_policy: LICENSE_POLICY,
    storage_note: STORAGE.note,
  });
  return catList;
}

// Validación ligera de consistencia interna (validate.js completo necesita categories/ en disco;
// corre cuando se materialice para reanudar el scraper).
function liteValidate() {
  const ok = (cond, msg) => { if (!cond) throw new Error(`lite-validate FALLÓ: ${msg}`); };
  const models = fs.readdirSync(path.join(ROOT, "api", "model")).filter((x) => x.endsWith(".json"));
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "index.json"), "utf8"));
  ok(index.total_models === models.length, `index.total_models ${index.total_models} != ${models.length} api/model`);
  const catIds = new Set(models.map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "api", "model", f), "utf8")).id));
  for (const c of JSON.parse(fs.readFileSync(path.join(ROOT, "api", "categories.json"), "utf8"))) {
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "categories", `${c.id}.json`), "utf8"));
    ok(list.count === (list.models || []).length, `${c.id}: count != models`);
    ok(c.count === list.count, `categories.json ${c.id}: ${c.count} != ${list.count}`);
    for (const x of list.models || []) ok(catIds.has(String(x.id)), `${c.id}: ficha ${x.id} sin api/model`);
  }
  console.log(`lite-validate OK: ${models.length} fichas coherentes`);
}

// ---------- main ----------
if (!opt.category && !opt.model) {
  console.error("uso: node scripts/quarantine.mjs --category <cat> [--model <id>] [--apply] [--no-push]");
  process.exit(1);
}
const all = loadModels();
const target = all.filter((x) => x.inTarget);
const removing = all.filter((x) => x.remove);
const survivors = all.filter((x) => !x.remove).map((x) => x.m);
console.log(`${opt.category || `(modelo ${opt.model})`}: ${target.length} modelos en el filtro · ${removing.length} a retirar · ${target.length - removing.length} se quedan`);
if (target.some((x) => x.kept)) console.log(`  (mantenida por decisión del dueño: gta-vi — ${target.filter((x) => x.kept).length} no publicables SIN retirar)`);
const removedBytes = removing.reduce((s, x) => s + (x.m.total_size || (x.m.files || []).reduce((a, f) => a + (f.size || 0), 0)), 0);
console.log(`  bytes a retirar: ${(removedBytes / 1e9).toFixed(2)} GB en .3mf.xz`);
for (const x of removing.slice(0, 20)) console.log(`  - ${x.m.category}/${x.m.id} ${x.m.title} [${x.m.license || "(sin licencia)"}]`);
if (removing.length > 20) console.log(`  … y ${removing.length - 20} más`);
if (!opt.apply) { console.log("dry-run: nada tocado. Confirma con --apply."); process.exit(0); }

// 1-2. Archiva el manifiesto y quita el directorio del índice git.
for (const x of removing) {
  const m = x.m;
  const tracked = git("ls-files", "--", `categories/${m.category}/${m.id}_*`).trim().split("\n").filter(Boolean);
  write(path.join(ROOT, "quarantine", m.category, `${m.id}_${m.slug || ""}.json`), m);
  for (let i = 0; i < tracked.length; i += 200) run("git", ["update-index", "--force-remove", ...tracked.slice(i, i + 200)]);
  if (tracked.length) console.log(`  retirado del índice: categories/${m.category}/${tracked[0].split("/")[2]}/ (${tracked.length} archivos)`);
  else console.warn(`  sin rastros en git: ${m.id} (solo se borra su api/model)`);
  fs.rmSync(path.join(ROOT, "api", "model", `${m.id}.json`));
}

// 3. Regenera la API desde los supervivientes y valida.
rebuildApi(survivors);
liteValidate();

// 4. Auditoría fresca + commit (+push salvo --no-push).
audit();
run("git", ["add", "-A", "api", "quarantine", "api-license-report.json"]);
run("git", ["commit", "-q", "-m", `quarantine(${opt.category || opt.model}): -${removing.length} modelos sin licencia publicable (gate CC0/CC BY)`]);
if (!opt["no-push"]) run("git", ["push", "-q", "origin", "HEAD"]);
console.log(`listo: ${removing.length} retirados, ${survivors.length} permanecen. ${opt["no-push"] ? "SIN push (revisa y empuja tú)." : "Publicado."}`);

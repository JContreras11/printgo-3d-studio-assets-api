#!/usr/bin/env node
// Genera api/ a partir de categories/<cat>/<id>_<slug>/manifest.json (la fuente de verdad).
// Recalcula tamaños/sha256 de archivos, image_sizes (sin red), meta de 3MF nuevos y variant_hint.
// Uso: node scripts/build_api.mjs
import fs from "node:fs";
import path from "node:path";
import { sha256File } from "./lib/misc.js";
import { imageSize, BASE_LABELS } from "./lib/mw_data.mjs";
import { extractMeta, modelVariantHint } from "./extract_3mf_meta.mjs";

export const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;
const STORAGE = {
  format: "xz",
  note: "Los 3MF se guardan como .3mf.xz para no superar el límite de 100 MB de GitHub. Descomprime con `xz -d -k <archivo>` antes de usarlo; el SHA-256 se calcula sobre el archivo comprimido.",
};

export function labels() {
  const f = path.join(ROOT, "categories_es.json");
  return { ...BASE_LABELS, ...(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}) };
}

const write = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 1) + "\n"); };

// Normaliza un manifest contra el disco. Devuelve el manifest actualizado.
export async function refreshManifest(folder, m) {
  // .3mf sin comprimir con gemelo .3mf.xz: sobra (el repo publica solo .xz).
  const modelDir = path.join(folder, "model");
  const onDisk = fs.existsSync(modelDir) ? fs.readdirSync(modelDir).filter((f) => /\.3mf(\.xz)?$/i.test(f)) : [];
  for (const f of onDisk) if (/\.3mf$/i.test(f) && onDisk.includes(`${f}.xz`)) fs.rmSync(path.join(modelDir, f));
  const byPath = new Map((m.files || []).map((f) => [f.path, f]));
  const files = [];
  for (const f of fs.readdirSync(modelDir).filter((x) => /\.3mf(\.xz)?$/i.test(x)).sort()) {
    const rel = `model/${f}`;
    const full = path.join(folder, rel);
    const prev = byPath.get(rel) || {};
    const size = fs.statSync(full).size;
    const sha256 = prev.size === size && prev.sha256 ? prev.sha256 : sha256File(full);
    const entry = { ...prev, path: rel, size, sha256, compressed: f.endsWith(".xz"), decompress: f.endsWith(".xz") ? "xz -d -k <filename>" : null };
    if (!entry.meta && f.endsWith(".xz")) {
      const meta = await extractMeta(full);
      if (Object.keys(meta).length) entry.meta = meta;
    }
    files.push(entry);
  }
  // perfil por defecto primero, luego el orden de MakerWorld/nombre
  files.sort((a, b) => (b.default === true) - (a.default === true));

  const prevDir = path.join(folder, "previews");
  const disk = fs.existsSync(prevDir) ? fs.readdirSync(prevDir).filter((f) => IMG_RE.test(f)).sort().map((f) => `previews/${f}`) : [];
  const images = [...(m.images || []).filter((p) => disk.includes(p)), ...disk.filter((p) => !(m.images || []).includes(p))];
  const image_sizes = {};
  for (const p of [...images, ...files.map((f) => f.thumbnail).filter(Boolean)]) {
    const full = path.join(folder, p);
    if (fs.existsSync(full)) { const s = imageSize(full); if (s) image_sizes[p] = s; }
  }
  return {
    ...m,
    preview: images[0] || null,
    images,
    image_sizes,
    files,
    variant_hint: modelVariantHint(files, m.title),
    storage: STORAGE,
  };
}

export async function build() {
  fs.mkdirSync(path.join(ROOT, ".tmp"), { recursive: true });
  const LABELS = labels();
  const catsDir = path.join(ROOT, "categories");
  const perCat = {};
  const ids = new Set();
  for (const cat of fs.readdirSync(catsDir).sort()) {
    const cdir = path.join(catsDir, cat);
    if (!fs.statSync(cdir).isDirectory()) continue;
    for (const name of fs.readdirSync(cdir).sort()) {
      const folder = path.join(cdir, name);
      const mf = path.join(folder, "manifest.json");
      if (!fs.existsSync(mf)) continue;
      const m = await refreshManifest(folder, { ...JSON.parse(fs.readFileSync(mf, "utf8")), category: cat });
      if (!m.files.length) { console.warn(`sin 3MF, no se publica: ${cat}/${name}`); continue; }
      write(mf, m);
      write(path.join(ROOT, "api", "model", `${m.id}.json`), m);
      ids.add(m.id);
      const base = `categories/${cat}/${name}`;
      (perCat[cat] ??= []).push({
        id: m.id, title: m.title, slug: m.slug, category: cat, author: m.author, license: m.license,
        release_date: m.release_date, description: (m.description || "").slice(0, 200), use_cases: m.use_cases || [],
        tags: m.tags || [], file_count: m.files.length, total_size: m.files.reduce((s, f) => s + f.size, 0),
        preview: m.preview ? `${base}/${m.preview}` : null, preview_size: m.image_sizes[m.preview] || null,
        images: m.images.map((p) => `${base}/${p}`), url: m.url, variant_hint: m.variant_hint,
      });
    }
  }
  for (const f of fs.readdirSync(path.join(ROOT, "api", "model"))) if (!ids.has(f.replace(/\.json$/, ""))) fs.rmSync(path.join(ROOT, "api", "model", f));
  for (const f of fs.readdirSync(path.join(ROOT, "api", "categories"))) if (!perCat[f.replace(/\.json$/, "")]) fs.rmSync(path.join(ROOT, "api", "categories", f));

  const order = [...Object.keys(LABELS), ...Object.keys(perCat).filter((c) => !LABELS[c])];
  const catList = order.filter((c) => perCat[c]).map((c) => ({
    id: c, name: c, label_es: LABELS[c] || c, count: perCat[c].length, size: perCat[c].reduce((s, x) => s + x.total_size, 0),
  }));
  for (const [c, models] of Object.entries(perCat)) write(path.join(ROOT, "api", "categories", `${c}.json`), { category: c, label_es: LABELS[c] || c, count: models.length, models });
  write(path.join(ROOT, "api", "categories.json"), catList);
  const total = catList.reduce((s, c) => s + c.count, 0);
  write(path.join(ROOT, "api", "index.json"), {
    name: "PrintGo 3D Library",
    version: "2.0.0",
    generated: new Date().toISOString().slice(0, 10),
    total_models: total,
    total_files: Object.values(perCat).flat().reduce((s, x) => s + x.file_count, 0),
    categories: catList.map((c) => c.id),
    source: "MakerWorld",
    license_policy: "Modelos gratuitos de MakerWorld; cada modelo conserva su licencia, autor y URL de origen.",
    storage_note: STORAGE.note,
  });
  console.log(`api: ${total} modelos en ${catList.length} categorías`);
  return { total };
}

if (import.meta.url === `file://${process.argv[1]}`) build().catch((e) => { console.error(e); process.exit(1); });

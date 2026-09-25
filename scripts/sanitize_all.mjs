#!/usr/bin/env node
// Saneo global: pasa todo el texto publicado de los manifests por sanitize + traducción ES y reconstruye api/.
// Uso: node scripts/sanitize_all.mjs   (imprime cuántos campos cambió)
import fs from "node:fs";
import path from "node:path";
import { toEs, saveCache } from "./lib/text_es.mjs";
import { build, ROOT } from "./build_api.mjs";

let changed = 0, fields = 0;
const es = async (v) => {
  if (typeof v !== "string" || !v) return v;
  fields++;
  const out = (await toEs(v, { curated: true })) || v; // ponytail: si no se logra traducir se conserva y validate.js lo marca
  if (out !== v) changed++;
  return out;
};
await build(); // primero: extrae meta de 3MF nuevos para sanear también profile_title/notes
const dirs = [];
for (const cat of fs.readdirSync(path.join(ROOT, "categories"))) {
  const c = path.join(ROOT, "categories", cat);
  if (fs.statSync(c).isDirectory()) for (const n of fs.readdirSync(c)) if (fs.existsSync(path.join(c, n, "manifest.json"))) dirs.push(path.join(c, n, "manifest.json"));
}
let i = 0;
async function worker() {
  while (i < dirs.length) {
    const mf = dirs[i++];
    const m = JSON.parse(fs.readFileSync(mf, "utf8"));
    for (const k of ["title", "description", "source_category"]) m[k] = await es(m[k]);
    m.use_cases = await Promise.all((m.use_cases || []).map(es));
    const tags = await Promise.all((m.tags || []).map(es));
    const uniq = [...new Set(tags.map((t) => t.toLowerCase()).filter(Boolean))];
    if (uniq.length !== tags.length) changed++;
    m.tags = uniq;
    for (const f of m.files || []) {
      if (f.name) f.name = await es(f.name);
      if (f.meta?.profile_title) f.meta.profile_title = await es(f.meta.profile_title);
      if (f.meta?.profile_notes) f.meta.profile_notes = await es(f.meta.profile_notes);
    }
    fs.writeFileSync(mf, JSON.stringify(m, null, 1) + "\n");
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
saveCache();
await build();
console.log(`saneo global: ${changed} de ${fields} campos cambiados en ${dirs.length} modelos`);

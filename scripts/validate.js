#!/usr/bin/env node
// Valida la biblioteca publicada: archivos (tamaño + sha256), imágenes, api/ == manifest y texto saneado en español.
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { sha256File } from "./lib/misc.js";
import { sanitize, looksEnglish } from "./lib/text_es.mjs";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

// Campos de texto publicados: deben venir saneados y sin inglés detectable.
export function textProblems(m) {
  const out = [];
  const fields = [["title", m.title], ["description", m.description], ["source_category", m.source_category],
    ...(m.tags || []).map((t, i) => [`tags[${i}]`, t]), ...(m.use_cases || []).map((t, i) => [`use_cases[${i}]`, t]),
    ...(m.files || []).map((f, i) => [`files[${i}].name`, f.name])];
  for (const [k, v] of fields) {
    if (v == null || v === "") continue;
    if (sanitize(v) !== v) out.push(`${k} sin sanear: ${JSON.stringify(v.slice(0, 80))}`);
    if (looksEnglish(v)) out.push(`${k} en inglés: ${JSON.stringify(v.slice(0, 80))}`);
  }
  return out;
}

function main() {
  const catsDir = path.join(ROOT, "categories");
  let models = 0, files = 0;
  for (const cat of fs.readdirSync(catsDir)) {
    if (!fs.statSync(path.join(catsDir, cat)).isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(catsDir, cat))) {
      const dir = path.join(catsDir, cat, name);
      const where = `${cat}/${name}`;
      const mf = path.join(dir, "manifest.json");
      if (!fs.existsSync(mf)) { err(where, "sin manifest.json"); continue; }
      const m = JSON.parse(fs.readFileSync(mf, "utf8"));
      models++;
      for (const k of ["id", "title", "slug", "url", "category"]) if (!m[k]) err(where, `falta ${k}`);
      if (m.category !== cat) err(where, `category=${m.category} en carpeta ${cat}`);
      if (!name.startsWith(`${m.id}_`)) err(where, "carpeta no coincide con id");
      if (!m.files?.length) err(where, "sin archivos 3MF");
      for (const f of m.files || []) {
        files++;
        const p = path.join(dir, f.path);
        if (!f.path.endsWith(".3mf.xz")) err(where, `${f.path} no es .3mf.xz`);
        if (!fs.existsSync(p)) { err(where, `falta ${f.path}`); continue; }
        if (fs.statSync(p).size !== f.size) err(where, `tamaño distinto ${f.path}`);
        else if (sha256File(p) !== f.sha256) err(where, `sha256 distinto ${f.path}`);
        if (f.thumbnail && !fs.existsSync(path.join(dir, f.thumbnail))) err(where, `falta ${f.thumbnail}`);
      }
      for (const img of m.images || []) {
        if (!fs.existsSync(path.join(dir, img))) err(where, `falta ${img}`);
        if (!m.image_sizes?.[img]) err(where, `sin image_sizes para ${img}`);
      }
      for (const t of textProblems(m)) err(where, t);
      const apiFile = path.join(ROOT, "api", "model", `${m.id}.json`);
      if (!fs.existsSync(apiFile) || !isDeepStrictEqual(JSON.parse(fs.readFileSync(apiFile, "utf8")), m)) err(where, "api/model desactualizado (ejecuta node scripts/build_api.mjs)");
    }
  }
  const cats = JSON.parse(fs.readFileSync(path.join(ROOT, "api", "categories.json"), "utf8"));
  for (const c of cats) if (!c.label_es) err(`api/categories.json`, `${c.id} sin label_es`);
  if (cats.reduce((s, c) => s + c.count, 0) !== models) err("api/categories.json", "conteo distinto de categories/");
  if (errors.length) {
    console.error(errors.slice(0, 60).join("\n") + (errors.length > 60 ? `\n… y ${errors.length - 60} más` : ""));
    console.error(`\nFALLÓ: ${errors.length} problemas en ${models} modelos`);
    process.exit(1);
  }
  console.log(`OK: ${models} modelos, ${files} archivos 3MF`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

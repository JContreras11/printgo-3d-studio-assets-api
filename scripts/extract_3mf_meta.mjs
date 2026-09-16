#!/usr/bin/env node
// Extracts honest print metadata from the real .3mf.xz files (Bambu/Orca-ish:
// 3D/3dmodel.model, Metadata/project_settings.config, Metadata/slice_info.config,
// Metadata/plate_*.png) and stores it per file as `files[].meta` in the
// manifests and api/model/*.json. Also adds `variant_hint` (human, es-CO) to
// every manifest, api/model/*.json record, and api/categories/*.json record.
//
// Run AFTER scripts/build_api.py so it augments the generated files:
//   node scripts/extract_3mf_meta.mjs
//
// No facts are invented: a field is only set when it appears in the file.
// Front-end code falls back to filename-derived hints when `meta` is absent,
// so the live library works even before these manifests are deployed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const MODELS_GLOB = "categories/*/*/manifest.json";
const TMP_DIR = path.join(ROOT, ".tmp");

function parseXmlMetadata(xmlText) {
  const meta = {};
  for (const match of xmlText.matchAll(/<metadata name="([^"]+)">([\s\S]*?)<\/metadata>/g)) {
    meta[match[1]] = match[2];
  }
  return meta;
}

const XML_ENTITIES = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
function decodeXml(text = "") {
  let value = String(text);
  for (let pass = 0; pass < 4; pass++) {
    const next = value.replace(/&(lt|gt|amp|quot|#39|apos);/g, (m) => XML_ENTITIES[m.toLowerCase()] ?? m);
    if (next === value) break;
    value = next;
  }
  return value;
}
function stripTags(text = "") {
  return decodeXml(text).replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
}

function listZipEntries(filePath) {
  const out = execFileSync("unzip", ["-l", filePath], { encoding: "utf8" });
  return out.split("\n").slice(3).map((line) => line.trim().split(/\s+/).slice(-1)[0]).filter(Boolean);
}

function readZipEntry(filePath, entry) {
  try {
    return execFileSync("unzip", ["-p", filePath, entry], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function findInJson(obj, key) {
  if (obj == null || typeof obj !== "object") return undefined;
  if (obj[key] !== undefined && typeof obj[key] !== "object") return obj[key];
  for (const value of Object.values(obj)) {
    const found = findInJson(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parsePlates(sliceXml) {
  if (!sliceXml) return [];
  const plates = [];
  for (const block of sliceXml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const body = block[1];
    const get = (key) => body.match(new RegExp(`key="${key}" value="([^"]*)"`))?.[1];
    const filaments = [...body.matchAll(/<filament\b([^>]*)>/g)].map((m) => {
      const attrs = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
      return { type: attrs.type, color: attrs.color };
    });
    const entries = [...body.matchAll(/<object\b[^>]*>/g)].length
      || [...body.matchAll(/<metadata key="index"/g)].length;
    plates.push({
      index: Number(get("index")) || undefined,
      printer_model_id: get("printer_model_id") || undefined,
      nozzle_diameters: get("nozzle_diameters") || undefined,
      prediction_ms: Number(get("prediction")) || undefined,
      weight_g: Number(get("weight")) || undefined,
      support_used: get("support_used") === "true",
      entries,
      filaments: filaments.length ? filaments : undefined,
    });
  }
  return plates;
}

function variantSegments(filename) {
  return String(filename).toLowerCase()
    .replace(/\.3mf(\.xz)?$/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[_\-\s]+/)
    .filter(Boolean);
}

// Structured es-CO tokens built ONLY from the filename (so a printer family
// is never claimed unless the creator named it). Returns { colors, printers }.
export function variantTokens(filename, title = "") {
  const titleTokens = new Set(String(title).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const segments = variantSegments(filename).filter((token) => !titleTokens.has(token));
  const colors = [];
  const printers = [];
  for (let i = 0; i < segments.length; i++) {
    const token = segments[i];
    if (token === "a1" && segments[i + 1] === "mini") { printers.push("A1 mini"); i++; continue; }
    if (token === "vase" && segments[i + 1] === "mode") { i++; continue; }
    if (["colored", "multicolor"].includes(token)) colors.push("Multicolor");
    else if (["mono", "single"].includes(token)) colors.push("Monocromo");
    else if (token === "x1c") printers.push("X1 Carbon");
    else if (token === "x1e") printers.push("X1E");
    else if (["x1", "p1s", "p1p", "a1"].includes(token)) printers.push(token.toUpperCase());
    else if (token === "mini") printers.push("A1 mini");
  }
  return { colors: [...new Set(colors)], printers: [...new Set(printers)] };
}

// Short, human es-CO hint built ONLY from tokens present in the filename.
export function variantHints(filename, title = "") {
  const { colors, printers } = variantTokens(filename, title);
  return [...colors, ...printers];
}

// Model-level hint summarising every variant, e.g.
// "Multicolor y monocromo · para X1 y A1 mini".
export function modelVariantHint(files = [], title = "") {
  const colors = new Set();
  const printers = new Set();
  for (const file of files) {
    const { colors: c, printers: p } = variantTokens(path.basename(file.path ?? ""), title);
    for (const x of c) colors.add(x);
    for (const x of p) printers.add(x);
  }
  const parts = [];
  if (colors.size === 2) parts.push("Multicolor y monocromo");
  else if (colors.has("Multicolor")) parts.push("Multicolor");
  else if (colors.has("Monocromo")) parts.push("Monocromo");
  if (printers.size) parts.push(`para ${[...printers].join(" y ")}`);
  return parts.join(" · ") || undefined;
}

export async function extractMeta(xzPath) {
  const out = {};
  const name = path.basename(xzPath);
  try {
    const dir = fs.mkdtempSync(path.join(TMP_DIR, "3mf-"));
    const threeMf = path.join(dir, name.replace(/\.xz$/i, "") || "model.3mf");
    const outFd = fs.openSync(threeMf, "w");
    try {
      execFileSync("xz", ["-d", "-k", "-c", xzPath], { stdio: ["ignore", outFd, "ignore"], timeout: 120_000 });
    } finally {
      fs.closeSync(outFd);
    }

    let keys = [];
    try { keys = listZipEntries(threeMf); } catch { return out; }

    const modelXml = readZipEntry(threeMf, "3D/3dmodel.model");
    if (modelXml) {
      const meta = parseXmlMetadata(modelXml);
      const app = meta.Application || "";
      out.application = app || undefined;
      out.profile_title = stripTags(meta.ProfileTitle) || undefined;
      out.profile_notes = stripTags(meta.ProfileDescription) || undefined;
      out.creation_date = meta.CreationDate || undefined;
      if (/^orca/i.test(app) || /^orca\b/i.test(app)) out.slicer = "OrcaSlicer";
      else if (/bambus/i.test(app)) out.slicer = "Bambu Studio";
      else if (app) out.slicer = app;
    }

    const projectConfig = readZipEntry(threeMf, "Metadata/project_settings.config");
    if (projectConfig) {
      let config = null;
      try { config = JSON.parse(projectConfig); } catch { /* keep null */ }
      const get = (k) => (config ? findInJson(config, k) : undefined)
        ?? projectConfig.match(new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`))?.[1];
      const printer = get("printer_model");
      if (printer) out.printer = String(printer).trim();
      const layer = get("layer_height");
      if (layer) out.layer_height = String(layer).trim();
      const infill = get("sparse_infill_density");
      if (infill) out.infill = String(infill).trim();
      const ironing = get("ironing_type");
      if (ironing && ironing !== "no ironing") out.ironing = String(ironing).trim();
      const support = get("support_type");
      if (support) out.support_type = String(support).trim();
    }

    const sliceXml = readZipEntry(threeMf, "Metadata/slice_info.config");
    const plates = parsePlates(sliceXml);
    if (plates.length) {
      out.plates = plates.map((plate) => ({
        printer_model_id: plate.printer_model_id,
        nozzle_diameters: plate.nozzle_diameters,
        prediction_ms: plate.prediction_ms,
        weight_g: plate.weight_g,
        support_used: plate.support_used,
        filaments: plate.filaments?.map(({ type, color }) => ({ type, color })),
      }));
    }

    const plateCount = new Set(keys.filter((k) => /^Metadata\/plate_\d+\.png$/i.test(k))
      .map((k) => k.match(/(\d+)\.png$/i)[1])).size;
    if (plateCount > 0) out.photos = keys.filter((k) => /^Metadata\/plate_\d+\.png$/i.test(k)).length;

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
  } catch {
    return out;
  }
}

function findManifests(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findManifests(full).forEach((p) => results.push(p));
    else if (entry.isFile() && entry.name === "manifest.json") results.push(full);
  }
  return results;
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const manifests = findManifests(path.join(ROOT, "categories")).sort();
  let enriched = 0;
  let filesWithMeta = 0;

  for (const manifestPath of manifests) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const category = path.basename(path.dirname(path.dirname(manifestPath)));
    const modelDir = path.dirname(manifestPath);
    let any = false;

    for (const file of manifest.files || []) {
      const xzPath = path.join(modelDir, file.path);
      if (!fs.existsSync(xzPath)) continue;
      const meta = await extractMeta(xzPath);
      if (Object.keys(meta).length) {
        file.meta = meta;
        filesWithMeta++;
        any = true;
      }
    }

    const variantHint = modelVariantHint(manifest.files || [], manifest.title);
    manifest.variant_hint = variantHint;

    if (any || variantHint) {
      fs.writeFileSync(path.join(modelDir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
      const apiModel = path.join(ROOT, "api", "model", `${manifest.id}.json`);
      if (fs.existsSync(apiModel)) {
        fs.writeFileSync(apiModel, JSON.stringify(manifest, null, 1) + "\n");
      }
      const apiCategory = path.join(ROOT, "api", "categories", `${category}.json`);
      if (fs.existsSync(apiCategory)) {
        const list = JSON.parse(fs.readFileSync(apiCategory, "utf8"));
        for (const record of list.models || []) {
          if (record.id === manifest.id) record.variant_hint = variantHint;
        }
        fs.writeFileSync(apiCategory, JSON.stringify(list, null, 1) + "\n");
      }
      enriched++;
    }
  }

  console.log(`enriched ${enriched}/${manifests.length} manifests · ${filesWithMeta} 3MF files with metadata`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
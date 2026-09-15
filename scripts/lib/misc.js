import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// sha256 of a file, chunked (stream-safe, no deps).
export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(1024 * 1024);
  let bytes;
  try {
    while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

// Deterministic safe slug from a model title.
export function slugify(title) {
  return (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "model";
}

// Extract the numeric MakerWorld id from a model URL/string.
export function makerIdOf(input) {
  if (!input) return null;
  const m = String(input).match(/\/(models|model)\/(\d+)/);
  return m ? m[2] : null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9._ -]/g, "_");
}

// Determine a file's role by extension for the manifest.
export function roleOf(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".3mf") return "model-3mf";
  if ([".jpeg", ".jpg", ".png", ".webp", ".avif", ".gif"].includes(ext)) return "preview";
  if ([".stl", ".step", ".stp", ".obj", ".f3d", ".skp", ".blend"].includes(ext)) return "model-other";
  if ([".pdf", ".txt", ".md", ".csv"].includes(ext)) return "doc";
  return "other";
}
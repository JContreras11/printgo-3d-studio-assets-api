#!/usr/bin/env node
// 3MF core → proyecto Bambu. Reutiliza read-only el convertidor probado del studio:
// read3mf + recolor3mf recorren el camino verificado con Bambu Studio 2.x (presets
// X1C "0.20mm Standard", placas, paint codes, diálogos silenciados). El repo
// printgo-3d-studio no se modifica: solo se importan sus módulos por ruta.
//
//   import { coreToBambu } from "./lib/bambu.mjs"
//   node labs/lib/bambu.mjs entrada.3mf salida.3mf
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
// Repo vecino con el motor geométrico y los binarios de laminado; sobreescribible para CI.
export const STUDIO = process.env.PRINTGO_STUDIO || path.resolve(ROOT, "..", "printgo-3d-studio");

const studioModule = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);

// Envuelve un 3MF core (write_3mf del geometry-worker) en un proyecto Bambu abierto
// sin diálogos por cualquier Bambu Studio 2.x. Devuelve triángulos y filamentos usados.
export async function coreToBambu(corePath, outPath) {
  const [{ unzipSync, zipSync }, { read3mf, recolor3mf }] = await Promise.all([
    studioModule("node_modules/three/examples/jsm/libs/fflate.module.js"),
    studioModule("apps/studio-web/threemf.js"),
  ]);
  const files = unzipSync(new Uint8Array(fs.readFileSync(corePath)));
  const { palette, pieces, triangles } = read3mf(files);
  const out = recolor3mf(files, palette, pieces);
  if (!out["Metadata/project_settings.config"]) throw new Error(`${corePath}: el wrap no produjo project_settings`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, zipSync(out));
  return { triangles, filaments: palette.filter((slot) => slot.triangles > 0).length, outPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error("uso: node labs/lib/bambu.mjs <core.3mf> <proyecto.3mf>");
    process.exit(1);
  }
  coreToBambu(inPath, outPath)
    .then((r) => console.log(`${outPath}: ${r.triangles} triángulos · ${r.filaments} filamento(s)`))
    .catch((e) => { console.error(e); process.exit(1); });
}

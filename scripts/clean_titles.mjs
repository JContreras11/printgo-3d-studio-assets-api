// Aplica cleanTitle() a los 396 títulos: el nombre del modelo se queda con lo
// relevante y fuera la jerga ("SIN AMS", "Infill", "patrón de relleno visible",
// "capa de 0,2 mm, 2 paredes"). No toca los .3mf, que ya llevan su nombre corto.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./build_api.mjs";
import { cleanTitle } from "./lib/names.mjs";

const apply = process.argv.includes("--apply");
let touched = 0;

for (const cat of fs.readdirSync(path.join(ROOT, "categories")).sort()) {
  const catDir = path.join(ROOT, "categories", cat);
  if (!fs.statSync(catDir).isDirectory()) continue;
  for (const dir of fs.readdirSync(catDir).sort()) {
    const file = path.join(catDir, dir, "manifest.json");
    if (!fs.existsSync(file)) continue;
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    const clean = cleanTitle(m.title);
    if (!clean || clean === m.title) continue;
    console.log(`  ${m.id ?? dir.split("_")[0]} | ${m.title}\n           -> ${clean}`);
    m.title = clean;
    if (apply) { fs.writeFileSync(file, JSON.stringify(m, null, 1) + "\n"); touched++; }
  }
}
console.log(`\ntítulos a limpiar: ${touched ? touched : "(los de arriba)"}`);
if (!apply) console.log("dry-run: revisa arriba y vuelve con --apply");

// Renombra los 3MF al nombre del proyecto ("funda-iphone.3mf") y deja el manifest al día.
// El nombre viejo venía del perfil del laminador ("Capa de 0,2 mm, 2 paredes, 15% de relleno"),
// que no le dice nada a quien recibe el archivo. No se tocan las carpetas ni los ids,
// así que las URLs de la API siguen igual; solo cambia el basename y files[].name.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./build_api.mjs";
import { projectFileName } from "./lib/names.mjs";

const apply = process.argv.includes("--apply");
let renamed = 0, touched = 0, models = 0, numbered = 0, labeled = 0;
const numberedNames = [];

for (const cat of fs.readdirSync(path.join(ROOT, "categories")).sort()) {
  const catDir = path.join(ROOT, "categories", cat);
  if (!fs.statSync(catDir).isDirectory()) continue;
  for (const dir of fs.readdirSync(catDir).sort()) {
    const folder = path.join(catDir, dir);
    const file = path.join(folder, "manifest.json");
    if (!fs.existsSync(file)) continue;
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    const files = m.files || [];
    if (!files.length) continue;
    models++;
    const taken = new Set();
    let dirty = false;
    files.forEach((f, i) => {
      const wanted = `${projectFileName(m.title, { category: m.category, total: files.length, index: i, file: f })}.3mf`;
      // Blindaje: dos archivos del mismo modelo no pueden acabar con el mismo nombre.
      let name = wanted;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = wanted.replace(/\.3mf$/, `-${n}.3mf`);
      taken.add(name.toLowerCase());
      const oldAbs = path.join(folder, f.path);
      const newRel = `model/${name}.xz`;
      const newAbs = path.join(folder, newRel);
      if (f.path !== newRel) {
        if (apply && fs.existsSync(oldAbs)) { fs.renameSync(oldAbs, newAbs); renamed++; }
        f.path = newRel;
        dirty = true;
      }
      if (f.name !== name.replace(/\.3mf$/, "")) { f.name = name.replace(/\.3mf$/, ""); dirty = true; }
      // El número solo entra si no hay variación humana que mostrar.
      if (new RegExp(`(?:^|-)${i + 1}$`).test(name.replace(/\.3mf$/, ""))) { numbered++; numberedNames.push(`${cat}/${dir} -> ${name}`); } else labeled++;
    });
    if (dirty) {
      if (apply) { fs.writeFileSync(file, JSON.stringify(m, null, 1) + "\n"); touched++; }
      if (touched <= 5 || apply) console.log(`  ${cat}/${dir} -> ${[...taken].join(", ")}`);
    }
  }
}
console.log(`${apply ? "renombrados" : "por renombrar"}: ${renamed} archivos · manifests tocados: ${touched} · modelos: ${models}`);
console.log(`con variación humana (color/material/tiempo): ${labeled} · con número de variante: ${numbered}`);
if (numberedNames.length) console.log(`  ej: ${numberedNames.slice(0, 4).join(" | ")}`);
if (!apply) console.log("dry-run:复查 arriba y luego vuelve con --apply");

// Renombra los 3MF al nombre del proyecto ("funda-iphone.3mf") y deja el manifest al día.
// El nombre viejo venía del perfil del laminador ("Capa de 0,2 mm, 2 paredes, 15% de relleno"),
// que no le dice nada a quien recibe el archivo. No se tocan las carpetas ni los ids,
// así que las URLs de la API siguen igual.
// El basename va corto y con guion; files[].name es lo que se lee en la lista de
// variantes, y ahí va en castellano ("Multicolor", "Una sola placa"), sin tiempos:
// la hora, el peso y las placas ya salen en las pills de al lado.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./build_api.mjs";
import { projectFileName, variantDisplayName } from "./lib/names.mjs";

const apply = process.argv.includes("--apply");
// Nombre de variante ya traducido (scripts/build_variant_labels.mjs lo genera).
const LABELS = fs.existsSync(path.join(ROOT, "data", "variant-labels.json"))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, "data", "variant-labels.json"), "utf8"))
  : {};
let renamed = 0, touched = 0, models = 0, numbered = 0, standard = 0;
const numberedNames = [];
const labels = [];

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
    // Primero todos a un nombre temporal y luego al definitivo. Si dos archivos del mismo
    // modelo se intercambian el nombre ("a" -> "b" y "b" -> "a"), renombrar en el sitio
    // sobrescribe el destino y se pierde un archivo: este script no puede permitírselo.
    const moves = [];
    files.forEach((f, i) => {
      const wanted = `${projectFileName(m.title, { category: m.category, total: files.length, index: i, file: f })}.3mf`;
      // Blindaje: dos archivos del mismo modelo no pueden acabar con el mismo nombre.
      let name = wanted;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = wanted.replace(/\.3mf$/, `-${n}.3mf`);
      taken.add(name.toLowerCase());
      const newRel = `model/${name}.xz`;
      if (f.path !== newRel) {
        moves.push({ from: path.join(folder, f.path), to: path.join(folder, newRel) });
        f.path = newRel;
        dirty = true;
        renamed++;
      }
      // files[].name es lo que se lee en la lista de variantes: en castellano y sin horas.
      const label = variantDisplayName(f, LABELS);
      if (f.name !== label) { f.name = label; dirty = true; }
      labels.push(label);
      if (label === "Versión estándar") standard++;
      // El número solo entra en el basename si no hay variación humana que mostrar.
      if (new RegExp(`(?:^|-)${i + 1}$`).test(name.replace(/\.3mf$/, ""))) { numbered++; numberedNames.push(`${cat}/${dir} -> ${name}`); }
    });
    if (apply) {
      for (const mv of moves) {
        if (!fs.existsSync(mv.from)) continue;
        const tmp = `${mv.from}.renaming`;
        fs.renameSync(mv.from, tmp);
        mv.tmp = tmp;
      }
      for (const mv of moves) {
        if (!mv.tmp) continue;
        fs.renameSync(mv.tmp, mv.to);
      }
    }
    if (dirty) {
      if (apply) { fs.writeFileSync(file, JSON.stringify(m, null, 1) + "\n"); touched++; }
      if (touched <= 5 || apply) console.log(`  ${cat}/${dir} -> ${files.map((f) => f.name).join(" | ")}`);
    }
  }
}
console.log(`${apply ? "renombrados" : "por renombrar"}: ${renamed} archivos · manifests tocados: ${touched} · modelos: ${models}`);
console.log(`nombres de variante: ${labels.length} · sin dato propio ("Versión estándar"): ${standard}`);
console.log(`  los más usados: ${[...new Set(labels)].sort((a, b) => labels.filter((l) => l === b).length - labels.filter((l) => l === a).length).slice(0, 8).join(" · ")}`);
if (numberedNames.length) console.log(`  basename con número: ${numbered} ej: ${numberedNames.slice(0, 3).join(" | ")}`);
if (!apply) console.log("dry-run:复查 arriba y luego vuelve con --apply");

// Red de seguridad: si el renombrado hubiera pisado algún archivo, el conteo del disco
// ya no cuadraría con el manifest. Es mejor fallar aquí que publicar una biblioteca amputada.
if (apply) {
  let onDisk = 0;
  for (const cat of fs.readdirSync(path.join(ROOT, "categories"))) {
    const catDir = path.join(ROOT, "categories", cat);
    if (!fs.statSync(catDir).isDirectory()) continue;
    for (const dir of fs.readdirSync(catDir)) {
      const modelDir = path.join(catDir, dir, "model");
      if (!fs.existsSync(modelDir)) continue;
      onDisk += fs.readdirSync(modelDir).filter((f) => /\.3mf\.xz$/i.test(f)).length;
    }
  }
  if (onDisk !== labels.length) {
    console.error(`\nABORTADO: ${onDisk} archivos en disco pero ${labels.length} en los manifests. No sigas con build_api.`);
    process.exit(1);
  }
  console.log(`  ${onDisk} archivos en disco, cuadran con los manifests`);
}

// Nombre de variante en castellano para la lista de la web.
//
// De dónde sale el nombre de cada variante, en orden de preferencia:
//   1. El título del perfil, si describe el producto ("10 Minutes Sign", "Larger GTA VI"):
//      se quita la jerga y se traduce. El mapa queda en data/variant-labels.json para
//      que el build de la API sea determinista y no dependa de la red.
//   2. Si el perfil es solo ajuste ("0,2 mm, 2 paredes, 15 % de relleno"), se deduce de los
//      datos: color (multicolor/monocolor), material, piezas sueltas o una sola placa, tamaño.
// Ni tiempos de impresión ni "2 mm" ni relleno: la hora ya sale en las pills de al lado.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./build_api.mjs";
import { toEs, saveCache, looksEnglish } from "./lib/text_es.mjs";
import { PROFILE_JARGON, isDescriptiveTitle, profileLabel, normalizeVariantLabel } from "./lib/names.mjs";

const OUT = path.join(ROOT, "data", "variant-labels.json");
const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force"); // vuelve a traducir lo que ya está guardado

// Conectores: no sostienen un nombre.
const STOP_ES = /^(?:de|del|la|el|los|las|un|una|y|o|a|en|con|sin|para|por|que|the|and|or|of|for|su|sus|se|al|lo|es|son)$/i;
// Discurso del fabricante: no dice qué variante es, solo lo bien que sale.
const FILLER_ES = /^(?:optimi[sz]|reduc|mejor|eficient|calidad|rapid|rápid|facilit|recomend|suger|consejo|important|nota|aviso|aument|disminu|increase|improv|reduce|better|support|planchas?|discos?|bandejas?|cambiar|caras?|parámetros?|texturas?|capas?|capas|modelo|model|optimi[sz]ación|partes?|piezas?|todos|todas|un\s+disco)\b/iu;
// Si TODAS las palabras son relleno, el título no nombra ninguna variante.
const ALL_FILLER = new RegExp(`^(?:${FILLER_ES.source}|${STOP_ES.source})$`, "iu");
// Frases que describen el ajuste, no la variante.
const PHRASE_ES = /\b(?:impresi[óo]n\s+multicolor\s+en\s+(?:una|un)\s+plancha|several\s+colou?rs?|print\s+speed|flow\s+rate|one\s+plate|separated?|serial\s+number|test\s*print)/gi;
// Jerga que el traductor ya ha pasado a castellano: sigue siendo jerga, así que no se publica.
const JARGON_ES = /\b(?:boquilla\w*|pared\w*|capa\w*|relleno\w*|giroide\w*|panal\w*|inyector\w*|detectar|detecci[óo]n|perfil\w*|altura\w*|l[íi]nea\w*\s+de\s+capa|flujo\w*|velocidad\w*|textura\w*|soporte\w*|malla\w*|hexagonal\w*|anillo\w*|pared\s+delgada|piso\s+de)\b/iu;
// Traducción rota: palabras sueltas sin verbo, o la misma palabra repetida ("de de", "pisos de pisos").
const BROKEN_ES = /\b(\p{L}{3,})\b(?:\s+\p{L}{1,4})?\s+\1\b/iu;
// "Usando PETG", "3 colores de largo": no nombran el producto, son un ajuste mal traducido.
const NOT_A_NAME = /^(?:usando|con|para|3\s|colores?\s+de\s+largo|colores?\s+de\s+alto)\b/iu;

/** Deja solo la parte que nombra la variante y corta el discurso del fabricante. */
function trimToVariant(es) {
  const clauses = es.split(/(?<=[.。;；])\s*/).filter(Boolean);
  const kept = [];
  for (const c of clauses) {
    const bare = c.replace(/[.。;；,]+$/, "").trim();
    if (!bare) continue;
    const words = bare.split(/[\s·|]+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase())
      .filter(Boolean);
    const content = words.filter((w) => !STOP_ES.test(w) && /\p{L}{3}/u.test(w));
    // Sin contenido, o todo relleno: la variante se acabó aquí.
    if (!content.length || content.every((w) => ALL_FILLER.test(w))) break;
    kept.push(bare);
    if (kept.length >= 2) break;
  }
  const out = kept.join(". ")
    .replace(PHRASE_ES, " ")
    .replace(/[·|]+/g, " ")
    .replace(/\s*,\s*(?=[,.;])|^[·|,.\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // "Giroide sin ala", "0 16 inyectores": tradujo la jerga, así que el título no servía.
  if (JARGON_ES.test(out) || BROKEN_ES.test(out) || NOT_A_NAME.test(out)) return "";
  // El nombre de variante es corto: "GTA VI frontal", no un párrafo del fabricante.
  const words = out.split(/\s+/);
  if (words.length > 6) return "";
  return out.length >= 3 && /\p{L}{3}/u.test(out) ? out : "";
}

const titles = new Set();
for (const cat of fs.readdirSync(path.join(ROOT, "categories"))) {
  const catDir = path.join(ROOT, "categories", cat);
  if (!fs.statSync(catDir).isDirectory()) continue;
  for (const dir of fs.readdirSync(catDir)) {
    const file = path.join(catDir, dir, "manifest.json");
    if (!fs.existsSync(file)) continue;
    for (const f of JSON.parse(fs.readFileSync(file, "utf8")).files || []) {
      const t = String((f.meta || {}).profile_title || "").trim();
      if (t && isDescriptiveTitle(t)) titles.add(t);
    }
  }
}

const map = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = [...titles].filter((t) => force || !map[t]);
console.log(`títulos que describen el producto: ${titles.size} · ya resueltos: ${titles.size - todo.length} · pendientes: ${todo.length}`);

const sample = [];
for (const t of todo.sort()) {
  const source = profileLabel(t);
  if (!source) { map[t] = ""; continue; } // era pura jerga
  const es = (await toEs(source)).replace(PROFILE_JARGON, " ");
  // Se limpia otra vez: el traductor puede devolver "Capa de" donde no había nada.
  const tidy = es.replace(/\s+([,.;:])/g, "$1").replace(/^[\s·|,.;:\-–—]+/, "").replace(/\s+/g, " ").trim();
  const trimmed = trimToVariant(tidy);
  // Se guarda ya normalizado ("un solo color" -> "Monocromo"): el mapa es la fuente.
  map[t] = !trimmed || looksEnglish(trimmed) ? "" : normalizeVariantLabel(trimmed);
  sample.push([t, map[t]]);
}
saveCache();

if (apply) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, null, 1) + "\n");
  const vacias = Object.entries(map).filter(([k, v]) => !v && titles.has(k)).length;
  console.log(`escrito ${path.relative(ROOT, OUT)}: ${Object.keys(map).length} entradas · ${vacias} sin texto útil`);
} else {
  for (const [k, v] of sample.slice(0, 12)) console.log(`  ${JSON.stringify(k.slice(0, 44))} -> ${JSON.stringify(v)}`);
  console.log(`dry-run: ${todo.length} traducciones pendientes`);
}

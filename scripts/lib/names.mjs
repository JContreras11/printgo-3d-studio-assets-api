// Nombres humanos: fuera la jerga de laminador y fuera el ruido de MakerWorld.
// El objetivo es que en la biblioteca se lea qué se imprime, no con qué ajustes.
// OJO: un tamaño puede ser el del objeto ("gancho de 35 mm", "marcos de 20 mm"),
// por eso las unidades sueltas solo se quitan cuando el nombre es de un perfil
// (units), nunca en el título del modelo.
const JARGON = [
  // phrases(names) — before the generic ones, or "relleno" would leave "patrón de visible".
  // [^)]* swallows the qualifier that trails inside the parenthesis.
  /\bpatr[oó]n\s+de\s+relleno\b[^)]*/gi,
  /\bdensidad\s+de\s+relleno\b[^)]*/gi,
  /\b(?:relleno|infill)\b/gi,
  // AMS: estación de material, no es parte del producto ("SIN AMS", "no se requiere AMS")
  /\bno\s*ams\b/gi,
  /\b(?:sin|no|no\s+se\s+requiere|requiere|con|para)\s+ams\b/gi,
  // altura de capa: el "mm" solo cuenta si va con estas palabras
  /\b(?:altura\s+(?:de|del?)\s+(?:la\s+)?(?:capa|piso|layer)|altura\s+capa|layer\s*height|capa\s*(?:de\s*)?\d)\b[^,;/|·]*/gi,
  // "boquilla 0,2 mm" sí es ajuste, pero "boquilla anular de alta presión" es del producto.
  /\bboquilla\s*[\d.,]*\s*mm\b[^,;/|·]*/gi,
  /\bcapas?\s*(?:de|separad[ao]s?)?\s*[\d.,]*\s*mm\b/gi,
  // paredes / perímetros
  /\b\d+\s*(?:pared(?:es|e|es)|walls?|perimetros?|perimeters?)\b[^,;/|·]*/gi,
  /\bpared(?:es|e|es)\s+delgad\w*|wall\s*loops?|detecci[oó]n\s+de\s+pared\w*|thin\s*walls?\b/gi,
  // porcentaje suelto
  /\b\d+\s*%/gi,
  // velocidad y flujo
  /\b(?:velocidad\s+(?:de\s+)?impresi[oó]n|print\s*speed|flow\s*rate|flujo)\b[^,;/|·]*/gi,
];
// "20 mm" suelto: ajuste de perfil, no tamaño del objeto. Solo para archivos.
const UNITS = /\b[\d.,]+\s*mm\b/gi;
// Una medida que sobrevivió al recorte: señal de que el nombre era puro ajuste.
const BARE_UNIT = /\b\d[\d.,]*\s*(?:mm|%)\b/i;
// Conectores que quedan colgando al quitar una cláusula ("Repisa de cama para marcos de").
const DANGLING = /\s+(?:de|del|para|con|sin|y|o|a|en|for|with|and|the|of|para)\s*$/i;
// Palabras que nunca sostienen un nombre por sí solas.
const FILLER = /^(?:serie|series|modelo|model|versi[oó]n|version|para|con|sin|el|la|los|las|un|una|the|an|a|de|del|y|o|type|tipo|nuevo|new|test|prueba|ams|no\s*ams|sin\s+ams)$/i;

const clean = (s) => String(s ?? "")
  .replace(/[|｜]+/g, " · ")
  .replace(/[\u0000-\u001f]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** Quita cláusulas de ajuste. `units` además descarta medidas sueltas. Dice si quitó algo. */
function stripJargon(text, { units = false } = {}) {
  let out = String(text ?? "");
  let hit = false;
  for (const re of JARGON) {
    if (!re.test(out)) { re.lastIndex = 0; continue; }
    re.lastIndex = 0;
    out = out.replace(re, " ");
    hit = true;
  }
  if (units && UNITS.test(out)) { hit = true; out = out.replace(UNITS, " "); }
  UNITS.lastIndex = 0;
  const cleaned = clean(out)
    // Un coma entre dígitos es decimal ("0,2 mm"), no separador: si no, se parte en dos.
    .replace(/(?<!\d)[,;·|/]+(?!\d)/g, " ")
    // El guion es separador intencional ("PS5 - GTA VI"): solo se quita el que sobra.
    .replace(/[·|/\-–—,]+$/, "")
    .replace(/^[·|/\-–—,]+\s*/, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(DANGLING, "")
    .trim();
  return { text: cleaned, hit };
}

/** ¿Queda algo legible? (para decidir si el nombre sirve o hay que inventarlo) */
function meaningful(text) {
  return clean(text)
    .split(/\s+/)
    .filter((w) => w && !FILLER.test(w.replace(/[^\p{L}\p{N}]/gu, "")))
    .join(" ");
}

/** Título del modelo: sin prefijos de marketing ni ajustes. Conserva los tamaños del objeto. */
export function cleanTitle(title) {
  let t = clean(title);
  const first = stripJargon(t);
  // Si no había jerga, el título no se toca: "S24+/S25" debe sobrevivir intacto.
  if (first.hit) {
    // Si la limpieza dejó una medida suelta ("2 mm"), fue a medias: hay que terminarla.
    const stripped = BARE_UNIT.test(first.text) ? stripJargon(first.text, { units: true }).text : first.text;
    if (meaningful(stripped).length >= 3) t = stripped;
  }
  // "Modelo atómico" -> "atómico", pero "Modelo del átomo" se queda entero.
  t = t.replace(/^\s*(?:modelo|model|new)\s+(?!(?:de|del|la|el|los|las|un|una|para|con)\b)(?=\w)/i, "");
  // No recortamos "Serie Goofy" a secas: es parte del nombre del producto.
  t = t.replace(/\s*\(\s*\d+\s*\)\s*$/, "").replace(/\s*[-–]\s*\(\d+\)\s*$/, "");
  return t.replace(/\s{2,}/g, " ").trim() || clean(title);
}

/** Nombre corto tipo "funda-iphone" cuando el nombre del perfil no dice nada. */
export function shortName(text, words = 2) {
  const base = stripJargon(text, { units: true }).text.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!base) return "";
  const parts = base.split(/\s+/).filter((w) => w && !FILLER.test(w));
  return parts.slice(0, words).join("-").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Qué distingue a una variante de otra, en humano: color, material y tiempo.
 * Lo técnico (0,2 mm, relleno, AMS) no se muestra; el perfil del laminador tampoco.
 */
export function variantLabel(file) {
  const f = file || {};
  const parts = [];
  const filaments = (f.meta?.plates || []).flatMap((p) => p.filaments || []);
  const types = [...new Set(filaments.map((x) => x.type).filter(Boolean))];
  const colors = [...new Set(filaments.map((x) => x.color).filter(Boolean))];
  const profile = String(f.meta?.profile_title || "");
  let color = "";
  // Solo multicolor/monocolor: un hex suelto ("#CACDA0") no le dice nada al usuario.
  if (colors.length > 1) color = "multicolor";
  if (!color && MULTICOLOR.test(profile)) color = "multicolor";
  else if (!color && MONOCOLOR.test(profile)) color = "monocolor";
  if (types.length === 1) parts.push(types[0].toLowerCase());
  if (color) parts.push(color);
  const hours = Number(f.print_time_h);
  if (Number.isFinite(hours) && hours > 0) {
    // 3,3 h son 198 min exactos: no hay que inventar ni recortar.
    const min = Math.round(hours * 60);
    const rest = min % 60;
    parts.push(min < 60 ? `${min}min` : rest ? `${Math.floor(min / 60)}h${String(rest).padStart(2, "0")}` : `${Math.floor(min / 60)}h`);
  }
  return parts.join("-");
}

// "single color" / "多色": se detectan, no se traducen (traducir aquí es un rabbit hole).
const MONOCOLOR = /single[\s-]?colou?r|monocrom|\bun\s*colou?r\b|单色/i;
const MULTICOLOR = /multi[\s-]?colou?r|several\s+colou?rs|full[\s-]?colou?r|多色|多彩/i;

/**
 * Nombre del archivo publicado. El nombre sale del PROYECTO, no del perfil del
 * laminador, y las variantes se distinguen por lo que el usuario nota al imprimir:
 *   "Funda para iPhone 14" (1 variante)  -> "funda-iphone.3mf"
 *   "Perro pastor alemán" (7 variantes)  -> "perro-pastor-monocolor-54min.3mf"
 *                                            "perro-pastor-multicolor-1h48.3mf"
 * La categoría solo entra si el título no da ninguna palabra usable.
 */
export function projectFileName(modelTitle, { category = "", total = 1, index = 0, file = null } = {}) {
  const base = shortName(modelTitle) || shortName(category) || shortName(modelTitle, 4) || "modelo";
  if (total <= 1) return base;
  // El índice es el último recurso: solo si dos variantes acaban con el mismo nombre.
  const label = variantLabel(file);
  if (!label) return `${base}-${index + 1}`;
  return `${base}-${label}`;
}

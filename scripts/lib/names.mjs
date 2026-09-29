// Nombres humanos: fuera la jerga de laminador y fuera el ruido de MakerWorld.
// El objetivo es que en la biblioteca se lea qué se imprime, no con qué ajustes.
// OJO: un tamaño puede ser el del objeto ("gancho de 35 mm", "marcos de 20 mm"),
// por eso las unidades sueltas solo se quitan cuando el nombre es de un perfil
// (units), nunca en el título del modelo.
const JARGON = [
  // altura de capa / boquilla: el "mm" solo cuenta si va con estas palabras
  /\b(?:altura\s+(?:de|del?)\s+(?:la\s+)?(?:capa|piso|layer)|altura\s+capa|layer\s*height|capa\s*(?:de\s*)?\d|boquilla)\b[^,;/|·]*/gi,
  /\bcapas?\s*(?:de|separad[ao]s?)?\s*[\d.,]*\s*mm\b/gi,
  // paredes / perímetros
  /\b\d+\s*(?:pared(?:es|e|es)|walls?|perimetros?|perimeters?)\b[^,;/|·]*/gi,
  /\bpared(?:es|e|es)\s+delgad\w*|wall\s*loops?|detecci[oó]n\s+de\s+pared\w*|thin\s*walls?\b/gi,
  // relleno y porcentaje
  /\b\d+\s*%|\b(?:relleno|infill)\b/gi,
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
    .replace(/(?<!\d)[,;·|/\-–—]+(?!\d)/g, " ")
    .replace(/(?<!\d)[,;·|/\-–—]+\s*$/, " ")
    .replace(/\s+/g, " ")
    .replace(DANGLING, "")
    .replace(/^(?:[·,\s]|-)+/, "")
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
  t = t.replace(/^\s*(?:serie|series|serie\s+de|modelo|model|new)\s+(?=\w)/i, "");
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
 * Nombre del archivo publicado. El nombre sale del PROYECTO, no del perfil del
 * laminador: quien compra necesita reconocer el archivo, no sus ajustes.
 *   "Funda para iPhone 14" + 1 variante  -> "funda-iphone.3mf"
 *   "Funda para iPhone 14" + 3 variantes -> "funda-iphone-1/2/3.3mf"
 * La categoría solo entra si el título no da ninguna palabra usable.
 */
export function projectFileName(modelTitle, { category = "", total = 1, index = 0 } = {}) {
  const base = shortName(modelTitle) || shortName(category) || shortName(modelTitle, 4) || "modelo";
  return total > 1 ? `${base}-${index + 1}` : base;
}

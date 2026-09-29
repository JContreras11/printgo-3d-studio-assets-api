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

// Jerga que aparece en los títulos de PERFIL de MakerWorld: si el nombre es esto y solo esto,
// no describe una variante, es un ajuste. Si el título tiene además algo más ("10 Minutes Sign"),
// esa parte sí se traduce y se usa (ver scripts/build_variant_labels.mjs).
export const PROFILE_JARGON =
  /\b\d+\s*(?:capa|layer|parede|pared|wall|paredes|walls|relleno|rellenos|infill|per[íi]metro|per[íi]metros|perimeter|perimeters|ams|mm)\b|\b(?:capa|layer|pared|pared|wall|paredes|walls|relleno|rellenos|infill|per[íi]metro|per[íi]metros|perimeter|perimeters|ams|altura|alturas|height|heights|perfil|perfiles|profile|profiles|soporte|supports?)\b|\b\d+\s*%|\b[\d.,]+\s*mm\b|\btodos los perfiles\b|\btodas (?:as |las )?impressoras\b/gi;

// Palabras que no sostienen un nombre: conectores y sustantivos vacíos.
const STOPWORD = /^(?:de|del|la|el|los|las|un|una|y|o|a|en|con|sin|para|por|the|and|or|of|for|aproximadamente|about|around)\.?$/i;
// El chino y el japonés no separan por espacios: se cuenta por caracteres.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/gu;

/** ¿El título de perfil describe el producto (y por tanto vale como nombre de variante)? */
export function isDescriptiveTitle(title) {
  const t = clean(title).replace(PROFILE_JARGON, " ");
  // Fuera cifras sueltas: "2 paredes" es jerga, "2 piezas" no, y eso lo decide el resto.
  const words = meaningful(t)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => !STOPWORD.test(w) && /\p{L}{3}/u.test(w));
  if (words.length >= 2) return true;
  return (t.match(CJK) || []).length >= 4;
}

/** La parte del título de perfil que describe el producto, sin jerga ("Sign", no "0,2 mm"). */
export function profileLabel(title) {
  // Solo se va la cifra que acompaña a la jerga ("2 paredes", "120% relleno"): el 10 de
  // "10 Minutes Sign" es el nombre del producto y se queda.
  const out = clean(title).replace(PROFILE_JARGON, " ")
    .replace(/\b\d+\b(?=\s*$)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
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
const MONOCOLOR = /single[\s-]?colou?r|monocrom|\bun\s*colou?r\b|(?:un|una|1)\s+[úu]nico\s+color|[úu]nico\s+colou?r|monocolou?r|单色/i;
const MULTICOLOR = /multi[\s-]?colou?r|several\s+colou?rs|full[\s-]?colou?r|(?:two|double|dual|2)[\s-]?colou?r|doble\s+color|bicolor|multicolor|多色|多彩/i;
// "Impresión multicolor en una bandeja": tras sacar el color queda "Impresión en una bandeja", que no nombra nada.
const COLOR_ONLY_ES = /^\s*(?:impresi[óo]n|impreso|coloreado|una?\s+impresi[óo]n)\b/i;

/**
 * Nombre de la variante tal como se lee en la lista: castellano llano, sin guiones
 * y sin tiempos (la hora, el peso y las placas ya salen en las pills de al lado).
 *   "Multicolor" · "Una sola placa" · "Versión grande" · "Cartel de 10 minutos"
 * Es un nombre distinto al del archivo .3mf, que sí es corto y con guion.
 * @param labels mapa título de perfil -> título ya traducido (data/variant-labels.json)
 */
export function variantDisplayName(file, labels = {}) {
  const f = file || {};
  const raw = clean(f.meta?.profile_title);
  const filaments = (f.meta?.plates || []).flatMap((p) => p.filaments || []);
  const types = [...new Set(filaments.map((x) => x.type).filter(Boolean))];
  const colors = [...new Set(filaments.map((x) => x.color).filter(Boolean))];
  const out = [];
  // 1) Si el perfil nombra la variante ("10 Minutes Sign", "Larger GTA VI"), manda su traducción.
  const translated = labels[raw];
  if (translated) {
    const t = clean(translated).replace(/[·|/\-–—]+/g, " ");
    if (meaningful(t).length >= 3) return normalizeVariantLabel(t);
  }
  // 2) Color: multicolor o monocromo. Un hex suelto ("#CACDA0") no le dice nada al usuario.
  if (colors.length > 1 || MULTICOLOR.test(raw)) out.push("Multicolor");
  else if (MONOCOLOR.test(raw)) out.push("Monocromo");
  // 3) Material, cuando el modelo se ofrece en varios.
  if (types.length === 1) out.push(`Impresión en ${types[0].toUpperCase()}`);
  // 4) Cómo viene el pieza: suelta o montada en una placa.
  if (OUTPIECES.test(raw)) out.push("Piezas sueltas");
  else if (ONPLATE.test(raw)) out.push("Una sola placa");
  // 5) Tamaño de la versión (la altura y la escala son del producto, no del laminado).
  if (/\bmini\b|\bpeque[ñn]\w*|\bsmall\b|\btiny\b|\bcompact\w*/i.test(raw)) out.push("Versión mini");
  else if (/\blarge\b|\bgrande\b|\bbig\b|\bgrande\w*|\bscaled up\b|\bscaled\b|\bversi[óo]n\s+grande/i.test(raw)) out.push("Versión grande");
  if (!out.length) return "Versión estándar";
  // "Monocromo" + "Versión mini" -> "Monocromo versión mini": en castellano el rótulo va en minúsculas.
  return out.map((p, i) => (i ? p[0].toLowerCase() + p.slice(1) : p)).join(" ");
}

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

// Cómo trae las piezas el perfil: sueltas o montadas en una placa.
const OUTPIECES = /separate\s*parts?|piezas?\s+separadas?|\bseparadas?\b|un\s*connected|each\s+part/i;
const ONPLATE = /all\s*parts?\s*(?:on|in)?\s*(?:a\s*)?(?:one|single)\s*plate|one\s*plate|single\s*plate|una\s+sola\s+placa|en\s+una\s+placa|connected\s*plate/i;

/**
 * Deja el nombre de variante en castellano llano: el color se dice con una sola palabra
 * ("Multicolor", "Monocromo") y fuera las horas, que ya salen en las pills de al lado.
 */
export function normalizeVariantLabel(text) {
  let t = clean(text);
  // El color manda: "Impresión multicolor en una bandeja" se lee mejor como "Multicolor".
  // "un solo color", "única color" y "one colour" son la misma idea que "monocolor".
  // Ojo: \b no funciona con "Ú" en mayúscula (\w es ASCII), así que "ÚNICA COLOR" va sin \b.
  const solo = /\b(?:un|una|1)\s+(?:solo|s[óo]lo|[úu]nico)\s+colou?r\b|\bcolou?r\s+[úu]nic[ao]\b|[úu]nic[ao]\s+colou?r/i;
  if (MULTICOLOR.test(t)) return "Multicolor";
  // "PETG monocolor" son las dos cosas: material y color, y las dos son útiles.
  if (MONOCOLOR.test(t) || solo.test(t)) {
    const mat = t.match(/\b(PETG|PLA|ABS|ASA|TPU|PA|NYLON)\b/i);
    return mat ? `Monocromo en ${mat[1].toUpperCase()}` : "Monocromo";
  }
  // "Un solo color - Tamaño completo" sí dice algo más: se queda solo con esa parte.
  if (solo.test(t)) t = t.replace(solo, "Monocromo");
  // Las horas ya salen en la pill de al lado: fuera ("de 4 horas", "1 hora para imprimir").
  t = t.replace(/\b\d+\s*(?:h|hora\w*|hours?)\b[^,;.!?]*/gi, " ")
    .replace(/\bpara\s+imprimir\b/gi, " ")
    .replace(/\bimpresi[óo]n\s+en\s+una?\s+(?:bandeja|plancha|disco)\b/gi, " ")
    // "PETG - MAS RESISTENTE -": el grito del fabricante no es el nombre de la variante.
    .replace(/\b(?:PERO\s+RESISTENTE|M[ÁA]S\s+RESISTENTE|resistente)\b/gi, " ")
    .replace(/\b(?:muy\s+resistente|super\s+resistente|ultra\s*resistente)\b/gi, " ")
    // "Impresión en PLA versión mini" -> "PLA versión mini": "Impresión en" no aporta.
    .replace(/^Impresi[óo]n\s+en\s+/i, "")
    .replace(/[·|]+/g, " ")
    // Lo que se va deja puntuación colgando: "PETG - MAS RESISTENTE -" -> "PETG - -".
    .replace(/(?:\s*[-–—]\s*){2,}/g, " ")
    .replace(/\s*([,.;:]|[-–—])\s*$/g, "")
    .replace(/^[·|,.\s-]+/, "")
    .replace(/\s*,\s*(?=[,.;])|^[·|,.\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Lo que queda puede ser solo relleno ("Impresión", "Aproximadamente"): no es un nombre.
  const words = t.split(/\s+/).filter((w) => !FILLER.test(w.replace(/[^\p{L}\p{N}]/gu, "")) && /\p{L}{3}/u.test(w));
  if (!words.length || COLOR_ONLY_ES.test(t)) return "Versión estándar";
  return t[0].toUpperCase() + t.slice(1);
}

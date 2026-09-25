// Texto publicado en español y saneado: sin HTML, emojis, URLs ni inglés.
// Traducción por código (endpoint gratuito gtx de Google) + glosario + regex. Sin LLM.
import fs from "node:fs";
import path from "node:path";

// Términos que nunca se traducen (marcas, consolas, juegos, materiales, impresoras).
export const GLOSSARY = [
  "Grand Theft Auto VI", "Grand Theft Auto", "GTA VI", "GTA 6", "GTA V", "GTA6", "GTA", "Vice City", "Los Santos",
  "iPhone", "iPad", "AirPods", "AirTag", "Apple Watch", "MagSafe", "Apple", "Pro Max",
  "Samsung", "Galaxy", "Google Pixel", "Pixel", "Xiaomi", "Redmi", "Motorola", "OnePlus", "Huawei",
  "Nintendo Switch 2", "Nintendo Switch", "Switch OLED", "Switch", "Joy-Con", "Nintendo", "GameCube", "Game Boy",
  "PlayStation 5", "PlayStation", "PS5 Pro", "PS5", "PS4", "DualSense", "DualShock",
  "Xbox Series X", "Xbox Series S", "Xbox", "Steam Deck", "ROG Ally", "Meta Quest",
  "Bambu Lab", "Bambu", "MakerWorld", "IKEA", "SKÅDIS", "Gridfinity", "DIN", "AMS", "PLA", "PETG", "TPU", "ABS", "ASA", "LED", "USB-C", "USB",
  "A1 mini", "A1", "X1 Carbon", "X1C", "X1E", "P1S", "P1P", "P2S", "H2D", "H2S",
];
const GLOSS_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${[...GLOSSARY].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

// Limpieza determinista: HTML, entidades, URLs, emojis/iconos, espacios.
export function sanitize(text) {
  if (text == null) return "";
  return String(text)
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENTITIES[e.toLowerCase()] ?? " ";
    })
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/(?!°)[\p{Extended_Pictographic}\p{So}\p{Co}‍️︎⃣]/gu, "")
    .replace(/[★☆•●■□▪▫►▶◆◇※→←↑↓✓✔✗✘|]+/g, " ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

// Palabras frecuentes que solo existen en inglés (no en español).
const EN_WORDS = new Set(("the and with for you your this that these those is are was were be been of to it its in on at by from " +
  "print printed printing printer case cover holder stand box mount support supports keychain wall art lamp version " +
  "without please thanks thank enjoy use using used make made can will should would just only also more easy fast " +
  "new all one two three layer layers walls infill plate plates color colors single dual tray organizer " +
  "storage hook shelf drawer insert set kit part parts piece pieces size small large big mini top bottom side left right " +
  "which what when where how here there if not no yes or but so than then my our we they he she him her them their " +
  "inspired design designed model models file files profile profiles fit fits perfect great cool nice best better").split(" "));
// Palabras que también son españolas y no delatan inglés.
const ES_OK = new Set("no mini set kit use top".split(" "));

// Heurística: ¿queda inglés detectable? (ignora términos del glosario).
export function looksEnglish(text) {
  const words = sanitize(text).replace(GLOSS_RE, " ").toLowerCase().match(/\p{L}+/gu) || [];
  if (!words.length) return false;
  const hits = words.filter((w) => EN_WORDS.has(w) && !ES_OK.has(w)).length;
  return words.length <= 3 ? hits >= 1 && hits / words.length >= 0.5 : hits >= 2 && hits / words.length >= 0.15;
}

const CANON = new Map(GLOSSARY.map((t) => [t.toLowerCase(), t]));
const canon = (m) => CANON.get(m.toLowerCase()) ?? m;
const ES_WORDS = new Set("de para con el la los las y del por sin una un que tu su es al se o en como más".split(" "));
const PT_WORDS = new Set("com uma ao do da dos das em não nao você suporte controle capa para-choque porta-copos".split(" "));
// ¿Ya está en español? (tildes/ñ o palabras funcionales españolas, y sin inglés detectable).
export function looksSpanish(text) {
  const words = sanitize(text).replace(GLOSS_RE, " ").toLowerCase().match(/\p{L}+/gu) || [];
  if (!words.length || looksEnglish(text)) return false;
  if (words.some((w) => PT_WORDS.has(w) || /ção|ções|ões|ã/.test(w))) return false;
  const hits = words.filter((w) => ES_WORDS.has(w) || /[ñáéíóú¿¡]/.test(w)).length;
  return words.length <= 4 ? hits >= 1 : hits / words.length >= 0.12;
}
// Idiomas que se confunden con español en textos cortos: ahí manda el detector de Google.
const ROMANCE = new Set(["pt", "it", "ca", "gl", "fr"]);

function protect(text) {
  const keep = [];
  const out = text.replace(GLOSS_RE, (m) => `ZQ${keep.push(canon(m)) - 1}Z`);
  return { out, keep };
}
const restore = (text, keep) => text.replace(/ZQ\s?(\d+)\s?Z/gi, (m, i) => keep[+i] ?? "");
const glossIn = (text) => [...new Set((text.match(GLOSS_RE) || []).map((m) => canon(m).toLowerCase()))];
// Correcciones propias de vocabulario de impresión 3D que el traductor confunde.
const FIXES = [
  [/dock/i, /\bmuelles?\b/gi, "base"],
  [/fillet/i, /\bfiletes?\b/gi, "redondeo"],
  [/\bcase\b/i, /\b(caja|estuche) (esqueleto|protectora)\b/gi, "funda $2"],
  [/\bcase\b/i, /\bcaso\b/gi, "funda"],
  [/\bcase\b/i, /\bCaso\b/g, "Funda"],
];
const fix = (src, es) => {
  let t = FIXES.reduce((acc, [when, re, to]) => (when.test(src) ? acc.replace(re, to) : acc), es).replace(GLOSS_RE, canon);
  // etiquetas cortas: sin artículo inicial que el original no tenía ("carcasa" -> "la carcasa")
  if ((src.match(/\p{L}+/gu) || []).length <= 3 && !/^(the|el|la|los|las)\b/i.test(src)) t = t.replace(/^(el|la|los|las) /i, "");
  return t;
};

// Caché en disco (.tmp/, ignorado por git) para no repetir llamadas.
const CACHE_FILE = path.join(path.dirname(path.dirname(path.dirname(new URL(import.meta.url).pathname))), ".tmp", "translate-cache.json");
let cache = null;
const loadCache = () => (cache ??= fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {});
export function saveCache() {
  if (!cache) return;
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

// gtx da mejor calidad; si Google lo limita (429) se usa el endpoint dict-chrome-ex un rato.
let gtxBlockedUntil = 0;
let last = Promise.resolve();
const throttle = () => (last = last.then(() => new Promise((ok) => setTimeout(ok, 120))));
async function gtx(text, fetchFn) {
  const q = encodeURIComponent(text);
  for (let attempt = 0; attempt < 6; attempt++) {
    await throttle();
    const useGtx = Date.now() > gtxBlockedUntil;
    const url = useGtx
      ? `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${q}`
      : `https://translate.googleapis.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=es&q=${q}`;
    const r = await fetchFn(url).catch(() => null);
    if (r?.ok) {
      const j = await r.json();
      if (useGtx) return { text: (j[0] || []).map((s) => s[0]).join(""), lang: j[2] };
      const [t, lang] = Array.isArray(j[0]) ? j[0] : [j[0], ""];
      return { text: t, lang };
    }
    if (r?.status === 429 && useGtx) { gtxBlockedUntil = Date.now() + 10 * 60_000; continue; }
    await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt));
  }
  throw new Error("traductor no disponible");
}

// Devuelve el texto en español saneado, o "" si no se logra quitar el inglés (no se publica en inglés).
// curated=true (copy ya revisado): textos cortos solo se traducen si hay señal clara de otro idioma,
// porque el detector falla con palabras sueltas ("mesa" -> inglés).
const LATIN_LIKE = new Set(["es", "en", "pt", "gl", "eo", "ca", "it", "la"]);
const FOREIGN_CHARS = /[ßäöåøçãõœæ]|[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/iu;
export async function toEs(text, { fetchFn = fetch, curated = false } = {}) {
  const clean = sanitize(text);
  if (!clean || !/\p{L}/u.test(clean)) return clean;
  const c = fetchFn === fetch ? loadCache() : {}; // tests con fetch simulado no tocan la caché real
  const key = curated ? `c:${clean}` : clean;
  if (c[key] !== undefined) return c[key];
  let result = "";
  // gtx acepta ~5000 caracteres por petición; se trocea por párrafos.
  const chunks = clean.slice(0, 4800).split(/\n\n/);
  const parts = [];
  for (const chunk of chunks) {
    if (looksSpanish(chunk)) { parts.push(chunk.replace(GLOSS_RE, canon)); continue; }
    const { out, keep } = protect(chunk);
    const terms = glossIn(chunk);
    let done = null;
    // 1) traducción natural; 2) si pierde un término del glosario, con términos protegidos; 3) en minúsculas.
    for (const attempt of [chunk, out, out.toLowerCase()]) {
      const t = await gtx(attempt, fetchFn);
      // Si Google detecta español se confía en el original; la heurística solo juzga lo traducido.
      const short = (chunk.match(/\p{L}+/gu) || []).length <= 3;
      const keepCurated = curated && short && !looksEnglish(chunk) && !FOREIGN_CHARS.test(chunk) && LATIN_LIKE.has(t.lang);
      if (t.lang === "es" || keepCurated || (looksSpanish(chunk) && !ROMANCE.has(t.lang))) { done = chunk.replace(GLOSS_RE, canon); break; }
      const es = fix(chunk, sanitize(restore(t.text, keep)));
      const lost = terms.some((g) => !es.toLowerCase().includes(g));
      if (!lost && !looksEnglish(es)) { done = es; break; }
    }
    parts.push(done ?? "");
  }
  result = parts.filter(Boolean).join("\n\n");
  c[key] = result;
  return result;
}

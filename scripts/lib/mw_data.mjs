// Lógica pura sobre datos de MakerWorld: perfiles de impresión, clasificación y tamaños de imagen.
import fs from "node:fs";

// Etiquetas ES de las categorías base (las nuevas se guardan en categories_es.json).
export const BASE_LABELS = {
  "phone-cases": "Fundas de teléfono",
  "console-cases": "Accesorios de consola",
  automotive: "Automotriz",
  bathroom: "Baño",
  bedroom: "Dormitorio",
  decor: "Decoración",
  "home-organization": "Organización del hogar",
  kitchen: "Cocina",
  repair: "Reparación y herramientas",
  science: "Ciencia y educación",
  "gta-vi": "Accesorios GTA VI",
};

// Reglas en orden de prioridad; la primera que coincide gana. Lo demás cae en "decor".
const RULES = [
  ["phone-cases", /\b(iphone|samsung|galaxy s\d|pixel \d|xiaomi|redmi|phone ?case|funda (de )?(movil|móvil|celular|telefono|teléfono)|airpods|magsafe)\b/i],
  ["console-cases", /\b(ps[45]|playstation|dualsense|dualshock|xbox|nintendo|switch (oled|lite|2|dock|case)|joy-?con|steam deck|gamecube|game ?boy|controller|mando|gamepad|console|consola)\b/i],
  ["decor", /\b(decor|decoration|decorazione|decoración|wall art|lamp|lampe|lightbox|light box|leuchtkasten|lithophane|litophane|keychains?|keyrings?|key ?chain|portachiavi|llavero|figure|figurine|statue|bust|diorama|sign|poster|clock|horloge|funko|ornament|vase|plaque|bookmark|magnets?|trophy|art)\b/i],
  ["automotive", /\b(dashboard|cup ?holder|vehicle|truck|air ?vent|car (mount|holder|phone|organizer|interior|seat|trash)|bmw|toyota|tesla|volkswagen|carro|coche)\b/i],
  ["kitchen", /\b(kitchen|cocina|spice|egg|mug|coffee|cafe|café|utensil|cutlery|knife|fridge|bottle opener|cookie cutter)\b/i],
  ["bathroom", /\b(bath|bathroom|shower|toothbrush|soap|toilet|towel|baño|ducha)\b/i],
  ["bedroom", /\b(bed|bedroom|nightstand|headphone|headset|pillow|dormitorio)\b/i],
  ["repair", /\b(tool|tools|clamp|repair|screw|jig|wrench|drill|herramienta|toolbox)\b/i],
  ["science", /\b(science|molecule|dna|anatomy|education|educational|math|physics|chemistry|ciencia)\b/i],
  ["home-organization", /\b(organizer|organiser|storage|drawer|shelf|rack|hook|cable|desk|holder|tray|gridfinity|box|organizador)\b/i],
];

// Nombres propios que engañan a las reglas ("Grand Theft Auto" no es automotriz).
const NOISE = /gran[d]? theft auto|\bgta\s*(vi|v|6|5)?\b|vice city|los santos/gi;
const GTA_VI = /\b(gta\s*(vi|6)|grand theft auto\s*(vi|6)|vice city|los santos)\b/i;

// Clasifica por título primero, luego etiquetas y por último la categoría de MakerWorld.
export function classify({ title = "", titleTranslated = "", tags = [], categories = [] } = {}) {
  const layers = [[title, titleTranslated], tags || [], (categories || []).map((c) => c?.name ?? c)];
  if (layers.flat().some((value) => GTA_VI.test(String(value)))) return "gta-vi";
  for (const layer of layers) {
    const text = layer.join(" ").replace(NOISE, " ");
    for (const [slug, re] of RULES) if (re.test(text)) return slug;
  }
  return "decor";
}

// Tópico libre: un resultado es relevante si contiene todas las palabras (≥3 letras) de alguna variante del término.
export function relevant(hit, variants) {
  const text = [hit.title, hit.titleTranslated, ...(hit.tags || [])].join(" ").toLowerCase();
  return variants.some((v) => v.toLowerCase().split(/\s+/).filter((w) => w.length >= 3).every((w) => text.includes(w)));
}

// instances[] del diseño -> metadatos de perfil para files[] (contrato con la UI).
export function parseProfiles(design) {
  const owner = design?.designCreator?.uid;
  const list = (design?.instances || []).map((i) => {
    const info = i.extention?.modelInfo || {};
    const printers = [info.compatibility, ...(info.otherCompatibility || [])]
      .map((c) => c?.devProductName).filter(Boolean);
    return {
      instance_id: String(i.id),
      title: i.titleTranslated || i.title || "",
      cover: i.cover || "",
      print_time_h: i.prediction ? Math.round((i.prediction / 3600) * 10) / 10 : null,
      plates: (info.plates || []).length || null,
      rating: i.ratingCount ? Math.round((i.ratingScoreTotal / i.ratingCount) * 10) / 10 : null,
      rating_count: i.ratingCount || 0,
      by_designer: owner != null && i.instanceCreator?.uid === owner,
      printers: [...new Set(printers)],
      default: Boolean(i.isDefault) || String(i.id) === String(design.defaultInstanceId),
    };
  });
  if (list.length && !list.some((p) => p.default)) list[0].default = true;
  return list;
}

// Ancho y alto reales leyendo solo la cabecera (JPEG, PNG, WebP, GIF). null si no se reconoce.
export function imageSize(file) {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(256 * 1024);
  const n = fs.readSync(fd, b, 0, b.length, 0);
  fs.closeSync(fd);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString("ascii", 0, 3) === "GIF") return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === "VP8L") { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
    if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    // ponytail: busca el SOF dentro de los primeros 256 KB; EXIF gigantes darían null.
    let i = 2;
    while (i + 9 < n) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

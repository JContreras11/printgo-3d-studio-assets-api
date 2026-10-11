// Normalización de licencias de MakerWorld. Solo se publica lo que el creador autorizó
// explícitamente para uso comercial de terceros: CC0/dominio público y CC BY (con atribución).
// Todo lo demás — NC, ND, SA, Standard Digital File License, MakerWorld Exclusive, sin
// licencia o desconocido — queda fuera de la API. Denegación por defecto: lo que no se
// reconoce no se publica.
// Valores reales observados en api/model/*.json (auditoría 2026-10-11):
//   "CC BY 4", "Public Domain / CC0", "CC0", "BY", "BY-SA", "BY-ND", "BY-NC", "BY-NC-SA",
//   "BY-NC-ND", "Standard Digital File License", "Standard Digital File License - Community Use",
//   "MakerWorld Exclusive License", "" — dos formatos: largos ("CC BY 4") y códigos ("BY-NC").
export function normalizeLicense(raw) {
  const s = String(raw ?? "").trim();
  const low = s.toLowerCase();
  if (!s) return { id: "unknown", label: "(sin licencia)", publishable: false };
  if (low === "cc0" || low.includes("public domain")) return { id: "cc0", label: s, publishable: true };
  if (low.includes("standard digital file license")) return { id: "standard", label: s, publishable: false };
  if (low.includes("makerworld exclusive")) return { id: "exclusive", label: s, publishable: false };
  // Familia Creative Commons: "CC BY 4", "CC BY-NC-SA", "BY", "BY-ND", "cc by-sa 4.0",
  // "Creative Commons Attribution-NonCommercial 4.0"…
  const cc = low.replace(/^creative commons\s+/, "cc ").replace(/^cc\s+/, "").replace(/attribution/g, "by").trim();
  if (/^by[\s-]/.test(cc) || cc === "by") {
    const flags = {
      nc: /\bnc\b|noncommercial|non-commercial/.test(cc),
      nd: /\bnd\b|noderivs|no derivatives/.test(cc),
      sa: /\bsa\b|sharealike|share-alike/.test(cc),
    };
    const mods = [flags.nc && "nc", flags.nd && "nd", flags.sa && "sa"].filter(Boolean).join("-");
    // NC impide el negocio; ND impide adaptar; SA obliga a heredar la licencia en derivados.
    return { id: mods ? `cc-by-${mods}` : "cc-by", label: s, publishable: !mods };
  }
  return { id: "unknown", label: s, publishable: false };
}

export const isPublishable = (raw) => normalizeLicense(raw).publishable;

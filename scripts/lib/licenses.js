// License allowlist + normalizer for the asset library.
//
// PrintGo will redistribute assets inside a public GitHub static library, so we may only
// store models whose license EXPLICITLY permits download + redistribution.
//
// Policy: FAIL CLOSED. A license that is missing, unknown, or ambiguous is rejected.

export const ALLOWED = {
  CC0: { redists: true, attribution: false, label: "CC0 / Public Domain", spdx: "CC0-1.0" },
  BY: { redists: true, attribution: true, label: "CC BY 4.0", spdx: "CC-BY-4.0" },
  "BY-SA": { redists: true, attribution: true, label: "CC BY-SA 4.0", spdx: "CC-BY-SA-4.0" },
};

// MakerWorld exposes license names like "CC BY 4.0", "CC BY-NC-SA 4.0", "Public Domain",
// "Standard Digital File License". Map them to our normalized keys.
const MAKERWORLD_ALIASES = {
  "public domain": "CC0",
  "cc0": "CC0",
  "cc by": "BY",
  "cc-by": "BY",
  "cc by 4.0": "BY",
  "cc-by-4.0": "BY",
  "cc by-sa": "BY-SA",
  "cc by-sa 4.0": "BY-SA",
  "cc-by-sa": "BY-SA",
  "cc-by-sa-4.0": "BY-SA",
};

const REJECTED_HINTS = [
  /nc/i,
  /non-?commercial/i,
  /nd/i,
  /no derivatives/i,
  /standard digital file/i,
  /free standard/i,
  /personal use/i,
  /private use/i,
];

// Normalize a raw license string from an arbitrary source. Returns null when the license
// is not on the allowlist (or unparseable). Throws nothing.
export function normalizeLicense(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  // Reject-first: any explicit restriction hint disqualifies the model.
  if (REJECTED_HINTS.some((re) => re.test(s))) return null;

  const lower = s.toLowerCase();
  const key = Object.keys(MAKERWORLD_ALIASES).find((k) => lower.includes(k.toLowerCase()));
  if (key) return { key: MAKERWORLD_ALIASES[key], raw: s, ...ALLOWED[MAKERWORLD_ALIASES[key]] };

  return null;
}

// Build the attribution string for a model's manifest.
export function attributionFor({ creatorName, normalized }) {
  if (!normalized) return "";
  const name = creatorName || "Unknown creator";
  if (normalized.attribution) {
    return `"${name}" is licensed under ${normalized.label} (${normalized.spdx}) by ${name}. ` +
      `Portions of this model may be subject to additional terms; see source URL.`;
  }
  return `${name} — released into the public domain (${normalized.label}).`;
}
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLicense, isPublishable } from "../scripts/lib/license.mjs";

// Los 14 valores reales observados en api/model/*.json (auditoría 2026-10-11).
const REALES = {
  "CC BY 4": { id: "cc-by", publishable: true },
  "Public Domain / CC0": { id: "cc0", publishable: true },
  "CC0": { id: "cc0", publishable: true },
  "BY": { id: "cc-by", publishable: true },
  "BY-SA": { id: "cc-by-sa", publishable: false },
  "BY-ND": { id: "cc-by-nd", publishable: false },
  "BY-NC": { id: "cc-by-nc", publishable: false },
  "BY-NC-SA": { id: "cc-by-nc-sa", publishable: false },
  "BY-NC-ND": { id: "cc-by-nc-nd", publishable: false },
  "Standard Digital File License": { id: "standard", publishable: false },
  "Standard Digital File License - Community Use": { id: "standard", publishable: false },
  "MakerWorld Exclusive License": { id: "exclusive", publishable: false },
  "": { id: "unknown", publishable: false },
};

test("normalizeLicense: los 14 valores reales del catálogo", () => {
  for (const [raw, want] of Object.entries(REALES)) {
    const got = normalizeLicense(raw);
    assert.equal(got.id, want.id, `id para "${raw}"`);
    assert.equal(got.publishable, want.publishable, `publishable para "${raw}"`);
  }
});

test("normalizeLicense: variantes futuras del mismo formato", () => {
  assert.deepEqual(pick(normalizeLicense("CC BY 4.0")), { id: "cc-by", publishable: true });
  assert.deepEqual(pick(normalizeLicense("cc by-sa 4.0")), { id: "cc-by-sa", publishable: false });
  assert.deepEqual(pick(normalizeLicense("CC BY-NC 3.0")), { id: "cc-by-nc", publishable: false });
  assert.deepEqual(pick(normalizeLicense("Creative Commons Attribution 4.0")), { id: "cc-by", publishable: true });
  assert.deepEqual(pick(normalizeLicense("Creative Commons Attribution-NonCommercial 4.0")), { id: "cc-by-nc", publishable: false });
});

test("isPublishable: denegación por defecto ante lo desconocido", () => {
  assert.equal(isPublishable("CC BY 4"), true);
  assert.equal(isPublishable("Una licencia nueva que no conocemos"), false);
  assert.equal(isPublishable(undefined), false);
  assert.equal(isPublishable(null), false);
});

function pick({ id, publishable }) {
  return { id, publishable };
}

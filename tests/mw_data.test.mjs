import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classify, parseProfiles, imageSize } from "../scripts/lib/mw_data.mjs";

test("clasificador de tópico", () => {
  assert.equal(classify({ title: "gta 6 iphone 16 case" }), "phone-cases");
  assert.equal(classify({ title: "GTA VI Universal PS5 & Xbox Controller Stand" }), "console-cases");
  assert.equal(classify({ title: "Grand Theft Auto VI Logo Keychain" }), "decor"); // "Auto" no es automotriz
  assert.equal(classify({ title: "GTA 6 Headphone Stand" }), "bedroom");
  assert.equal(classify({ title: "Cosa rara", tags: ["spice rack"] }), "kitchen");
  assert.equal(classify({ title: "Nada" }), "decor");
});

test("parser de perfiles (instances[] de MakerWorld)", () => {
  const design = {
    designCreator: { uid: 1 },
    defaultInstanceId: 20,
    instances: [
      { id: 10, title: "0.2mm layer", prediction: 8640, ratingScoreTotal: 9, ratingCount: 2, instanceCreator: { uid: 1 }, cover: "c.jpg",
        extention: { modelInfo: { compatibility: { devProductName: "P1S" }, otherCompatibility: [{ devProductName: "A1" }, { devProductName: "P1S" }], plates: [{}, {}] } } },
      { id: 20, title: "Otro", titleTranslated: "Other", prediction: 0, ratingCount: 0, instanceCreator: { uid: 2 }, extention: {} },
    ],
  };
  const [a, b] = parseProfiles(design);
  assert.deepEqual(a, { instance_id: "10", title: "0.2mm layer", cover: "c.jpg", print_time_h: 2.4, plates: 2, rating: 4.5, rating_count: 2, by_designer: true, printers: ["P1S", "A1"], default: false });
  assert.equal(b.default, true);
  assert.equal(b.title, "Other");
  assert.equal(b.by_designer, false);
});

test("imageSize lee cabecera PNG", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000003e8000002ee08060000", "hex");
  const f = path.join(os.tmpdir(), "t.png");
  fs.writeFileSync(f, Buffer.concat([png, Buffer.alloc(64)]));
  assert.deepEqual(imageSize(f), [1000, 750]);
});

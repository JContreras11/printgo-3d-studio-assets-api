import test from "node:test";
import assert from "node:assert/strict";
import { projectFileName, shortName, cleanTitle, variantLabel, variantDisplayName, normalizeVariantLabel, isDescriptiveTitle, profileLabel } from "../scripts/lib/names.mjs";

test("el nombre del archivo sale del proyecto, no del perfil del laminador", () => {
  // Lo que hoy se ve en pantalla: "Serie iPhone14 0,2 mm de altura del piso, 2 paredes, 15 % de relleno"
  assert.equal(projectFileName("Funda para iPhone 14", { total: 1 }), "funda-iphone");
  assert.equal(projectFileName("Funda de cota de malla para iPhone 13-15", { total: 1 }), "funda-cota");
});

test("varias variantes se numeran y no se pisan", () => {
  const names = [0, 1, 2].map((index) => projectFileName("Porta-moñas Brontosaurio", { total: 3, index }));
  assert.deepEqual(names, ["porta-monas-1", "porta-monas-2", "porta-monas-3"]);
  assert.equal(new Set(names).size, 3);
});

test("sin palabras útiles cae a la categoría", () => {
  assert.equal(projectFileName("El de la", { category: "decor", total: 1 }), "decor");
  assert.equal(projectFileName("", { category: "home-organization", total: 1 }), "home-organization");
});

test("la variante muestra su variación: color, material y tiempo", () => {
  const multi = { meta: { plates: [{ filaments: [{ type: "PLA", color: "#0078BF" }, { type: "PLA", color: "#FFFFFF" }] }] } };
  assert.equal(variantLabel(multi), "pla-multicolor");
  const mono = { print_time_h: 0.9, meta: { profile_title: "Mini single color version -0.12mm layer, 2 walls, 10% infill" } };
  assert.equal(variantLabel(mono), "monocolor-54min");
  // 3,3 h son 198 min exactos: el tiempo no se recorta ni se inventa.
  assert.equal(variantLabel({ print_time_h: 3.3 }), "3h18");
  assert.equal(variantLabel({ print_time_h: 14.4 }), "14h24");
});

test("la variante no muestra lo técnico: ni mm, ni relleno, ni AMS", () => {
  const file = { print_time_h: 2, meta: { profile_title: "Capa de 0,2 mm, 3 paredes, 25% de relleno AMS" } };
  assert.equal(variantLabel(file), "2h");
});

test("el nombre de variante es castellano llano, sin horas ni guiones", () => {
  // El color se dice con una palabra, sin repetitions del traductor automático.
  assert.equal(normalizeVariantLabel("un solo color"), "Monocromo");
  assert.equal(normalizeVariantLabel("Versión ÚNICA COLOR"), "Monocromo");
  assert.equal(normalizeVariantLabel("Impresión multicolor en una bandeja"), "Multicolor");
  assert.equal(normalizeVariantLabel("Two color"), "Multicolor");
  // Material + color: las dos cosas son útiles para quien va a imprimir.
  assert.equal(normalizeVariantLabel("PETG monocolor"), "Monocromo en PETG");
  // La hora ya sale en la pill de al lado: se quita, pero el color se queda.
  assert.equal(normalizeVariantLabel("Impresión monocolor de 1 hora"), "Monocromo");
  // Un nombre de producto se respeta tal cual, con su mayúscula.
  assert.equal(normalizeVariantLabel("10 minutos"), "10 minutos");
  assert.equal(normalizeVariantLabel("GTA VI frontal"), "GTA VI frontal");
  assert.equal(normalizeVariantLabel("Versión del protector de pantalla"), "Versión del protector de pantalla");
});

test("el nombre de variante no es el nombre del archivo", () => {
  const file = { print_time_h: 0.9, meta: { profile_title: "Mini single color version" } };
  // El archivo lleva material y tiempo; el rótulo, solo lo que el usuario nota.
  // El perfil dice "single color" y "mini": las dos se dicen, la hora no.
  assert.equal(variantDisplayName(file), "Monocromo versión mini");
  assert.equal(projectFileName("Perro pastor alemán de punto", { total: 7, index: 5, file }), "perro-pastor-monocolor-54min");
  // Sin datos propios, y sin traducción, se dice lo mínimo sin inventar.
  assert.equal(variantDisplayName({ meta: { profile_title: "Capa de 0,2 mm, 2 paredes" } }), "Versión estándar");
  // Las piezas sueltas o montadas sí distinguen una variante de otra.
  assert.equal(variantDisplayName({ meta: { profile_title: "Separate Parts, 0.12mm layer" } }), "Piezas sueltas");
  assert.equal(variantDisplayName({ meta: { profile_title: "All Parts on One Plate" } }), "Una sola placa");
});

test("el nombre de archivo lleva la variación, no un número de variante", () => {
  const file = { print_time_h: 0.9, meta: { profile_title: "Mini single color version" } };
  assert.equal(
    projectFileName("Perro pastor alemán de punto", { total: 7, index: 5, file }),
    "perro-pastor-monocolor-54min",
  );
  // Sin datos humanos no hay nada que mostrar: ahí sí, el índice.
  assert.equal(projectFileName("Soporte de parabrisas V4", { total: 3, index: 1 }), "soporte-parabrisas-2");
});

test("el título de perfil solo se traduce si describe el producto", () => {
  // Pura jerga: no se traduce, y encima no se publica.
  assert.equal(isDescriptiveTitle("0.2mm layer, 2 walls, 15% infill"), false);
  assert.equal(isDescriptiveTitle("Capa de 0,2 mm, 2 paredes, 15 % de relleno"), false);
  assert.equal(isDescriptiveTitle("todos los perfiles"), false);
  // Con algo de producto dentro, sí.
  assert.equal(isDescriptiveTitle("10 Minutes Sign"), true);
  assert.equal(isDescriptiveTitle("SM58 Size - scaled up to 120 percent with end nub"), true);
  // La jerga se quita antes de traducir, pero el 10 de "10 Minutes Sign" es el nombre.
  assert.equal(profileLabel("10 Minutes Sign"), "10 Minutes Sign");
  assert.equal(profileLabel("Separate Parts, 0.12mm layer, 2 walls, 10% infill"), "Separate Parts");
});

test("el nombre es ASCII y sin acentos", () => {
  assert.equal(shortName("Anatómico del torso"), "anatomico-torso");
  assert.equal(shortName("Los Tardígrados - 3 modelos"), "tardigrados-3");
});

test("el título conserva los tamaños que son del objeto", () => {
  assert.equal(cleanTitle("Gancho de puerta de 35 mm"), "Gancho de puerta de 35 mm");
  assert.equal(cleanTitle("Repisa de cama clipsable para marcos de 20 mm"), "Repisa de cama clipsable para marcos de 20 mm");
  assert.equal(cleanTitle("Funda hueca para Samsung S24+/S25/S25+ (MagSafe)"), "Funda hueca para Samsung S24+/S25/S25+ (MagSafe)");
});

test("el título sí pierde los ajustes de impresión", () => {
  assert.equal(cleanTitle("Nur AMS capa de 0,2 mm, 2 paredes, 15% de relleno"), "Nur AMS");
  // "Serie" es la línea de producto, no jerga: se conserva.
  assert.equal(cleanTitle("Serie iPhone14 0,2 mm de altura del piso, 2 paredes, 15 % de relleno"), "Serie iPhone14");
});

test("el título pierde el AMS y el relleno, que son ajustes de impresora", () => {
  assert.equal(cleanTitle("¡Gatito de Halloween! / SIN AMS"), "¡Gatito de Halloween!");
  assert.equal(cleanTitle("Arte El Payaso multiparte no AMS"), "Arte El Payaso multiparte");
  assert.equal(cleanTitle("Logotipo de GTA VI con AMS y SIN AMS"), "Logotipo de GTA VI");
  assert.equal(cleanTitle("Modelo del átomo de carbono (sin AMS)"), "Modelo del átomo de carbono");
  assert.equal(cleanTitle("Serie Goofy– Ojos Móviles PUMPKIN NOAMS HALLOWEEN"), "Serie Goofy– Ojos Móviles PUMPKIN HALLOWEEN");
  assert.equal(cleanTitle("Funda Infill para iPhone 14-17 (patrón de relleno visible)"), "Funda para iPhone 14-17");
  assert.equal(cleanTitle("Funda tipo open-design para iPhone 12-16 (densidad de relleno configurable)"), "Funda tipo open-design para iPhone 12-16");
});

test("el título conserva lo que SÍ es del producto", () => {
  // "boquilla anular de alta presión" es lacharacteristic del cabezal, no un ajuste del slicer.
  assert.equal(
    cleanTitle("Cabezal de ducha de masaje con arandela de pata de mascota, vibración de alta frecuencia, boquilla anular de alta presión"),
    "Cabezal de ducha de masaje con arandela de pata de mascota, vibración de alta frecuencia, boquilla anular de alta presión",
  );
  assert.equal(cleanTitle("Funda TPU personalizable para Samsung Galaxy S25 Ultra"), "Funda TPU personalizable para Samsung Galaxy S25 Ultra");
  assert.equal(cleanTitle("Modelo anatómico de torso humano"), "anatómico de torso humano");
});

test("si el título es solo jerga se conserva tal cual (nunca queda vacío ni «2 mm»)", () => {
  assert.equal(cleanTitle("Capa de 0,2 mm, 2 paredes, 15% de relleno"), "Capa de 0,2 mm, 2 paredes, 15% de relleno");
});

test("el renombrado no pisa archivos cuando dos se intercambian el nombre", async () => {
  // Regresión: renombrar en el sitio hacía que "a"->"b" y "b"->"a" se comieran un archivo,
  // y como build_api reconstruye files[] desde el disco, el modelo salía con un 3MF de menos.
  const { mkdtempSync, mkdirSync, writeFileSync, renameSync, readdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const modelDir = path.join(mkdtempSync(path.join(tmpdir(), "rename-")), "model");
  mkdirSync(modelDir);
  writeFileSync(path.join(modelDir, "a.3mf.xz"), "A");
  writeFileSync(path.join(modelDir, "b.3mf.xz"), "B");
  // Los dos pasos del script: primero a temporal, luego al nombre definitivo.
  const moves = [["a", "b"], ["b", "a"]];
  for (const [from, to] of moves) renameSync(path.join(modelDir, `${from}.3mf.xz`), path.join(modelDir, `${from}.3mf.xz.renaming`));
  for (const [from, to] of moves) renameSync(path.join(modelDir, `${from}.3mf.xz.renaming`), path.join(modelDir, `${to}.3mf.xz`));
  assert.deepEqual(readdirSync(modelDir).sort(), ["a.3mf.xz", "b.3mf.xz"], "ningún .3mf.xz puede perderse en el camino");
});

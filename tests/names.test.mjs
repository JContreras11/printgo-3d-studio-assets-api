import test from "node:test";
import assert from "node:assert/strict";
import { projectFileName, shortName, cleanTitle } from "../scripts/lib/names.mjs";

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

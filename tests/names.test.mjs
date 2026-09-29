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
  assert.equal(cleanTitle("Serie iPhone14 0,2 mm de altura del piso, 2 paredes, 15 % de relleno"), "iPhone14");
});

test("si el título es solo jerga se conserva tal cual (nunca queda vacío ni «2 mm»)", () => {
  assert.equal(cleanTitle("Capa de 0,2 mm, 2 paredes, 15% de relleno"), "Capa de 0,2 mm, 2 paredes, 15% de relleno");
});

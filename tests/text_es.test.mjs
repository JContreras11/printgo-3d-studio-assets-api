import test from "node:test";
import assert from "node:assert/strict";
import { sanitize, looksEnglish, looksSpanish, toEs } from "../scripts/lib/text_es.mjs";

// fetch simulado con la forma de respuesta de gtx: [[[traducción, original]], null, idioma]
const fakeFetch = (dict) => async (url) => {
  const q = decodeURIComponent(new URL(url).searchParams.get("q"));
  const [text, lang] = dict[q] ?? [q, "es"];
  return { ok: true, json: async () => [[[text, q]], null, lang] };
};

test("sanitize quita HTML, entidades, URLs y emojis", () => {
  assert.equal(sanitize("<p>Hola&nbsp;<b>mundo</b> 🔥 https://x.com/a</p>"), "Hola mundo");
  assert.equal(sanitize("Soporte ★★★ 90°"), "Soporte 90°");
  assert.equal(sanitize("Línea<br>dos"), "Línea\ndos");
});

test("heurística de idioma", () => {
  assert.equal(looksEnglish("Skeleton case for iPhone"), true);
  assert.equal(looksEnglish("Funda esqueleto para iPhone"), false);
  assert.equal(looksSpanish("Organizador de cables"), true);
  assert.equal(looksSpanish("Suporte para controle"), false); // portugués
});

test("toEs traduce y conserva el glosario", async () => {
  const fetchFn = fakeFetch({ "Nintendo Switch dock cover": ["Cubierta de muelle Nintendo Switch", "en"] });
  assert.equal(await toEs("Nintendo Switch dock cover 🎮", { fetchFn }), "Cubierta de base Nintendo Switch");
});

test("toEs reintenta protegiendo términos si el traductor los pierde", async () => {
  const fetchFn = fakeFetch({
    "Switch stand": ["Soporte de cambio", "en"],
    "ZQ0Z stand": ["Soporte ZQ0Z", "en"],
  });
  assert.equal(await toEs("Switch stand", { fetchFn }), "Soporte Switch");
});

test("toEs no publica inglés si no logra traducir", async () => {
  const fetchFn = fakeFetch({ "print the case with the holder": ["print the case with the holder", "en"] });
  assert.equal(await toEs("print the case with the holder", { fetchFn }), "");
});

test("toEs deja intacto el español ya curado", async () => {
  const fetchFn = async () => { throw new Error("no debería llamar"); };
  assert.equal(await toEs("Porta-moñas Brontosaurio", { fetchFn, curated: true }), "Porta-moñas Brontosaurio");
});

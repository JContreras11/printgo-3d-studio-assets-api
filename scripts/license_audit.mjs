#!/usr/bin/env node
// Auditoría de licencias de todo lo publicado (api/model/*.json). No toca nada: genera
// api-license-report.json con el estado publicable/cuarentena de cada modelo y los conteos
// por categoría y licencia. La retirada la ejecuta scripts/quarantine.mjs por fases.
// No requiere categories/ en disco: trabaja sobre la API publicada.
import fs from "node:fs";
import path from "node:path";
import { normalizeLicense } from "./lib/license.mjs";
import { ROOT } from "./build_api.mjs";

const MODEL_DIR = path.join(ROOT, "api", "model");

export function audit() {
  const models = [];
  for (const f of fs.readdirSync(MODEL_DIR).filter((x) => x.endsWith(".json"))) {
    const m = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, f), "utf8"));
    const lic = normalizeLicense(m.license);
    const size = m.total_size || (m.files || []).reduce((s, x) => s + (x.size || 0), 0);
    models.push({
      id: m.id, title: m.title, category: m.category, author: m.author,
      license: m.license, license_id: lic.id,
      status: lic.publishable ? "publishable" : "quarantine",
      files: (m.files || []).length, size,
    });
  }
  models.sort((a, b) => (a.category + a.id).localeCompare(b.category + b.id));

  const byCategory = {};
  for (const m of models) {
    const c = (byCategory[m.category] ??= { publishable: 0, quarantine: 0, total_size: 0, licenses: {} });
    c[m.status]++;
    c.total_size += m.size;
    c.licenses[m.license_id] = (c.licenses[m.license_id] || 0) + 1;
  }
  const byLicense = {};
  for (const m of models) byLicense[m.license_id] = (byLicense[m.license_id] || 0) + 1;

  const quarantineBytes = models.filter((m) => m.status === "quarantine").reduce((s, m) => s + m.size, 0);
  const report = {
    generated: new Date().toISOString(),
    policy: "publishable = CC0 / CC BY (uso comercial con atribución). Todo lo demás en cuarentena.",
    totals: {
      models: models.length,
      publishable: models.length - models.filter((m) => m.status === "quarantine").length,
      quarantine: models.filter((m) => m.status === "quarantine").length,
      quarantine_bytes: quarantineBytes,
    },
    by_license: byLicense,
    by_category: byCategory,
    notes: [
      "gta-vi: decisión del dueño (2026-10-11) mantenerla publicada tal cual. Riesgo documentado: casi toda la categoría es NC/ARR y la mayoría son personajes/marcas de terceros (Take-Two); un reclamo afectaría la categoría completa.",
      "Los blobs retirados por quarantine.mjs permanecen en el historial de git (raw de commits previos los sigue sirviendo). El borrado total exigiría reescribir la historia del repo: decisión pendiente.",
    ],
    models,
  };
  fs.writeFileSync(path.join(ROOT, "api-license-report.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`auditoría: ${report.totals.models} modelos · ${report.totals.publishable} publicables · ${report.totals.quarantine} en cuarentena (${(quarantineBytes / 1e9).toFixed(2)} GB)`);
  for (const [c, v] of Object.entries(byCategory)) {
    console.log(`  ${c.padEnd(18)} publicables ${String(v.publishable).padStart(3)} · cuarentena ${String(v.quarantine).padStart(3)} · ${(v.total_size / 1e9).toFixed(2)} GB`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) audit();

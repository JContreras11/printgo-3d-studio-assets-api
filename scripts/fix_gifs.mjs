// Re-downloads the ORIGINAL animated GIFs of every catalogue model: earlier runs fetched them through
// the CDN resize (?x-oss-process), which flattens a GIF to its first frame. Files keep their names
// (previews/NN.gif = design_pictures[NN-1]), so no JSON changes. Usage: node scripts/fix_gifs.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "api/index.json"), "utf8"));
let fixed = 0, bytes = 0;
for (const category of index.categories) {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, `api/categories/${category}.json`), "utf8"));
  for (const model of list.models) {
    const gifs = (model.images ?? []).filter((rel) => /\.gif$/i.test(rel));
    if (!gifs.length) continue;
    // curl passes MakerWorld's Cloudflare check where Node's fetch gets the challenge page.
    let design;
    try { design = JSON.parse(execFileSync("curl", ["-s", "-m", "30", "-A", "Mozilla/5.0", `https://makerworld.com/api/v1/design-service/design/${model.id}`]).toString()); }
    catch { console.log("api fail", model.id); continue; }
    const pictures = design.designExtension?.design_pictures?.map((picture) => picture.url) ?? [design.coverUrl];
    for (const rel of gifs) {
      const at = Number(rel.match(/(\d+)\.gif$/i)?.[1]) - 1;
      const url = pictures[at];
      if (!url || !/\.gif$/i.test(url.split("?")[0])) { console.log("skip", model.id, rel); continue; }
      const response = await fetch(url);
      if (!response.ok) { console.log("fail", model.id, rel, response.status); continue; }
      const data = Buffer.from(await response.arrayBuffer());
      const file = path.join(ROOT, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
      fixed += 1; bytes += data.length;
      console.log("ok", model.id, rel, `${(data.length / 1e6).toFixed(1)} MB`);
    }
  }
}
console.log(`${fixed} GIF animados restaurados, ${(bytes / 1e6).toFixed(1)} MB`);

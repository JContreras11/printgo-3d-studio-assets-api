// Parse MakerWorld model-page accessibility-tree text into structured metadata.
// Sees only what the a11y tree exposes (no screenshots, no credentials).

import { getTree, navigate, parseTree, findRow } from "./browser.js";

// Extract list items from an HTML link title like "link [Title](http://...)".
function parseLinkTitle(text) {
  const m = text.match(/link \[(.*?)\]\((https?:\/\/[^)]+)\)/);
  if (!m) return null;
  return { label: m[1], url: m[2] };
}

const PREVIEW_RE = /https:\/\/makerworld\.bblmw\.com\/makerworld\/model\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s<>]*)?/g;

export async function captureModelPage(url, { windowId, waitMs } = {}) {
  const tree = await navigate(url, { windowId, waitMs });
  const rows = parseTree(tree);

  const meta = {
    sourceUrl: url,
    title: null,
    author: null,
    authorUrl: null,
    licenseRaw: null,
    description: [],
    tags: [],
    printFileCount: null,
    printFileLabels: [],
    releasedOn: null,
    hasDownloadButton: false,
  };

  // Author link: MakerWorld author URLs look like https://makerworld.com/en/@handle
  for (const row of rows) {
    const link = parseLinkTitle(row.text);
    if (link && /makerworld\.com\/en\/@/.test(link.url)) {
      meta.author = link.label;
      meta.authorUrl = link.url;
      break;
    }
  }

  // Title: many pages render the title as a `container <Title>` whose child repeats it.
  // We look for a container row with a short-ish label right before the author link.
  const authorIdx = rows.findIndex((r) => r.text.includes(meta.authorUrl || "@@@none"));
  if (authorIdx > 0) {
    // Walk backwards to nearest sibling-level container that looks like a heading.
    for (let i = authorIdx - 1; i >= 0; i--) {
      const t = rows[i].text;
      if (/^container\s+[\w@&'\- ,.:/()[\]%!?]+$/.test(t) && t.length < 120 && t.length > 3 && !t.includes("http")) {
        meta.title = t.replace(/^container\s*/, "");
        break;
      }
    }
  }

  // License: the row right after a "heading License".
  const licHeading = findRow(rows, "heading License");
  if (licHeading) {
    const li = rows.findIndex((r) => r.index === licHeading.index);
    if (li >= 0 && li + 1 < rows.length) {
      meta.licenseRaw = rows[li + 1].text
        .replace(/^text\s*/, "")
        .replace(/^container, Text:\s*/, "")
        .trim();
    }
  }

  // Description: rows between the "Description Reviews & Ratings" toggle and Reviews heading.
  const descStart = findRow(rows, "Description Reviews");
  if (descStart) {
    const startIdx = rows.findIndex((r) => r.index === descStart.index);
    for (let i = startIdx + 1; i < rows.length; i++) {
      const t = rows[i].text;
      if (t.includes("Reviews & Ratings") && i !== startIdx) break;
      if (t.startsWith("heading Reviews")) break;
      if (/^text\s+/.test(t)) {
        const v = t.replace(/^text\s*/, "").trim();
        if (v && v !== "Boost Me (for free)" && v !== "Thanks for your support!" && !/^\/format/.test(v)) {
          meta.description.push(v);
        }
      }
      if (t.startsWith("heading Print Files")) break;
    }
  }

  // Tags.
  for (const row of rows) {
    const link = parseLinkTitle(row.text);
    if (link && link.url.includes("/search/models?keyword=tag:")) {
      const tag = decodeURIComponent(link.url.split("tag:").pop() || "").replace(/\+/g, " ");
      if (tag) meta.tags.push(tag);
    }
  }

  // Print files.
  const pf = findRow(rows, "Print Files (");
  if (pf) {
    const mm = pf.text.match(/Print Files \((\d+)\)/);
    meta.printFileCount = mm ? parseInt(mm[1], 10) : null;
    for (const row of rows) {
      if (/^container, Text:.+(Designer \d+(?:\.\d+)? h \d+ plate)/.test(row.text)) {
        meta.printFileLabels.push(row.text.replace(/^container, Text:\s*/, ""));
      }
    }
  }

  // Released date.
  const rel = findRow(rows, "Released ");
  if (rel) meta.releasedOn = (rel.text.match(/Released\s+([\d-]+)/) || [null, null])[1];

  // Download button presence.
  meta.hasDownloadButton = Boolean(findRow(rows, "Download 3MF"));

  return meta;
}

// After navigating to `view-source:<model URL>`, extract preview image URLs from the HTML.
export async function extractPreviewUrls({ windowId } = {}) {
  const tree = await getTree({ windowId });
  const urls = new Set();
  for (const m of tree.matchAll(PREVIEW_RE)) urls.add(m[0]);
  return [...urls];
}
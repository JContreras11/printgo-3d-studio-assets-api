// Orchestration helpers for driving the user's logged-in Brave window via the
// `orca computer` CLI, for scraping MakerWorld behind Cloudflare with the real session.
// Never exports cookies/credentials — automation only.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileP = promisify(execFile);

export const BRAVE_APP = "com.brave.Browser";
export const DEFAULT_WINDOW_ID = process.env.PRINTGO_MW_WINDOW_ID || "917";
export const DEFAULT_DOWNLOAD_DIR =
  process.env.PRINTGO_MW_DOWNLOAD_DIR || path.join(process.env.HOME, "Downloads");

const WRAPPER = path.join(__dirname, "..", "..", ".agent", "orca-run.sh");

export class OrcaError extends Error {
  constructor(message, code, raw) {
    super(message);
    this.name = "OrcaError";
    this.code = code;
    this.raw = raw;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Run an `orca computer ...` command through the restore-wrapper; returns parsed JSON.
export async function orcaComputer(args, { timeoutMs = 90000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileP(WRAPPER, ["computer", ...args], { timeout: timeoutMs });
      const parsed = JSON.parse(stdout);
      if (!parsed.ok) {
        throw new OrcaError(
          `orca computer ${args.join(" ")} failed: ${parsed.error?.message || JSON.stringify(parsed.error)}`,
          parsed.error?.code || "unknown",
          parsed.error
        );
      }
      return parsed;
    } catch (e) {
      lastErr = e;
      // Orca transient window-stale errors: restore + retry.
      if (
        e instanceof OrcaError &&
        ["window_not_found", "window_stale", "window_not_focused"].includes(e.code) &&
        attempt < retries
      ) {
        await sleep(800);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Fetch the accessibility tree text for the current tab.
export async function getTree({ windowId = DEFAULT_WINDOW_ID } = {}) {
  const parsed = await orcaComputer([
    "get-app-state",
    "--app",
    BRAVE_APP,
    "--window-id",
    windowId,
    "--no-screenshot",
    "--json",
  ]);
  return parsed?.result?.snapshot?.treeText || "";
}

// Navigate the browser to a URL by setting the address bar + Return.
export async function navigate(url, { windowId = DEFAULT_WINDOW_ID, waitMs = 7000 } = {}) {
  await orcaComputer([
    "set-value",
    "--app",
    BRAVE_APP,
    "--window-id",
    windowId,
    "--element-index",
    "9",
    "--value",
    url,
    "--json",
  ]);
  await orcaComputer([
    "press-key",
    "--app",
    BRAVE_APP,
    "--window-id",
    windowId,
    "--key",
    "Return",
    "--no-screenshot",
    "--json",
  ]);
  await sleep(waitMs);
  return getTree({ windowId });
}

// Parse the accessibility tree into a flat list of {index, indent, text} for browsing.
export function parseTree(treeText) {
  const rows = [];
  for (const raw of treeText.split("\n")) {
    const m = raw.match(/^(\s*)(\d+)\s+(.*)$/);
    if (m) {
      rows.push({
        index: parseInt(m[2], 10),
        indent: m[1].length,
        text: m[3].trim(),
      });
    }
  }
  return rows;
}

// Find the first row containing a substring; returns row or null.
export function findRow(rows, needle, { fromIndex } = {}) {
  const start = fromIndex == null ? 0 : fromIndex;
  for (let i = start; i < rows.length; i++) {
    if (rows[i].text.includes(needle)) return rows[i];
  }
  return null;
}

export function findAllRows(rows, needle, { fromIndex } = {}) {
  const start = fromIndex == null ? 0 : fromIndex;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    if (rows[i].text.includes(needle)) out.push(rows[i]);
  }
  return out;
}

// Click an element by its a11y index.
export async function clickIndex(index, { windowId = DEFAULT_WINDOW_ID } = {}) {
  return orcaComputer([
    "click",
    "--app",
    BRAVE_APP,
    "--window-id",
    windowId,
    "--element-index",
    String(index),
    "--no-screenshot",
    "--json",
  ]);
}

// Convenience: navigate + parse tree in one call.
export async function openUrlAndParse(url, { windowId = DEFAULT_WINDOW_ID, waitMs = 7000 } = {}) {
  const tree = await navigate(url, { windowId, waitMs });
  return parseTree(tree);
}

// Find the newest file in a directory matching a list of extensions.
export function newestFile(dir, exts, { newerThanMs = 0 } = {}) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir).map((f) => {
    const p = path.join(dir, f);
    try {
      return { name: f, path: p, mtime: fs.statSync(p).mtimeMs };
    } catch {
      return null;
    }
  });
  const byExt = entries.filter((e) => {
    if (!e) return false;
    const ext = path.extname(e.name).toLowerCase();
    return exts.includes(ext) && e.mtime > newerThanMs;
  });
  byExt.sort((a, b) => b.mtime - a.mtime);
  return byExt[0] || null;
}

export { sleep };
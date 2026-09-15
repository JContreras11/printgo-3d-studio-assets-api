// Minimal, dependency-free 3MF / ZIP structural validation.
//
// A .3MF file is an OPC package = a ZIP archive that MUST contain:
//   [Content_Types].xml   ("[Content_Types].xml")
//   3D/3dmodel.model      (the core 3D model)
// and typically _rels/.rels, 3D/_rels/model.rels, Metadata/model_metadata.json ...
// We parse the ZIP End-Of-Central-Directory and central directory entries using the
// binary spec (no iconv/zip libs) and verify presence of required parts.

import fs from "node:fs";
import path from "node:path";

const ZIP_EOCD_SIG = 0x06054b50; // 'PK\x05\x06'
const ZIP_CENTRAL_SIG = 0x02014b50; // 'PK\x01\x02'

export class ArchiveError extends Error {
  constructor(msg, code) {
    super(msg);
    this.code = code;
  }
}

export function readU16(buf, off) {
  return buf.readUInt16LE(off);
}
export function readU32(buf, off) {
  return buf.readUInt32LE(off);
}

// Scan the file for the End-Of-Central-Directory; returns buffer + offsets.
function findEocd(buf) {
  // EOCD is within the last 65557 bytes.
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === ZIP_EOCD_SIG) {
      return {
        eocdOffset: i,
        entryCount: readU16(buf, i + 10),
        cdSize: readU32(buf, i + 12),
        cdOffset: readU32(buf, i + 16),
      };
    }
  }
  throw new ArchiveError("EOCD signature not found — not a valid ZIP/3MF archive", "NOT_ZIP");
}

// List central directory entry names (and whether each is a directory).
export function listZipEntries(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new ArchiveError("not a regular file", "NOT_FILE");
  const buf = fs.readFileSync(filePath);

  const eocd = findEocd(buf);
  const entries = [];
  let off = eocd.cdOffset;
  for (let i = 0; i < eocd.entryCount; i++) {
    if (off + 46 > buf.length) throw new ArchiveError("central directory truncated", "TRUNCATED");
    const sig = buf.readUInt32LE(off);
    if (sig !== ZIP_CENTRAL_SIG) throw new ArchiveError("bad central directory signature", "BAD_CD");
    const nameLen = readU16(buf, off + 28);
    const extraLen = readU16(buf, off + 30);
    const commentLen = readU16(buf, off + 32);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    entries.push({ name, offset: off });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export const REQUIRED_PARTS = ["[Content_Types].xml", "3D/3dmodel.model"];

// Validate a 3MF archive. Returns { ok, nameOfEntries, missing }.
export function validate3mf(filePath) {
  let entries;
  try {
    entries = listZipEntries(filePath);
  } catch (e) {
    return { ok: false, entries: [], missing: [], error: e.message };
  }
  const names = entries.map((e) => e.name.replace(/^\/+/, ""));
  const set = new Set(names.map((n) => n.replace(/\\/g, "/")));
  const missing = REQUIRED_PARTS.filter((p) => !set.has(p));
  const hasContentTypes = set.has("[Content_Types].xml");
  return {
    ok: missing.length === 0 && hasContentTypes,
    entries: names,
    missing,
  };
}

export function validate3mfStrict(filePath) {
  const res = validate3mf(filePath);
  if (!res.ok) {
    throw new ArchiveError(
      `Invalid 3MF archive (${path.basename(filePath)}): missing ${res.missing.join(", ") || res.error}`,
      "INVALID_3MF"
    );
  }
  return res;
}
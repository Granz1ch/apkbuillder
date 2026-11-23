/**
 * resources.arsc generator — the resource table.
 * Minimal implementation: one package, string and drawable types.
 */
import { ByteWriter, enc } from './bytes';

const RES_TABLE_TYPE = 0x0002;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_TABLE_PACKAGE_TYPE = 0x0200;
const RES_TABLE_TYPE_SPEC_TYPE = 0x0202;
const RES_TABLE_TYPE_TYPE = 0x0201;

const TYPE_STRING = 0x03;

function pool(strings: string[], utf8 = true): Uint8Array {
  const offsets: number[] = [];
  const datas: Uint8Array[] = [];
  let rel = 0;
  for (const s of strings) {
    const bytes = enc.encode(s);
    const w = new ByteWriter(bytes.length + 8);
    const u16len = s.length;
    if (u16len < 0x80) w.u8(u16len);
    else {
      w.u8(0x80 | (u16len & 0x7f));
      w.u8((u16len >> 7) & 0x7f);
    }
    if (bytes.length < 0x80) w.u8(bytes.length);
    else {
      w.u8(0x80 | (bytes.length & 0x7f));
      w.u8((bytes.length >> 7) & 0x7f);
    }
    w.bytes(bytes);
    w.u8(0);
    const b = w.slice();
    offsets.push(rel);
    datas.push(b);
    rel += b.length;
  }
  const headerSize = 28;
  const size = headerSize + strings.length * 4 + rel;
  const out = new ByteWriter(size);
  out.u16(RES_STRING_POOL_TYPE);
  out.u16(headerSize);
  out.u32(size);
  out.u32(strings.length);
  out.u32(0);
  out.u32(utf8 ? 0x100 : 0);
  out.u32(headerSize + strings.length * 4);
  out.u32(0);
  for (const o of offsets) out.u32(o);
  for (const d of datas) out.bytes(d);
  return out.slice();
}

export interface ArscEntry {
  key: string;
  /** for string — the value; for drawable — the file path */
  value: string;
  isFile?: boolean;
}

export interface ArscResource {
  type: 'string' | 'drawable';
  entries: ArscEntry[];
}

export interface ArscResult {
  bytes: Uint8Array;
  /** map "typeName/keyName" -> resource id */
  ids: Record<string, number>;
}

const CONFIG_SIZE = 64;

export function buildResources(packageName: string, resources: ArscResource[]): ArscResult {
  const globalStrings: string[] = [];
  const globalMap = new Map<string, number>();
  const addGlobal = (s: string) => {
    let i = globalMap.get(s);
    if (i === undefined) {
      i = globalStrings.length;
      globalStrings.push(s);
      globalMap.set(s, i);
    }
    return i;
  };

  // First collect all value strings
  for (const r of resources) for (const e of r.entries) addGlobal(e.value);

  const globalPool = pool(globalStrings);
  const typeNames = resources.map((r) => r.type);
  const typePool = pool(typeNames);

  const keyNames: string[] = [];
  const keyMap = new Map<string, number>();
  const addKey = (s: string) => {
    let i = keyMap.get(s);
    if (i === undefined) {
      i = keyNames.length;
      keyNames.push(s);
      keyMap.set(s, i);
    }
    return i;
  };
  for (const r of resources) for (const e of r.entries) addKey(e.key);
  const keyPool = pool(keyNames);

  // ----- package contents -----
  const chunks: Uint8Array[] = [];
  const ids: Record<string, number> = {};

  const config = new Uint8Array(CONFIG_SIZE);
  new DataView(config.buffer).setUint32(0, CONFIG_SIZE, true);

  resources.forEach((r, typeIndex) => {
    const typeId = typeIndex + 1;
    const entryCount = r.entries.length;

    // ResTable_typeSpec
    {
      const size = 16 + entryCount * 4;
      const w = new ByteWriter(size);
      w.u16(RES_TABLE_TYPE_SPEC_TYPE);
      w.u16(16);
      w.u32(size);
      w.u8(typeId);
      w.u8(0);
      w.u16(0);
      w.u32(entryCount);
      for (let i = 0; i < entryCount; i++) w.u32(0);
      chunks.push(w.slice());
    }

    // ResTable_type
    {
      const offsets: number[] = [];
      const entries: Uint8Array[] = [];
      let entriesRel = 0;
      const headerSize = 20 + CONFIG_SIZE;
      const offsetsStart = headerSize;
      const entriesStart = offsetsStart + entryCount * 4;

      r.entries.forEach((e, i) => {
        const ew = new ByteWriter(16);
        ew.u16(16); // size
        ew.u16(0); // flags
        ew.u32(addKey(e.key));
        ew.u16(8); // Res_value size
        ew.u8(0);
        ew.u8(TYPE_STRING);
        ew.u32(addGlobal(e.value));
        const b = ew.slice();
        offsets.push(entriesRel);
        entries.push(b);
        entriesRel += b.length;
        ids[`${r.type}/${e.key}`] = (0x7f << 24) | (typeId << 16) | i;
      });

      const totalSize = entriesStart + entriesRel;
      const w = new ByteWriter(totalSize + 8);
      w.u16(RES_TABLE_TYPE_TYPE);
      w.u16(headerSize);
      w.u32(totalSize);
      w.u8(typeId);
      w.u8(0);
      w.u16(0);
      w.u32(entryCount);
      w.u32(entriesStart);
      w.bytes(config);
      for (const o of offsets) w.u32(o);
      for (const e of entries) w.bytes(e);
      chunks.push(w.slice());
    }
  });

  // ----- package -----
  const typeStringsOff = 28 + 256; // after the package header
  const keyStringsOff = typeStringsOff + typePool.length;
  const packageSize = keyStringsOff + keyPool.length + chunks.reduce((a, b) => a + b.length, 0);

  const pw = new ByteWriter(packageSize + 16);
  pw.u16(RES_TABLE_PACKAGE_TYPE);
  pw.u16(28 + 256);
  pw.u32(packageSize);
  pw.u32(0x7f);
  const nameBytes = enc.encode(packageName);
  for (let i = 0; i < 256; i += 2) {
    const c = i / 2 < nameBytes.length ? nameBytes[i / 2] : 0;
    pw.u8(c);
    pw.u8(0);
  }
  pw.u32(typeStringsOff);
  pw.u32(resources.length);
  pw.u32(keyStringsOff);
  pw.u32(keyNames.length);
  pw.bytes(typePool);
  pw.bytes(keyPool);
  for (const c of chunks) pw.bytes(c);

  const pkg = pw.slice();
  const total = 12 + globalPool.length + pkg.length;
  const out = new ByteWriter(total);
  out.u16(RES_TABLE_TYPE);
  out.u16(12);
  out.u32(total);
  out.u32(1);
  out.bytes(globalPool);
  out.bytes(pkg);
  return { bytes: out.slice(), ids };
}

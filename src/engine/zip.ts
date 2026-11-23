/**
 * ZIP: writing (with alignment control) and reading.
 * A custom writer is needed for precise offset control when signing with APK Signature Scheme v2.
 */
import { ByteWriter, crc32, enc, dec, concat } from './bytes';
import { deflateSync, inflateSync } from 'fflate';

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
  method?: 'store' | 'deflate';
  /** alignment of the data start (e.g. 4 for .so / resources) */
  align?: number;
  /** path inside the APK (for sorting) */
  extra?: Uint8Array;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const DOS_TIME = 0x6000; // 12:00:00
const DOS_DATE = 0x5821; // 2024-01-01

export class ZipWriter {
  private entries: ZipEntryInput[] = [];

  add(entry: ZipEntryInput) {
    this.entries.push(entry);
    return this;
  }

  addFile(name: string, data: Uint8Array, opts: Omit<ZipEntryInput, 'name' | 'data'> = {}) {
    return this.add({ name, data, ...opts });
  }

  build(): Uint8Array {
    const out = new ByteWriter(1 << 16);
    const central: Uint8Array[] = [];
    const offsets: { name: string; offset: number; size: number; crc: number; method: number }[] = [];

    for (const e of this.entries) {
      const nameBytes = enc.encode(e.name);
      const method = e.method === 'store' ? 0 : 8;
      const data = method === 0 ? e.data : deflateSync(e.data, { level: 6 });
      const crc = crc32(e.data);
      const align = e.align ?? (method === 0 ? 4 : 1);

      // local header
      const headerStart = out.offset;
      // compute extra to align the data
      let extraLen = 0;
      const dataStartNoExtra = headerStart + 30 + nameBytes.length;
      if (align > 1) {
        const pad = (align - (dataStartNoExtra % align)) % align;
        if (pad > 0) {
          // extra field: header id + size + data (min 4 bytes)
          extraLen = 4 + pad;
          if (pad < 4) extraLen = 4 + pad + 4; // never happens: pad>=1 => extraLen>=5
        }
      }
      // For simplicity: when padding is needed we add an extra field with id 0xd935 (zipalign pad)
      let extraBytes = new Uint8Array(0);
      if (extraLen > 0) {
        const w = new ByteWriter(extraLen);
        w.u16(0xd935);
        w.u16(extraLen - 4);
        while (w.offset < extraLen) w.u8(0x00);
        extraBytes = w.slice();
      }

      const dataStart = headerStart + 30 + nameBytes.length + extraBytes.length;

      out.u32(SIG_LOCAL);
      out.u16(20); // version needed
      out.u16(0x0800); // UTF-8 names
      out.u16(method);
      out.u16(DOS_TIME);
      out.u16(DOS_DATE);
      out.u32(crc);
      out.u32(data.length);
      out.u32(e.data.length);
      out.u16(nameBytes.length);
      out.u16(extraBytes.length);
      out.bytes(nameBytes);
      out.bytes(extraBytes);
      if (dataStart !== out.offset) {
        // safety net
        const diff = dataStart - out.offset;
        if (diff > 0) out.bytes(new Uint8Array(diff));
      }
      out.bytes(data);

      offsets.push({ name: e.name, offset: headerStart, size: data.length, crc, method });

      // central directory
      const cd = new ByteWriter(nameBytes.length + 64);
      cd.u32(SIG_CENTRAL);
      cd.u16(20); // version made by
      cd.u16(20);
      cd.u16(0x0800);
      cd.u16(method);
      cd.u16(DOS_TIME);
      cd.u16(DOS_DATE);
      cd.u32(crc);
      cd.u32(data.length);
      cd.u32(e.data.length);
      cd.u16(nameBytes.length);
      cd.u16(0); // extra len
      cd.u16(0); // comment len
      cd.u16(0); // disk number
      cd.u16(0); // internal attrs
      cd.u32(0); // external attrs
      cd.u32(headerStart);
      cd.bytes(nameBytes);
      central.push(cd.slice());
    }

    const cdOffset = out.offset;
    for (const c of central) out.bytes(c);
    const cdSize = out.offset - cdOffset;

    out.u32(SIG_EOCD);
    out.u16(0);
    out.u16(0);
    out.u16(this.entries.length);
    out.u16(this.entries.length);
    out.u32(cdSize);
    out.u32(cdOffset);
    out.u16(0);

    return out.slice();
  }
}

/* ------------------------------ reading ------------------------------ */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  size: number;
  compressedSize: number;
  method: number;
  crc: number;
  localHeaderOffset: number;
}

/**
 * ZIP parser based on the central directory.
 * fflate is not used for reading so we can get offsets (needed for signing and XAPK).
 */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // search for EOCD from the end
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 70000); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: End of Central Directory not found (corrupted file?)');
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  let cdOffset = dv.getUint32(eocd + 16, true);

  // ZIP64?
  if (cdOffset === 0xffffffff || count === 0xffff) {
    // look for the zip64 EOCD locator
    const loc = eocd - 20;
    if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
      const z64 = Number(dv.getBigUint64(loc + 8, true));
      cdOffset = Number(dv.getBigUint64(z64 + 48, true));
    }
  }

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const compSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const data = extractEntry(bytes, lho, compSize, size, method);
    entries.push({ name, data, size, compressedSize: compSize, method, crc, localHeaderOffset: lho });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (entries.length === 0) throw new Error('ZIP: empty or corrupted archive');
  return entries;
}

function extractEntry(bytes: Uint8Array, lho: number, compSize: number, size: number, method: number): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(lho, true) !== SIG_LOCAL) throw new Error('ZIP: corrupted local header');
  const nameLen = dv.getUint16(lho + 26, true);
  const extraLen = dv.getUint16(lho + 28, true);
  const start = lho + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + compSize);
  if (method === 0) return raw;
  if (method === 8) return inflateSync(raw);
  throw new Error(`ZIP: unsupported compression method ${method}`);
}

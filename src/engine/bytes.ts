/**
 * Низкоуровневые утилиты для работы с байтами.
 * Всё isomorphic: работает и в браузере, и в Node.
 */

export const enc = new TextEncoder();
export const dec = new TextDecoder();

export function u8(v: number): number {
  return v & 0xff;
}

export function u16(v: number): number {
  return v & 0xffff;
}

export function u32(v: number): number {
  return v >>> 0;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export class ByteWriter {
  buf: Uint8Array;
  view: DataView;
  len = 0;

  constructor(capacity = 1024) {
    this.buf = new Uint8Array(capacity);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    let cap = Math.max(this.buf.length * 2, this.len + extra);
    while (cap < this.len + extra) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
    this.view = new DataView(this.buf.buffer);
  }

  bytes(b: Uint8Array) {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
    return this;
  }

  u8(v: number) {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
    return this;
  }

  i8(v: number) {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
    return this;
  }

  u16(v: number) {
    this.ensure(2);
    this.view.setUint16(this.len, v & 0xffff, true);
    this.len += 2;
    return this;
  }

  u32(v: number) {
    this.ensure(4);
    this.view.setUint32(this.len, v >>> 0, true);
    this.len += 4;
    return this;
  }

  i32(v: number) {
    this.ensure(4);
    this.view.setInt32(this.len, v | 0, true);
    this.len += 4;
    return this;
  }

  u64(v: bigint | number) {
    this.ensure(8);
    const b = typeof v === 'bigint' ? v : BigInt(v);
    this.view.setBigUint64(this.len, b, true);
    this.len += 8;
    return this;
  }

  uleb128(v: number) {
    let x = v >>> 0;
    do {
      let b = x & 0x7f;
      x >>>= 7;
      if (x !== 0) b |= 0x80;
      this.u8(b);
    } while (x !== 0);
    return this;
  }

  /** UTF-8 строка с uleb128 длиной в UTF-16 код-юнитах (формат DEX string_data). */
  dexString(s: string) {
    this.uleb128(s.length);
    this.bytes(enc.encode(s));
    this.u8(0);
    return this;
  }

  align(n: number, fill = 0) {
    while (this.len % n !== 0) this.u8(fill);
    return this;
  }

  slice(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }

  get offset(): number {
    return this.len;
  }
}

/* ----------------------------- чтение ----------------------------- */

export class ByteReader {
  view: DataView;
  pos: number;
  constructor(public buf: Uint8Array, offset = 0) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.pos = offset;
  }
  u8(): number {
    return this.buf[this.pos++];
  }
  i8(): number {
    const v = this.buf[this.pos++];
    return v > 127 ? v - 256 : v;
  }
  u16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u64(): bigint {
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }
  uleb128(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.buf[this.pos++];
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result >>> 0;
  }
  skip(n: number) {
    this.pos += n;
    return this;
  }
  bytes(n: number): Uint8Array {
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
}

/* ----------------------------- CRC / Adler ----------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/* ----------------------------- hex / base64 ----------------------------- */

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf16Length(s: string): number {
  return s.length;
}

/** Сравнение строк в порядке UTF-16 code units (как того требует DEX). */
export function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(2)} МБ`;
}

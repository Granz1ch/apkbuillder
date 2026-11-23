/**
 * Запись бинарного XML (AXML) — формат, который понимает Android.
 */
import { ByteWriter, enc } from './bytes';

export const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

export type AttrValue =
  | string
  | number
  | boolean
  | { ref: number }
  | { raw: string }
  | { int: number }
  | { hex: number };

export interface AxmlNode {
  name: string;
  attrs?: Record<string, AttrValue>;
  children?: AxmlNode[];
}

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;

const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_BOOLEAN = 0x12;

class StringPool {
  strings: string[] = [];
  private map = new Map<string, number>();

  add(s: string): number {
    let i = this.map.get(s);
    if (i === undefined) {
      i = this.strings.length;
      this.strings.push(s);
      this.map.set(s, i);
    }
    return i;
  }

  build(): Uint8Array {
    const offsets: number[] = [];
    const datas: Uint8Array[] = [];
    let rel = 0;
    for (const s of this.strings) {
      const utf8 = enc.encode(s);
      const w = new ByteWriter(utf8.length + 8);
      // utf16 length
      const u16len = s.length;
      if (u16len < 0x80) w.u8(u16len);
      else {
        w.u8(0x80 | (u16len & 0x7f));
        w.u8((u16len >> 7) & 0x7f);
      }
      // utf8 byte length
      if (utf8.length < 0x80) w.u8(utf8.length);
      else {
        w.u8(0x80 | (utf8.length & 0x7f));
        w.u8((utf8.length >> 7) & 0x7f);
      }
      w.bytes(utf8);
      w.u8(0);
      const b = w.slice();
      offsets.push(rel);
      datas.push(b);
      rel += b.length;
    }
    const headerSize = 28;
    const dataStart = headerSize + this.strings.length * 4;
    const size = dataStart + rel + ((4 - ((dataStart + rel) % 4)) % 4);
    const out = new ByteWriter(size);
    out.u16(RES_STRING_POOL_TYPE);
    out.u16(headerSize);
    out.u32(size);
    out.u32(this.strings.length);
    out.u32(0); // styleCount
    out.u32(0x100); // UTF-8 flag
    out.u32(dataStart); // stringsStart
    out.u32(0); // stylesStart
    for (const o of offsets) out.u32(o);
    for (const d of datas) out.bytes(d);
    while (out.offset % 4 !== 0) out.u8(0);
    return out.slice();
  }
}

export class AxmlWriter {
  private pool = new StringPool();
  private parts: Uint8Array[] = [];
  private namespaces = new Set<string>();

  private str(s: string) {
    return this.pool.add(s);
  }

  private startNs(prefix: string, uri: string) {
    const w = new ByteWriter(24);
    w.u16(RES_XML_START_NAMESPACE_TYPE);
    w.u16(16);
    w.u32(24);
    w.i32(0); // lineNumber
    w.u32(0xffffffff); // comment
    w.u32(this.str(prefix));
    w.u32(this.str(uri));
    this.parts.push(w.slice());
  }

  private endNs(prefix: string, uri: string) {
    const w = new ByteWriter(24);
    w.u16(RES_XML_END_NAMESPACE_TYPE);
    w.u16(16);
    w.u32(24);
    w.i32(0);
    w.u32(0xffffffff);
    w.u32(this.str(prefix));
    w.u32(this.str(uri));
    this.parts.push(w.slice());
  }

  private startElement(node: AxmlNode) {
    const attrs = Object.entries(node.attrs ?? {});
    const nameStr = this.str(node.name);
    const encoded: { ns: number; name: number; raw: number; type: number; data: number }[] = [];
    for (const [k, v] of attrs) {
      let ns = 0xffffffff;
      let name = k;
      if (k.includes(':')) {
        const [p, n] = k.split(':');
        name = n;
        ns = this.str(p === 'android' ? ANDROID_NS : p);
        this.namespaces.add(p);
      }
      let type = TYPE_STRING;
      let data = 0;
      let raw = 0xffffffff;
      if (typeof v === 'string') {
        type = TYPE_STRING;
        data = this.str(v);
        raw = this.str(v);
      } else if (typeof v === 'boolean') {
        type = TYPE_INT_BOOLEAN;
        data = v ? 1 : 0;
      } else if (typeof v === 'number') {
        type = TYPE_INT_DEC;
        data = v >>> 0;
      } else if ('ref' in v) {
        type = TYPE_REFERENCE;
        data = v.ref >>> 0;
      } else if ('int' in v) {
        type = TYPE_INT_DEC;
        data = v.int >>> 0;
      } else if ('hex' in v) {
        type = TYPE_INT_DEC;
        data = v.hex >>> 0;
      } else if ('raw' in v) {
        type = TYPE_STRING;
        data = this.str(v.raw);
        raw = data;
      }
      encoded.push({ ns, name: this.str(name), raw, type, data });
    }
    const nodeSize = 16 + 20 + encoded.length * 20;
    const w = new ByteWriter(nodeSize);
    w.u16(RES_XML_START_ELEMENT_TYPE);
    w.u16(16);
    w.u32(nodeSize);
    w.i32(0);
    w.u32(0xffffffff);
    w.u32(0xffffffff); // ns of element (не используем префиксы у элементов)
    w.u32(nameStr);
    w.u16(20); // attributeStart
    w.u16(20); // attributeSize
    w.u16(encoded.length);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    for (const a of encoded) {
      w.u32(a.ns);
      w.u32(a.name);
      w.u32(a.raw);
      w.u16(8);
      w.u8(0);
      w.u8(a.type);
      w.u32(a.data);
    }
    this.parts.push(w.slice());
  }

  private endElement(node: AxmlNode) {
    const w = new ByteWriter(24);
    w.u16(RES_XML_END_ELEMENT_TYPE);
    w.u16(16);
    w.u32(24);
    w.i32(0);
    w.u32(0xffffffff);
    w.u32(0xffffffff);
    w.u32(this.str(node.name));
    this.parts.push(w.slice());
  }

  private walk(node: AxmlNode) {
    this.startElement(node);
    for (const c of node.children ?? []) this.walk(c);
    this.endElement(node);
  }

  build(root: AxmlNode): Uint8Array {
    this.walk(root);
    const nsPrefixes = [...this.namespaces];
    const nsParts: Uint8Array[] = [];
    for (const p of nsPrefixes) {
      const uri = p === 'android' ? ANDROID_NS : p;
      // эмулируем startNs/endNs вручную, чтобы не тащить их в parts раньше времени
    }
    // Собираем: namespace-узлы должны идти до элементов
    const startNsNodes: Uint8Array[] = [];
    const endNsNodes: Uint8Array[] = [];
    for (const p of nsPrefixes) {
      const uri = p === 'android' ? ANDROID_NS : p;
      const a = new ByteWriter(24);
      a.u16(RES_XML_START_NAMESPACE_TYPE);
      a.u16(16);
      a.u32(24);
      a.i32(0);
      a.u32(0xffffffff);
      a.u32(this.str(p));
      a.u32(this.str(uri));
      startNsNodes.push(a.slice());
      const b = new ByteWriter(24);
      b.u16(RES_XML_END_NAMESPACE_TYPE);
      b.u16(16);
      b.u32(24);
      b.i32(0);
      b.u32(0xffffffff);
      b.u32(this.str(p));
      b.u32(this.str(uri));
      endNsNodes.push(b.slice());
    }
    const poolBytes = this.pool.build();
    const body = [...startNsNodes, ...this.parts, ...endNsNodes];
    const total = 8 + poolBytes.length + body.reduce((a, b) => a + b.length, 0);
    const out = new ByteWriter(total);
    out.u16(RES_XML_TYPE);
    out.u16(8);
    out.u32(total);
    out.bytes(poolBytes);
    for (const b of body) out.bytes(b);
    return out.slice();
  }
}

export function buildManifest(root: AxmlNode): Uint8Array {
  return new AxmlWriter().build(root);
}

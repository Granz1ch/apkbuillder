/**
 * Reading binary Android XML (AXML) → plain XML.
 */
import { dec } from '../bytes';

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_CDATA_TYPE = 0x0104;

const TYPE_REFERENCE = 0x01;
const TYPE_ATTRIBUTE = 0x02;
const TYPE_STRING = 0x03;
const TYPE_FLOAT = 0x04;
const TYPE_DIMENSION = 0x05;
const TYPE_FRACTION = 0x06;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;
const TYPE_INT_COLOR_ARGB8 = 0x1c;
const TYPE_INT_COLOR_RGB8 = 0x1d;
const TYPE_INT_COLOR_ARGB4 = 0x1e;
const TYPE_INT_COLOR_RGB4 = 0x1f;

export interface StringPool {
  strings: string[];
  styles: string[][];
}

export function readStringPool(buf: Uint8Array, offset: number): StringPool {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const type = dv.getUint16(offset, true);
  if (type !== RES_STRING_POOL_TYPE) throw new Error(`StringPool: invalid type 0x${type.toString(16)}`);
  const headerSize = dv.getUint16(offset + 2, true);
  const stringCount = dv.getUint32(offset + 8, true);
  const styleCount = dv.getUint32(offset + 12, true);
  const flags = dv.getUint32(offset + 16, true);
  const stringsStart = dv.getUint32(offset + 20, true);
  const stylesStart = dv.getUint32(offset + 24, true);
  const utf8 = (flags & 0x100) !== 0;

  const offsets: number[] = [];
  for (let i = 0; i < stringCount; i++) offsets.push(dv.getUint32(offset + headerSize + i * 4, true));

  const strings: string[] = [];
  for (let i = 0; i < stringCount; i++) {
    let p = offset + stringsStart + offsets[i];
    if (utf8) {
      // utf16 length
      let l = buf[p++];
      if (l & 0x80) l = ((l & 0x7f) << 8) | buf[p++];
      let bl = buf[p++];
      if (bl & 0x80) bl = ((bl & 0x7f) << 8) | buf[p++];
      strings.push(dec.decode(buf.subarray(p, p + bl)));
    } else {
      let l = dv.getUint16(p, true);
      p += 2;
      if (l & 0x8000) {
        l = ((l & 0x7fff) << 16) | dv.getUint16(p, true);
        p += 2;
      }
      let out = '';
      for (let k = 0; k < l; k++) {
        out += String.fromCharCode(dv.getUint16(p + k * 2, true));
      }
      strings.push(out);
    }
  }
  void styleCount;
  void stylesStart;
  return { strings, styles: [] };
}

export interface AxmlNode {
  name: string;
  ns?: string;
  attrs: Record<string, string>;
  children: AxmlNode[];
  text?: string;
  line?: number;
}

interface RawNode {
  name: string;
  ns: number;
  attrs: { ns: number; name: number; raw: number; dataType: number; data: number }[];
  line: number;
}

function valueToString(dataType: number, data: number, pool: string[]): string {
  switch (dataType) {
    case TYPE_STRING:
      return pool[data] ?? '';
    case TYPE_REFERENCE:
      return `@0x${data.toString(16)}`;
    case TYPE_ATTRIBUTE:
      return `?0x${data.toString(16)}`;
    case TYPE_INT_BOOLEAN:
      return data ? 'true' : 'false';
    case TYPE_INT_DEC:
      return String(data | 0);
    case TYPE_INT_HEX:
      return `0x${data.toString(16)}`;
    case TYPE_INT_COLOR_ARGB8:
    case TYPE_INT_COLOR_RGB8:
      return `#${data.toString(16).padStart(8, '0')}`;
    case TYPE_FLOAT:
      return String(new Float32Array(new Uint8Array([data & 0xff, (data >> 8) & 0xff, (data >> 16) & 0xff, (data >> 24) & 0xff]).buffer)[0]);
    default:
      return `0x${data.toString(16)}`;
  }
}

export function parseAxml(buf: Uint8Array): AxmlNode {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint16(0, true) !== RES_XML_TYPE) throw new Error('AXML: invalid header');
  const pool = readStringPool(buf, 8).strings;

  let p = 8;
  const nsPrefix = new Map<number, string>();
  const root: AxmlNode = { name: '#document', attrs: {}, children: [] };
  const stack: AxmlNode[] = [root];
  const pending: RawNode[] = [];

  while (p + 8 <= buf.length) {
    const type = dv.getUint16(p, true);
    const headerSize = dv.getUint16(p + 2, true);
    const size = dv.getUint32(p + 4, true);
    if (size < 8) break;

    if (type === RES_XML_START_NAMESPACE_TYPE) {
      const prefix = dv.getUint32(p + 16, true);
      const uri = dv.getUint32(p + 20, true);
      nsPrefix.set(uri, pool[prefix] ?? '');
    } else if (type === RES_XML_END_NAMESPACE_TYPE) {
      // ignore
    } else if (type === RES_XML_START_ELEMENT_TYPE) {
      const extOff = p + headerSize;
      const ns = dv.getUint32(extOff, true);
      const name = dv.getUint32(extOff + 4, true);
      const attrStart = dv.getUint16(extOff + 8, true);
      const attrCount = dv.getUint16(extOff + 12, true);
      const attrs: RawNode['attrs'] = [];
      for (let i = 0; i < attrCount; i++) {
        const a = extOff + attrStart + i * 20;
        attrs.push({
          ns: dv.getUint32(a, true),
          name: dv.getUint32(a + 4, true),
          raw: dv.getUint32(a + 8, true),
          dataType: dv.getUint8(a + 15),
          data: dv.getUint32(a + 16, true),
        });
      }
      const node: AxmlNode = {
        name: pool[name] ?? '?',
        ns: ns === 0xffffffff ? undefined : pool[ns],
        attrs: {},
        children: [],
        line: dv.getInt32(p + 8, true),
      };
      for (const a of attrs) {
        const key = pool[a.name] ?? '?';
        const prefix = a.ns === 0xffffffff ? '' : nsPrefix.get(a.ns) ?? '';
        const full = prefix ? `${prefix}:${key}` : key;
        node.attrs[full] = valueToString(a.dataType, a.data, pool);
      }
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      pending.push({ name: node.name, ns, attrs, line: node.line! });
    } else if (type === RES_XML_END_ELEMENT_TYPE) {
      const extOff = p + headerSize;
      void extOff;
      stack.pop();
    } else if (type === RES_XML_CDATA_TYPE) {
      const extOff = p + headerSize;
      const data = dv.getUint32(extOff + 4, true);
      const dt = dv.getUint8(extOff + 3);
      const parent = stack[stack.length - 1];
      parent.text = (parent.text ?? '') + valueToString(dt, data, pool);
    }
    p += size;
  }

  return root;
}

export function axmlToXml(root: AxmlNode, resolve?: (ref: string) => string | undefined): string {
  const lines: string[] = [];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const walk = (node: AxmlNode, depth: number) => {
    const ind = '  '.repeat(depth);
    const attrs = Object.entries(node.attrs)
      .map(([k, v]) => {
        let val = v;
        const m = /^@0x([0-9a-f]+)$/i.exec(v);
        if (m && resolve) {
          const r = resolve(v);
          if (r) val = `@string/${r}`;
        }
        return `${k}="${esc(val)}"`;
      })
      .join(' ');
    if (node.children.length === 0 && !node.text) {
      lines.push(`${ind}<${node.name}${attrs ? ' ' + attrs : ''}/>`);
      return;
    }
    lines.push(`${ind}<${node.name}${attrs ? ' ' + attrs : ''}>`);
    if (node.text?.trim()) lines.push(`${ind}  ${esc(node.text.trim())}`);
    for (const c of node.children) walk(c, depth + 1);
    lines.push(`${ind}</${node.name}>`);
  };
  for (const c of root.children) walk(c, 0);
  return '<?xml version="1.0" encoding="utf-8"?>\n' + lines.join('\n') + '\n';
}

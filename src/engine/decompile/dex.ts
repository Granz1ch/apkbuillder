/**
 * Парсер и дизассемблер DEX (в smali-подобный текст).
 */
import { dec } from '../bytes';

export interface DexMethodId {
  cls: string;
  name: string;
  proto: string;
  ret: string;
  params: string[];
}

export interface DexFieldId {
  cls: string;
  name: string;
  type: string;
}

export interface DexClassInfo {
  name: string;
  access: number;
  superclass: string;
  interfaces: string[];
  sourceFile?: string;
  fields: { name: string; type: string; access: number; isStatic: boolean }[];
  methods: DexMethodInfo[];
}

export interface DexMethodInfo {
  name: string;
  proto: string;
  access: number;
  code?: { registers: number; ins: number; outs: number; instructions: string[] };
}

export class DexParser {
  private dv: DataView;
  private buf: Uint8Array;
  private strings: string[] = [];
  private types: string[] = [];
  private protos: { shorty: string; ret: string; params: string[] }[] = [];
  private fields: { cls: string; name: string; type: string }[] = [];
  private methods: DexMethodId[] = [];
  classes: DexClassInfo[] = [];

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (dec.decode(buf.subarray(0, 4)) !== 'dex\n') throw new Error('DEX: неверная сигнатура');
    this.readStringIds();
    this.readTypeIds();
    this.readProtoIds();
    this.readFieldIds();
    this.readMethodIds();
    this.readClassDefs();
  }

  private u32(o: number) {
    return this.dv.getUint32(o, true);
  }
  private u16(o: number) {
    return this.dv.getUint16(o, true);
  }
  private uleb(p: number): [number, number] {
    let r = 0;
    let s = 0;
    for (;;) {
      const b = this.buf[p++];
      r |= (b & 0x7f) << s;
      if (!(b & 0x80)) break;
      s += 7;
    }
    return [r >>> 0, p];
  }

  private readStringIds() {
    const size = this.u32(56);
    const off = this.u32(60);
    for (let i = 0; i < size; i++) {
      const so = this.u32(off + i * 4);
      let p = so;
      // uleb utf16 length
      let l = 0;
      let shift = 0;
      for (;;) {
        const b = this.buf[p++];
        l |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      void l;
      const end = this.buf.indexOf(0, p);
      let bytes = this.buf.subarray(p, end < 0 ? this.buf.length : end);
      // MUTF-8: C0 80 -> 00
      const fixed = new Uint8Array(bytes.length);
      let k = 0;
      for (let j = 0; j < bytes.length; j++) {
        if (bytes[j] === 0xc0 && bytes[j + 1] === 0x80) {
          fixed[k++] = 0;
          j++;
        } else fixed[k++] = bytes[j];
      }
      this.strings.push(dec.decode(fixed.subarray(0, k)));
    }
  }

  private readTypeIds() {
    const size = this.u32(64);
    const off = this.u32(68);
    for (let i = 0; i < size; i++) this.types.push(this.strings[this.u32(off + i * 4)]);
  }

  private readProtoIds() {
    const size = this.u32(72);
    const off = this.u32(76);
    for (let i = 0; i < size; i++) {
      const o = off + i * 12;
      const shorty = this.strings[this.u32(o)];
      const ret = this.types[this.u32(o + 4)];
      const paramsOff = this.u32(o + 8);
      const params: string[] = [];
      if (paramsOff) {
        const n = this.u32(paramsOff);
        for (let k = 0; k < n; k++) params.push(this.types[this.u16(paramsOff + 4 + k * 2)]);
      }
      this.protos.push({ shorty, ret, params });
    }
  }

  private readFieldIds() {
    const size = this.u32(80);
    const off = this.u32(84);
    for (let i = 0; i < size; i++) {
      const o = off + i * 8;
      this.fields.push({
        cls: this.types[this.u16(o)],
        type: this.types[this.u16(o + 2)],
        name: this.strings[this.u32(o + 4)],
      });
    }
  }

  private readMethodIds() {
    const size = this.u32(88);
    const off = this.u32(92);
    for (let i = 0; i < size; i++) {
      const o = off + i * 8;
      const p = this.protos[this.u16(o + 2)];
      this.methods.push({
        cls: this.types[this.u16(o)],
        name: this.strings[this.u32(o + 4)],
        ret: p.ret,
        params: p.params,
        proto: `(${p.params.join('')})${p.ret}`,
      });
    }
  }

  private readClassDefs() {
    const size = this.u32(96);
    const off = this.u32(100);
    for (let i = 0; i < size; i++) {
      const o = off + i * 32;
      const info: DexClassInfo = {
        name: this.types[this.u32(o)],
        access: this.u32(o + 4),
        superclass: this.types[this.u32(o + 8)],
        interfaces: [],
        fields: [],
        methods: [],
      };
      const interfacesOff = this.u32(o + 12);
      if (interfacesOff) {
        const n = this.u32(interfacesOff);
        for (let k = 0; k < n; k++) info.interfaces.push(this.types[this.u16(interfacesOff + 4 + k * 2)]);
      }
      const srcIdx = this.u32(o + 20);
      if (srcIdx !== 0xffffffff) info.sourceFile = this.strings[srcIdx];
      const cdOff = this.u32(o + 24);
      if (cdOff) {
        let p = cdOff;
        let sfN: number, ifN: number, dmN: number, vmN: number;
        [sfN, p] = this.uleb(p);
        [ifN, p] = this.uleb(p);
        [dmN, p] = this.uleb(p);
        [vmN, p] = this.uleb(p);
        let prev = 0;
        for (let k = 0; k < sfN; k++) {
          const d = this.uleb(p);
          p = d[1];
          prev += d[0];
          const acc = this.uleb(p);
          p = acc[1];
          const f = this.fields[prev];
          info.fields.push({ name: f.name, type: f.type, access: acc[0], isStatic: true });
        }
        prev = 0;
        for (let k = 0; k < ifN; k++) {
          const d = this.uleb(p);
          p = d[1];
          prev += d[0];
          const acc = this.uleb(p);
          p = acc[1];
          const f = this.fields[prev];
          info.fields.push({ name: f.name, type: f.type, access: acc[0], isStatic: false });
        }
        const readMethods = (count: number) => {
          let prevM = 0;
          for (let k = 0; k < count; k++) {
            const d = this.uleb(p);
            p = d[1];
            prevM += d[0];
            const acc = this.uleb(p);
            p = acc[1];
            const co = this.uleb(p);
            p = co[1];
            const m = this.methods[prevM];
            const mi: DexMethodInfo = {
              name: m.name,
              proto: m.proto,
              access: acc[0],
            };
            if (co[0]) mi.code = this.readCode(co[0]);
            info.methods.push(mi);
          }
        };
        readMethods(dmN);
        readMethods(vmN);
      }
      this.classes.push(info);
    }
  }

  private readCode(off: number) {
    const registers = this.u16(off);
    const ins = this.u16(off + 2);
    const outs = this.u16(off + 4);
    const tries = this.u16(off + 6);
    const insnsSize = this.u32(off + 12);
    const insns = new Uint16Array(insnsSize);
    for (let i = 0; i < insnsSize; i++) insns[i] = this.u16(off + 16 + i * 2);
    const instructions = disassemble(insns, this);
    void tries;
    return { registers, ins, outs, instructions };
  }

  /* ---------- вспомогательные ---------- */
  type(i: number) {
    return this.types[i];
  }
  string(i: number) {
    return this.strings[i];
  }
  method(i: number) {
    return this.methods[i];
  }
  field(i: number) {
    return this.fields[i];
  }
  get stringCount() {
    return this.strings.length;
  }
  get methodCount() {
    return this.methods.length;
  }
}

/* ============================ ДИЗАСССЕМБЛЕР ============================ */

type Fmt =
  | '10x' | '12x' | '11n' | '11x' | '10t' | '20t' | '22x' | '21t' | '21s' | '21h'
  | '21c' | '23x' | '22b' | '22t' | '22s' | '22c' | '32x' | '30t' | '31t' | '31c'
  | '35c' | '3rc' | '51l' | '45cc' | '4rcc' | '31i';

const OPS: Record<number, [string, Fmt]> = {};

function op(code: number, name: string, f: Fmt) {
  OPS[code] = [name, f];
}

op(0x00, 'nop', '10x');
op(0x01, 'move', '12x');
op(0x02, 'move/from16', '22x');
op(0x03, 'move/16', '32x');
op(0x04, 'move-wide', '12x');
op(0x05, 'move-wide/from16', '22x');
op(0x06, 'move-wide/16', '32x');
op(0x07, 'move-object', '12x');
op(0x08, 'move-object/from16', '22x');
op(0x09, 'move-object/16', '32x');
op(0x0a, 'move-result', '11x');
op(0x0b, 'move-result-wide', '11x');
op(0x0c, 'move-result-object', '11x');
op(0x0d, 'move-exception', '11x');
op(0x0e, 'return-void', '10x');
op(0x0f, 'return', '11x');
op(0x10, 'return-wide', '11x');
op(0x11, 'return-object', '11x');
op(0x12, 'const/4', '11n');
op(0x13, 'const/16', '21s');
op(0x14, 'const', '31i');
op(0x15, 'const/high16', '21h');
op(0x16, 'const-wide/16', '21s');
op(0x17, 'const-wide/32', '31i');
op(0x18, 'const-wide', '51l');
op(0x19, 'const-wide/high16', '21h');
op(0x1a, 'const-string', '21c');
op(0x1b, 'const-string/jumbo', '31c');
op(0x1c, 'const-class', '21c');
op(0x1d, 'monitor-enter', '11x');
op(0x1e, 'monitor-exit', '11x');
op(0x1f, 'check-cast', '21c');
op(0x20, 'instance-of', '22c');
op(0x21, 'array-length', '12x');
op(0x22, 'new-instance', '21c');
op(0x23, 'new-array', '22c');
op(0x24, 'filled-new-array', '35c');
op(0x25, 'filled-new-array/range', '3rc');
op(0x26, 'fill-array-data', '31t');
op(0x27, 'throw', '11x');
op(0x28, 'goto', '10t');
op(0x29, 'goto/16', '20t');
op(0x2a, 'goto/32', '30t');
op(0x2b, 'packed-switch', '31t');
op(0x2c, 'sparse-switch', '31t');
const cmps = ['cmpl-float', 'cmpg-float', 'cmpl-double', 'cmpg-double', 'cmp-long'];
cmps.forEach((n, i) => op(0x2d + i, n, '23x'));
const ifTests = ['if-eq', 'if-ne', 'if-lt', 'if-ge', 'if-gt', 'if-le'];
ifTests.forEach((n, i) => op(0x32 + i, n, '22t'));
const ifTestsZ = ['if-eqz', 'if-nez', 'if-ltz', 'if-gez', 'if-gtz', 'if-lez'];
ifTestsZ.forEach((n, i) => op(0x38 + i, n, '21t'));
const agets = ['aget', 'aget-wide', 'aget-object', 'aget-boolean', 'aget-byte', 'aget-char', 'aget-short'];
agets.forEach((n, i) => op(0x44 + i, n, '23x'));
const aputs = ['aput', 'aput-wide', 'aput-object', 'aput-boolean', 'aput-byte', 'aput-char', 'aput-short'];
aputs.forEach((n, i) => op(0x4b + i, n, '23x'));
const igets = ['iget', 'iget-wide', 'iget-object', 'iget-boolean', 'iget-byte', 'iget-char', 'iget-short'];
igets.forEach((n, i) => op(0x52 + i, n, '22c'));
const iputs = ['iput', 'iput-wide', 'iput-object', 'iput-boolean', 'iput-byte', 'iput-char', 'iput-short'];
iputs.forEach((n, i) => op(0x59 + i, n, '22c'));
const sgets = ['sget', 'sget-wide', 'sget-object', 'sget-boolean', 'sget-byte', 'sget-char', 'sget-short'];
sgets.forEach((n, i) => op(0x60 + i, n, '21c'));
const sputs = ['sput', 'sput-wide', 'sput-object', 'sput-boolean', 'sput-byte', 'sput-char', 'sput-short'];
sputs.forEach((n, i) => op(0x67 + i, n, '21c'));
op(0x6e, 'invoke-virtual', '35c');
op(0x6f, 'invoke-super', '35c');
op(0x70, 'invoke-direct', '35c');
op(0x71, 'invoke-static', '35c');
op(0x72, 'invoke-interface', '35c');
op(0x74, 'invoke-virtual/range', '3rc');
op(0x75, 'invoke-super/range', '3rc');
op(0x76, 'invoke-direct/range', '3rc');
op(0x77, 'invoke-static/range', '3rc');
op(0x78, 'invoke-interface/range', '3rc');
const unops = [
  'neg-int', 'not-int', 'neg-long', 'not-long', 'neg-float', 'neg-double', 'int-to-long',
  'int-to-float', 'int-to-double', 'long-to-int', 'long-to-float', 'long-to-double', 'float-to-int',
  'float-to-long', 'float-to-double', 'double-to-int', 'double-to-long', 'double-to-float',
  'int-to-byte', 'int-to-char', 'int-to-short',
];
unops.forEach((n, i) => op(0x7b + i, n, '12x'));
const binops = [
  'add-int', 'sub-int', 'mul-int', 'div-int', 'rem-int', 'and-int', 'or-int', 'xor-int', 'shl-int',
  'shr-int', 'ushr-int', 'add-long', 'sub-long', 'mul-long', 'div-long', 'rem-long', 'and-long',
  'or-long', 'xor-long', 'shl-long', 'shr-long', 'ushr-long', 'add-float', 'sub-float', 'mul-float',
  'div-float', 'rem-float', 'add-double', 'sub-double', 'mul-double', 'div-double', 'rem-double',
];
binops.forEach((n, i) => {
  op(0x90 + i, n, '23x');
  op(0xb0 + i, `${n}/2addr`, '12x');
  op(0xd0 + i, `${n}/lit16`, '22s');
  op(0xd8 + i, `${n}/lit8`, '22b');
});
op(0xfa, 'invoke-polymorphic', '45cc');
op(0xfc, 'invoke-custom', '35c');
op(0xfe, 'const-method-handle', '21c');
op(0xff, 'const-method-type', '21c');

function hex(n: number) {
  return `0x${n.toString(16)}`;
}

export function disassemble(insns: Uint16Array, dex: DexParser): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < insns.length) {
    const unit = insns[i];
    const code = unit & 0xff;
    const entry = OPS[code];
    const at = i;
    const next = (n: number) => insns[i + n] ?? 0;
    const sw = (n: number) => ((insns[i + n] << 16) | (insns[i + n + 1] ?? 0)) | 0;
    let text = `unknown-${hex(code)}`;
    let size = 1;

    if (entry) {
      const [name, f] = entry;
      const a = (unit >> 8) & 0xf;
      const b = (unit >> 12) & 0xf;
      const aa = (unit >> 8) & 0xff;
      switch (f) {
        case '10x':
          text = name;
          size = 1;
          break;
        case '12x':
          text = `${name} v${a}, v${b}`;
          size = 1;
          break;
        case '11n': {
          const lit = b > 7 ? b - 16 : b;
          text = `${name} v${a}, ${lit}`;
          size = 1;
          break;
        }
        case '11x':
          text = `${name} v${aa}`;
          size = 1;
          break;
        case '10t': {
          const off = aa > 127 ? aa - 256 : aa;
          text = `${name} ${at + off}`;
          size = 1;
          break;
        }
        case '20t':
          text = `${name} ${at + (insns[i + 1] | 0)}`;
          size = 2;
          break;
        case '22x':
          text = `${name} v${aa}, v${next(1)}`;
          size = 2;
          break;
        case '21t':
          text = `${name} v${aa}, ${at + next(1)}`;
          size = 2;
          break;
        case '21s': {
          const v = next(1);
          text = `${name} v${aa}, ${v > 0x7fff ? v - 0x10000 : v}`;
          size = 2;
          break;
        }
        case '21h': {
          const v = next(1);
          text = `${name} v${aa}, ${hex(v << 16)}`;
          size = 2;
          break;
        }
        case '21c': {
          const idx = next(1);
          let ref = hex(idx);
          if (name.startsWith('const-string')) ref = JSON.stringify(dex.string(idx));
          else if (name === 'const-class' || name === 'check-cast' || name === 'new-instance' || name === 'const-method-handle' || name === 'const-method-type')
            ref = dex.type(idx);
          else {
            const fl = dex.field(idx);
            ref = `${fl.cls}->${fl.name}:${fl.type}`;
          }
          text = `${name} v${aa}, ${ref}`;
          size = 2;
          break;
        }
        case '23x':
          text = `${name} v${aa}, v${next(1) & 0xff}, v${(next(1) >> 8) & 0xff}`;
          size = 2;
          break;
        case '22b': {
          const w = next(1);
          const lit = (w >> 8) & 0xff;
          text = `${name} v${aa}, v${w & 0xff}, ${lit > 127 ? lit - 256 : lit}`;
          size = 2;
          break;
        }
        case '22t':
          text = `${name} v${a}, v${b}, ${at + next(1)}`;
          size = 2;
          break;
        case '22s': {
          const v = next(1);
          text = `${name} v${a}, v${b}, ${v > 0x7fff ? v - 0x10000 : v}`;
          size = 2;
          break;
        }
        case '22c': {
          const idx = next(1);
          const fl = dex.field(idx);
          text = `${name} v${a}, v${b}, ${fl.cls}->${fl.name}:${fl.type}`;
          size = 2;
          break;
        }
        case '32x':
          text = `${name} v${next(1)}, v${next(2)}`;
          size = 3;
          break;
        case '30t':
          text = `${name} ${at + sw(1)}`;
          size = 3;
          break;
        case '31t':
          text = `${name} v${aa}, ${at + sw(1)}`;
          size = 3;
          break;
        case '31c':
          text = `${name} v${aa}, ${JSON.stringify(dex.string(sw(1)))}`;
          size = 3;
          break;
        case '35c': {
          const m = dex.method(next(1));
          const count = (unit >> 12) & 0xf;
          const regs = [next(2) & 0xf, (next(2) >> 4) & 0xf, (next(2) >> 8) & 0xf, (next(2) >> 12) & 0xf, (unit >> 8) & 0xf];
          text = `${name} {${regs.slice(0, count).map((r) => 'v' + r).join(', ')}}, ${m.cls}->${m.name}${m.proto}`;
          size = 3;
          break;
        }
        case '3rc': {
          const m = dex.method(next(1));
          const start = next(2);
          const count = (unit >> 8) & 0xff;
          const regs = Array.from({ length: count }, (_, k) => 'v' + (start + k));
          text = `${name} {${regs.join(', ')}}, ${m.cls}->${m.name}${m.proto}`;
          size = 3;
          break;
        }
        case '51l': {
          const lo = next(1) | (next(2) << 16);
          const hi = next(3) | (next(4) << 16);
          text = `${name} v${aa}, ${hex((hi * 0x100000000 + (lo >>> 0)) | 0)}`;
          size = 5;
          break;
        }
        case '45cc':
        case '4rcc':
          text = name;
          size = 4;
          break;
      }
    }
    out.push(`    ${at.toString(16).padStart(4, '0')}: ${text}`);
    i += size;
  }
  return out;
}

export function accessFlags(a: number): string {
  const names: [number, string][] = [
    [0x1, 'public'],
    [0x2, 'private'],
    [0x4, 'protected'],
    [0x8, 'static'],
    [0x10, 'final'],
    [0x20, 'synchronized'],
    [0x40, 'bridge'],
    [0x80, 'varargs'],
    [0x100, 'native'],
    [0x400, 'abstract'],
    [0x1000, 'synthetic'],
    [0x2000, 'annotation'],
    [0x4000, 'enum'],
    [0x10000, 'constructor'],
  ];
  return names.filter(([m]) => (a & m) !== 0).map(([, n]) => n).join(' ');
}

/** Превращает класс в smali-подобный текст. */
export function classToSmali(c: DexClassInfo): string {
  const lines: string[] = [];
  lines.push(`.class ${accessFlags(c.access)} ${c.name}`);
  lines.push(`.super ${c.superclass}`);
  for (const i of c.interfaces) lines.push(`.implements ${i}`);
  if (c.sourceFile) lines.push(`.source "${c.sourceFile}"`);
  lines.push('');
  for (const f of c.fields) {
    lines.push(`.field ${accessFlags(f.access)} ${f.name}:${f.type}`);
  }
  if (c.fields.length) lines.push('');
  for (const m of c.methods) {
    lines.push(`.method ${accessFlags(m.access)} ${m.name}${m.proto}`);
    if (m.code) {
      lines.push(`    .registers ${m.code.registers}`);
      lines.push(`    .ins ${m.code.ins}`);
      lines.push(`    .outs ${m.code.outs}`);
      lines.push('');
      lines.push(...m.code.instructions);
    }
    lines.push('.end method');
    lines.push('');
  }
  return lines.join('\n');
}

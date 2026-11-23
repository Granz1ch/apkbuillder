/**
 * Генератор DEX-файлов (Dalvik Executable) — чистая реализация без Android SDK.
 * Собирает байткод вручную; формат: https://source.android.com/docs/core/runtime/dex-format
 */
import { ByteWriter, adler32, cmpStr, enc } from './bytes';

/* ----------------------- opcodes / flags ----------------------- */

export const OP = {
  RETURN_VOID: 0x0e,
  CONST_4: 0x12,
  CONST_STRING: 0x1a,
  NEW_INSTANCE: 0x22,
  MOVE_RESULT_OBJECT: 0x0c,
  IPUT_OBJECT: 0x5b,
  INVOKE_VIRTUAL: 0x6e,
  INVOKE_SUPER: 0x6f,
  INVOKE_DIRECT: 0x70,
  INVOKE_STATIC: 0x71,
} as const;

export const ACC = {
  PUBLIC: 0x1,
  PRIVATE: 0x2,
  PROTECTED: 0x4,
  STATIC: 0x8,
  FINAL: 0x10,
  SYNCHRONIZED: 0x20,
  BRIDGE: 0x40,
  VARARGS: 0x80,
  NATIVE: 0x100,
  ABSTRACT: 0x400,
  STRICT: 0x800,
  SYNTHETIC: 0x1000,
  ANNOTATION: 0x2000,
  ENUM: 0x4000,
  CONSTRUCTOR: 0x10000,
} as const;

/* ----------------------- модель ----------------------- */

export type Proto = { ret: string; params: string[] };
export type MethodRef = { cls: string; name: string; proto: Proto };
export type FieldRef = { cls: string; name: string; type: string };

export type Ins =
  | { op: 0x0e }
  | { op: 0x12; reg: number; lit: number }
  | { op: 0x1a; reg: number; str: string }
  | { op: 0x22; reg: number; type: string }
  | { op: 0x0c; reg: number }
  | { op: 0x5b; obj: number; value: number; field: FieldRef }
  | { op: 0x6e | 0x6f | 0x70 | 0x71; args: number[]; method: MethodRef };

export interface DexMethod {
  name: string;
  proto: Proto;
  access: number;
  code?: { registers: number; ins: number; insns: Ins[] };
}

export interface DexClass {
  type: string;
  access: number;
  superclass: string;
  interfaces?: string[];
  sourceFile?: string;
  staticFields?: { name: string; type: string; access: number }[];
  instanceFields?: { name: string; type: string; access: number }[];
  directMethods?: DexMethod[];
  virtualMethods?: DexMethod[];
}

/* ----------------------- сборщик ----------------------- */

export class DexBuilder {
  private strings = new Map<string, number>();
  private types = new Map<string, number>();
  private protos: { shorty: string; ret: string; params: string[] }[] = [];
  private protoIdx = new Map<string, number>();
  private fields: FieldRef[] = [];
  private fieldIdx = new Map<string, number>();
  private methods: MethodRef[] = [];
  private methodIdx = new Map<string, number>();
  private classes: DexClass[] = [];

  addClass(c: DexClass) {
    this.classes.push(c);
    return this;
  }

  /* --- таблицы символов --- */

  private str(s: string): number {
    let i = this.strings.get(s);
    if (i === undefined) {
      i = this.strings.size;
      this.strings.set(s, i);
    }
    return i;
  }

  private type(t: string): number {
    this.str(t);
    let i = this.types.get(t);
    if (i === undefined) {
      i = this.types.size;
      this.types.set(t, i);
    }
    return i;
  }

  private shorty(p: Proto): string {
    const ch = (t: string) => (t.startsWith('L') || t.startsWith('[') ? 'L' : t);
    return ch(p.ret) + p.params.map(ch).join('');
  }

  private proto(p: Proto): number {
    this.str(this.shorty(p));
    this.type(p.ret);
    for (const t of p.params) this.type(t);
    const key = JSON.stringify(p);
    let i = this.protoIdx.get(key);
    if (i === undefined) {
      i = this.protos.length;
      this.protos.push({ shorty: this.shorty(p), ret: p.ret, params: p.params });
      this.protoIdx.set(key, i);
    }
    return i;
  }

  private field(f: FieldRef): number {
    this.type(f.cls);
    this.type(f.type);
    this.str(f.name);
    const key = `${f.cls}|${f.name}|${f.type}`;
    let i = this.fieldIdx.get(key);
    if (i === undefined) {
      i = this.fields.length;
      this.fields.push(f);
      this.fieldIdx.set(key, i);
    }
    return i;
  }

  private method(m: MethodRef): number {
    this.type(m.cls);
    this.str(m.name);
    this.proto(m.proto);
    const key = `${m.cls}|${m.name}|${JSON.stringify(m.proto)}`;
    let i = this.methodIdx.get(key);
    if (i === undefined) {
      i = this.methods.length;
      this.methods.push(m);
      this.methodIdx.set(key, i);
    }
    return i;
  }

  private collect() {
    for (const c of this.classes) {
      this.type(c.type);
      this.type(c.superclass);
      if (c.sourceFile) this.str(c.sourceFile);
      for (const i of c.interfaces ?? []) this.type(i);
      for (const f of [...(c.staticFields ?? []), ...(c.instanceFields ?? [])]) {
        this.field({ cls: c.type, name: f.name, type: f.type });
      }
      for (const m of [...(c.directMethods ?? []), ...(c.virtualMethods ?? [])]) {
        this.method({ cls: c.type, name: m.name, proto: m.proto });
        if (m.code) for (const ins of m.code.insns) this.collectIns(ins);
      }
    }
  }

  private collectIns(ins: Ins) {
    switch (ins.op) {
      case 0x12:
      case 0x0c:
      case 0x0e:
        return;
      case 0x1a:
        this.str(ins.str);
        return;
      case 0x22:
        this.type(ins.type);
        return;
      case 0x5b:
        this.field(ins.field);
        return;
      case 0x6e:
      case 0x6f:
      case 0x70:
      case 0x71:
        this.method(ins.method);
        return;
    }
  }

  build(): Uint8Array {
    this.collect();

    /* ---------- сортировка ---------- */
    const stringList = [...this.strings.keys()].sort(cmpStr);
    const stringIndex = new Map<string, number>();
    stringList.forEach((s, i) => stringIndex.set(s, i));

    const typeList = [...this.types.keys()].sort(cmpStr);
    const typeIndex = new Map<string, number>();
    typeList.forEach((t, i) => typeIndex.set(t, i));

    const protoList = this.protos
      .map((p, i) => ({ ...p, _i: i }))
      .sort((a, b) => {
        const ra = typeIndex.get(a.ret)!;
        const rb = typeIndex.get(b.ret)!;
        if (ra !== rb) return ra - rb;
        const n = Math.min(a.params.length, b.params.length);
        for (let k = 0; k < n; k++) {
          const pa = typeIndex.get(a.params[k])!;
          const pb = typeIndex.get(b.params[k])!;
          if (pa !== pb) return pa - pb;
        }
        return a.params.length - b.params.length;
      });
    const protoIndex = new Map<number, number>();
    protoList.forEach((p, i) => protoIndex.set(p._i, i));

    const fieldList = this.fields
      .map((f, i) => ({ f, _i: i }))
      .sort((a, b) => {
        const ca = typeIndex.get(a.f.cls)!;
        const cb = typeIndex.get(b.f.cls)!;
        if (ca !== cb) return ca - cb;
        const na = stringIndex.get(a.f.name)!;
        const nb = stringIndex.get(b.f.name)!;
        if (na !== nb) return na - nb;
        return typeIndex.get(a.f.type)! - typeIndex.get(b.f.type)!;
      });
    const fieldIndex = new Map<number, number>();
    fieldList.forEach((f, i) => fieldIndex.set(f._i, i));

    const methodList = this.methods
      .map((m, i) => ({ m, _i: i }))
      .sort((a, b) => {
        const ca = typeIndex.get(a.m.cls)!;
        const cb = typeIndex.get(b.m.cls)!;
        if (ca !== cb) return ca - cb;
        const na = stringIndex.get(a.m.name)!;
        const nb = stringIndex.get(b.m.name)!;
        if (na !== nb) return na - nb;
        const pa = protoIndex.get(this.protoIdx.get(JSON.stringify(a.m.proto))!)!;
        const pb = protoIndex.get(this.protoIdx.get(JSON.stringify(b.m.proto))!)!;
        return pa - pb;
      });
    const methodIndex = new Map<number, number>();
    methodList.forEach((m, i) => methodIndex.set(m._i, i));

    const strIdx = (s: string) => stringIndex.get(s)!;
    const typIdx = (t: string) => typeIndex.get(t)!;
    const prdIdx = (p: Proto) => protoIndex.get(this.protoIdx.get(JSON.stringify(p))!)!;
    const fldIdx = (f: FieldRef) => fieldIndex.get(this.fieldIdx.get(`${f.cls}|${f.name}|${f.type}`)!)!;
    const mthIdx = (m: MethodRef) => methodIndex.get(this.methodIdx.get(`${m.cls}|${m.name}|${JSON.stringify(m.proto)}`)!)!;

    /* ---------- кодирование инструкций ---------- */
    const encodeIns = (ins: Ins): number[] => {
      switch (ins.op) {
        case 0x0e:
          return [0x0e];
        case 0x12:
          return [((ins.lit & 0xf) << 12) | ((ins.reg & 0xf) << 8) | 0x12];
        case 0x1a:
          return [((ins.reg & 0xff) << 8) | 0x1a, strIdx(ins.str)];
        case 0x22:
          return [((ins.reg & 0xff) << 8) | 0x22, typIdx(ins.type)];
        case 0x0c:
          return [((ins.reg & 0xff) << 8) | 0x0c];
        case 0x5b:
          return [((ins.obj & 0xf) << 12) | ((ins.value & 0xf) << 8) | 0x5b, fldIdx(ins.field)];
        case 0x6e:
        case 0x6f:
        case 0x70:
        case 0x71: {
          const a = ins.args.length & 0xf;
          const regs = [0, 0, 0, 0];
          ins.args.slice(0, 4).forEach((r, i) => (regs[i] = r & 0xf));
          return [
            (a << 12) | ins.op,
            mthIdx(ins.method),
            (regs[3] << 12) | (regs[2] << 8) | (regs[1] << 4) | regs[0],
          ];
        }
      }
    };

    /* ---------- code_items (сначала — их смещения не зависят от class_data) ---------- */
    const codeBytes = new Map<DexMethod, Uint8Array>();
    for (const c of this.classes) {
      for (const m of [...(c.directMethods ?? []), ...(c.virtualMethods ?? [])]) {
        if (!m.code) continue;
        const insns: number[] = [];
        for (const i of m.code.insns) insns.push(...encodeIns(i));
        let outs = 0;
        for (const i of m.code.insns) if (i.op >= 0x6e && i.op <= 0x72) outs = Math.max(outs, (i as any).args.length);
        const cw = new ByteWriter(insns.length * 2 + 16);
        cw.u16(m.code.registers);
        cw.u16(m.code.ins);
        cw.u16(outs);
        cw.u16(0);
        cw.u32(0);
        cw.u32(insns.length);
        for (const unit of insns) cw.u16(unit);
        codeBytes.set(m, cw.slice());
      }
    }

    /* ---------- string_data ---------- */
    const stringData: Uint8Array[] = [];
    const stringDataRel: number[] = [];
    let stringDataSize = 0;
    for (const s of stringList) {
      const w = new ByteWriter(s.length * 2 + 8);
      w.uleb128(s.length);
      w.bytes(enc.encode(s));
      w.u8(0);
      const b = w.slice();
      stringData.push(b);
      stringDataRel.push(stringDataSize);
      stringDataSize += b.length;
    }

    /* ---------- type_list ---------- */
    const typeListData: Uint8Array[] = [];
    const typeListRel = new Map<any, number>();
    let typeListSize = 0;
    for (const p of protoList) {
      if (p.params.length === 0) continue;
      const w = new ByteWriter(8 + p.params.length * 2);
      w.u32(p.params.length);
      for (const t of p.params) w.u16(typIdx(t));
      while (w.offset % 4 !== 0) w.u16(0);
      const b = w.slice();
      typeListData.push(b);
      typeListRel.set(p, typeListSize);
      typeListSize += b.length;
    }

    /* ---------- планировка ---------- */
    const headerSize = 112;
    const align4 = (n: number) => (n + 3) & ~3;

    let cursor = headerSize;
    const stringIdsOff = cursor;
    cursor += stringList.length * 4;
    const typeIdsOff = cursor;
    cursor += typeList.length * 4;
    const protoIdsOff = cursor;
    cursor += protoList.length * 12;
    const fieldIdsOff = cursor;
    cursor += fieldList.length * 8;
    const methodIdsOff = cursor;
    cursor += methodList.length * 8;
    const classDefsOff = cursor;
    cursor += this.classes.length * 32;
    const dataStart = cursor;

    const stringDataStart = cursor;
    cursor += stringDataSize;
    cursor = align4(cursor);

    const typeListStart = cursor;
    cursor += typeListSize;
    cursor = align4(cursor);

    const codeOffsets = new Map<DexMethod, number>();
    for (const c of this.classes) {
      for (const m of [...(c.directMethods ?? []), ...(c.virtualMethods ?? [])]) {
        const b = codeBytes.get(m);
        if (!b) continue;
        codeOffsets.set(m, cursor);
        cursor += b.length;
        cursor = align4(cursor);
      }
    }

    /* ---------- class_data (теперь известны code_off) ---------- */
    const classDataBytes = new Map<DexClass, Uint8Array>();
    for (const c of this.classes) {
      const sf = c.staticFields ?? [];
      const inf = c.instanceFields ?? [];
      const dm = c.directMethods ?? [];
      const vm = c.virtualMethods ?? [];
      if (sf.length + inf.length + dm.length + vm.length === 0) continue;

      const w = new ByteWriter(256);
      w.uleb128(sf.length);
      w.uleb128(inf.length);
      w.uleb128(dm.length);
      w.uleb128(vm.length);
      let prev = 0;
      for (const f of sf) {
        const idx = fldIdx({ cls: c.type, name: f.name, type: f.type });
        w.uleb128(idx - prev);
        prev = idx;
        w.uleb128(f.access);
      }
      prev = 0;
      for (const f of inf) {
        const idx = fldIdx({ cls: c.type, name: f.name, type: f.type });
        w.uleb128(idx - prev);
        prev = idx;
        w.uleb128(f.access);
      }
      const writeMethods = (list: DexMethod[]) => {
        let p = 0;
        for (const m of list) {
          const idx = mthIdx({ cls: c.type, name: m.name, proto: m.proto });
          w.uleb128(idx - p);
          p = idx;
          w.uleb128(m.access);
          w.uleb128(codeOffsets.get(m) ?? 0);
        }
      };
      writeMethods(dm);
      writeMethods(vm);
      classDataBytes.set(c, w.slice());
    }

    const classDataOffsets = new Map<DexClass, number>();
    for (const c of this.classes) {
      const b = classDataBytes.get(c);
      if (!b) continue;
      classDataOffsets.set(c, cursor);
      cursor += b.length;
      cursor = align4(cursor);
    }

    const mapListOffset = cursor;
    const mapItems: [number, number, number][] = [];
    const fileSize = cursor + 4 + 12 * 12;

    /* ---------- запись ---------- */
    const body = new ByteWriter(fileSize + 64);
    body.bytes(enc.encode('dex\n035\0'));
    body.u32(0);
    body.bytes(new Uint8Array(20));
    body.u32(fileSize);
    body.u32(headerSize);
    body.u32(0x12345678);
    body.u32(0);
    body.u32(0);
    body.u32(mapListOffset);
    body.u32(stringList.length);
    body.u32(stringIdsOff);
    body.u32(typeList.length);
    body.u32(typeIdsOff);
    body.u32(protoList.length);
    body.u32(protoIdsOff);
    body.u32(fieldList.length);
    body.u32(fieldIdsOff);
    body.u32(methodList.length);
    body.u32(methodIdsOff);
    body.u32(this.classes.length);
    body.u32(classDefsOff);
    body.u32(fileSize - dataStart);
    body.u32(dataStart);
    if (body.offset !== headerSize) throw new Error(`DEX: заголовок ${body.offset} != 112`);

    for (let i = 0; i < stringList.length; i++) body.u32(stringDataStart + stringDataRel[i]);
    for (const t of typeList) body.u32(strIdx(t));
    for (const p of protoList) {
      body.u32(strIdx(p.shorty));
      body.u32(typIdx(p.ret));
      body.u32(p.params.length === 0 ? 0 : typeListStart + typeListRel.get(p)!);
    }
    for (const { f } of fieldList) {
      body.u16(typIdx(f.cls));
      body.u16(typIdx(f.type));
      body.u32(strIdx(f.name));
    }
    for (const { m } of methodList) {
      body.u16(typIdx(m.cls));
      body.u16(prdIdx(m.proto));
      body.u32(strIdx(m.name));
    }
    for (const c of this.classes) {
      body.u32(typIdx(c.type));
      body.u32(c.access);
      body.u32(typIdx(c.superclass));
      body.u32(0);
      body.u32(c.sourceFile ? strIdx(c.sourceFile) : 0xffffffff);
      body.u32(0);
      body.u32(classDataOffsets.get(c) ?? 0);
      body.u32(0);
    }
    if (body.offset !== dataStart) throw new Error(`DEX: data_start ${body.offset} != ${dataStart}`);

    for (const b of stringData) body.bytes(b);
    while (body.offset % 4 !== 0) body.u8(0);
    for (const b of typeListData) body.bytes(b);
    while (body.offset % 4 !== 0) body.u8(0);

    for (const c of this.classes) {
      for (const m of [...(c.directMethods ?? []), ...(c.virtualMethods ?? [])]) {
        const b = codeBytes.get(m);
        if (!b) continue;
        const at = codeOffsets.get(m)!;
        if (body.offset !== at) throw new Error(`DEX: code_item ${body.offset} != ${at}`);
        body.bytes(b);
        while (body.offset % 4 !== 0) body.u8(0);
      }
    }
    for (const c of this.classes) {
      const b = classDataBytes.get(c);
      if (!b) continue;
      const at = classDataOffsets.get(c)!;
      if (body.offset !== at) throw new Error(`DEX: class_data ${body.offset} != ${at}`);
      body.bytes(b);
      while (body.offset % 4 !== 0) body.u8(0);
    }

    if (body.offset !== mapListOffset) throw new Error(`DEX: map_list ${body.offset} != ${mapListOffset}`);
    const classDataCount = classDataOffsets.size;
    const codeCount = codeOffsets.size;
    const firstClassData = classDataCount ? Math.min(...classDataOffsets.values()) : 0;
    const firstCode = codeCount ? Math.min(...codeOffsets.values()) : 0;
    mapItems.push([0x0000, 1, 0]);
    mapItems.push([0x0001, stringList.length, stringIdsOff]);
    mapItems.push([0x0002, typeList.length, typeIdsOff]);
    mapItems.push([0x0003, protoList.length, protoIdsOff]);
    mapItems.push([0x0004, fieldList.length, fieldIdsOff]);
    mapItems.push([0x0005, methodList.length, methodIdsOff]);
    mapItems.push([0x0006, this.classes.length, classDefsOff]);
    mapItems.push([0x1001, typeListData.length, typeListStart]);
    mapItems.push([0x2002, stringList.length, stringDataStart]);
    mapItems.push([0x2000, classDataCount, firstClassData]);
    mapItems.push([0x2001, codeCount, firstCode]);
    mapItems.push([0x1000, 1, mapListOffset]);
    body.u32(mapItems.length);
    for (const [t, s, o] of mapItems) {
      body.u16(t);
      body.u16(0);
      body.u32(s);
      body.u32(o);
    }

    const result = body.slice();
    if (result.length !== fileSize) throw new Error(`DEX: размер ${result.length} != ${fileSize}`);
    const sig = sha1(result.subarray(32));
    result.set(sig, 12);
    new DataView(result.buffer).setUint32(8, adler32(result.subarray(12)), true);
    return result;
  }
}

/* ----------------------- SHA-1 ----------------------- */

export function sha1(data: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const ml = data.length * 8;
  const withOne = ((data.length + 8) >> 6) + 1;
  const totalLen = withOne * 64;
  const buf = new Uint8Array(totalLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(totalLen - 4, ml >>> 0, false);
  dv.setUint32(totalLen - 8, Math.floor(ml / 0x100000000), false);

  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let i = 0; i < totalLen; i += 64) {
    const w = new Uint32Array(80);
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => odv.setUint32(i * 4, h, false));
  return out;
}

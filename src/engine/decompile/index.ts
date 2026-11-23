/**
 * Декомпиляция APK: манифест, ресурсы, dex → smali, все файлы.
 */
import { readZip, ZipEntry } from '../zip';
import { parseAxml, axmlToXml, AxmlNode } from './axml';
import { DexParser, classToSmali, accessFlags } from './dex';
import { dec } from '../bytes';

export interface DecompileFile {
  path: string;
  data: Uint8Array;
}

export interface DecompileReport {
  package: string;
  appName: string;
  versionName: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  permissions: string[];
  activities: string[];
  mainActivity?: string;
  signature: { v2: boolean; v3: boolean };
  dexFiles: number;
  classes: number;
  methods: number;
  files: number;
  size: number;
}

export interface DecompileResult {
  files: DecompileFile[];
  report: DecompileReport;
  manifestXml: string;
  warnings: string[];
}

/* ----------------------- ресурсы (минимум) ----------------------- */

function readPool(buf: Uint8Array, off: number): string[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = dv.getUint32(off + 8, true);
  const flags = dv.getUint32(off + 16, true);
  const start = dv.getUint32(off + 20, true);
  const headerSize = dv.getUint16(off + 2, true);
  const utf8 = (flags & 0x100) !== 0;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const so = dv.getUint32(off + headerSize + i * 4, true);
    let p = off + start + so;
    if (utf8) {
      let l = buf[p++];
      if (l & 0x80) l = ((l & 0x7f) << 8) | buf[p++];
      let bl = buf[p++];
      if (bl & 0x80) bl = ((bl & 0x7f) << 8) | buf[p++];
      out.push(dec.decode(buf.subarray(p, p + bl)));
    } else {
      let l = dv.getUint16(p, true);
      p += 2;
      if (l & 0x8000) {
        l = ((l & 0x7fff) << 16) | dv.getUint16(p, true);
        p += 2;
      }
      let s = '';
      for (let k = 0; k < l; k++) s += String.fromCharCode(dv.getUint16(p + k * 2, true));
      out.push(s);
    }
  }
  return out;
}

/** Возвращает карту resId (0x7f010000) → строковое значение. */
export function readResourceStrings(arsc: Uint8Array): Map<number, string> {
  const map = new Map<number, string>();
  const dv = new DataView(arsc.buffer, arsc.byteOffset, arsc.byteLength);
  if (dv.getUint16(0, true) !== 0x0002) return map;
  const globalPool = readPool(arsc, 12);
  const pkgOff = 12 + dv.getUint32(12 + 4, true);
  // идём по чанкам внутри пакета
  let p = 12;
  const end = arsc.byteLength;
  while (p + 8 <= end) {
    const type = dv.getUint16(p, true);
    const size = dv.getUint32(p + 4, true);
    if (size < 8) break;
    if (type === 0x0200) {
      const typeStringsOff = dv.getUint32(p + 268, true);
      const keyStringsOff = dv.getUint32(p + 276, true);
      const keyPool = readPool(arsc, p + keyStringsOff);
      const typePool = readPool(arsc, p + typeStringsOff);
      let q = p + dv.getUint16(p + 2, true);
      while (q + 8 <= p + size) {
        const t2 = dv.getUint16(q, true);
        const sz2 = dv.getUint32(q + 4, true);
        if (sz2 < 8) break;
        if (t2 === 0x0201) {
          const typeId = dv.getUint8(q + 8);
          const entryCount = dv.getUint32(q + 12, true);
          const entriesStart = dv.getUint32(q + 16, true);
          const headerSize2 = dv.getUint16(q + 2, true);
          const offsets: number[] = [];
          for (let i = 0; i < entryCount; i++) offsets.push(dv.getUint32(q + headerSize2 + i * 4, true));
          offsets.forEach((o, i) => {
            if (o === 0xffffffff) return;
            const e = q + entriesStart + o;
            const keyIdx = dv.getUint32(e + 4, true);
            const dataType = dv.getUint8(e + 11);
            const data = dv.getUint32(e + 12, true);
            const resId = (0x7f << 24) | (typeId << 16) | i;
            if (dataType === 0x03) {
              map.set(resId, globalPool[data] ?? '');
            } else if (dataType === 0x01) {
              map.set(resId, `@0x${data.toString(16)}`);
            }
            void keyPool;
            void typePool;
          });
        }
        q += sz2;
      }
    }
    p += size;
  }
  return map;
}

/* ----------------------- основная логика ----------------------- */

export function decompileApk(bytes: Uint8Array): DecompileResult {
  const warnings: string[] = [];
  const entries = readZip(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));

  const manifestEntry = byName.get('AndroidManifest.xml');
  if (!manifestEntry) {
    throw new Error('E-3001');
  }

  const resourceStrings = byName.has('resources.arsc') ? readResourceStrings(byName.get('resources.arsc')!.data) : new Map<number, string>();
  const resolve = (ref: string) => {
    const m = /^@0x([0-9a-f]+)$/i.exec(ref);
    if (!m) return undefined;
    const v = resourceStrings.get(parseInt(m[1], 16));
    return v && !v.startsWith('@0x') ? v : undefined;
  };

  const root = parseAxml(manifestEntry.data);
  const manifest = root.children.find((c) => c.name === 'manifest') ?? root.children[0];
  const manifestXml = axmlToXml(root, resolve);

  const getAttr = (n: AxmlNode | undefined, k: string) => n?.attrs[k];

  const usesSdk = findNode(manifest, 'uses-sdk');
  const app = findNode(manifest, 'application');
  const activities = (app?.children ?? []).filter((c) => c.name === 'activity');
  const mainActivity = activities.find((a) =>
    (a.children ?? []).some((c) => c.name === 'intent-filter' && (c.children ?? []).some((x) => x.name === 'category' && x.attrs['android:name'] === 'android.intent.category.LAUNCHER')),
  );
  const permissions = (manifest.children ?? []).filter((c) => c.name === 'uses-permission').map((p) => p.attrs['android:name'] ?? '');

  let appName = getAttr(app, 'android:label') ?? '';
  if (appName.startsWith('@0x')) appName = resolve(appName) ?? appName;
  const pkg = getAttr(manifest, 'package') ?? '';
  const versionName = getAttr(manifest, 'android:versionName') ?? '';
  const versionCode = getAttr(manifest, 'android:versionCode') ?? '';

  // dex
  const dexEntries = entries.filter((e) => /^classes\d*\.dex$/.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  const files: DecompileFile[] = [];
  let classes = 0;
  let methods = 0;

  for (const d of dexEntries) {
    try {
      const parser = new DexParser(d.data);
      for (const c of parser.classes) {
        classes++;
        methods += c.methods.length;
        const safe = c.name.replace(/^L/, '').replace(/;$/, '').replace(/\//g, '.');
        files.push({ path: `smali/${safe}.smali`, data: new TextEncoder().encode(classToSmali(c)) });
      }
    } catch (e) {
      warnings.push(`Не удалось разобрать ${d.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (dexEntries.length === 0) warnings.push('E-3003');

  // остальные файлы
  for (const e of entries) {
    if (e.name === 'AndroidManifest.xml' || e.name === 'resources.arsc' || /^classes\d*\.dex$/.test(e.name)) continue;
    if (e.name.startsWith('META-INF/')) {
      files.push({ path: e.name, data: e.data });
      continue;
    }
    files.push({ path: e.name, data: e.data });
  }

  // манифест
  files.push({ path: 'AndroidManifest.xml', data: new TextEncoder().encode(manifestXml) });
  if (byName.has('resources.arsc')) {
    files.push({ path: 'resources.arsc.original', data: byName.get('resources.arsc')!.data });
  }

  const report: DecompileReport = {
    package: pkg,
    appName,
    versionName,
    versionCode,
    minSdk: getAttr(usesSdk, 'android:minSdkVersion') ?? '?',
    targetSdk: getAttr(usesSdk, 'android:targetSdkVersion') ?? '?',
    permissions,
    activities: activities.map((a) => getAttr(a, 'android:name') ?? '?'),
    mainActivity: mainActivity ? getAttr(mainActivity, 'android:name') : undefined,
    signature: { v2: true, v3: false },
    dexFiles: dexEntries.length,
    classes,
    methods,
    files: entries.length,
    size: bytes.length,
  };

  return { files, report, manifestXml, warnings };
}

function findNode(root: AxmlNode | undefined, name: string): AxmlNode | undefined {
  if (!root) return undefined;
  for (const c of root.children ?? []) {
    if (c.name === name) return c;
    const r = findNode(c, name);
    if (r) return r;
  }
  return undefined;
}

export function makeReadme(r: DecompileReport): string {
  return `# Декомпиляция: ${r.appName}

| Параметр | Значение |
|---|---|
| Пакет | \`${r.package}\` |
| Версия | ${r.versionName} (${r.versionCode}) |
| minSdk / targetSdk | ${r.minSdk} / ${r.targetSdk} |
| Activities | ${r.activities.length} |
| Классов | ${r.classes} |
| Методов | ${r.methods} |
| DEX-файлов | ${r.dexFiles} |
| Файлов в APK | ${r.files} |
| Размер APK | ${(r.size / 1024).toFixed(1)} КБ |

## Permissions
${r.permissions.map((p) => `- \`${p}\``).join('\n') || '— нет —'}

## Activities
${r.activities.map((a) => `- \`${a}\``).join('\n') || '— нет —'}

## Структура
- \`AndroidManifest.xml\` — декодированный манифест
- \`smali/\` — дизассемблированный байткод (по одному файлу на класс)
- остальные файлы APK — в исходном виде
`;
}

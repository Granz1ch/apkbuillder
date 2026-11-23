/**
 * XAPK / APKS → APK.
 * Merges base.apk with split modules (dex, native libraries, assets).
 */
import { readZip, ZipWriter, ZipEntry } from './zip';
import { ZipEntryInput } from './zip';
import { signApkV2 } from './sign';

export interface XapkSplit {
  name: string;
  size: number;
  kind: 'base' | 'config' | 'feature' | 'unknown';
  hasDex: boolean;
  hasLib: boolean;
  hasResources: boolean;
  abis: string[];
}

export interface XapkAnalysis {
  packageName: string;
  appName: string;
  versionName: string;
  versionCode: string;
  splits: XapkSplit[];
  totalSize: number;
  format: 'xapk' | 'apks' | 'zip';
  manifest: any;
}

export interface ConvertOptions {
  keystore?: { privateKey: CryptoKey; certificate: Uint8Array; publicKeyDer: Uint8Array };
  includeSplits?: boolean;
}

export interface ConvertResult {
  apk: Uint8Array;
  size: number;
  merged: string[];
  skipped: string[];
  warnings: string[];
}

const CONFIG_RE = /^config\.([a-z0-9_-]+)\.apk$/i;

export function analyzeXapk(bytes: Uint8Array, filename: string): XapkAnalysis {
  const entries = readZip(bytes);
  const names = new Set(entries.map((e) => e.name));
  const manifestEntry = entries.find((e) => e.name === 'manifest.json');
  let manifest: any = null;
  if (manifestEntry) {
    try {
      manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data));
    } catch {
      manifest = null;
    }
  }
  const apkEntries = entries.filter((e) => e.name.toLowerCase().endsWith('.apk'));
  if (apkEntries.length === 0) throw new Error('E-4001');

  const base = apkEntries.find((e) => e.name === 'base.apk') ?? apkEntries.sort((a, b) => b.size - a.size)[0];
  if (!base) throw new Error('E-4002');

  const splits: XapkSplit[] = apkEntries.map((e) => {
    let kind: XapkSplit['kind'] = 'unknown';
    if (e.name === base.name) kind = 'base';
    else if (CONFIG_RE.test(e.name)) kind = 'config';
    else if (e.name.startsWith('split_') || e.name.includes('feature')) kind = 'feature';
    let hasDex = false;
    let hasLib = false;
    let hasResources = false;
    const abis = new Set<string>();
    try {
      const inner = readZip(e.data);
      for (const f of inner) {
        if (/^classes\d*\.dex$/.test(f.name)) hasDex = true;
        if (f.name.startsWith('lib/')) {
          hasLib = true;
          const m = /^lib\/([^/]+)\//.exec(f.name);
          if (m) abis.add(m[1]);
        }
        if (f.name === 'resources.arsc') hasResources = true;
      }
    } catch {
      /* ignore */
    }
    return {
      name: e.name,
      size: e.size,
      kind,
      hasDex,
      hasLib,
      hasResources,
      abis: [...abis],
    };
  });

  return {
    packageName: manifest?.package_name ?? '',
    appName: manifest?.name ?? filename.replace(/\.(xapk|apks)$/i, ''),
    versionName: manifest?.version_name ?? '',
    versionCode: String(manifest?.version_code ?? ''),
    splits,
    totalSize: bytes.length,
    format: /\.apks$/i.test(filename) ? 'apks' : /\.xapk$/i.test(filename) ? 'xapk' : 'zip',
    manifest,
  };
}

export async function convertXapk(
  bytes: Uint8Array,
  filename: string,
  opts: ConvertOptions = {},
): Promise<ConvertResult> {
  const analysis = analyzeXapk(bytes, filename);
  const entries = readZip(bytes);
  const apkEntries = entries.filter((e) => e.name.toLowerCase().endsWith('.apk'));
  const base = apkEntries.find((e) => e.name === 'base.apk') ?? apkEntries.sort((a, b) => b.size - a.size)[0]!;
  const baseZip = readZip(base.data);

  const merged: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  const out = new ZipWriter();
  const baseNames = new Set(baseZip.map((e) => e.name));
  for (const e of baseZip) {
    if (e.name.startsWith('META-INF/') && /\.(RSA|DSA|EC|SF|MF)$/i.test(e.name)) continue;
    out.addFile(e.name, e.data, { method: 'store', align: 4 });
  }

  let dexIndex = 1;
  for (const split of analysis.splits) {
    if (split.kind === 'base') continue;
    if (opts.includeSplits === false) {
      skipped.push(split.name);
      continue;
    }
    const entry = apkEntries.find((e) => e.name === split.name);
    if (!entry) continue;
    let inner: ZipEntry[];
    try {
      inner = readZip(entry.data);
    } catch {
      warnings.push(`Failed to read ${split.name}`);
      continue;
    }
    let added = 0;
    for (const f of inner) {
      if (f.name === 'AndroidManifest.xml' || f.name === 'resources.arsc' || f.name.startsWith('META-INF/')) continue;
      if (/^classes\d*\.dex$/.test(f.name)) {
        dexIndex++;
        out.addFile(`classes${dexIndex}.dex`, f.data, { method: 'store', align: 4 });
        merged.push(`${split.name} → classes${dexIndex}.dex`);
        added++;
        continue;
      }
      if (baseNames.has(f.name)) {
        skipped.push(f.name);
        continue;
      }
      out.addFile(f.name, f.data, { method: 'deflate', align: 1 });
      added++;
    }
    if (split.hasResources) warnings.push('E-4004');
    if (added > 0) merged.push(`${split.name} (${added} file(s)`);
  }

  const zipBytes = out.build();
  let apk = zipBytes;
  if (opts.keystore) {
    apk = (await signApkV2(zipBytes, opts.keystore.privateKey, opts.keystore.certificate, opts.keystore.publicKeyDer)).bytes;
  } else {
    warnings.push('E-2001');
  }

  return { apk, size: apk.length, merged, skipped, warnings };
}

/**
 * Оркестратор сборки APK: манифест + ресурсы + DEX + ZIP + подпись.
 */
import { buildManifest, AxmlNode } from './axml';
import { buildResources } from './arsc';
import { buildWebAppDex, RUNTIME_ACTIVITY } from './runtime';
import { ZipWriter } from './zip';
import { signApkV2 } from './sign';
import { concat, formatBytes } from './bytes';

export interface ApkAsset {
  path: string;
  data: Uint8Array;
}

export interface ApkBuildOptions {
  appName: string;
  packageName: string;
  versionName?: string;
  versionCode?: number;
  minSdk?: number;
  targetSdk?: number;
  /** внешний URL (PWA) или file:///android_asset/app/index.html */
  startUrl?: string;
  assets?: ApkAsset[];
  permissions?: string[];
  iconPng?: Uint8Array;
  orientation?: 'portrait' | 'landscape' | 'unspecified';
  keepScreenOn?: boolean;
  cleartext?: boolean;
  keystore?: {
    privateKey: CryptoKey;
    certificate: Uint8Array;
    publicKeyDer: Uint8Array;
  };
  /** подписывать ли APK (по умолчанию да) */
  sign?: boolean;
}

export interface ApkBuildResult {
  bytes: Uint8Array;
  size: number;
  digest: Uint8Array | null;
  files: { name: string; size: number }[];
  warnings: string[];
  resourceIds: Record<string, number>;
}

export const DEFAULT_PACKAGE = 'com.apkbuilder.app';

export function sanitizePackage(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');
  const parts = cleaned.split('.').filter(Boolean);
  if (parts.length === 0) return DEFAULT_PACKAGE;
  if (parts.some((p) => /^\d/.test(p))) {
    return parts.map((p) => (/^\d/.test(p) ? 'n' + p : p)).join('.');
  }
  return parts.join('.');
}

export function isValidPackage(name: string): boolean {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(name);
}

/**
 * Собирает установочный APK.
 */
export async function buildApk(opts: ApkBuildOptions): Promise<ApkBuildResult> {
  const warnings: string[] = [];
  const packageName = sanitizePackage(opts.packageName || DEFAULT_PACKAGE);
  if (!isValidPackage(packageName)) {
    throw new Error(`Некорректное имя пакета: ${opts.packageName}`);
  }
  const appName = (opts.appName || 'APK Builder App').slice(0, 80);
  const versionName = opts.versionName || '1.0';
  const versionCode = opts.versionCode || 1;
  const minSdk = opts.minSdk ?? 24;
  const targetSdk = opts.targetSdk ?? 34;

  const permissions = new Set<string>(['android.permission.INTERNET']);
  for (const p of opts.permissions ?? []) permissions.add(p);

  // ---------- ресурсы ----------
  const resources: { type: 'string' | 'drawable'; entries: { key: string; value: string }[] }[] = [
    { type: 'string', entries: [{ key: 'app_name', value: appName }] },
  ];
  if (opts.iconPng) {
    resources.push({ type: 'drawable', entries: [{ key: 'ic_launcher', value: 'res/mipmap-xxxhdpi/ic_launcher.png' }] });
  }
  const arsc = buildResources(packageName, resources);

  // ---------- манифест ----------
  const appAttrs: Record<string, any> = {
    'android:label': { ref: arsc.ids['string/app_name'] },
    'android:allowBackup': true,
    'android:hardwareAccelerated': true,
    'android:usesCleartextTraffic': opts.cleartext ?? true,
    'android:supportsRtl': true,
  };
  if (opts.iconPng) appAttrs['android:icon'] = { ref: arsc.ids['drawable/ic_launcher'] };

  const activityAttrs: Record<string, any> = {
    'android:name': RUNTIME_ACTIVITY,
    'android:exported': true,
    'android:configChanges': 'orientation|screenSize|keyboardHidden|uiMode',
    'android:windowSoftInputMode': 'adjustResize',
  };
  if (opts.orientation && opts.orientation !== 'unspecified') {
    activityAttrs['android:screenOrientation'] = opts.orientation;
  }

  const manifest: AxmlNode = {
    name: 'manifest',
    attrs: {
      'xmlns:android': { raw: 'http://schemas.android.com/apk/res/android' },
      'package': packageName,
      'android:versionCode': versionCode,
      'android:versionName': versionName,
      'android:installLocation': 'auto',
    },
    children: [
      {
        name: 'uses-sdk',
        attrs: { 'android:minSdkVersion': minSdk, 'android:targetSdkVersion': targetSdk },
        children: [],
      },
      ...[...permissions].map((p) => ({
        name: 'uses-permission',
        attrs: { 'android:name': p },
        children: [],
      })),
      {
        name: 'application',
        attrs: appAttrs,
        children: [
          {
            name: 'activity',
            attrs: activityAttrs,
            children: [
              {
                name: 'intent-filter',
                attrs: {},
                children: [
                  { name: 'action', attrs: { 'android:name': 'android.intent.action.MAIN' }, children: [] },
                  { name: 'category', attrs: { 'android:name': 'android.intent.category.LAUNCHER' }, children: [] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const manifestBytes = buildManifest(manifest);

  // ---------- DEX ----------
  const startUrl = opts.startUrl ?? 'file:///android_asset/app/index.html';
  const dex = buildWebAppDex({ url: startUrl });

  // ---------- ZIP ----------
  const zip = new ZipWriter();
  zip.addFile('AndroidManifest.xml', manifestBytes, { method: 'store', align: 4 });
  zip.addFile('resources.arsc', arsc.bytes, { method: 'store', align: 4 });
  zip.addFile('classes.dex', dex, { method: 'store', align: 4 });
  if (opts.iconPng) {
    zip.addFile('res/mipmap-xxxhdpi/ic_launcher.png', opts.iconPng, { method: 'store', align: 4 });
  }
  const seen = new Set<string>();
  for (const a of opts.assets ?? []) {
    const p = a.path.replace(/^\/+/, '');
    if (seen.has(p)) {
      warnings.push(`Дубликат файла пропущен: ${p}`);
      continue;
    }
    seen.add(p);
    zip.addFile(p, a.data, { method: 'deflate', align: 1 });
  }
  const zipBytes = zip.build();

  // ---------- подпись ----------
  let bytes = zipBytes;
  let digest: Uint8Array | null = null;
  if (opts.sign !== false && opts.keystore) {
    const signed = await signApkV2(zipBytes, opts.keystore.privateKey, opts.keystore.certificate, opts.keystore.publicKeyDer);
    bytes = signed.bytes;
    digest = signed.digest;
  } else if (opts.sign !== false) {
    warnings.push('APK не подписан: не выбран ключ');
  }

  return {
    bytes,
    size: bytes.length,
    digest,
    files: [
      { name: 'AndroidManifest.xml', size: manifestBytes.length },
      { name: 'resources.arsc', size: arsc.bytes.length },
      { name: 'classes.dex', size: dex.length },
      ...(opts.iconPng ? [{ name: 'res/mipmap-xxxhdpi/ic_launcher.png', size: opts.iconPng.length }] : []),
      ...(opts.assets ?? []).map((a) => ({ name: a.path, size: a.data.length })),
    ],
    warnings,
    resourceIds: arsc.ids,
  };
}

/** Собирает HTML-проект из одного файла. */
export function htmlProjectAssets(html: string): ApkAsset[] {
  return [{ path: 'assets/app/index.html', data: new TextEncoder().encode(html) }];
}

/** Превращает плоский список файлов проекта (с относительными путями) в assets. */
export function folderProjectAssets(files: { path: string; data: Uint8Array }[]): ApkAsset[] {
  return files
    .filter((f) => !f.path.startsWith('..') && !f.path.startsWith('/'))
    .map((f) => ({ path: `assets/app/${f.path.replace(/^\.?\//, '')}`, data: f.data }));
}

/** Генерирует простой HTML-файл для PWA-сборки. */
export function pwaShellHtml(opts: { url: string; title: string; color?: string }): string {
  const color = opts.color ?? '#0b0d12';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<meta name="theme-color" content="${color}"/>
<title>${escapeHtml(opts.title)}</title>
<style>
  html,body{margin:0;height:100%;background:${color};overflow:hidden}
  #f{position:fixed;inset:0;width:100%;height:100%;border:0}
  #s{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
     font:600 17px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#e8ecf5;
     background:radial-gradient(120% 120% at 50% 0%, #1b2436 0%, ${color} 60%);
     transition:opacity .35s ease}
  #s.hide{opacity:0;pointer-events:none}
  .b{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#38e8c6,#6c8cff);
     box-shadow:0 10px 30px rgba(108,140,255,.35);animation:p 1.1s ease-in-out infinite}
  @keyframes p{0%,100%{transform:scale(.86);opacity:.7}50%{transform:scale(1);opacity:1}}
</style>
</head>
<body>
<div id="s"><div class="b"></div></div>
<iframe id="f" src="${escapeHtml(opts.url)}" allow="geolocation; microphone; camera; clipboard-read; clipboard-write"
  onload="document.getElementById('s').classList.add('hide')"></iframe>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

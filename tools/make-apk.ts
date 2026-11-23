/**
 * Собирает APK самой студии из готового dist/ (vite build).
 * Внутрь assets/app/ кладётся вся веб-сборка, WebView открывает index.html.
 *
 *   npm run build && npm run apk:self
 */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildApk, type ApkAsset } from '../src/engine/apk';
import { createSelfSignedCertificate, exportKey, importStoredKey, type StoredKey } from '../src/engine/cert';
import { fromBase64 } from '../src/engine/bytes';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const KEY_PATH = join(ROOT, 'tools', 'release-key.json');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION_NAME: string = pkg.version;
const VERSION_CODE = Number(String(VERSION_NAME).split('.').map((n) => n.padStart(2, '0')).join('')) || 1;

function walk(dir: string, base = ''): ApkAsset[] {
  const out: ApkAsset[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (rel === 'apk-builder.apk') continue; // не вкладываем APK самого себя
    else out.push({ path: `assets/app/${rel}`, data: new Uint8Array(readFileSync(full)) });
  }
  return out;
}

async function loadKey(): Promise<StoredKey> {
  if (existsSync(KEY_PATH)) {
    const stored = JSON.parse(readFileSync(KEY_PATH, 'utf8')) as StoredKey;
    await importStoredKey(stored); // проверяем, что ключ расшифровывается
    return stored;
  }
  const kp = await createSelfSignedCertificate({
    commonName: 'APK Builder Studio',
    organization: 'APK Builder',
    organizationalUnit: 'Release',
    country: 'RU',
    validityDays: 3650,
  });
  const stored = await exportKey(kp, 'apk-builder-studio');
  writeFileSync(KEY_PATH, JSON.stringify(stored, null, 2));
  return stored;
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/ не найден — сначала выполните npm run build');
    process.exit(1);
  }
  const assets = walk(DIST);
  const total = assets.reduce((a, b) => a + b.data.length, 0);
  console.log(`Файлов веб-сборки: ${assets.length} (${(total / 1024).toFixed(0)} КБ)`);

  const stored = await loadKey();
  const { privateKey, certificate } = await importStoredKey(stored);

  const icon = new Uint8Array(readFileSync(join(ROOT, 'public', 'icon-192.png')));

  const res = await buildApk({
    appName: 'APK Builder',
    packageName: 'com.apkbuilder.studio',
    versionName: VERSION_NAME,
    versionCode: VERSION_CODE,
    minSdk: 24,
    targetSdk: 34,
    startUrl: 'file:///android_asset/app/index.html',
    assets,
    permissions: [],
    iconPng: icon,
    orientation: 'unspecified',
    keystore: { privateKey, certificate, publicKeyDer: fromBase64(stored.publicKey) },
  });

  mkdirSync(join(ROOT, 'public'), { recursive: true });
  mkdirSync(join(ROOT, 'release'), { recursive: true });
  writeFileSync(join(ROOT, 'public', 'apk-builder.apk'), res.bytes);
  const outName = `APK-Builder-${VERSION_NAME}.apk`;
  writeFileSync(join(ROOT, 'release', outName), res.bytes);
  console.log(`APK: ${outName} — ${(res.bytes.length / 1024).toFixed(0)} КБ, файлов внутри: ${res.files.length}`);
  if (res.warnings.length) console.log('Предупреждения:', res.warnings);
  console.log(`Отпечаток ключа: ${stored.fingerprint}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

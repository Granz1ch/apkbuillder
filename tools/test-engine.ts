import { mkdirSync, writeFileSync } from 'node:fs';
import { buildApk } from '../src/engine/apk';
import { createSelfSignedCertificate } from '../src/engine/cert';
import { inspectSignature } from '../src/engine/sign';

async function main() {
  mkdirSync('out', { recursive: true });
  const kp = await createSelfSignedCertificate({ commonName: 'APK Builder Test', organization: 'APK Builder' });

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Test</title>
<style>body{font-family:sans-serif;background:#0b0d12;color:#fff;display:grid;place-items:center;height:100vh;margin:0}</style></head>
<body><h1>Hello, APK Builder! 👋</h1></body></html>`;

  const res = await buildApk({
    appName: 'Test App',
    packageName: 'com.apkbuilder.demo',
    versionName: '1.0.0',
    versionCode: 1,
    keystore: {
      privateKey: kp.privateKey,
      certificate: kp.certificate,
      publicKeyDer: kp.publicKeyDer,
    },
    assets: [{ path: 'assets/app/index.html', data: new TextEncoder().encode(html) }],
    iconPng: undefined,
  });

  writeFileSync('out/test.apk', res.bytes);
  console.log('APK size:', res.size);
  console.log('files:', res.files.map((f) => `${f.name} (${f.size})`).join(', '));
  console.log('warnings:', res.warnings);
  const info = await inspectSignature(res.bytes);
  console.log('signature:', info);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * APK Builder — desktop launcher.
 * Starts a local static server and opens the app in a browser.
 * A single executable: the whole web build is embedded (desktop/assets.ts).
 */
import { ASSETS, ASSET_COUNT } from './assets';

const VERSION = '1.1.0';

const files = new Map<string, { mime: string; data: Buffer }>();
for (const [path, [mime, b64]] of Object.entries(ASSETS)) {
  files.set('/' + path.replace(/^\/+/, ''), { mime, data: Buffer.from(b64, 'base64') });
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  idleTimeout: 120,
  fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') path = '/index.html';

    // SPA fallback: /converter → index.html
    let entry = files.get(path);
    if (!entry && !path.includes('.')) entry = files.get('/index.html');
    if (!entry) {
      return new Response('Not found: ' + path, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    const headers: Record<string, string> = {
      'content-type': entry.mime,
      'cache-control': path === '/index.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    };
    if (req.method === 'HEAD') return new Response(null, { headers });
    return new Response(new Response(entry.data).body, { headers });
  },
});

const url = `http://127.0.0.1:${server.port}/`;

function openBrowser(target: string) {
  const cmd =
    process.platform === 'win32'
      ? ['cmd', '/c', 'start', '', target]
      : process.platform === 'darwin'
        ? ['open', target]
        : ['xdg-open', target];
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' });
  } catch {
    /* the browser did not open — the address is printed anyway */
  }
}

const line = '─'.repeat(56);
console.log('');
console.log(`\x1b[36m  APK Builder ${VERSION}\x1b[0m — Android app build studio`);
console.log(`  ${line}`);
console.log(`  Local address  : ${url}`);
console.log(`  Files embedded : ${ASSET_COUNT}`);
console.log(`  Mode           : offline, no Android SDK`);
console.log(`  ${line}`);
console.log('  You can close this window — the app opens in your browser.');
console.log('  Press Ctrl+C to stop.');
console.log('');

openBrowser(url);

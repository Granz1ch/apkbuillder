/**
 * APK Builder — настольный лаунчер.
 * Поднимает локальный статический сервер и открывает приложение в браузере.
 * Один исполняемый файл: вся веб-сборка встроена (desktop/assets.ts).
 */
import { ASSETS, ASSET_COUNT } from './assets';

const VERSION = '1.0.0';

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

    // SPA-fallback: /converter → index.html
    let entry = files.get(path);
    if (!entry && !path.includes('.')) entry = files.get('/index.html');
    if (!entry) {
      return new Response('Не найдено: ' + path, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
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
    /* браузер не открылся — адрес всё равно напечатан */
  }
}

const line = '─'.repeat(56);
console.log('');
console.log(`\x1b[36m  APK Builder ${VERSION}\x1b[0m — студия сборки Android-приложений`);
console.log(`  ${line}`);
console.log(`  Локальный адрес : ${url}`);
console.log(`  Файлов встроено : ${ASSET_COUNT}`);
console.log(`  Режим           : офлайн, без Android SDK`);
console.log(`  ${line}`);
console.log('  Окно можно закрыть — приложение откроется в браузере.');
console.log('  Чтобы остановить, нажмите Ctrl+C.');
console.log('');

openBrowser(url);

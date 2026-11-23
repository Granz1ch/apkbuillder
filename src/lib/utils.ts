/** Скачивание файла в браузере. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/octet-stream') {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain') {
  downloadBytes(new TextEncoder().encode(text), filename, mime);
}

/**
 * Приложение запущено в Android WebView (в собственной APK-сборке)?
 * В этом режиме системный WebView не отдаёт файлы через <a download>,
 * поэтому пользователю показываем подсказку.
 */
export function isAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /\bwv\b/.test(navigator.userAgent) && /Android/i.test(navigator.userAgent);
}

/** Читает File в Uint8Array. */
export function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

/** Собирает файлы из webkitDirectory-инпута в список {path, data}. */
export async function readDirectoryFiles(files: File[]): Promise<{ path: string; data: Uint8Array }[]> {
  const out: { path: string; data: Uint8Array }[] = [];
  for (const f of files) {
    const rel = (f as any).webkitRelativePath as string | undefined;
    const p = rel ? rel.split('/').slice(1).join('/') : f.name;
    if (!p || f.size === 0) continue;
    out.push({ path: p, data: await readFileBytes(f) });
  }
  return out;
}

export function timestampSlug(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'app';
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

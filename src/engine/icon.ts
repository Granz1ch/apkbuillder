/** Работа с иконками: загрузка дефолтной и ресайз через canvas. */

let defaultIcon: Uint8Array | null = null;

export async function loadDefaultIcon(): Promise<Uint8Array | null> {
  if (defaultIcon) return defaultIcon;
  try {
    const res = await fetch('./icon.png');
    if (!res.ok) return null;
    defaultIcon = new Uint8Array(await res.arrayBuffer());
    return defaultIcon;
  } catch {
    return null;
  }
}

export async function loadImage(data: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([data as BlobPart], { type: 'image/png' });
  return createImageBitmap(blob);
}

export async function resizePng(data: Uint8Array, size: number): Promise<Uint8Array> {
  const bmp = await loadImage(data);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, size, size);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function pngInfo(data: Uint8Array): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await loadImage(data);
    const info = { width: bmp.width, height: bmp.height };
    bmp.close();
    return info;
  } catch {
    return null;
  }
}

/** Рисует иконку-заглушку (если нет интернета и ассетов). */
export function makeFallbackIcon(size = 192): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#5eead4');
  g.addColorStop(0.55, '#818cf8');
  g.addColorStop(1, '#f472b6');
  ctx.fillStyle = g;
  const r = size * 0.22;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  ctx.fillStyle = 'rgba(4,6,11,0.9)';
  ctx.font = `800 ${size * 0.52}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', size / 2, size * 0.54);
  return new Uint8Array(
    Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (c) => c.charCodeAt(0)),
  );
}

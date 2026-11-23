import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="boot"></div><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
for (const k of ['HTMLElement','Element','Node','MutationObserver','KeyboardEvent','MouseEvent','Event','DragEvent','DataTransfer','File','FileReader','Blob','DocumentFragment','Range','Selection','SVGElement','Text','HTMLInputElement']) {
  if (dom.window[k]) g[k] = dom.window[k];
}
g.getComputedStyle = dom.window.getComputedStyle;
g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 16);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.indexedDB = undefined;

const errors: string[] = [];
console.error = (...a: any[]) => { errors.push(a.map(String).join(' ')); };

async function main() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const { default: App } = await import('../src/App');
  const { useStore } = await import('../src/store');
  const root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(React.createElement(App)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });

  const pages = ['dashboard','converter','builder','decompiler','xapk','signing','errors','settings'];
  for (const p of pages) {
    errors.length = 0;
    await act(async () => { useStore.getState().setActivePage(p); });
    await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
    const html = document.getElementById('root')!.innerHTML;
    const h1 = document.querySelector('.page h1')?.textContent ?? '';
    console.log(`${p.padEnd(11)} html=${String(html.length).padStart(6)}  h1="${h1.slice(0,46)}"  errors=${errors.length}`);
    errors.slice(0, 3).forEach((e) => console.log('     ERR:', e.replace(/\s+/g, ' ').slice(0, 260)));
  }
  root.unmount();
}
main().catch((e) => { console.log('FATAL', e?.stack ?? e); process.exit(1); });

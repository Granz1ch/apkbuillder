/**
 * Global application state (zustand) + persistence in IndexedDB.
 */
import { create } from 'zustand';
import { idbGet, idbSet } from './lib/idb';
import type { StoredKey } from './engine/cert';

export interface LogEntry {
  id: string;
  ts: number;
  level: 'info' | 'ok' | 'warn' | 'err';
  message: string;
  code?: string;
}

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  kind: 'info' | 'ok' | 'err' | 'warn';
}

export interface BuildRecord {
  id: string;
  type: 'convert' | 'build' | 'xapk' | 'decompile' | 'sign';
  name: string;
  size: number;
  at: number;
  path?: string;
  ok: boolean;
  errorId?: string;
}

export interface Settings {
  defaultPackage: string;
  minSdk: number;
  targetSdk: number;
  orientation: 'unspecified' | 'portrait' | 'landscape';
  themeColor: string;
  autoValidate: boolean;
  signBuilds: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  defaultPackage: 'com.apkbuilder.app',
  minSdk: 24,
  targetSdk: 34,
  orientation: 'unspecified',
  themeColor: '#0b0d12',
  autoValidate: true,
  signBuilds: true,
};

export const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>My App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="app">
    <header class="hero">
      <div class="badge">APK BUILDER</div>
      <h1>Hello, world 👋</h1>
      <p>This app is built from plain HTML. Replace the code on the left and build your own APK.</p>
    </header>

    <section class="grid">
      <button class="tile" data-action="vibrate">
        <span class="ico">⚡</span>
        <span class="t">Vibration</span>
      </button>
      <button class="tile" data-action="toast">
        <span class="ico">🔔</span>
        <span class="t">Notification</span>
      </button>
      <button class="tile" data-action="theme">
        <span class="ico">🌙</span>
        <span class="t">Theme</span>
      </button>
    </section>

    <footer class="foot">
      <span>Built with <b>APK Builder</b></span>
      <span class="dot"></span>
      <span id="clock">--:--</span>
    </footer>
  </main>
  <script src="app.js"></script>
</body>
</html>
`;

export const SAMPLE_CSS = `:root {
  --bg: #0b0d12;
  --panel: rgba(255, 255, 255, .05);
  --text: #e9edf6;
  --muted: #9aa4ba;
  --accent: #5eead4;
  --accent-2: #818cf8;
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(120% 90% at 50% -10%, #16203a 0%, var(--bg) 60%);
  color: var(--text);
  font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
  display: grid;
  place-items: center;
  padding: 24px;
}

.app { width: 100%; max-width: 420px; }

.hero { padding: 28px 24px; border-radius: 24px; border: 1px solid var(--panel);
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.01)); }

.badge { display: inline-block; padding: 5px 10px; border-radius: 99px;
         font-size: 10px; letter-spacing: .18em; color: var(--accent);
         border: 1px solid rgba(94,234,212,.3); background: rgba(94,234,212,.08); }

h1 { font-size: 30px; letter-spacing: -.03em; margin: 16px 0 8px; }
p  { color: var(--muted); font-size: 14px; line-height: 1.6; margin: 0; }

.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }

.tile {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 18px 8px; border-radius: 18px; cursor: pointer;
  border: 1px solid var(--panel); background: var(--panel); color: var(--text);
  transition: transform .15s ease, border-color .15s ease;
}
.tile:active { transform: scale(.96); }
.tile .ico { font-size: 22px; }
.tile .t { font-size: 12px; color: var(--muted); }

.foot { display: flex; align-items: center; gap: 8px; justify-content: center;
        margin-top: 22px; font-size: 11px; color: var(--muted); }
.foot .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--muted); }
`;

export const SAMPLE_JS = `// Lightweight app logic
const clock = document.getElementById('clock');

function tick() {
  clock.textContent = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

setInterval(tick, 1000);
tick();

document.querySelectorAll('.tile').forEach((tile) => {
  tile.addEventListener('click', () => {
    const action = tile.dataset.action;
    if (action === 'vibrate' && navigator.vibrate) navigator.vibrate(30);
    if (action === 'toast') alert('It works! 🎉');
    if (action === 'theme') document.body.classList.toggle('dark');
  });
});
`;

export const SAMPLE_PY = `# Python → APK
#
# Python code is syntax-checked and stored in the project.
# To build a native APK use an HTML project:
# the engine builds a WebView wrapper, while the script stays in assets.
#
# Example of valid code:

def greet(name: str) -> str:
    return f"Hello, {name}!"


class App:
    def __init__(self, title: str) -> None:
        self.title = title

    def run(self) -> None:
        print(greet("APK Builder"))
        print(self.title)


if __name__ == "__main__":
    App("Demo").run()
`;

export interface AppState {
  booted: boolean;
  projectName: string;
  files: Record<string, Uint8Array>;
  keys: StoredKey[];
  logs: LogEntry[];
  toasts: ToastItem[];
  history: BuildRecord[];
  settings: Settings;
  consoleOpen: boolean;
  consoleHeight: number;
  sidebarOpen: boolean;
  activePage: string;

  boot: () => Promise<void>;
  setProjectName: (n: string) => void;
  setFile: (path: string, data: Uint8Array) => void;
  removeFile: (path: string) => void;
  clearFolder: (prefix: string) => number;
  addKey: (k: StoredKey) => void;
  removeKey: (alias: string) => void;
  log: (level: LogEntry['level'], message: string, code?: string) => void;
  clearLogs: () => void;
  toast: (kind: ToastItem['kind'], title: string, message?: string) => void;
  dismissToast: (id: string) => void;
  pushHistory: (r: BuildRecord) => void;
  setSettings: (s: Partial<Settings>) => void;
  toggleConsole: (v?: boolean) => void;
  setConsoleHeight: (h: number) => void;
  setSidebar: (v: boolean) => void;
  setActivePage: (p: string) => void;
}

let uid = 0;
const nextId = () => `${Date.now().toString(36)}${(uid++).toString(36)}`;

export const useStore = create<AppState>((set, get) => ({
  booted: false,
  projectName: 'My Project',
  files: {
    'src/index.html': new TextEncoder().encode(SAMPLE_HTML),
    'src/style.css': new TextEncoder().encode(SAMPLE_CSS),
    'src/app.js': new TextEncoder().encode(SAMPLE_JS),
    'src/app.py': new TextEncoder().encode(SAMPLE_PY),
  },
  keys: [],
  logs: [],
  toasts: [],
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  consoleOpen: false,
  consoleHeight: 240,
  sidebarOpen: false,
  activePage: 'dashboard',

  boot: async () => {
    if (get().booted) return;
    const [meta, files, keys, history, settings] = await Promise.all([
      idbGet<{ projectName: string }>('meta'),
      idbGet<Record<string, Uint8Array>>('files'),
      idbGet<StoredKey[]>('keys'),
      idbGet<BuildRecord[]>('history'),
      idbGet<Settings>('settings'),
    ]);
    set({
      booted: true,
      projectName: meta?.projectName ?? 'My Project',
      files: files && Object.keys(files).length ? files : get().files,
      keys: keys ?? [],
      history: history ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    });
    get().log('ok', 'APK Builder engine initialized');
  },

  setProjectName: (n) => {
    set({ projectName: n });
    void idbSet('meta', { projectName: n });
  },

  setFile: (path, data) => {
    set((s) => ({ files: { ...s.files, [path]: data } }));
  },

  removeFile: (path) => {
    set((s) => {
      const f = { ...s.files };
      delete f[path];
      return { files: f };
    });
  },

  clearFolder: (prefix) => {
    const before = Object.keys(get().files).length;
    set((s) => {
      const f: Record<string, Uint8Array> = {};
      for (const [k, v] of Object.entries(s.files)) if (!k.startsWith(prefix)) f[k] = v;
      return { files: f };
    });
    return before - Object.keys(get().files).length;
  },

  addKey: (k) => {
    set((s) => ({ keys: [...s.keys.filter((x) => x.alias !== k.alias), k] }));
  },

  removeKey: (alias) => {
    set((s) => ({ keys: s.keys.filter((x) => x.alias !== alias) }));
  },

  log: (level, message, code) => {
    const entry: LogEntry = { id: nextId(), ts: Date.now(), level, message, code };
    set((s) => ({ logs: [...s.logs.slice(-400), entry] }));
    if (level === 'err') {
      // eslint-disable-next-line no-console
      console.error(`[${code ?? 'ERR'}] ${message}`);
    }
  },

  clearLogs: () => set({ logs: [] }),

  toast: (kind, title, message) => {
    const item: ToastItem = { id: nextId(), title, message, kind };
    set((s) => ({ toasts: [...s.toasts.slice(-4), item] }));
    setTimeout(() => get().dismissToast(item.id), kind === 'err' ? 6000 : 3800);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  pushHistory: (r) => set((s) => ({ history: [r, ...s.history].slice(0, 60) })),

  setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),

  toggleConsole: (v) => set((s) => ({ consoleOpen: v ?? !s.consoleOpen })),
  setConsoleHeight: (h) => set({ consoleHeight: Math.max(120, Math.min(560, h)) }),
  setSidebar: (v) => set({ sidebarOpen: v }),
  setActivePage: (p) => set({ activePage: p, sidebarOpen: false }),
}));

/* ---------- autosave ---------- */
let saveTimer: number | null = null;
useStore.subscribe((state, prev) => {
  if (!state.booted) return;
  if (state.files !== prev.files) scheduleSave('files', state.files);
  if (state.keys !== prev.keys) scheduleSave('keys', state.keys);
  if (state.history !== prev.history) scheduleSave('history', state.history);
  if (state.settings !== prev.settings) scheduleSave('settings', state.settings);
});

function scheduleSave(key: string, value: unknown) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void idbSet(key, value);
  }, 350);
}

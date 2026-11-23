import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Topbar, Sidebar } from './components/Chrome';
import { Console, Toasts } from './components/Panels';
import { Dashboard } from './pages/Dashboard';
import { Converter } from './pages/Converter';
import { Builder } from './pages/Builder';
import { Decompiler } from './pages/Decompiler';
import { XapkPage } from './pages/Xapk';
import { Signing } from './pages/Signing';
import { ErrorsPage } from './pages/Errors';
import { SettingsPage } from './pages/Settings';
import { isAndroidWebView } from './lib/utils';
import { Smartphone, X } from 'lucide-react';

const PAGES: Record<string, () => React.ReactElement> = {
  dashboard: () => <Dashboard />,
  converter: () => <Converter />,
  builder: () => <Builder />,
  decompiler: () => <Decompiler />,
  xapk: () => <XapkPage />,
  signing: () => <Signing />,
  errors: () => <ErrorsPage />,
  settings: () => <SettingsPage />,
};

function AndroidNotice() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem('ab-webview-notice') === '1');
    } catch {
      /* ignore */
    }
  }, []);
  if (hidden || !isAndroidWebView()) return null;
  return (
    <div
      className="flex gap-10"
      style={{
        padding: '8px 16px',
        background: 'rgba(96,165,250,.08)',
        borderBottom: '1px solid rgba(96,165,250,.18)',
        fontSize: 11.5,
        color: 'var(--text-2)',
        alignItems: 'center',
      }}
    >
      <Smartphone size={13} style={{ color: 'var(--info)', flex: 'none' }} />
      <span style={{ flex: 1 }}>
        Android build: WebView cannot export files — the result stays inside the project. To export APKs
        use the desktop version.
      </span>
      <button
        className="btn btn-ghost btn-icon"
        style={{ width: 22, height: 22 }}
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem('ab-webview-notice', '1');
          } catch {
            /* ignore */
          }
        }}
        title="Hide"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function App() {
  const boot = useStore((s) => s.boot);
  const activePage = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);
  const toggleConsole = useStore((s) => s.toggleConsole);

  useEffect(() => {
    boot().finally(() => {
      const el = document.getElementById('boot');
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 520);
      }
    });
  }, [boot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === '`') {
        e.preventDefault();
        toggleConsole();
        return;
      }
      if (e.altKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        const item = ['dashboard', 'converter', 'builder', 'decompiler', 'xapk', 'signing', 'errors', 'settings'];
        setActivePage(item[parseInt(e.key, 10) - 1]);
      }
      if (e.key === 'Escape') setActivePage(activePage);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePage, setActivePage, toggleConsole]);

  const render = PAGES[activePage] ?? PAGES.dashboard;

  return (
    <div className="app noise">
      <Topbar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <AndroidNotice />
          <div className="page-scroll" key={activePage}>
            {render()}
          </div>
          <Console />
        </main>
      </div>
      <Toasts />
    </div>
  );
}

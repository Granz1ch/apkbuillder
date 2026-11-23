import { useState } from 'react';
import {
  LayoutDashboard,
  FileCode2,
  FileSearch,
  PackageOpen,
  Hammer,
  KeyRound,
  AlertOctagon,
  Settings,
  FolderTree,
  TerminalSquare,
  Menu,
  X,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { useStore } from '../store';
import { Button, Modal, Input, Field, formatBytes } from './ui';

export const NAV = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard, key: '1', group: 'Студия' },
  { id: 'converter', label: 'Конвертер', icon: FileCode2, key: '2', group: 'Студия' },
  { id: 'builder', label: 'Сборка APK', icon: Hammer, key: '3', group: 'Студия' },
  { id: 'decompiler', label: 'Декомпилятор', icon: FileSearch, key: '4', group: 'Инструменты' },
  { id: 'xapk', label: 'XAPK → APK', icon: PackageOpen, key: '5', group: 'Инструменты' },
  { id: 'signing', label: 'Подпись', icon: KeyRound, key: '6', group: 'Инструменты' },
  { id: 'errors', label: 'Ошибки', icon: AlertOctagon, key: '7', group: 'Справочник' },
  { id: 'settings', label: 'Настройки', icon: Settings, key: '8', group: 'Справочник' },
];

export function Topbar() {
  const projectName = useStore((s) => s.projectName);
  const setProjectName = useStore((s) => s.setProjectName);
  const consoleOpen = useStore((s) => s.consoleOpen);
  const toggleConsole = useStore((s) => s.toggleConsole);
  const setSidebar = useStore((s) => s.setSidebar);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState(projectName);

  const errors = useStore((s) => s.logs.filter((l) => l.level === 'err').length);

  return (
    <header className="topbar">
      <button
        className="btn btn-ghost btn-icon"
        style={{ display: 'none' }}
        onClick={() => setSidebar(!sidebarOpen)}
        aria-label="Меню"
      >
        <Menu size={18} />
      </button>
      <div className="brand">
        <div className="brand-mark">A</div>
        <div>
          <div className="brand-name">
            APK <span>Builder</span>
          </div>
        </div>
        <span className="brand-ver">v1.0</span>
      </div>

      <div className="topbar-center">
        <button className="project-chip" onClick={() => { setName(projectName); setRename(true); }}>
          <span className="dot" />
          <div style={{ minWidth: 0 }}>
            <div className="nm">{projectName}</div>
            <div className="pth">~/projects/{projectName.toLowerCase().replace(/\s+/g, '-')}</div>
          </div>
          <Pencil size={11} style={{ opacity: 0.4, flex: 'none' }} />
        </button>
      </div>

      <div className="topbar-right">
        <div className="engine-pill">
          <span className="led" />
          ENGINE READY
        </div>
        {errors > 0 && <span className="badge badge-err">{errors} ошибок</span>}
        <button
          className={`btn btn-sm ${consoleOpen ? '' : 'btn-ghost'}`}
          onClick={() => toggleConsole()}
          title="Консоль ( ` )"
        >
          <TerminalSquare size={14} />
          <span className="hide-sm">Консоль</span>
        </button>
      </div>

      <Modal
        open={rename}
        onClose={() => setRename(false)}
        title="Переименовать проект"
        sub="Имя используется в заголовках и путях"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRename(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (name.trim()) setProjectName(name.trim());
                setRename(false);
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <Field label="Название проекта">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </header>
  );
}

const FOLDERS = [
  { prefix: 'src/', label: 'src', desc: 'исходники' },
  { prefix: 'convertors/', label: 'convertors', desc: 'результаты' },
  { prefix: 'decompilation/', label: 'decompilation', desc: 'декомпиляция' },
  { prefix: 'xapkconvs/', label: 'xapkconvs', desc: 'XAPK' },
  { prefix: 'build/', label: 'build', desc: 'сборки' },
];

export function Sidebar() {
  const activePage = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);
  const files = useStore((s) => s.files);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebar = useStore((s) => s.setSidebar);
  const errorCount = useStore((s) => s.logs.filter((l) => l.level === 'err').length);

  const counts = FOLDERS.map((f) => {
    const list = Object.keys(files).filter((k) => k.startsWith(f.prefix));
    const size = list.reduce((a, k) => a + (files[k]?.length ?? 0), 0);
    return { ...f, count: list.length, size };
  });

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <>
      {sidebarOpen && <div className="overlay" style={{ zIndex: 55 }} onClick={() => setSidebar(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <nav className="nav">
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-label">{g}</div>
              {NAV.filter((n) => n.group === g).map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <div
                    key={item.id}
                    className={`nav-item ${active ? 'active' : ''}`}
                    onClick={() => setActivePage(item.id)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                    {item.id === 'errors' && errorCount > 0 ? (
                      <span className="nav-badge">{errorCount}</span>
                    ) : (
                      <span className="nav-key">{item.key}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="tree">
          <div className="tree-head">
            <span className="tree-title">Проект</span>
            <span className="tree-title" style={{ letterSpacing: 0 }}>
              {Object.keys(files).length} файлов
            </span>
          </div>
          <div className="tree-list">
            {counts.map((f) => (
              <div className="tree-row" key={f.prefix}>
                <FolderTree />
                <span className="dir-name">{f.label}</span>
                <span className="sz">{f.count ? `${f.count} · ${formatBytes(f.size)}` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

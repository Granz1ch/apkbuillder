import { useEffect, useRef } from 'react';
import { TerminalSquare, Trash2, ChevronDown, X } from 'lucide-react';
import { useStore } from '../store';
import { formatTime } from './ui';

export function Console() {
  const open = useStore((s) => s.consoleOpen);
  const logs = useStore((s) => s.logs);
  const height = useStore((s) => s.consoleHeight);
  const setHeight = useStore((s) => s.setConsoleHeight);
  const toggle = useStore((s) => s.toggleConsole);
  const clear = useStore((s) => s.clearLogs);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs, open]);

  if (!open) return null;

  return (
    <div className="console" style={{ height }}>
      <div className="console-head">
        <div className="console-title">
          <TerminalSquare size={12} />
          Build log
          <span className="badge badge-neutral" style={{ height: 18 }}>
            {logs.length}
          </span>
        </div>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={clear} title="Clear">
          <Trash2 size={13} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => toggle(false)} title="Collapse">
          <ChevronDown size={14} />
        </button>
      </div>
      <div
        className="console-body"
        ref={bodyRef}
        style={{ height: height - 36 }}
      >
        {logs.length === 0 ? (
          <div className="console-empty">The log is empty — run a build or a check</div>
        ) : (
          logs.map((l) => (
            <div key={l.id} className={`log-line ${l.level}`}>
              <span className="ts">{formatTime(l.ts)}</span>
              <span className="lv">{l.level}</span>
              <span className="msg">
                {l.code ? <span style={{ color: 'var(--accent-2)' }}>[{l.code}] </span> : null}
                {l.message}
              </span>
            </div>
          ))
        )}
      </div>
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = height;
          const move = (ev: MouseEvent) => setHeight(startH + (startY - ev.clientY));
          const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
          };
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', up);
        }}
        style={{
          position: 'absolute',
          top: -3,
          left: 0,
          right: 0,
          height: 7,
          cursor: 'ns-resize',
          zIndex: 5,
        }}
      />
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} style={{ cursor: 'pointer' }}>
          <div className="ti">
            {t.kind === 'err' ? (
              <X size={13} />
            ) : t.kind === 'ok' ? (
              <span style={{ fontSize: 13 }}>✓</span>
            ) : (
              <span style={{ fontSize: 13 }}>i</span>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="tt">{t.title}</div>
            {t.message && <div className="tm">{t.message}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

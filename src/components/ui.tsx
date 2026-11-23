import React, { forwardRef } from 'react';
import { Loader2, X, Check, AlertTriangle, Info, XCircle } from 'lucide-react';

/* ---------------- button ---------------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'default', size = 'md', loading, icon, block, className = '', children, ...rest },
  ref,
) {
  const cls = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    variant === 'danger' ? 'btn-danger' : '',
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    loading ? 'loading' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} className={cls} {...rest}>
      {loading ? null : icon}
      {children}
    </button>
  );
});

/* ---------------- field ---------------- */
export function Field({
  label,
  required,
  tip,
  error,
  children,
  hint,
}: {
  label?: string;
  required?: boolean;
  tip?: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      {label && (
        <div className="label">
          <span>
            {label}
            {required && <span className="req">*</span>}
          </span>
          {tip && <span className="tip">{tip}</span>}
        </div>
      )}
      {children}
      {error ? <div className="hint err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(
  function Input({ mono, className = '', ...rest }, ref) {
    return <input ref={ref} className={`input ${mono ? 'mono' : ''} ${className}`} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`textarea ${className}`} {...rest} />;
  },
);

export function Select({
  children,
  className = '',
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}

/* ---------------- badge ---------------- */
export function Badge({
  tone = 'neutral',
  children,
  icon,
  ...rest
}: {
  tone?: 'ok' | 'warn' | 'err' | 'info' | 'neutral' | 'accent';
  children: React.ReactNode;
  icon?: React.ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`badge badge-${tone}`} {...rest}>
      {icon}
      {children}
    </span>
  );
}

/* ---------------- card ---------------- */
export function Card({
  children,
  className = '',
  interactive,
  pad,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  pad?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${interactive ? 'interactive' : ''} ${pad ? 'pad' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHead({
  icon,
  title,
  sub,
  right,
  tone,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  tone?: 'teal' | 'pink' | 'amber';
}) {
  return (
    <div className="card-head">
      {icon && <div className={`card-icon ${tone ?? ''}`}>{icon}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ---------------- progress ---------------- */
export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`progress ${className}`}>
      <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ---------------- switch ---------------- */
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <div className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

/* ---------------- empty state ---------------- */
export function Empty({ icon, title, sub, action }: { icon?: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="ico">{icon}</div>}
      <div className="t">{title}</div>
      {sub && <div className="s">{sub}</div>}
      {action && <div className="mt-12">{action}</div>}
    </div>
  );
}

/* ---------------- modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: width ? `min(${width}px, 100%)` : undefined }}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- misc ---------------- */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="section-title">{children}</div>;
}

export function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? <Check size={13} /> : <XCircle size={13} />;
}

export function Loading({ label }: { label?: string }) {
  return (
    <div className="flex center gap-8 muted" style={{ padding: 18 }}>
      <Loader2 size={16} className="pulse-soft" />
      {label && <span className="tiny">{label}</span>}
    </div>
  );
}

export function InlineHint({ tone, children }: { tone: 'warn' | 'err' | 'ok' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'err' ? XCircle : tone === 'ok' ? Check : Info;
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'err' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--info)';
  return (
    <div className="flex gap-8" style={{ fontSize: 12, color, lineHeight: 1.45 }}>
      <Icon size={14} style={{ flex: 'none', marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

export function Divider() {
  return <hr className="divider" />;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

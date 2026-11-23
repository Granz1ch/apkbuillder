import { ReactNode } from 'react';

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="page" style={wide ? { maxWidth: 1680 } : undefined}>
      {children}
    </div>
  );
}

export function PageHead({
  num,
  eyebrow,
  title,
  sub,
  actions,
}: {
  num: string;
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow">
          <span className="num">{num}</span>
          <span className="sep" />
          <span>{eyebrow}</span>
        </div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

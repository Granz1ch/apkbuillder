import { useMemo, useState } from 'react';
import { AlertOctagon, Search, XCircle, AlertTriangle, Info, BookOpen } from 'lucide-react';
import { Page, PageHead } from '../components/Page';
import { Card, Badge, Input } from '../components/ui';
import { ERROR_CATALOG, type ErrorDef } from '../engine/errors';

const SCOPES: Record<string, string> = {
  validator: 'Validation',
  build: 'Build',
  decompile: 'Decompilation',
  xapk: 'XAPK',
  sign: 'Signing',
  engine: 'Engine',
};

export function ErrorsPage() {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<string>('all');

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ERROR_CATALOG.filter(
      (e) =>
        (scope === 'all' || e.scope === scope) &&
        (!query ||
          e.id.toLowerCase().includes(query) ||
          e.title.toLowerCase().includes(query) ||
          e.cause.toLowerCase().includes(query) ||
          e.fix.toLowerCase().includes(query)),
    );
  }, [q, scope]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of ERROR_CATALOG) m[e.scope] = (m[e.scope] ?? 0) + 1;
    return m;
  }, []);

  return (
    <Page>
      <PageHead
        num="06"
        eyebrow="Reference"
        title={
          <>
            Every failure has its own <em>identifier</em>
          </>
        }
        sub="Every error in the app has a code, a cause and a way to fix it. Search by code, title or description."
        actions={<Badge tone="accent">{ERROR_CATALOG.length} total</Badge>}
      />

      <div className="flex gap-10 mb-16" style={{ flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-4)' }} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: E-2001, signing, decompilation…" style={{ paddingLeft: 34 }} />
        </div>
        <div className="tabs">
          <div className={`tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>
            All
          </div>
          {Object.entries(SCOPES).map(([k, v]) => (
            <div key={k} className={`tab ${scope === k ? 'active' : ''}`} onClick={() => setScope(k)}>
              {v} <span className="cnt">{counts[k] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="col gap-8">
        {list.map((e: ErrorDef) => {
          const Icon = e.severity === 'error' ? XCircle : e.severity === 'warning' ? AlertTriangle : Info;
          const color = e.severity === 'error' ? 'var(--danger)' : e.severity === 'warning' ? 'var(--warn)' : 'var(--info)';
          return (
            <Card key={e.id} className="interactive" style={{ padding: '16px 18px' }}>
              <div className="flex gap-14" style={{ alignItems: 'flex-start' }}>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    padding: '4px 8px',
                    borderRadius: 6,
                    color,
                    border: `1px solid ${color}44`,
                    background: `${color}14`,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.06em',
                    flex: 'none',
                  }}
                >
                  {e.id}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</span>
                    <Badge tone={e.severity === 'error' ? 'err' : e.severity === 'warning' ? 'warn' : 'info'}>
                      {SCOPES[e.scope]}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.55 }}>
                    <span style={{ color: 'var(--text-4)' }}>Cause: </span>
                    {e.cause}
                  </div>
                  <div className="flex gap-8" style={{ fontSize: 12, marginTop: 5, lineHeight: 1.55 }}>
                    <Icon size={13} style={{ color, flex: 'none', marginTop: 1 }} />
                    <span style={{ color: 'var(--text-3)' }}>{e.fix}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {list.length === 0 && (
          <div className="empty">
            <BookOpen size={20} />
            <div className="t">Nothing found</div>
            <div className="s">Try another query</div>
          </div>
        )}
      </div>
    </Page>
  );
}

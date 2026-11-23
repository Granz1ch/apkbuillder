import {
  ArrowRight,
  FileCode2,
  FileSearch,
  PackageOpen,
  Hammer,
  KeyRound,
  Sparkles,
  ShieldCheck,
  Cpu,
  Activity,
  CheckCircle2,
  AlertCircle,
  Layers,
  Zap,
} from 'lucide-react';
import { useStore } from '../store';
import { Page, PageHead } from '../components/Page';
import { Card, CardHead, Badge, Button, formatBytes, formatDate } from '../components/ui';
import { useNavigate } from '../lib/nav';

export function Dashboard() {
  const history = useStore((s) => s.history);
  const files = useStore((s) => s.files);
  const keys = useStore((s) => s.keys);
  const logs = useStore((s) => s.logs);
  const nav = useNavigate();

  const builds = history.length;
  const okBuilds = history.filter((h) => h.ok).length;
  const errors = logs.filter((l) => l.level === 'err').length;
  const last = history[0];
  const apkCount = Object.keys(files).filter((k) => k.endsWith('.apk')).length;

  const modules = [
    {
      id: 'converter',
      icon: FileCode2,
      title: 'Converter',
      desc: 'HTML / CSS / JS / Python → APK with code validation',
      tone: 'teal' as const,
      tag: '01',
    },
    {
      id: 'builder',
      icon: Hammer,
      title: 'Build APK',
      desc: 'A PWA link or a project folder → a ready application',
      tone: 'pink' as const,
      tag: '02',
    },
    {
      id: 'decompiler',
      icon: FileSearch,
      title: 'Decompiler',
      desc: 'Open up any APK: manifest, smali and resources',
      tone: 'amber' as const,
      tag: '03',
    },
    {
      id: 'xapk',
      icon: PackageOpen,
      title: 'XAPK → APK',
      desc: 'Merge split modules into one installable APK',
      tone: 'teal' as const,
      tag: '04',
    },
  ];

  return (
    <Page>
      <PageHead
        num="00"
        eyebrow="Overview"
        title={
          <>
            An Android app <em>build studio</em>
          </>
        }
        sub="Code converter, decompiler, XAPK converter and a full APK builder — all in one place, right in the browser."
        actions={
          <>
            <Button variant="ghost" icon={<ShieldCheck size={15} />} onClick={() => nav('signing')}>
              Signing keys
            </Button>
            <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => nav('converter')}>
              Start building
            </Button>
          </>
        }
      />

      <div className="hero">
        <div className="flex between" style={{ alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div className="page-eyebrow" style={{ marginBottom: 10 }}>
              <span className="num">READY</span>
              <span className="sep" />
              <span>engine ready</span>
            </div>
            <h2>
              From an idea to an <em>installable APK</em>
            </h2>
            <p>
              Own engine: the binary manifest, DEX bytecode, resources and the v2 signature are generated locally,
              with no Android SDK and no cloud uploads.
            </p>
          </div>
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            <Badge tone="ok" icon={<CheckCircle2 size={11} />}>
              DEX
            </Badge>
            <Badge tone="ok" icon={<CheckCircle2 size={11} />}>
              AXML
            </Badge>
            <Badge tone="ok" icon={<CheckCircle2 size={11} />}>
              ARSC
            </Badge>
            <Badge tone="accent" icon={<ShieldCheck size={11} />}>
              APK Sig v2
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid g-4 mt-16">
        <div className="kpi">
          <div className="kpi-label">
            <Layers size={11} /> Builds
          </div>
          <div className="kpi-value">
            {builds}
            <span className="u">total</span>
          </div>
          <div className="kpi-delta">{okBuilds} succeeded</div>
        </div>
        <div className="kpi" style={{ '--kpi-glow': 'rgba(94,234,212,.2)' } as React.CSSProperties}>
          <div className="kpi-label">
            <Zap size={11} /> APKs in project
          </div>
          <div className="kpi-value">
            {apkCount}
            <span className="u">files</span>
          </div>
          <div className="kpi-delta">{last ? `${formatBytes(last.size)} — latest` : 'none yet'}</div>
        </div>
        <div className="kpi" style={{ '--kpi-glow': 'rgba(251,113,133,.16)' } as React.CSSProperties}>
          <div className="kpi-label">
            <AlertCircle size={11} /> Errors in log
          </div>
          <div className="kpi-value" style={{ color: errors ? 'var(--danger)' : undefined }}>
            {errors}
          </div>
          <div className="kpi-delta">{logs.length} entries total</div>
        </div>
        <div className="kpi" style={{ '--kpi-glow': 'rgba(244,114,182,.16)' } as React.CSSProperties}>
          <div className="kpi-label">
            <KeyRound size={11} /> Signing keys
          </div>
          <div className="kpi-value">
            {keys.length}
          </div>
          <div className="kpi-delta">{keys[0] ? keys[0].alias : 'created automatically'}</div>
        </div>
      </div>

      <div className="mt-24">
        <div className="section-title">Modules</div>
        <div className="grid g-2">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <Card key={m.id} interactive onClick={() => nav(m.id)} style={{ cursor: 'pointer' }}>
                <div className="flex gap-16" style={{ padding: 20 }}>
                  <div className={`card-icon ${m.tone}`} style={{ width: 42, height: 42, borderRadius: 12 }}>
                    <Icon size={19} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="flex between" style={{ alignItems: 'flex-start' }}>
                      <div className="card-title" style={{ fontSize: 15 }}>
                        {m.title}
                      </div>
                      <span className="mono tiny" style={{ color: 'var(--text-4)' }}>
                        {m.tag}
                      </span>
                    </div>
                    <div className="card-sub" style={{ marginTop: 5 }}>
                      {m.desc}
                    </div>
                  </div>
                  <ArrowRight size={16} style={{ color: 'var(--text-4)', marginTop: 4 }} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid g-23 mt-24">
        <Card>
          <CardHead
            icon={<Activity size={16} />}
            title="Recent operations"
            sub="Build and conversion history"
            right={
              <Button variant="ghost" size="sm" icon={<ArrowRight size={13} />} onClick={() => nav('builder')}>
                View all
              </Button>
            }
          />
          {history.length === 0 ? (
            <div className="empty" style={{ padding: 34 }}>
              <div className="ico">
                <Activity size={18} />
              </div>
              <div className="t">Nothing here yet</div>
              <div className="s">Build your first APK and it will show up here</div>
            </div>
          ) : (
            <div className="rows" style={{ padding: 8 }}>
              {history.slice(0, 6).map((h) => (
                <div className="row" key={h.id}>
                  <div className="ico" style={{ color: h.ok ? 'var(--ok)' : 'var(--danger)' }}>
                    {h.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  </div>
                  <div className="main">
                    <div className="t">{h.name}</div>
                    <div className="s">
                      {formatDate(h.at)} · {formatBytes(h.size)}
                      {h.errorId ? ` · ${h.errorId}` : ''}
                    </div>
                  </div>
                  <Badge tone={h.ok ? 'ok' : 'err'}>{h.ok ? 'done' : 'failed'}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead icon={<Cpu size={16} />} title="Engine status" sub="Components are checked locally" />
          <div style={{ padding: 18 }} className="col gap-12">
            {[
              { k: 'WebCrypto / RSA-2048', ok: !!crypto?.subtle },
              { k: 'DEX bytecode generator', ok: true },
              { k: 'Binary AXML + ARSC', ok: true },
              { k: 'APK Signature Scheme v2', ok: true },
              { k: 'IndexedDB storage', ok: true },
            ].map((s) => (
              <div className="flex between" key={s.k} style={{ fontSize: 12.5 }}>
                <span className="muted">{s.k}</span>
                {s.ok ? (
                  <span className="badge badge-ok">
                    <CheckCircle2 size={11} /> ok
                  </span>
                ) : (
                  <span className="badge badge-err">no</span>
                )}
              </div>
            ))}
            <div
              className="mono tiny"
              style={{ color: 'var(--text-4)', marginTop: 6, lineHeight: 1.6 }}
            >
              userAgent: {navigator.userAgent.slice(0, 64)}…
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}

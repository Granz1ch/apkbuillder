import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  FileCode2,
  FileText,
  FileJson,
  Plus,
  Trash2,
  Eye,
  Code2,
  Smartphone,
  Download,
  Loader2,
  Sparkles,
  Package,
  ShieldCheck,
  FileWarning,
  Wand2,
} from 'lucide-react';
import { useStore } from '../store';
import { Page, PageHead } from '../components/Page';
import { Card, CardHead, Button, Badge, Field, Input, Select, Switch, Modal, Progress, formatBytes, Empty } from '../components/ui';
import { CodeEditor } from '../components/CodeEditor';
import { Dropzone } from '../components/Dropzone';
import { validateCode, type Issue } from '../engine/validate';
import { buildApk, sanitizePackage, isValidPackage, type ApkBuildResult } from '../engine/apk';
import { getOrCreateKey } from '../engine/keyring';
import { getErrorDef } from '../engine/errors';
import { downloadBytes, readFileBytes, slugify, timestampSlug, plural } from '../lib/utils';
import { loadDefaultIcon, resizePng, pngInfo } from '../engine/icon';
import { EditorView } from '@codemirror/view';

const PERMISSIONS = [
  { id: 'android.permission.INTERNET', label: 'Internet', on: true },
  { id: 'android.permission.CAMERA', label: 'Camera', on: false },
  { id: 'android.permission.RECORD_AUDIO', label: 'Microphone', on: false },
  { id: 'android.permission.ACCESS_FINE_LOCATION', label: 'Location', on: false },
  { id: 'android.permission.READ_EXTERNAL_STORAGE', label: 'Storage', on: false },
  { id: 'android.permission.VIBRATE', label: 'Vibration', on: false },
  { id: 'android.permission.POST_NOTIFICATIONS', label: 'Notifications', on: false },
];

const STEPS = [
  'Validating source code',
  'Generating the AXML manifest',
  'Compiling DEX bytecode',
  'Building the resource table',
  'Signing with APK Signature v2',
];

const FILE_ICONS: Record<string, any> = {
  html: FileCode2,
  css: FileText,
  js: FileJson,
  py: FileCode2,
  json: FileJson,
};

function extOf(path: string) {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

function langOf(path: string) {
  const e = extOf(path);
  if (e === 'html' || e === 'htm') return 'html';
  if (e === 'css') return 'css';
  if (e === 'py') return 'python';
  if (e === 'json') return 'json';
  return 'js';
}

export function Converter() {
  const files = useStore((s) => s.files);
  const setFile = useStore((s) => s.setFile);
  const removeFile = useStore((s) => s.removeFile);
  const settings = useStore((s) => s.settings);
  const keys = useStore((s) => s.keys);
  const log = useStore((s) => s.log);
  const toast = useStore((s) => s.toast);
  const pushHistory = useStore((s) => s.pushHistory);
  const projectName = useStore((s) => s.projectName);

  const srcFiles = useMemo(
    () => Object.keys(files).filter((k) => k.startsWith('src/')).sort((a, b) => a.localeCompare(b)),
    [files],
  );
  const [tab, setTab] = useState('src/index.html');
  const [mode, setMode] = useState<'code' | 'preview'>('code');
  const [issuesByFile, setIssuesByFile] = useState<Record<string, Issue[]>>({});
  const [showIssues, setShowIssues] = useState(true);
  const editorRef = useRef<EditorView | null>(null);
  const validateTimer = useRef<number | null>(null);

  const [cfg, setCfg] = useState({
    appName: 'My App',
    packageName: settings.defaultPackage,
    versionName: '1.0.0',
    versionCode: 1,
    orientation: settings.orientation as 'unspecified' | 'portrait' | 'landscape',
    permissions: PERMISSIONS.filter((p) => p.on).map((p) => p.id),
    sign: true,
  });
  const [icon, setIcon] = useState<Uint8Array | null>(null);
  const [iconName, setIconName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  useEffect(() => {
    if (!icon) {
      setIconUrl('');
      return;
    }
    const url = URL.createObjectURL(new Blob([icon as BlobPart], { type: 'image/png' }));
    setIconUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [icon]);

  const [build, setBuild] = useState({
    open: false,
    running: false,
    step: -1,
    result: null as ApkBuildResult | null,
    error: null as { id: string; title: string; detail: string } | null,
    apkName: '',
    outputPath: '',
  });

  const activeFile = tab;
  const text = files[activeFile] ? new TextDecoder().decode(files[activeFile]) : '';
  const issues = issuesByFile[activeFile] ?? [];
  const allIssues = useMemo(() => Object.values(issuesByFile).flat(), [issuesByFile]);
  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warnCount = allIssues.filter((i) => i.severity === 'warning').length;
  const fileErrors = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [f, list] of Object.entries(issuesByFile)) m[f] = list.filter((i) => i.severity === 'error').length;
    return m;
  }, [issuesByFile]);

  const runValidation = useCallback(
    (path?: string) => {
      const targets = path ? [path] : srcFiles;
      const next: Record<string, Issue[]> = { ...issuesByFile };
      let hasErr = false;
      for (const p of targets) {
        const raw = files[p];
        if (!raw) continue;
        const lang = langOf(p);
        if (lang === 'js' || lang === 'html' || lang === 'css' || lang === 'python' || lang === 'json') {
          const list = validateCode(p, new TextDecoder().decode(raw));
          next[p] = list;
          if (list.some((i) => i.severity === 'error')) hasErr = true;
        }
      }
      setIssuesByFile(next);
      return hasErr;
    },
    [files, issuesByFile, srcFiles],
  );

  useEffect(() => {
    if (!settings.autoValidate) return;
    if (validateTimer.current) window.clearTimeout(validateTimer.current);
    validateTimer.current = window.setTimeout(() => runValidation(activeFile), 320);
    return () => {
      if (validateTimer.current) window.clearTimeout(validateTimer.current);
    };
  }, [text, activeFile, settings.autoValidate, runValidation]);

  const hasIndex = srcFiles.some((f) => f.endsWith('index.html'));
  const pyFiles = srcFiles.filter((f) => f.endsWith('.py'));

  /* ---------------- build ---------------- */
  const doBuild = async () => {
    const hasErr = runValidation();
    if (hasErr) {
      toast('err', 'The code has errors', 'Fix them before building');
      log('err', 'Build aborted: validation errors found', 'E-1001');
      return;
    }
    if (!srcFiles.length) {
      toast('err', 'No files to build', 'Add at least one file to src/');
      log('err', 'Build aborted: empty project', 'E-1013');
      return;
    }
    if (!cfg.appName.trim()) {
      toast('err', 'Enter an app name', 'E-2005');
      return;
    }
    if (!isValidPackage(sanitizePackage(cfg.packageName))) {
      toast('err', 'Invalid package name', 'Use the com.example.app format');
      log('err', `Invalid package name: ${cfg.packageName}`, 'E-1012');
      return;
    }

    setBuild({ open: true, running: true, step: 0, result: null, error: null, apkName: '', outputPath: '' });
    log('info', `Building "${cfg.appName}"`);

    try {
      for (let i = 0; i < STEPS.length; i++) {
        setBuild((b) => ({ ...b, step: i }));
        await new Promise((r) => setTimeout(r, 260));
      }

      let key = null;
      if (cfg.sign) {
        key = await getOrCreateKey();
      }

      let iconPng: Uint8Array | undefined;
      if (icon) {
        iconPng = await resizePng(icon, 192);
      } else {
        const def = await loadDefaultIcon();
        if (def) iconPng = await resizePng(def, 192);
      }

      const assets = srcFiles.map((p) => ({
        path: `assets/app/${p.replace(/^src\//, '')}`,
        data: files[p],
      }));

      const result = await buildApk({
        appName: cfg.appName,
        packageName: sanitizePackage(cfg.packageName),
        versionName: cfg.versionName,
        versionCode: Number(cfg.versionCode) || 1,
        minSdk: settings.minSdk,
        targetSdk: settings.targetSdk,
        orientation: cfg.orientation,
        permissions: cfg.permissions,
        keystore: key ?? undefined,
        sign: cfg.sign,
        iconPng,
        assets,
      });

      const slug = slugify(cfg.appName);
      const apkName = `${slug}-${timestampSlug()}.apk`;
      const outputPath = `convertors/${apkName}`;
      setFile(outputPath, result.bytes);
      setBuild((b) => ({ ...b, running: false, step: STEPS.length, result, apkName, outputPath }));
      pushHistory({ id: `${Date.now()}`, type: 'convert', name: apkName, size: result.size, at: Date.now(), path: outputPath, ok: true });
      log('ok', `APK built: ${apkName} (${formatBytes(result.size)})`);
      for (const w of result.warnings) log('warn', w, 'E-2001');
      toast('ok', 'APK built successfully', `${apkName} · ${formatBytes(result.size)}`);
    } catch (e: unknown) {
      const id = (e as any)?.code ?? 'E-2002';
      const def = getErrorDef(id);
      const detail = e instanceof Error ? e.message : String(e);
      setBuild((b) => ({ ...b, running: false, error: { id, title: def.title, detail } }));
      log('err', `${def.title}: ${detail}`, id);
      toast('err', 'Build failed', `${id} · ${def.title}`);
      pushHistory({ id: `${Date.now()}`, type: 'convert', name: cfg.appName, size: 0, at: Date.now(), ok: false, errorId: id });
    }
  };

  /* ---------------- files ---------------- */
  const createFile = (name: string) => {
    const path = name.startsWith('src/') ? name : `src/${name}`;
    if (files[path]) {
      setTab(path);
      return;
    }
    const templates: Record<string, string> = {
      html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Page</title>\n</head>\n<body>\n  <h1>New page</h1>\n</body>\n</html>\n`,
      css: `/* new style */\n`,
      js: `// new script\n`,
      py: `# new module\n`,
    };
    const e = extOf(path);
    setFile(path, new TextEncoder().encode(templates[e] ?? ''));
    setTab(path);
    log('info', `File created: ${path}`);
  };

  const onDropFiles = async (list: File[]) => {
    for (const f of list) {
      const data = await readFileBytes(f);
      const path = `src/${f.name}`;
      setFile(path, data);
      setTab(path);
    }
    runValidation();
  };

  const jumpTo = (path: string, line: number) => {
    setTab(path);
    setMode('code');
    setTimeout(() => {
      const v = editorRef.current;
      if (!v) return;
      const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
      v.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
      v.focus();
    }, 60);
  };

  const previewDoc = useMemo(() => {
    const html = files['src/index.html'] ? new TextDecoder().decode(files['src/index.html']) : '';
    if (!html) return '';
    let out = html;
    const css = files['src/style.css'] ? new TextDecoder().decode(files['src/style.css']) : '';
    if (css) out = out.replace(/<link[^>]+href=["']style\.css["'][^>]*>/i, `<style>\n${css}\n</style>`);
    const js = files['src/app.js'] ? new TextDecoder().decode(files['src/app.js']) : '';
    if (js) out = out.replace(/<script[^>]+src=["']app\.js["'][^>]*><\/script>/i, `<script>\n${js}\n</script>`);
    return out;
  }, [files]);

  const stats = useMemo(() => {
    const bytes = srcFiles.reduce((a, p) => a + (files[p]?.length ?? 0), 0);
    return { files: srcFiles.length, bytes };
  }, [srcFiles, files]);

  const statusTone = errorCount ? 'err' : warnCount ? 'warn' : 'ok';
  const StatusIcon = errorCount ? XCircle : warnCount ? AlertTriangle : CheckCircle2;

  return (
    <Page wide>
      <PageHead
        num="01"
        eyebrow="Converter"
        title={
          <>
            Code → <em>APK</em>
          </>
        }
        sub="Paste HTML, CSS, JS or Python. The engine validates the code, underlines errors with an explanation and builds an installable APK."
        actions={
          <>
            <Button variant="ghost" icon={<Eye size={15} />} onClick={() => setMode(mode === 'code' ? 'preview' : 'code')}>
              {mode === 'code' ? 'Preview' : 'Code'}
            </Button>
            <Button variant="ghost" icon={<CheckCircle2 size={15} />} onClick={() => runValidation()}>
              Validate
            </Button>
            <Button variant="primary" icon={<Play size={15} />} onClick={doBuild} disabled={build.running}>
              Build APK
            </Button>
          </>
        }
      />

      <div className="grid g-23" style={{ alignItems: 'start' }}>
        {/* ---------- EDITOR ---------- */}
        <Card style={{ height: 'calc(100dvh - 250px)', minHeight: 520, display: 'flex', flexDirection: 'column' }}>
          <div className="editor-tabs" style={{ flex: 'none' }}>
            {srcFiles.map((f) => {
              const Icon = FILE_ICONS[extOf(f)] ?? FileCode2;
              const errs = fileErrors[f] ?? 0;
              const warns = (issuesByFile[f] ?? []).filter((i) => i.severity === 'warning').length;
              return (
                <div
                  key={f}
                  className={`editor-tab ${tab === f ? 'active' : ''}`}
                  onClick={() => setTab(f)}
                >
                  <Icon size={11} style={{ opacity: 0.6 }} />
                  {f.replace('src/', '')}
                  <span className={`dot ${errs ? 'err' : warns ? 'warn' : issuesByFile[f] ? 'ok' : ''}`} />
                  {tab === f && (
                    <span
                      className="x"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (srcFiles.length === 1) return;
                        removeFile(f);
                        setTab(srcFiles.find((x) => x !== f) ?? 'src/index.html');
                      }}
                      title="Close"
                    >
                      ×
                    </span>
                  )}
                </div>
              );
            })}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                className="btn btn-ghost btn-icon"
                style={{ width: 26, height: 26, borderRadius: 7 }}
                title="New file"
                onClick={() => createFile(`new-${Date.now() % 1000}.html`)}
              >
                <Plus size={14} />
              </button>
              <button
                className="btn btn-ghost btn-icon"
                style={{ width: 26, height: 26, borderRadius: 7 }}
                title="Upload files"
                onClick={() => {
                  const inp = document.createElement('input');
                  inp.type = 'file';
                  inp.multiple = true;
                  inp.accept = '.html,.css,.js,.py,.json';
                  inp.onchange = async () => {
                    const fs = Array.from(inp.files ?? []);
                    if (fs.length) await onDropFiles(fs);
                  };
                  inp.click();
                }}
              >
                <Download size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: mode === 'code' ? 'block' : 'none' }}>
            <CodeEditor
              key={activeFile}
              value={text}
              lang={langOf(activeFile)}
              issues={issues}
              onChange={(v) => setFile(activeFile, new TextEncoder().encode(v))}
              onReady={(v) => (editorRef.current = v)}
            />
          </div>

          {mode === 'preview' && (
            <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 18, background: 'radial-gradient(circle at 50% 0%, rgba(129,140,248,.12), transparent 60%)' }}>
              <div
                style={{
                  width: 300,
                  height: 560,
                  borderRadius: 34,
                  border: '8px solid #15181f',
                  background: '#05070c',
                  boxShadow: '0 40px 80px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.08)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 86,
                    height: 20,
                    borderRadius: 99,
                    background: '#0a0c12',
                    zIndex: 3,
                    border: '1px solid rgba(255,255,255,.06)',
                  }}
                />
                <iframe
                  title="preview"
                  srcDoc={previewDoc}
                  sandbox="allow-scripts allow-forms allow-modals"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#05070c' }}
                />
              </div>
            </div>
          )}

          <div
            className="flex between"
            style={{ flex: 'none', padding: '7px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)' }}
          >
            <div className="flex gap-12">
              <span className="mono">{activeFile.replace('src/', '')}</span>
              <span className="mono">{stats.files} files · {formatBytes(stats.bytes)}</span>
            </div>
            <div className="flex gap-12">
              <span className={`flex gap-6 ${errorCount ? 'text-err' : ''}`}>
                <XCircle size={12} /> {errorCount}
              </span>
              <span className={`flex gap-6 ${warnCount ? 'text-warn' : 'text-ok'}`}>
                <AlertTriangle size={12} /> {warnCount}
              </span>
              <span className="flex gap-6">
                <Code2 size={12} /> UTF-8
              </span>
            </div>
          </div>
        </Card>

        {/* ---------- PANEL ---------- */}
        <div className="col gap-16">
          {/* validation status */}
          <Card>
            <div style={{ padding: 18 }}>
              <div className="flex gap-14" style={{ alignItems: 'flex-start' }}>
                <div
                  className={`card-icon ${statusTone === 'ok' ? 'teal' : statusTone === 'warn' ? 'amber' : 'pink'}`}
                  style={{ width: 42, height: 42, borderRadius: 12 }}
                >
                  <StatusIcon size={19} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 620 }}>
                    {errorCount
                      ? `${errorCount} ${plural(errorCount, ['error', 'errors', 'errors'])}`
                      : warnCount
                        ? 'Code is ready, with notes'
                        : 'No errors found'}
                  </div>
                  <div className="card-sub" style={{ marginTop: 3 }}>
                    {errorCount
                      ? 'Fix the underlined spots'
                      : warnCount
                        ? `${warnCount} ${plural(warnCount, ['warning', 'warnings', 'warnings'])} — safe to build`
                        : 'Ready to build an APK'}
                  </div>
                </div>
                <Badge tone={statusTone} icon={<StatusIcon size={11} />}>
                  {statusTone === 'ok' ? 'OK' : statusTone === 'warn' ? 'WARN' : 'ERR'}
                </Badge>
              </div>

              <div className="flex gap-8 mt-16">
                <Badge tone="err">{errorCount} errors</Badge>
                <Badge tone="warn">{warnCount} warnings</Badge>
                <Badge tone="info">{allIssues.filter((i) => i.severity === 'info').length} hints</Badge>
              </div>

              {allIssues.length > 0 && (
                <div className="scroll-y" style={{ maxHeight: 260, marginTop: 14 }}>
                  {allIssues.map((issue, i) => {
                    const def = getErrorDef(issue.id);
                    const Icon = issue.severity === 'error' ? XCircle : issue.severity === 'warning' ? AlertTriangle : Info;
                    const color =
                      issue.severity === 'error' ? 'var(--danger)' : issue.severity === 'warning' ? 'var(--warn)' : 'var(--info)';
                    return (
                      <div
                        key={i}
                        className="row"
                        style={{ padding: '9px 10px', cursor: 'pointer', alignItems: 'flex-start' }}
                        onClick={() => jumpTo(issue.source, issue.line)}
                      >
                        <div style={{ color, marginTop: 2, flex: 'none' }}>
                          <Icon size={14} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex gap-8" style={{ alignItems: 'center' }}>
                            <span className="mono tiny" style={{ color, letterSpacing: 0 }}>
                              {issue.id}
                            </span>
                            <span className="mono tiny" style={{ color: 'var(--text-4)' }}>
                              {issue.source.replace('src/', '')}:{issue.line}:{issue.col}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>{issue.message}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{def.cause}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {allIssues.length === 0 && (
                <div className="flex gap-8 mt-16" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  <ShieldCheck size={14} style={{ color: 'var(--ok)' }} />
                  Structure and syntax look good. All inline scripts and styles are checked.
                </div>
              )}
            </div>
          </Card>

          {/* build settings */}
          <Card>
            <CardHead
              icon={<Package size={16} />}
              title="APK settings"
              sub="How the app appears on the device"
              tone="teal"
              right={
                <span className="badge badge-neutral mono">v{cfg.versionName}</span>
              }
            />
            <div className="col gap-14" style={{ padding: 18 }}>
              <div className="grid g-2">
                <Field label="App name" required>
                  <Input value={cfg.appName} onChange={(e) => setCfg({ ...cfg, appName: e.target.value })} placeholder="My App" />
                </Field>
                <Field label="Version">
                  <Input value={cfg.versionName} onChange={(e) => setCfg({ ...cfg, versionName: e.target.value })} />
                </Field>
              </div>

              <Field
                label="Package name"
                required
                error={isValidPackage(sanitizePackage(cfg.packageName)) ? undefined : 'Latin letters, digits and dots only. At least two segments.'}
              >
                <Input
                  mono
                  value={cfg.packageName}
                  onChange={(e) => setCfg({ ...cfg, packageName: e.target.value })}
                  placeholder="com.example.app"
                />
              </Field>

              <div className="grid g-2">
                <Field label="Version code">
                  <Input
                    mono
                    type="number"
                    value={cfg.versionCode}
                    onChange={(e) => setCfg({ ...cfg, versionCode: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Orientation">
                  <Select value={cfg.orientation} onChange={(e) => setCfg({ ...cfg, orientation: e.target.value as any })}>
                    <option value="unspecified">Auto</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </Select>
                </Field>
              </div>

              <Field label="Icon" tip={iconName || 'PNG'}>
                <Dropzone
                  compact
                  accept="image/png,image/jpeg,image/webp"
                  onFiles={async (fs) => {
                    const f = fs[0];
                    if (!f) return;
                    const data = await readFileBytes(f);
                    const info = await pngInfo(data);
                    if (!info || info.width < 48) {
                      toast('err', 'Icon is too small', 'At least 48×48 px');
                      return;
                    }
                    setIcon(data);
                    setIconName(`${f.name} · ${info.width}×${info.height}`);
                  }}
                >
                  <div className="flex gap-12 center">
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: 'linear-gradient(135deg,#5eead4,#818cf8)',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#05070d',
                        fontWeight: 800,
                      }}
                    >
                      {icon && iconUrl ? <img src={iconUrl} style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} alt="" /> : 'A'}
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 12, fontWeight: 550 }}>{icon ? 'Icon selected' : 'Upload a PNG'}</div>
                      <div className="tiny muted">{icon ? iconName : 'Default — the APK Builder logo'}</div>
                    </div>
                  </div>
                </Dropzone>
              </Field>

              <div>
                <div className="label" style={{ marginBottom: 8 }}>
                  Permissions
                  <span className="tip">{cfg.permissions.length}</span>
                </div>
                <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                  {PERMISSIONS.map((p) => {
                    const on = cfg.permissions.includes(p.id);
                    return (
                      <span
                        key={p.id}
                        className={`pill`}
                        style={{
                          cursor: 'pointer',
                          height: 27,
                          borderColor: on ? 'rgba(94,234,212,.35)' : 'var(--border)',
                          background: on ? 'rgba(94,234,212,.09)' : 'var(--panel)',
                          color: on ? 'var(--accent)' : 'var(--text-3)',
                        }}
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            permissions: on ? cfg.permissions.filter((x) => x !== p.id) : [...cfg.permissions, p.id],
                          })
                        }
                      >
                        {on ? '✓ ' : '+ '}
                        {p.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="switch-row" style={{ padding: '4px 0' }}>
                <div>
                  <div className="t">Sign the APK</div>
                  <div className="d">
                    {keys.length ? `Key: ${keys[0].alias}` : 'A key is created automatically'}
                  </div>
                </div>
                <Switch on={cfg.sign} onChange={(v) => setCfg({ ...cfg, sign: v })} />
              </div>

              <Button variant="primary" size="lg" block icon={<Play size={16} />} onClick={doBuild} disabled={build.running}>
                {build.running ? 'Building…' : 'Build APK'}
              </Button>

              {pyFiles.length > 0 && (
                <div
                  className="flex gap-8"
                  style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--text-3)', padding: '9px 11px', borderRadius: 10, background: 'rgba(96,165,250,.07)', border: '1px solid rgba(96,165,250,.16)' }}
                >
                  <Info size={13} style={{ color: 'var(--info)', flex: 'none', marginTop: 1 }} />
                  <span>
                    {pyFiles.length === 1 ? `${pyFiles[0].replace('src/', '')} is a Python file.` : `${pyFiles.length} Python files.`}{' '}
                    They are packed into the APK as assets (<span className="mono">assets/app/*.py</span>). Running Python on
                    a device requires a separate runtime, which the offline engine does not include.
                  </span>
                </div>
              )}

              <div className="flex gap-8" style={{ fontSize: 11, color: 'var(--text-4)' }}>
                <ShieldCheck size={12} />
                Everything runs locally. Files never leave the device.
              </div>
            </div>
          </Card>

          {/* hint */}
          <Card pad>
            <div className="flex gap-12">
              <Wand2 size={16} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                <b style={{ color: 'var(--text)' }}>Tip:</b> the result appears in the{' '}
                <span className="code-inline">convertors/</span> folder of the project. Open it from the project tree on the left.
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ---------- BUILD MODAL ---------- */}
      <Modal
        open={build.open}
        onClose={() => !build.running && setBuild((b) => ({ ...b, open: false }))}
        title={build.error ? 'Build failed' : build.result ? 'APK is ready' : 'Building app'}
        sub={build.error ? build.error.id : build.result ? build.outputPath : cfg.appName}
        width={520}
        footer={
          build.result ? (
            <>
              <Button variant="ghost" onClick={() => setBuild((b) => ({ ...b, open: false }))}>
                Close
              </Button>
              <Button
                variant="primary"
                icon={<Download size={15} />}
                onClick={() => {
                  const f = files[build.outputPath];
                  if (f) downloadBytes(f, build.apkName, 'application/vnd.android.package-archive');
                }}
              >
                Download APK
              </Button>
            </>
          ) : build.error ? (
            <Button variant="primary" onClick={() => setBuild((b) => ({ ...b, open: false }))}>
              Got it
            </Button>
          ) : null
        }
      >
        {build.error ? (
          <div className="col gap-12">
            <div className="flex gap-12" style={{ color: 'var(--danger)' }}>
              <XCircle size={20} style={{ flex: 'none' }} />
              <div>
                <div style={{ fontWeight: 600 }}>{build.error.title}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {build.error.detail}
                </div>
              </div>
            </div>
            <div className="hint">{getErrorDef(build.error.id).fix}</div>
          </div>
        ) : (
          <>
            <div className="steps">
              {STEPS.map((s, i) => {
                const state = build.result ? 'done' : i < build.step ? 'done' : i === build.step ? 'active' : 'idle';
                return (
                  <div className={`step ${state}`} key={s}>
                    <div className="n">
                      {state === 'done' ? <CheckCircle2 size={12} /> : state === 'active' ? <div className="spinner" /> : i + 1}
                    </div>
                    {s}
                    {state === 'done' && <span className="ms">ok</span>}
                  </div>
                );
              })}
            </div>
            <Progress value={build.result ? 100 : ((build.step + 1) / STEPS.length) * 100} />
            {build.result && (
              <div className="grid g-3 mt-16">
                <div className="kpi" style={{ padding: 14 }}>
                  <div className="kpi-label">Size</div>
                  <div className="kpi-value" style={{ fontSize: 20 }}>
                    {formatBytes(build.result.size)}
                  </div>
                </div>
                <div className="kpi" style={{ padding: 14 }}>
                  <div className="kpi-label">Files</div>
                  <div className="kpi-value" style={{ fontSize: 20 }}>
                    {build.result.files.length}
                  </div>
                </div>
                <div className="kpi" style={{ padding: 14 }}>
                  <div className="kpi-label">Signature</div>
                  <div className="kpi-value" style={{ fontSize: 20 }}>
                    {cfg.sign ? 'v2' : '—'}
                  </div>
                </div>
              </div>
            )}
            {build.result && build.result.warnings.length > 0 && (
              <div className="col gap-6 mt-12">
                {build.result.warnings.map((w, i) => (
                  <div key={i} className="flex gap-8" style={{ fontSize: 12, color: 'var(--warn)' }}>
                    <AlertTriangle size={13} style={{ flex: 'none' }} />
                    {w}
                  </div>
                ))}
              </div>
            )}
            {build.result && (
              <div className="mt-16" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                <div className="mono tiny" style={{ color: 'var(--text-4)', marginBottom: 6 }}>
                  APK CONTENTS
                </div>
                <div className="col gap-4">
                  {build.result.files.slice(0, 8).map((f) => (
                    <div key={f.name} className="flex between mono" style={{ fontSize: 10.5 }}>
                      <span style={{ color: 'var(--text-2)' }}>{f.name}</span>
                      <span style={{ color: 'var(--text-4)' }}>{formatBytes(f.size)}</span>
                    </div>
                  ))}
                  {build.result.files.length > 8 && (
                    <div className="mono tiny" style={{ color: 'var(--text-4)' }}>
                      + {build.result.files.length - 8} more files
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </Page>
  );
}

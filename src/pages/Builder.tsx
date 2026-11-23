import { useMemo, useState } from 'react';
import {
  Hammer,
  Globe,
  FolderOpen,
  FileCode2,
  Smartphone,
  Play,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Layers,
  FileArchive,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useStore } from '../store';
import { Page, PageHead } from '../components/Page';
import { Card, CardHead, Button, Badge, Field, Input, Select, Switch, formatBytes, Empty } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { BuildModal } from '../components/BuildModal';
import { buildApk, sanitizePackage, isValidPackage, type ApkBuildResult } from '../engine/apk';
import { getOrCreateKey } from '../engine/keyring';
import { getErrorDef } from '../engine/errors';
import { downloadBytes, readDirectoryFiles, readFileBytes, slugify, timestampSlug } from '../lib/utils';
import { loadDefaultIcon, resizePng, pngInfo } from '../engine/icon';

const STEPS = [
  'Checking sources',
  'Generating the AXML manifest',
  'Compiling DEX bytecode',
  'Building resources',
  'Signing with APK Signature v2',
];

const PERMISSIONS = [
  { id: 'android.permission.INTERNET', label: 'Internet' },
  { id: 'android.permission.CAMERA', label: 'Camera' },
  { id: 'android.permission.RECORD_AUDIO', label: 'Microphone' },
  { id: 'android.permission.ACCESS_FINE_LOCATION', label: 'Location' },
  { id: 'android.permission.VIBRATE', label: 'Vibration' },
];

export function Builder() {
  const settings = useStore((s) => s.settings);
  const files = useStore((s) => s.files);
  const setFile = useStore((s) => s.setFile);
  const log = useStore((s) => s.log);
  const toast = useStore((s) => s.toast);
  const pushHistory = useStore((s) => s.pushHistory);

  const [mode, setMode] = useState<'pwa' | 'folder'>('pwa');
  const [cfg, setCfg] = useState({
    url: 'https://example.com',
    appName: 'My Web App',
    packageName: settings.defaultPackage,
    versionName: '1.0.0',
    versionCode: 1,
    orientation: settings.orientation as 'unspecified' | 'portrait' | 'landscape',
    themeColor: '#0b0d12',
    permissions: ['android.permission.INTERNET'] as string[],
    cleartext: true,
  });
  const [icon, setIcon] = useState<Uint8Array | null>(null);
  const [iconLabel, setIconLabel] = useState('');

  const [folderFiles, setFolderFiles] = useState<{ path: string; data: Uint8Array }[]>([]);
  const [folderName, setFolderName] = useState('');

  const [build, setBuild] = useState({
    open: false,
    running: false,
    step: -1,
    result: null as ApkBuildResult | null,
    error: null as { id: string; title: string; detail: string } | null,
    apkName: '',
    outputPath: '',
  });

  const hasIndex = folderFiles.some((f) => f.path === 'index.html' || f.path.endsWith('/index.html'));
  const folderSize = useMemo(() => folderFiles.reduce((a, f) => a + f.data.length, 0), [folderFiles]);

  const validUrl = /^https?:\/\/.+/i.test(cfg.url.trim());

  const doBuild = async () => {
    if (!isValidPackage(sanitizePackage(cfg.packageName))) {
      toast('err', 'Invalid package name', 'Format: com.example.app');
      log('err', `Invalid package name: ${cfg.packageName}`, 'E-1012');
      return;
    }
    if (!cfg.appName.trim()) {
      toast('err', 'Enter an app name', 'E-2005');
      return;
    }
    if (mode === 'pwa' && !validUrl) {
      toast('err', 'Invalid URL', 'The address must start with http:// or https://');
      log('err', `Invalid URL: ${cfg.url}`, 'E-1014');
      return;
    }
    if (mode === 'folder' && !hasIndex) {
      toast('err', 'No index.html in the folder', 'Add an entry point and try again');
      log('err', 'index.html not found in the project folder', 'E-1015');
      return;
    }

    setBuild({ open: true, running: true, step: 0, result: null, error: null, apkName: '', outputPath: '' });
    log('info', `APK build (${mode === 'pwa' ? 'PWA' : 'folder'}) — "${cfg.appName}"`);
    try {
      for (let i = 0; i < STEPS.length; i++) {
        setBuild((b) => ({ ...b, step: i }));
        await new Promise((r) => setTimeout(r, 240));
      }
      const key = await getOrCreateKey();
      let iconPng: Uint8Array | undefined;
      if (icon) iconPng = await resizePng(icon, 192);
      else {
        const def = await loadDefaultIcon();
        if (def) iconPng = await resizePng(def, 192);
      }

      const assets =
        mode === 'folder'
          ? folderFiles
              .filter((f) => !f.path.startsWith('.'))
              .map((f) => ({ path: `assets/app/${f.path}`, data: f.data }))
          : [];

      const result = await buildApk({
        appName: cfg.appName,
        packageName: sanitizePackage(cfg.packageName),
        versionName: cfg.versionName,
        versionCode: Number(cfg.versionCode) || 1,
        minSdk: settings.minSdk,
        targetSdk: settings.targetSdk,
        orientation: cfg.orientation,
        permissions: cfg.permissions,
        startUrl: mode === 'pwa' ? cfg.url.trim() : 'file:///android_asset/app/index.html',
        cleartext: cfg.cleartext,
        keystore: key,
        iconPng,
        assets,
      });

      const apkName = `${slugify(cfg.appName)}-${timestampSlug()}.apk`;
      const outputPath = `build/${apkName}`;
      setFile(outputPath, result.bytes);
      setBuild((b) => ({ ...b, running: false, step: STEPS.length, result, apkName, outputPath }));
      pushHistory({ id: `${Date.now()}`, type: 'build', name: apkName, size: result.size, at: Date.now(), path: outputPath, ok: true });
      log('ok', `APK built: ${apkName} (${formatBytes(result.size)})`);
      result.warnings.forEach((w) => log('warn', w, 'E-2001'));
      toast('ok', 'APK built successfully', `${apkName} · ${formatBytes(result.size)}`);
    } catch (e: unknown) {
      const id = (e as any)?.code ?? 'E-2002';
      const def = getErrorDef(id);
      const detail = e instanceof Error ? e.message : String(e);
      setBuild((b) => ({ ...b, running: false, error: { id, title: def.title, detail } }));
      log('err', `${def.title}: ${detail}`, id);
      toast('err', 'Build failed', `${id} · ${def.title}`);
      pushHistory({ id: `${Date.now()}`, type: 'build', name: cfg.appName, size: 0, at: Date.now(), ok: false, errorId: id });
    }
  };

  const onFolder = async (fs: File[]) => {
    const list = await readDirectoryFiles(fs);
    if (!list.length) {
      toast('err', 'The folder is empty', 'Pick a folder with project files');
      return;
    }
    const rel = (fs[0] as any).webkitRelativePath as string | undefined;
    setFolderName(rel ? rel.split('/')[0] : 'project');
    setFolderFiles(list);
    setMode('folder');
    log('ok', `Folder loaded: ${list.length} files, ${formatBytes(list.reduce((a, f) => a + f.data.length, 0))}`);
  };

  return (
    <Page>
      <PageHead
        num="02"
        eyebrow="Build APK"
        title={
          <>
            Two paths to a <em>ready APK</em>
          </>
        }
        sub="Build an app from a website link (PWA) or from a project folder with HTML/CSS/JS. The output is a signed APK, ready to install."
        actions={
          <Button variant="primary" icon={<Play size={15} />} onClick={doBuild} disabled={build.running}>
            Build APK
          </Button>
        }
      />

      <div className="tabs mb-16">
        <div className={`tab ${mode === 'pwa' ? 'active' : ''}`} onClick={() => setMode('pwa')}>
          <Globe size={13} /> From a link (PWA)
        </div>
        <div className={`tab ${mode === 'folder' ? 'active' : ''}`} onClick={() => setMode('folder')}>
          <FolderOpen size={13} /> From a project folder
        </div>
      </div>

      <div className="grid g-23" style={{ alignItems: 'start' }}>
        <div className="col gap-16">
          {mode === 'pwa' ? (
            <Card>
              <CardHead
                icon={<Globe size={16} />}
                tone="pink"
                title="PWA / web app"
                sub="The APK opens the site in a native WebView window"
              />
              <div className="col gap-14" style={{ padding: 20 }}>
                <Field
                  label="App address"
                  required
                  error={validUrl ? undefined : 'Enter the full URL, for example https://example.com'}
                >
                  <Input
                    mono
                    value={cfg.url}
                    onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
                    placeholder="https://example.com"
                  />
                </Field>
                <div className="grid g-2">
                  <Field label="App name" required>
                    <Input value={cfg.appName} onChange={(e) => setCfg({ ...cfg, appName: e.target.value })} />
                  </Field>
                  <Field label="Package name" required>
                    <Input
                      mono
                      value={cfg.packageName}
                      onChange={(e) => setCfg({ ...cfg, packageName: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid g-3">
                  <Field label="Version">
                    <Input value={cfg.versionName} onChange={(e) => setCfg({ ...cfg, versionName: e.target.value })} />
                  </Field>
                  <Field label="Version code">
                    <Input
                      mono
                      type="number"
                      value={cfg.versionCode}
                      onChange={(e) => setCfg({ ...cfg, versionCode: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Orientation">
                    <Select
                      value={cfg.orientation}
                      onChange={(e) => setCfg({ ...cfg, orientation: e.target.value as any })}
                    >
                      <option value="unspecified">Auto</option>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </Select>
                  </Field>
                </div>

                <div className="grid g-2">
                  <Field label="Theme color">
                    <div className="flex gap-8">
                      <input
                        type="color"
                        value={cfg.themeColor}
                        onChange={(e) => setCfg({ ...cfg, themeColor: e.target.value })}
                        style={{
                          width: 40,
                          height: 40,
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          background: 'transparent',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      />
                      <Input mono value={cfg.themeColor} onChange={(e) => setCfg({ ...cfg, themeColor: e.target.value })} />
                    </div>
                  </Field>
                  <Field label="Icon">
                    <Dropzone
                      compact
                      accept="image/png"
                      onFiles={async (fs) => {
                        const f = fs[0];
                        if (!f) return;
                        const data = await readFileBytes(f);
                        const info = await pngInfo(data);
                        if (!info || info.width < 48) return toast('err', 'Icon is too small', 'At least 48×48');
                        setIcon(data);
                        setIconLabel(`${info.width}×${info.height}`);
                      }}
                    >
                      <div className="flex gap-10 center">
                        <Upload size={16} style={{ color: 'var(--accent)' }} />
                        <div style={{ fontSize: 12 }}>{iconLabel || 'Upload a PNG'}</div>
                      </div>
                    </Dropzone>
                  </Field>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 8 }}>Permissions</div>
                  <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                    {PERMISSIONS.map((p) => {
                      const on = cfg.permissions.includes(p.id);
                      return (
                        <span
                          key={p.id}
                          className="pill"
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

                <div className="switch-row" style={{ padding: '2px 0' }}>
                  <div>
                    <div className="t">Allow HTTP (not HTTPS)</div>
                    <div className="d">Useful for local servers and legacy sites</div>
                  </div>
                  <Switch on={cfg.cleartext} onChange={(v) => setCfg({ ...cfg, cleartext: v })} />
                </div>

                <Button variant="primary" size="lg" block icon={<Play size={16} />} onClick={doBuild}>
                  Build APK from link
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHead
                icon={<FolderOpen size={16} />}
                tone="teal"
                title="Project folder"
                sub="All files go into assets/app, index.html becomes the entry point"
                right={
                  folderFiles.length > 0 ? (
                    <Badge tone="ok" icon={<CheckCircle2 size={11} />}>
                      {folderFiles.length} files
                    </Badge>
                  ) : null
                }
              />
              <div style={{ padding: 20 }} className="col gap-14">
                <Dropzone folder multiple onFiles={onFolder} title="Drop the project folder" sub="or click to pick a folder with index.html">
                  <div className="ico">
                    <FolderOpen />
                  </div>
                  <div className="t">Drop the project folder</div>
                  <div className="s">
                    {folderFiles.length
                      ? `${folderName} · ${folderFiles.length} files · ${formatBytes(folderSize)}`
                      : 'or click to pick a folder with index.html'}
                  </div>
                </Dropzone>

                {folderFiles.length > 0 && (
                  <>
                    <div className={`flex gap-10 ${hasIndex ? '' : ''}`} style={{ fontSize: 12 }}>
                      {hasIndex ? (
                        <Badge tone="ok" icon={<CheckCircle2 size={11} />}>
                          index.html found
                        </Badge>
                      ) : (
                        <Badge tone="err" icon={<AlertTriangle size={11} />}>
                          index.html not found
                        </Badge>
                      )}
                      <Badge tone="neutral">{formatBytes(folderSize)}</Badge>
                      <Badge tone="neutral">{folderName}</Badge>
                    </div>
                    <div className="scroll-y" style={{ maxHeight: 260, border: '1px solid var(--border)', borderRadius: 12, padding: 6 }}>
                      {folderFiles.slice(0, 120).map((f) => (
                        <div key={f.path} className="flex between" style={{ padding: '6px 10px', borderRadius: 7, fontSize: 11.5 }}>
                          <span className="mono truncate" style={{ color: 'var(--text-2)' }}>
                            {f.path}
                          </span>
                          <span className="mono" style={{ color: 'var(--text-4)' }}>
                            {formatBytes(f.data.length)}
                          </span>
                        </div>
                      ))}
                      {folderFiles.length > 120 && (
                        <div className="tiny muted" style={{ padding: 8 }}>
                          + {folderFiles.length - 120} more files
                        </div>
                      )}
                    </div>
                    <div className="grid g-2">
                      <Field label="App name" required>
                        <Input value={cfg.appName} onChange={(e) => setCfg({ ...cfg, appName: e.target.value })} />
                      </Field>
                      <Field label="Package name" required>
                        <Input mono value={cfg.packageName} onChange={(e) => setCfg({ ...cfg, packageName: e.target.value })} />
                      </Field>
                    </div>
                    <Button variant="primary" size="lg" block icon={<Play size={16} />} onClick={doBuild}>
                      Build APK from folder
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* right column */}
        <div className="col gap-16">
          <Card>
            <CardHead icon={<Layers size={16} />} title="What goes into the APK" sub="Structure of the package being built" />
            <div style={{ padding: 16 }} className="col gap-6">
              {[
                ['AndroidManifest.xml', 'binary manifest: package, version, permissions'],
                ['classes.dex', 'WebView Activity wrapper'],
                ['resources.arsc', 'app name and icon'],
                ['res/mipmap-xxxhdpi/', '192×192 icon'],
                ['assets/app/*', mode === 'folder' ? 'your project files' : '— (PWA mode)'],
                ['META-INF/', 'APK Signature v2 signature'],
              ].map(([n, d]) => (
                <div key={n} className="flex gap-10" style={{ alignItems: 'flex-start' }}>
                  <FileCode2 size={13} style={{ color: 'var(--text-4)', marginTop: 2, flex: 'none' }} />
                  <div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {n}
                    </div>
                    <div className="tiny" style={{ color: 'var(--text-4)' }}>
                      {d}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card pad>
            <div className="flex gap-12">
              <Smartphone size={16} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                <b style={{ color: 'var(--text)' }}>Install:</b> allow "install from unknown sources" and open the APK.
                The v2 signature works on Android 7.0+.
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="flex gap-12">
              <Info size={16} style={{ color: 'var(--info)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                PWA mode loads the site directly in the WebView. For offline use, build from a folder.
              </div>
            </div>
          </Card>
        </div>
      </div>

      <BuildModal
        open={build.open}
        onClose={() => setBuild((b) => ({ ...b, open: false }))}
        running={build.running}
        step={build.step}
        steps={STEPS}
        result={build.result}
        error={build.error}
        apkName={build.apkName}
        outputPath={build.outputPath}
        onDownload={() => {
          const f = files[build.outputPath];
          if (f) downloadBytes(f, build.apkName, 'application/vnd.android.package-archive');
        }}
      />
    </Page>
  );
}

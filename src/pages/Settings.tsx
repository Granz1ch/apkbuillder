import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Database,
  Smartphone,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Info,
  Cpu,
  Palette,
  ShieldCheck,
  HardDrive,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { useStore } from '../store';
import { Page, PageHead } from '../components/Page';
import { Card, CardHead, Button, Field, Input, Select, Switch, Badge, Modal, formatBytes } from '../components/ui';
import { downloadBytes, readFileBytes, timestampSlug } from '../lib/utils';
import { ZipWriter, readZip } from '../engine/zip';
import { SAMPLE_CSS, SAMPLE_HTML, SAMPLE_JS, SAMPLE_PY } from '../store';

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const files = useStore((s) => s.files);
  const keys = useStore((s) => s.keys);
  const history = useStore((s) => s.history);
  const projectName = useStore((s) => s.projectName);
  const setFile = useStore((s) => s.setFile);
  const log = useStore((s) => s.log);
  const toast = useStore((s) => s.toast);
  const [confirmClear, setConfirmClear] = useState(false);

  const totalSize = Object.values(files).reduce((a, b) => a + (b?.length ?? 0), 0);

  const exportProject = () => {
    const zip = new ZipWriter();
    zip.addFile('project.json', new TextEncoder().encode(JSON.stringify({ name: projectName, version: 1, keys: keys.length, history }, null, 2)));
    for (const [path, data] of Object.entries(files)) zip.addFile(path, data, { method: 'deflate' });
    downloadBytes(zip.build(), `${projectName.toLowerCase().replace(/\s+/g, '-')}-${timestampSlug()}.zip`, 'application/zip');
    log('ok', 'Project exported to ZIP');
    toast('ok', 'Project exported', `${Object.keys(files).length} files`);
  };

  const importProject = async (fs: File[]) => {
    const f = fs[0];
    if (!f) return;
    try {
      const entries = readZip(await readFileBytes(f));
      let n = 0;
      for (const e of entries) {
        if (e.name === 'project.json' || e.name.endsWith('/')) continue;
        setFile(e.name, e.data);
        n++;
      }
      log('ok', `Files imported: ${n}`);
      toast('ok', 'Project imported', `${n} files`);
    } catch (e) {
      toast('err', 'Import failed', String(e));
    }
  };

  const resetSamples = () => {
    setFile('src/index.html', new TextEncoder().encode(SAMPLE_HTML));
    setFile('src/style.css', new TextEncoder().encode(SAMPLE_CSS));
    setFile('src/app.js', new TextEncoder().encode(SAMPLE_JS));
    setFile('src/app.py', new TextEncoder().encode(SAMPLE_PY));
    log('info', 'Demo files restored');
    toast('ok', 'Demo project restored');
  };

  return (
    <Page>
      <PageHead
        num="07"
        eyebrow="Settings"
        title={
          <>
            Studio <em>settings</em>
          </>
        }
        sub="Engine behaviour, project and data. All settings are stored locally."
      />

      <div className="grid g-23" style={{ alignItems: 'start' }}>
        <div className="col gap-16">
          <Card>
            <CardHead icon={<Cpu size={16} />} tone="teal" title="Build engine" sub="Applied to new builds" />
            <div className="col gap-14" style={{ padding: 18 }}>
              <div className="grid g-2">
                <Field label="Default package">
                  <Input mono value={settings.defaultPackage} onChange={(e) => setSettings({ defaultPackage: e.target.value })} />
                </Field>
                <Field label="Theme color" tip="HEX">
                  <Input mono value={settings.themeColor} onChange={(e) => setSettings({ themeColor: e.target.value })} />
                </Field>
              </div>
              <div className="grid g-3">
                <Field label="minSdk">
                  <Input mono type="number" value={settings.minSdk} onChange={(e) => setSettings({ minSdk: Number(e.target.value) })} />
                </Field>
                <Field label="targetSdk">
                  <Input mono type="number" value={settings.targetSdk} onChange={(e) => setSettings({ targetSdk: Number(e.target.value) })} />
                </Field>
                <Field label="Orientation">
                  <Select value={settings.orientation} onChange={(e) => setSettings({ orientation: e.target.value as any })}>
                    <option value="unspecified">Auto</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </Select>
                </Field>
              </div>
              <div className="switch-row">
                <div>
                  <div className="t">Live validation</div>
                  <div className="d">Underline errors as you type</div>
                </div>
                <Switch on={settings.autoValidate} onChange={(v) => setSettings({ autoValidate: v })} />
              </div>
              <div className="switch-row">
                <div>
                  <div className="t">Sign builds</div>
                  <div className="d">Use the key from the "Signing" section</div>
                </div>
                <Switch on={settings.signBuilds} onChange={(v) => setSettings({ signBuilds: v })} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHead icon={<HardDrive size={16} />} tone="pink" title="Project and data" sub={`${Object.keys(files).length} files · ${formatBytes(totalSize)}`} />
            <div style={{ padding: 18 }} className="col gap-8">
              <div className="list-group">
                <div className="list-group-item">
                  <div style={{ flex: 1 }}>
                    <div className="t">Export project</div>
                    <div className="d">A ZIP with all files, keys and history</div>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Download size={13} />} onClick={exportProject}>
                    Export
                  </Button>
                </div>
                <div className="list-group-item">
                  <div style={{ flex: 1 }}>
                    <div className="t">Import project</div>
                    <div className="d">Load a previously exported ZIP</div>
                  </div>
                  <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={13} />
                    Import
                    <input
                      type="file"
                      accept=".zip"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) await importProject([f]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <div className="list-group-item">
                  <div style={{ flex: 1 }}>
                    <div className="t">Demo files</div>
                    <div className="d">Restore the samples in src/</div>
                  </div>
                  <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={resetSamples}>
                    Restore
                  </Button>
                </div>
                <div className="list-group-item">
                  <div style={{ flex: 1 }}>
                    <div className="t">Clear project</div>
                    <div className="d">Delete all files and history</div>
                  </div>
                  <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => setConfirmClear(true)}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="flex gap-8 mt-8" style={{ fontSize: 11, color: 'var(--text-4)' }}>
                <Database size={12} />
                IndexedDB · {history.length} history entries · {keys.length} keys
              </div>
            </div>
          </Card>
        </div>

        <div className="col gap-16">
          <Card pad>
            <div className="section-title">Android version</div>
            <div className="col gap-12">
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                The same studio as an APK: works offline, without internet and without the Android SDK.
                Files inside the Android build are stored in the project (WebView cannot save them to Downloads).
              </div>
              <div className="flex gap-8">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Smartphone size={14} />}
                  onClick={async () => {
                    try {
                      const res = await fetch('./apk-builder.apk');
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      const buf = await res.arrayBuffer();
                      downloadBytes(new Uint8Array(buf), 'APK-Builder.apk', 'application/vnd.android.package-archive');
                      toast('ok', 'APK downloaded', `${(buf.byteLength / 1024).toFixed(0)} KB`);
                    } catch {
                      toast('err', 'File unavailable', 'The APK version appears after a release build');
                    }
                  }}
                >
                  Download APK
                </Button>
                <Badge tone="neutral" icon={<ShieldCheck size={11} />}>
                  APK Sig v2
                </Badge>
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="section-title">About</div>
            <div className="col gap-12" style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.65 }}>
              <div className="flex gap-10">
                <ShieldCheck size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <span>
                  <b style={{ color: 'var(--text)' }}>Local.</b> Source code, keys and APKs never leave the device. The network is not used.
                </span>
              </div>
              <div className="flex gap-10">
                <Cpu size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <span>
                  <b style={{ color: 'var(--text)' }}>No SDK.</b> DEX, the binary manifest, resources and the v2 signature are generated by our own engine.
                </span>
              </div>
              <div className="flex gap-10">
                <Palette size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <span>
                  <b style={{ color: 'var(--text)' }}>Open source.</b> Built with React + CodeMirror and distributed as is.
                </span>
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="section-title">Keyboard shortcuts</div>
            <div className="col gap-8">
              {[
                ['Alt + 1…8', 'Switch between sections'],
                ['`', 'Toggle the console'],
                ['Tab', 'Indent in the editor'],
                ['Ctrl + Z', 'Undo in the editor'],
              ].map(([k, v]) => (
                <div key={k} className="flex between" style={{ fontSize: 12 }}>
                  <span className="muted">{v}</span>
                  <span className="kbd">{k}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card pad>
            <div className="flex gap-10" style={{ alignItems: 'flex-start' }}>
              <Info size={15} style={{ color: 'var(--info)', flex: 'none', marginTop: 1 }} />
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Version 1.0.0 · APK Builder Engine · RSA-2048 · APK Signature Scheme v2
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear the project?"
        sub="This action cannot be undone"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                const st = useStore.getState();
                for (const k of Object.keys(st.files)) st.removeFile(k);
                useStore.setState({ history: [] });
                setConfirmClear(false);
                log('warn', 'Project cleared');
                toast('ok', 'Project cleared');
              }}
            >
              Clear
            </Button>
          </>
        }
      >
        <div className="flex gap-10" style={{ color: 'var(--warn)', fontSize: 12.5 }}>
          <AlertTriangle size={16} style={{ flex: 'none' }} />
          All project files, build results and history will be deleted. Signing keys are kept.
        </div>
      </Modal>
    </Page>
  );
}

import { useMemo, useState } from 'react';
import {
  FileSearch,
  Upload,
  Download,
  Package,
  Activity,
  KeyRound,
  FileCode2,
  FolderTree,
  ScanSearch,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Smartphone,
  Layers,
  ShieldCheck,
  Hash,
} from 'lucide-react';
import { useStore } from '../store';
import { Page, PageHead } from '../components/Page';
import { Card, CardHead, Button, Badge, Empty, formatBytes, formatTime } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { decompileApk, makeReadme, type DecompileResult } from '../engine/decompile';
import { getErrorDef } from '../engine/errors';
import { downloadBytes, readFileBytes, slugify, timestampSlug } from '../lib/utils';
import { ZipWriter } from '../engine/zip';

type Tab = 'manifest' | 'smali' | 'files';

export function Decompiler() {
  const setFile = useStore((s) => s.setFile);
  const log = useStore((s) => s.log);
  const toast = useStore((s) => s.toast);
  const pushHistory = useStore((s) => s.pushHistory);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DecompileResult | null>(null);
  const [error, setError] = useState<{ id: string; title: string; detail: string } | null>(null);
  const [tab, setTab] = useState<Tab>('manifest');
  const [classIdx, setClassIdx] = useState(0);
  const [apkName, setApkName] = useState('');

  const smaliFiles = useMemo(() => result?.files.filter((f) => f.path.startsWith('smali/')) ?? [], [result]);
  const otherFiles = useMemo(() => result?.files.filter((f) => !f.path.startsWith('smali/')) ?? [], [result]);

  const run = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setApkName(f.name);
    try {
      const bytes = await readFileBytes(f);
      const res = decompileApk(bytes);
      const folder = `decompilation/${slugify(f.name.replace(/\.apk$/i, ''))}-${timestampSlug()}`;
      for (const file of res.files) setFile(`${folder}/${file.path}`, file.data);
      setFile(`${folder}/README.md`, new TextEncoder().encode(makeReadme(res.report)));
      setResult(res);
      setTab('manifest');
      setClassIdx(0);
      log('ok', `Декомпилировано: ${f.name} → ${folder} (${res.files.length} файлов)`);
      res.warnings.forEach((w) => log('warn', w, w.startsWith('E-') ? w.slice(0, 6) : undefined));
      pushHistory({ id: `${Date.now()}`, type: 'decompile', name: folder, size: bytes.length, at: Date.now(), path: folder, ok: true });
      toast('ok', 'Декомпиляция завершена', `${res.report.classes} классов · ${res.report.methods} методов`);
    } catch (e: unknown) {
      const id = (e as any)?.code ?? (e instanceof Error && e.message.startsWith('E-') ? e.message.slice(0, 6) : 'E-3002');
      const def = getErrorDef(id);
      setError({ id, title: def.title, detail: e instanceof Error ? e.message : String(e) });
      log('err', `${def.title}: ${e instanceof Error ? e.message : String(e)}`, id);
      toast('err', 'Не удалось декомпилировать', def.title);
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = () => {
    if (!result) return;
    const zip = new ZipWriter();
    for (const f of result.files) zip.addFile(f.path, f.data, { method: 'deflate' });
    const bytes = zip.build();
    downloadBytes(bytes, `${slugify(apkName.replace(/\.apk$/i, ''))}-decompiled.zip`, 'application/zip');
    log('ok', 'Архив декомпиляции скачан');
  };

  return (
    <Page>
      <PageHead
        num="03"
        eyebrow="Декомпилятор"
        title={
          <>
            Загляни <em>внутрь APK</em>
          </>
        }
        sub="Разберите любой APK на составляющие: декодированный манифест, smali-байткод, ресурсы, ассеты и подпись."
        actions={
          result ? (
            <Button variant="primary" icon={<Download size={15} />} onClick={downloadZip}>
              Скачать проект
            </Button>
          ) : (
            <Button variant="ghost" icon={<Upload size={15} />} onClick={() => document.querySelector<HTMLInputElement>('.dropzone input')?.click()}>
              Загрузить APK
            </Button>
          )
        }
      />

      {!result && !busy && (
        <Card>
          <div style={{ padding: 24 }}>
            <Dropzone accept=".apk,application/vnd.android.package-archive" onFiles={run} title="Перетащите .apk файл" sub="Файл обрабатывается локально — никуда не отправляется">
              <div className="ico">
                <ScanSearch />
              </div>
              <div className="t">Перетащите .apk файл</div>
              <div className="s">Декомпиляция выполняется локально: манифест, DEX → smali, ресурсы</div>
            </Dropzone>
            <div className="grid g-3 mt-20">
              {[
                { i: FileCode2, t: 'Манифест', d: 'Бинарный AXML → читаемый XML с разрешениями и компонентами' },
                { i: Activity, t: 'Байткод', d: 'DEX → smali-подобный листинг всех классов и методов' },
                { i: FolderTree, t: 'Ресурсы', d: 'Все файлы APK извлекаются в папку decompilation/' },
              ].map((x) => {
                const I = x.i;
                return (
                  <div key={x.t} className="col gap-8">
                    <div className="card-icon teal" style={{ width: 34, height: 34, borderRadius: 10 }}>
                      <I size={15} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 560 }}>{x.t}</div>
                    <div className="tiny" style={{ color: 'var(--text-3)', lineHeight: 1.5 }}>
                      {x.d}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {busy && (
        <Card>
          <div className="flex center col gap-10" style={{ padding: 70 }}>
            <Loader2 size={26} className="pulse-soft" style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Анализируем APK…</div>
            <div className="tiny" style={{ color: 'var(--text-4)' }}>
              Читаем манифест, ресурсы и DEX-байткод
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <div style={{ padding: 24 }} className="flex gap-14">
            <div className="card-icon pink" style={{ width: 42, height: 42, borderRadius: 12 }}>
              <AlertTriangle size={19} />
            </div>
            <div>
              <div style={{ fontWeight: 620 }}>{error.title}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{error.detail}</div>
              <div className="hint mt-8">{getErrorDef(error.id).fix}</div>
            </div>
          </div>
        </Card>
      )}

      {result && (
        <>
          <div className="grid g-4 mb-16">
            <div className="kpi">
              <div className="kpi-label">
                <Package size={11} /> Пакет
              </div>
              <div className="mono" style={{ fontSize: 12.5, marginTop: 9, wordBreak: 'break-all', color: 'var(--accent)' }}>
                {result.report.package}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">
                <Smartphone size={11} /> Приложение
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 7 }}>{result.report.appName || '—'}</div>
              <div className="kpi-delta">
                v{result.report.versionName} ({result.report.versionCode})
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">
                <Layers size={11} /> Классы / методы
              </div>
              <div className="kpi-value" style={{ fontSize: 21 }}>
                {result.report.classes}
                <span className="u">/ {result.report.methods}</span>
              </div>
              <div className="kpi-delta">{result.report.dexFiles} dex</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">
                <Hash size={11} /> SDK
              </div>
              <div className="kpi-value" style={{ fontSize: 21 }}>
                {result.report.minSdk}
                <span className="u">→ {result.report.targetSdk}</span>
              </div>
              <div className="kpi-delta">{formatBytes(result.report.size)} · {result.report.files} файлов</div>
            </div>
          </div>

          <Card>
            <div className="card-head" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div className="tabs">
                <div className={`tab ${tab === 'manifest' ? 'active' : ''}`} onClick={() => setTab('manifest')}>
                  Манифест
                </div>
                <div className={`tab ${tab === 'smali' ? 'active' : ''}`} onClick={() => setTab('smali')}>
                  Smali <span className="cnt">{smaliFiles.length}</span>
                </div>
                <div className={`tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')}>
                  Файлы <span className="cnt">{otherFiles.length}</span>
                </div>
              </div>
              <div className="spacer" />
              <Badge tone="neutral" icon={<FileCode2 size={11} />}>
                {result.report.activities.length} activities
              </Badge>
              <Badge tone="ok" icon={<ShieldCheck size={11} />}>
                подпись v2
              </Badge>
            </div>

            {tab === 'manifest' && (
              <div className="grid g-23" style={{ gap: 0 }}>
                <div style={{ borderRight: '1px solid var(--border)' }}>
                  <div className="section-title" style={{ padding: '14px 16px 0' }}>Разрешения</div>
                  <div className="flex gap-6" style={{ padding: '0 16px 16px', flexWrap: 'wrap' }}>
                    {result.report.permissions.length ? (
                      result.report.permissions.map((p) => (
                        <span key={p} className="mono" style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                          {p.replace('android.permission.', '')}
                        </span>
                      ))
                    ) : (
                      <span className="tiny muted">Нет</span>
                    )}
                  </div>
                  <div className="section-title" style={{ padding: '0 16px' }}>Activities</div>
                  <div className="col gap-4" style={{ padding: '0 16px 16px' }}>
                    {result.report.activities.map((a) => (
                      <div key={a} className="flex gap-8" style={{ fontSize: 11.5 }}>
                        {a === result.report.mainActivity ? <CheckCircle2 size={12} style={{ color: 'var(--ok)' }} /> : <Activity size={12} style={{ color: 'var(--text-4)' }} />}
                        <span className="mono truncate" style={{ color: 'var(--text-2)' }}>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="scroll-y" style={{ maxHeight: 560, background: '#070910' }}>
                  <pre className="mono" style={{ margin: 0, padding: 16, fontSize: 11.5, lineHeight: 1.65, color: '#a5b4fc', whiteSpace: 'pre', overflow: 'auto' }}>
                    {result.manifestXml}
                  </pre>
                </div>
              </div>
            )}

            {tab === 'smali' && (
              <div className="grid" style={{ gridTemplateColumns: '260px 1fr', minHeight: 420 }}>
                <div className="scroll-y" style={{ maxHeight: 560, borderRight: '1px solid var(--border)' }}>
                  {smaliFiles.map((f, i) => (
                    <div
                      key={f.path}
                      className={`row ${i === classIdx ? '' : ''}`}
                      style={{
                        padding: '7px 12px',
                        cursor: 'pointer',
                        background: i === classIdx ? 'rgba(129,140,248,.1)' : undefined,
                        borderRadius: 0,
                      }}
                      onClick={() => setClassIdx(i)}
                    >
                      <span className="mono truncate" style={{ fontSize: 10.5, color: i === classIdx ? 'var(--text)' : 'var(--text-3)' }}>
                        {f.path.replace('smali/', '').replace('.smali', '')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="scroll-y" style={{ maxHeight: 560, background: '#070910' }}>
                  <pre className="mono" style={{ margin: 0, padding: 16, fontSize: 11, lineHeight: 1.6, color: '#c9d2e6', whiteSpace: 'pre', overflow: 'auto' }}>
                    {smaliFiles[classIdx] ? new TextDecoder().decode(smaliFiles[classIdx].data) : '—'}
                  </pre>
                </div>
              </div>
            )}

            {tab === 'files' && (
              <div className="scroll-y" style={{ maxHeight: 520, padding: 10 }}>
                {otherFiles.slice(0, 400).map((f) => (
                  <div key={f.path} className="flex between" style={{ padding: '7px 12px', borderRadius: 7, fontSize: 11.5 }}>
                    <span className="mono truncate" style={{ color: 'var(--text-2)' }}>{f.path}</span>
                    <span className="mono" style={{ color: 'var(--text-4)' }}>{formatBytes(f.data.length)}</span>
                  </div>
                ))}
                {otherFiles.length > 400 && <div className="tiny muted" style={{ padding: 8 }}>+ ещё {otherFiles.length - 400} файлов</div>}
              </div>
            )}
          </Card>

          <Card pad className="mt-16">
            <div className="flex gap-12">
              <FolderTree size={16} style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Проект сохранён в <span className="code-inline">decompilation/{slugify(apkName.replace(/\.apk$/i, ''))}-…/</span>.
                Внутри: <span className="mono">AndroidManifest.xml</span>, <span className="mono">smali/</span> и все файлы APK.
              </div>
            </div>
          </Card>
        </>
      )}
    </Page>
  );
}

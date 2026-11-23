import { useState } from 'react';
import {
  PackageOpen,
  Upload,
  Download,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileArchive,
  Merge,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { useStore } from '../store';
import { Page, PageHead } from '../components/Page';
import { Card, CardHead, Button, Badge, Empty, Switch, Progress, formatBytes } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { analyzeXapk, convertXapk, type XapkAnalysis, type ConvertResult } from '../engine/xapk';
import { getErrorDef } from '../engine/errors';
import { getOrCreateKey } from '../engine/keyring';
import { downloadBytes, readFileBytes, slugify, timestampSlug } from '../lib/utils';

const STEPS = ['Чтение архива', 'Анализ split-модулей', 'Слияние dex / lib / assets', 'Подпись APK v2'];

export function XapkPage() {
  const setFile = useStore((s) => s.setFile);
  const log = useStore((s) => s.log);
  const toast = useStore((s) => s.toast);
  const pushHistory = useStore((s) => s.pushHistory);
  const [analysis, setAnalysis] = useState<XapkAnalysis | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<{ id: string; title: string; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [includeSplits, setIncludeSplits] = useState(true);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [filename, setFilename] = useState('');
  const [apkName, setApkName] = useState('');

  const onFile = async (fs: File[]) => {
    const f = fs[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setFilename(f.name);
    try {
      const b = await readFileBytes(f);
      setBytes(b);
      const a = analyzeXapk(b, f.name);
      setAnalysis(a);
      log('ok', `XAPK проанализирован: ${a.splits.length} APK, ${formatBytes(a.totalSize)}`);
    } catch (e: unknown) {
      const id = (e as any)?.code ?? (e instanceof Error && e.message.startsWith('E-') ? e.message.slice(0, 6) : 'E-4001');
      const def = getErrorDef(id);
      setError({ id, title: def.title, detail: e instanceof Error ? e.message : String(e) });
      log('err', `${def.title}: ${e instanceof Error ? e.message : String(e)}`, id);
    } finally {
      setBusy(false);
    }
  };

  const doConvert = async () => {
    if (!bytes) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setStep(0);
    try {
      for (let i = 0; i < STEPS.length; i++) {
        setStep(i);
        await new Promise((r) => setTimeout(r, 220));
      }
      const key = await getOrCreateKey();
      const res = await convertXapk(bytes, filename, { keystore: key, includeSplits });
      const name = `${slugify(analysis?.appName || filename.replace(/\.(xapk|apks)$/i, ''))}-${timestampSlug()}.apk`;
      const outputPath = `xapkconvs/${name}`;
      setFile(outputPath, res.apk);
      setApkName(name);
      setResult({ ...res, size: res.size });
      setStep(STEPS.length);
      log('ok', `XAPK → APK: ${name} (${formatBytes(res.size)})`);
      res.warnings.forEach((w) => log('warn', w, w.startsWith('E-') ? w.slice(0, 6) : undefined));
      pushHistory({ id: `${Date.now()}`, type: 'xapk', name, size: res.size, at: Date.now(), path: outputPath, ok: true });
      toast('ok', 'APK готов', `${name} · ${formatBytes(res.size)}`);
    } catch (e: unknown) {
      const id = (e as any)?.code ?? 'E-4002';
      const def = getErrorDef(id);
      setError({ id, title: def.title, detail: e instanceof Error ? e.message : String(e) });
      log('err', `${def.title}: ${e instanceof Error ? e.message : String(e)}`, id);
      toast('err', 'Ошибка конвертации', def.title);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHead
        num="04"
        eyebrow="XAPK → APK"
        title={
          <>
            Split-архив в <em>один APK</em>
          </>
        }
        sub="XAPK и APKS содержат базовый APK и split-модули. Мы объединяем dex, нативные библиотеки и ассеты в один файл и подписываем его."
        actions={
          analysis && !result ? (
            <Button variant="primary" icon={<Merge size={15} />} onClick={doConvert} disabled={busy}>
              Конвертировать
            </Button>
          ) : null
        }
      />

      {!analysis && !busy && (
        <Card>
          <div style={{ padding: 24 }}>
            <Dropzone accept=".xapk,.apks,application/zip" onFiles={onFile} title="Перетащите .xapk или .apks" sub="Обычные APK тоже поддерживаются — они будут переподписаны">
              <div className="ico">
                <PackageOpen />
              </div>
              <div className="t">Перетащите .xapk или .apks</div>
              <div className="s">Файл обрабатывается локально</div>
            </Dropzone>
            <div className="grid g-3 mt-20">
              {[
                { i: Layers, t: 'Анализ', d: 'Показываем все split-модули, их размер и содержимое' },
                { i: Merge, t: 'Слияние', d: 'classes2.dex…N, lib/*, assets/* переносятся в базовый APK' },
                { i: ShieldCheck, t: 'Подпись', d: 'Готовый APK подписывается вашим ключом по схеме v2' },
              ].map((x) => {
                const I = x.i;
                return (
                  <div key={x.t} className="col gap-8">
                    <div className="card-icon teal" style={{ width: 34, height: 34, borderRadius: 10 }}>
                      <I size={15} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 560 }}>{x.t}</div>
                    <div className="tiny" style={{ color: 'var(--text-3)', lineHeight: 1.5 }}>{x.d}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {busy && !analysis && (
        <Card>
          <div className="flex center col gap-10" style={{ padding: 60 }}>
            <Loader2 size={24} className="pulse-soft" style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: 13 }}>Анализируем архив…</div>
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

      {analysis && (
        <div className="grid g-23" style={{ alignItems: 'start' }}>
          <Card>
            <CardHead
              icon={<PackageOpen size={16} />}
              tone="teal"
              title={analysis.appName || filename}
              sub={`${analysis.format.toUpperCase()} · ${analysis.packageName || 'пакет не указан'}`}
              right={<Badge tone="neutral">{formatBytes(analysis.totalSize)}</Badge>}
            />
            <div style={{ padding: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Модуль</th>
                    <th>Тип</th>
                    <th>Dex</th>
                    <th>Lib</th>
                    <th className="r">Размер</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.splits.map((s) => (
                    <tr key={s.name}>
                      <td className="mono truncate" style={{ maxWidth: 260 }}>{s.name}</td>
                      <td>
                        <Badge tone={s.kind === 'base' ? 'accent' : s.kind === 'config' ? 'info' : 'neutral'}>
                          {s.kind}
                        </Badge>
                      </td>
                      <td>{s.hasDex ? <CheckCircle2 size={13} style={{ color: 'var(--ok)' }} /> : <span className="tiny muted">—</span>}</td>
                      <td>{s.hasLib ? <CheckCircle2 size={13} style={{ color: 'var(--ok)' }} /> : <span className="tiny muted">—</span>}</td>
                      <td className="r mono">{formatBytes(s.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="col gap-16">
            <Card pad>
              <div className="switch-row" style={{ paddingTop: 0 }}>
                <div>
                  <div className="t">Включать split-модули</div>
                  <div className="d">Объединять dex, библиотеки и ассеты из модулей</div>
                </div>
                <Switch on={includeSplits} onChange={setIncludeSplits} />
              </div>
              <div className="flex gap-8 mt-8" style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>
                <Info size={14} style={{ flex: 'none', marginTop: 1 }} />
                resources.arsc из split-модулей не объединяется — используются ресурсы базового APK.
              </div>
              <Button variant="primary" size="lg" block icon={<Merge size={16} />} onClick={doConvert} disabled={busy} className="mt-16">
                Конвертировать в APK
              </Button>
            </Card>

            {(step >= 0 || result) && (
              <Card pad>
                <div className="steps">
                  {STEPS.map((s, i) => {
                    const state = result ? 'done' : i < step ? 'done' : i === step ? 'active' : 'idle';
                    return (
                      <div className={`step ${state}`} key={s}>
                        <div className="n">
                          {state === 'done' ? <CheckCircle2 size={12} /> : state === 'active' ? <div className="spinner" /> : i + 1}
                        </div>
                        {s}
                      </div>
                    );
                  })}
                </div>
                <Progress value={result ? 100 : ((step + 1) / STEPS.length) * 100} className="mt-12" />
              </Card>
            )}

            {result && (
              <Card pad>
                <div className="flex gap-12" style={{ alignItems: 'flex-start' }}>
                  <div className="card-icon teal" style={{ width: 38, height: 38, borderRadius: 11 }}>
                    <FileArchive size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 620 }}>APK собран</div>
                    <div className="mono tiny" style={{ color: 'var(--text-3)', marginTop: 3, wordBreak: 'break-all' }}>
                      xapkconvs/{apkName}
                    </div>
                    <div className="flex gap-8 mt-8" style={{ flexWrap: 'wrap' }}>
                      <Badge tone="ok">{formatBytes(result.size)}</Badge>
                      <Badge tone="neutral">{result.merged.length} объединено</Badge>
                      {result.skipped.length > 0 && <Badge tone="warn">{result.skipped.length} пропущено</Badge>}
                    </div>
                  </div>
                </div>
                {result.merged.length > 0 && (
                  <div className="mt-12" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {result.merged.slice(0, 6).map((m) => (
                      <div key={m} className="mono truncate" style={{ lineHeight: 1.6 }}>· {m}</div>
                    ))}
                    {result.merged.length > 6 && <div className="mono">+ ещё {result.merged.length - 6}</div>}
                  </div>
                )}
                {result.warnings.length > 0 && (
                  <div className="col gap-6 mt-12">
                    {result.warnings.map((w, i) => (
                      <div key={i} className="flex gap-8" style={{ fontSize: 11.5, color: 'var(--warn)' }}>
                        <AlertTriangle size={13} style={{ flex: 'none' }} />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  variant="primary"
                  block
                  icon={<Download size={15} />}
                  className="mt-16"
                  onClick={() => downloadBytes(result.apk, apkName, 'application/vnd.android.package-archive')}
                >
                  Скачать APK
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

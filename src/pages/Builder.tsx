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
  'Проверка исходников',
  'Генерация манифеста AXML',
  'Компиляция DEX-байткода',
  'Сборка ресурсов',
  'Подпись APK Signature v2',
];

const PERMISSIONS = [
  { id: 'android.permission.INTERNET', label: 'Интернет' },
  { id: 'android.permission.CAMERA', label: 'Камера' },
  { id: 'android.permission.RECORD_AUDIO', label: 'Микрофон' },
  { id: 'android.permission.ACCESS_FINE_LOCATION', label: 'Геолокация' },
  { id: 'android.permission.VIBRATE', label: 'Вибрация' },
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
    appName: 'Моё веб-приложение',
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
      toast('err', 'Некорректное имя пакета', 'Формат: com.example.app');
      log('err', `Некорректное имя пакета: ${cfg.packageName}`, 'E-1012');
      return;
    }
    if (!cfg.appName.trim()) {
      toast('err', 'Укажите имя приложения', 'E-2005');
      return;
    }
    if (mode === 'pwa' && !validUrl) {
      toast('err', 'Некорректный URL', 'Адрес должен начинаться с http:// или https://', );
      log('err', `Некорректный URL: ${cfg.url}`, 'E-1014');
      return;
    }
    if (mode === 'folder' && !hasIndex) {
      toast('err', 'В папке нет index.html', 'Добавьте точку входа и повторите');
      log('err', 'В папке проекта не найден index.html', 'E-1015');
      return;
    }

    setBuild({ open: true, running: true, step: 0, result: null, error: null, apkName: '', outputPath: '' });
    log('info', `Сборка APK (${mode === 'pwa' ? 'PWA' : 'папка'}) — «${cfg.appName}»`);
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
      log('ok', `APK собран: ${apkName} (${formatBytes(result.size)})`);
      result.warnings.forEach((w) => log('warn', w, 'E-2001'));
      toast('ok', 'APK успешно собран', `${apkName} · ${formatBytes(result.size)}`);
    } catch (e: unknown) {
      const id = (e as any)?.code ?? 'E-2002';
      const def = getErrorDef(id);
      const detail = e instanceof Error ? e.message : String(e);
      setBuild((b) => ({ ...b, running: false, error: { id, title: def.title, detail } }));
      log('err', `${def.title}: ${detail}`, id);
      toast('err', 'Ошибка сборки', `${id} · ${def.title}`);
      pushHistory({ id: `${Date.now()}`, type: 'build', name: cfg.appName, size: 0, at: Date.now(), ok: false, errorId: id });
    }
  };

  const onFolder = async (fs: File[]) => {
    const list = await readDirectoryFiles(fs);
    if (!list.length) {
      toast('err', 'Папка пуста', 'Выберите папку с файлами проекта');
      return;
    }
    const rel = (fs[0] as any).webkitRelativePath as string | undefined;
    setFolderName(rel ? rel.split('/')[0] : 'проект');
    setFolderFiles(list);
    setMode('folder');
    const idx = list.find((f) => f.path.endsWith('index.html'));
    if (idx) {
      const name = idx.path.split('/').pop() ?? 'index.html';
      setCfg((c) => ({ ...c, appName: c.appName || name.replace('.html', '') }));
    }
    log('ok', `Загружена папка: ${list.length} файлов, ${formatBytes(list.reduce((a, f) => a + f.data.length, 0))}`);
  };

  return (
    <Page>
      <PageHead
        num="02"
        eyebrow="Сборка APK"
        title={
          <>
            Два пути к <em>готовому APK</em>
          </>
        }
        sub="Соберите приложение из ссылки на сайт (PWA) или из папки проекта с HTML/CSS/JS. На выходе — подписанный APK, готовый к установке."
        actions={
          <Button variant="primary" icon={<Play size={15} />} onClick={doBuild} disabled={build.running}>
            Собрать APK
          </Button>
        }
      />

      <div className="tabs mb-16">
        <div className={`tab ${mode === 'pwa' ? 'active' : ''}`} onClick={() => setMode('pwa')}>
          <Globe size={13} /> По ссылке (PWA)
        </div>
        <div className={`tab ${mode === 'folder' ? 'active' : ''}`} onClick={() => setMode('folder')}>
          <FolderOpen size={13} /> По папке проекта
        </div>
      </div>

      <div className="grid g-23" style={{ alignItems: 'start' }}>
        <div className="col gap-16">
          {mode === 'pwa' ? (
            <Card>
              <CardHead
                icon={<Globe size={16} />}
                tone="pink"
                title="PWA / веб-приложение"
                sub="APK открывает сайт в нативном WebView-окне"
              />
              <div className="col gap-14" style={{ padding: 20 }}>
                <Field
                  label="Адрес приложения"
                  required
                  error={validUrl ? undefined : 'Введите полный URL, например https://example.com'}
                >
                  <Input
                    mono
                    value={cfg.url}
                    onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
                    placeholder="https://example.com"
                  />
                </Field>
                <div className="grid g-2">
                  <Field label="Имя приложения" required>
                    <Input value={cfg.appName} onChange={(e) => setCfg({ ...cfg, appName: e.target.value })} />
                  </Field>
                  <Field label="Имя пакета" required>
                    <Input
                      mono
                      value={cfg.packageName}
                      onChange={(e) => setCfg({ ...cfg, packageName: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid g-3">
                  <Field label="Версия">
                    <Input value={cfg.versionName} onChange={(e) => setCfg({ ...cfg, versionName: e.target.value })} />
                  </Field>
                  <Field label="Код версии">
                    <Input
                      mono
                      type="number"
                      value={cfg.versionCode}
                      onChange={(e) => setCfg({ ...cfg, versionCode: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Ориентация">
                    <Select
                      value={cfg.orientation}
                      onChange={(e) => setCfg({ ...cfg, orientation: e.target.value as any })}
                    >
                      <option value="unspecified">Авто</option>
                      <option value="portrait">Портрет</option>
                      <option value="landscape">Альбом</option>
                    </Select>
                  </Field>
                </div>

                <div className="grid g-2">
                  <Field label="Цвет темы">
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
                  <Field label="Иконка">
                    <Dropzone
                      compact
                      accept="image/png"
                      onFiles={async (fs) => {
                        const f = fs[0];
                        if (!f) return;
                        const data = await readFileBytes(f);
                        const info = await pngInfo(data);
                        if (!info || info.width < 48) return toast('err', 'Маленькая иконка', 'Минимум 48×48');
                        setIcon(data);
                        setIconLabel(`${info.width}×${info.height}`);
                      }}
                    >
                      <div className="flex gap-10 center">
                        <Upload size={16} style={{ color: 'var(--accent)' }} />
                        <div style={{ fontSize: 12 }}>{iconLabel || 'Загрузить PNG'}</div>
                      </div>
                    </Dropzone>
                  </Field>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 8 }}>Разрешения</div>
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
                    <div className="t">Разрешить HTTP (не HTTPS)</div>
                    <div className="d">Полезно для локальных серверов и старых сайтов</div>
                  </div>
                  <Switch on={cfg.cleartext} onChange={(v) => setCfg({ ...cfg, cleartext: v })} />
                </div>

                <Button variant="primary" size="lg" block icon={<Play size={16} />} onClick={doBuild}>
                  Собрать APK из ссылки
                </Button>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHead
                icon={<FolderOpen size={16} />}
                tone="teal"
                title="Папка проекта"
                sub="Все файлы попадут в assets/app, index.html станет точкой входа"
                right={
                  folderFiles.length > 0 ? (
                    <Badge tone="ok" icon={<CheckCircle2 size={11} />}>
                      {folderFiles.length} файлов
                    </Badge>
                  ) : null
                }
              />
              <div style={{ padding: 20 }} className="col gap-14">
                <Dropzone folder multiple onFiles={onFolder} title="Перетащите папку проекта" sub="или нажмите, чтобы выбрать папку с index.html">
                  <div className="ico">
                    <FolderOpen />
                  </div>
                  <div className="t">Перетащите папку проекта</div>
                  <div className="s">
                    {folderFiles.length
                      ? `${folderName} · ${folderFiles.length} файлов · ${formatBytes(folderSize)}`
                      : 'или нажмите, чтобы выбрать папку с index.html'}
                  </div>
                </Dropzone>

                {folderFiles.length > 0 && (
                  <>
                    <div className={`flex gap-10 ${hasIndex ? '' : ''}`} style={{ fontSize: 12 }}>
                      {hasIndex ? (
                        <Badge tone="ok" icon={<CheckCircle2 size={11} />}>
                          index.html найден
                        </Badge>
                      ) : (
                        <Badge tone="err" icon={<AlertTriangle size={11} />}>
                          index.html не найден
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
                          + ещё {folderFiles.length - 120} файлов
                        </div>
                      )}
                    </div>
                    <div className="grid g-2">
                      <Field label="Имя приложения" required>
                        <Input value={cfg.appName} onChange={(e) => setCfg({ ...cfg, appName: e.target.value })} />
                      </Field>
                      <Field label="Имя пакета" required>
                        <Input mono value={cfg.packageName} onChange={(e) => setCfg({ ...cfg, packageName: e.target.value })} />
                      </Field>
                    </div>
                    <Button variant="primary" size="lg" block icon={<Play size={16} />} onClick={doBuild}>
                      Собрать APK из папки
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* правая колонка */}
        <div className="col gap-16">
          <Card>
            <CardHead icon={<Layers size={16} />} title="Что попадёт в APK" sub="Структура собираемого пакета" />
            <div style={{ padding: 16 }} className="col gap-6">
              {[
                ['AndroidManifest.xml', 'бинарный манифест: пакет, версия, разрешения'],
                ['classes.dex', 'Activity-обёртка WebView'],
                ['resources.arsc', 'имя приложения и иконка'],
                ['res/mipmap-xxxhdpi/', 'иконка 192×192'],
                ['assets/app/*', mode === 'folder' ? 'файлы вашего проекта' : '— (PWA-режим)'],
                ['META-INF/', 'подпись APK Signature v2'],
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
                <b style={{ color: 'var(--text)' }}>Установка:</b> разрешите «установка из неизвестных источников» и откройте APK.
                Подпись v2 работает на Android 7.0+.
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="flex gap-12">
              <Info size={16} style={{ color: 'var(--info)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                PWA-режим загружает сайт напрямую в WebView. Для офлайн-доступа используйте сборку из папки.
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

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
    log('ok', 'Проект экспортирован в ZIP');
    toast('ok', 'Проект экспортирован', `${Object.keys(files).length} файлов`);
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
      log('ok', `Импортировано файлов: ${n}`);
      toast('ok', 'Проект импортирован', `${n} файлов`);
    } catch (e) {
      toast('err', 'Не удалось импортировать', String(e));
    }
  };

  const resetSamples = () => {
    setFile('src/index.html', new TextEncoder().encode(SAMPLE_HTML));
    setFile('src/style.css', new TextEncoder().encode(SAMPLE_CSS));
    setFile('src/app.js', new TextEncoder().encode(SAMPLE_JS));
    setFile('src/app.py', new TextEncoder().encode(SAMPLE_PY));
    log('info', 'Демо-файлы восстановлены');
    toast('ok', 'Демо-проект восстановлен');
  };

  return (
    <Page>
      <PageHead
        num="07"
        eyebrow="Настройки"
        title={
          <>
            Параметры <em>студии</em>
          </>
        }
        sub="Поведение движка, проект и данные. Все настройки сохраняются локально."
      />

      <div className="grid g-23" style={{ alignItems: 'start' }}>
        <div className="col gap-16">
          <Card>
            <CardHead icon={<Cpu size={16} />} tone="teal" title="Движок сборки" sub="Применяются к новым сборкам" />
            <div className="col gap-14" style={{ padding: 18 }}>
              <div className="grid g-2">
                <Field label="Пакет по умолчанию">
                  <Input mono value={settings.defaultPackage} onChange={(e) => setSettings({ defaultPackage: e.target.value })} />
                </Field>
                <Field label="Цвет темы" tip="HEX">
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
                <Field label="Ориентация">
                  <Select value={settings.orientation} onChange={(e) => setSettings({ orientation: e.target.value as any })}>
                    <option value="unspecified">Авто</option>
                    <option value="portrait">Портрет</option>
                    <option value="landscape">Альбом</option>
                  </Select>
                </Field>
              </div>
              <div className="switch-row">
                <div>
                  <div className="t">Автопроверка кода</div>
                  <div className="d">Подчёркивать ошибки во время ввода</div>
                </div>
                <Switch on={settings.autoValidate} onChange={(v) => setSettings({ autoValidate: v })} />
              </div>
              <div className="switch-row">
                <div>
                  <div className="t">Подписывать сборки</div>
                  <div className="d">Использовать ключ из раздела «Подпись»</div>
                </div>
                <Switch on={settings.signBuilds} onChange={(v) => setSettings({ signBuilds: v })} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHead icon={<HardDrive size={16} />} tone="pink" title="Проект и данные" sub={`${Object.keys(files).length} файлов · ${formatBytes(totalSize)}`} />
            <div style={{ padding: 18 }} className="col gap-8">
              <div className="list-group">
                <div className="list-group-item">
                  <div style={{ flex: 1 }}>
                    <div className="t">Экспорт проекта</div>
                    <div className="d">ZIP со всеми файлами, ключами и историей</div>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Download size={13} />} onClick={exportProject}>
                    Экспорт
                  </Button>
                </div>
                <div className="list-group-item">
                  <div style={{ flex: 1 }}>
                    <div className="t">Импорт проекта</div>
                    <div className="d">Загрузить ранее экспортированный ZIP</div>
                  </div>
                  <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                    <Upload size={13} />
                    Импорт
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
                    <div className="t">Демо-файлы</div>
                    <div className="d">Восстановить примеры в src/</div>
                  </div>
                  <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={resetSamples}>
                    Восстановить
                  </Button>
                </div>
                <div className="list-group-item">
                  <div style={{ flex: 1 }}>
                    <div className="t">Очистить проект</div>
                    <div className="d">Удалить все файлы и историю</div>
                  </div>
                  <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={() => setConfirmClear(true)}>
                    Очистить
                  </Button>
                </div>
              </div>
              <div className="flex gap-8 mt-8" style={{ fontSize: 11, color: 'var(--text-4)' }}>
                <Database size={12} />
                IndexedDB · {history.length} записей истории · {keys.length} ключей
              </div>
            </div>
          </Card>
        </div>

        <div className="col gap-16">
          <Card pad>
            <div className="section-title">Android-версия</div>
            <div className="col gap-12">
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Та же студия в виде APK: работает офлайн, без интернета и без Android SDK.
                Файлы внутри Android-сборки хранятся в проекте (WebView не отдаёт их в «Загрузки»).
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
                      toast('ok', 'APK-версия скачана', `${(buf.byteLength / 1024).toFixed(0)} КБ`);
                    } catch {
                      toast('err', 'Файл недоступен', 'APK-версия появляется после сборки релиза');
                    }
                  }}
                >
                  Скачать APK
                </Button>
                <Badge tone="neutral" icon={<ShieldCheck size={11} />}>
                  APK Sig v2
                </Badge>
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="section-title">О приложении</div>
            <div className="col gap-12" style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.65 }}>
              <div className="flex gap-10">
                <ShieldCheck size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <span>
                  <b style={{ color: 'var(--text)' }}>Локально.</b> Исходный код, ключи и APK не покидают устройство. Сеть не используется.
                </span>
              </div>
              <div className="flex gap-10">
                <Cpu size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <span>
                  <b style={{ color: 'var(--text)' }}>Без SDK.</b> DEX, бинарный манифест, ресурсы и подпись v2 генерируются собственным движком.
                </span>
              </div>
              <div className="flex gap-10">
                <Palette size={15} style={{ color: 'var(--accent)', flex: 'none', marginTop: 1 }} />
                <span>
                  <b style={{ color: 'var(--text)' }}>Открытый код.</b> Проект собран на React + CodeMirror и распространяется как есть.
                </span>
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="section-title">Горячие клавиши</div>
            <div className="col gap-8">
              {[
                ['Alt + 1…8', 'Переход между разделами'],
                ['`', 'Показать / скрыть консоль'],
                ['Tab', 'Отступ в редакторе'],
                ['Ctrl + Z', 'Отмена в редакторе'],
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
                Версия 1.0.0 · движок APK Builder Engine · RSA-2048 · APK Signature Scheme v2
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Очистить проект?"
        sub="Действие необратимо"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Отмена</Button>
            <Button
              variant="danger"
              onClick={() => {
                const st = useStore.getState();
                for (const k of Object.keys(st.files)) st.removeFile(k);
                useStore.setState({ history: [] });
                setConfirmClear(false);
                log('warn', 'Проект очищен');
                toast('ok', 'Проект очищен');
              }}
            >
              Очистить
            </Button>
          </>
        }
      >
        <div className="flex gap-10" style={{ color: 'var(--warn)', fontSize: 12.5 }}>
          <AlertTriangle size={16} style={{ flex: 'none' }} />
          Будут удалены все файлы проекта, результаты сборок и история. Ключи подписи сохранятся.
        </div>
      </Modal>
    </Page>
  );
}

import { useMemo, useState } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  Download,
  Upload,
  ShieldCheck,
  Fingerprint,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Calendar,
  Copy,
  Loader2,
} from 'lucide-react';
import { useStore } from '../store';
import { Page, PageHead } from '../components/Page';
import { Card, CardHead, Button, Badge, Field, Input, Empty, formatBytes, formatTime } from '../components/ui';
import { Dropzone } from '../components/Dropzone';
import { createSelfSignedCertificate, exportKey, importStoredKey, type StoredKey } from '../engine/cert';
import { inspectSignature, signApkV2, type SignatureInfo } from '../engine/sign';
import { readZip, ZipWriter } from '../engine/zip';
import { fromBase64, toBase64 } from '../engine/bytes';
import { downloadBytes, downloadText, readFileBytes, timestampSlug } from '../lib/utils';

export function Signing() {
  const keys = useStore((s) => s.keys);
  const addKey = useStore((s) => s.addKey);
  const removeKey = useStore((s) => s.removeKey);
  const log = useStore((s) => s.log);
  const toast = useStore((s) => s.toast);
  const setFile = useStore((s) => s.setFile);

  const [alias, setAlias] = useState('my-release-key');
  const [creating, setCreating] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [verify, setVerify] = useState<{ name: string; info: SignatureInfo } | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [signResult, setSignResult] = useState<{ name: string; size: number; path: string } | null>(null);

  const createKey = async () => {
    if (!alias.trim()) return;
    setCreating(true);
    try {
      const kp = await createSelfSignedCertificate({
        commonName: alias.trim(),
        organization: 'APK Builder',
        country: 'RU',
      });
      const stored = await exportKey(kp, alias.trim());
      addKey(stored);
      log('ok', `Создан ключ «${alias}» · RSA-2048 · SHA-256`);
      toast('ok', 'Ключ создан', `${alias.trim()} · отпечаток ${stored.fingerprint.slice(0, 23)}…`);
      setAlias('');
    } catch (e) {
      log('err', `Не удалось создать ключ: ${e}`, 'E-5001');
      toast('err', 'Ошибка создания ключа', String(e));
    } finally {
      setCreating(false);
    }
  };

  const exportKeyFile = (k: StoredKey) => {
    downloadText(
      JSON.stringify(
        {
          format: 'apkbuilder-key',
          version: 1,
          alias: k.alias,
          createdAt: k.createdAt,
          algorithm: 'RSA-2048',
          certificate: k.certificate,
          publicKey: k.publicKey,
          privateKey: k.privateKey,
        },
        null,
        2,
      ),
      `${k.alias}.apkbuilder-key.json`,
      'application/json',
    );
    log('info', `Ключ «${k.alias}» экспортирован`);
  };

  const importKeyFile = async (fs: File[]) => {
    const f = fs[0];
    if (!f) return;
    try {
      const text = await f.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        const m = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(text);
        if (!m) throw new Error('Не JSON и не PEM');
        data = { privateKey: m[1].replace(/\s+/g, ''), publicKey: '', certificate: '' };
      }
      const stored: StoredKey = {
        alias: data.alias || f.name.replace(/\.(json|pem|key)$/i, ''),
        createdAt: data.createdAt || Date.now(),
        certificate: data.certificate || '',
        publicKey: data.publicKey || '',
        privateKey: data.privateKey,
        fingerprint: data.fingerprint || '',
      };
      // проверим, что ключ импортируется
      await importStoredKey(stored);
      addKey(stored);
      log('ok', `Ключ «${stored.alias}» импортирован`);
      toast('ok', 'Ключ импортирован', stored.alias);
    } catch (e) {
      log('err', `Не удалось импортировать ключ: ${e}`, 'E-5001');
      toast('err', 'Ошибка импорта', 'Файл должен быть JSON-ключом APK Builder или PKCS#8 PEM');
    }
  };

  const signApk = async (fs: File[], keyAlias?: string) => {
    const f = fs[0];
    if (!f) return;
    if (!keys.length) {
      toast('err', 'Нет ключей', 'Сначала создайте ключ подписи');
      return;
    }
    setSignBusy(true);
    setSignResult(null);
    try {
      const bytes = await readFileBytes(f);
      const entries = readZip(bytes);
      const zip = new ZipWriter();
      for (const e of entries) {
        if (e.name.startsWith('META-INF/') && /\.(RSA|DSA|EC|SF|MF)$/i.test(e.name)) continue;
        zip.addFile(e.name, e.data, { method: e.method === 0 ? 'store' : 'deflate', align: e.method === 0 ? 4 : 1 });
      }
      const stored = keyAlias ? keys.find((k) => k.alias === keyAlias) ?? keys[0] : keys[0];
      const { privateKey, certificate } = await importStoredKey(stored!);
      const signed = await signApkV2(zip.build(), privateKey, certificate, fromBase64(stored!.publicKey));
      const name = `${f.name.replace(/\.apk$/i, '')}-signed-${timestampSlug()}.apk`;
      const path = `build/${name}`;
      setFile(path, signed.bytes);
      setSignResult({ name, size: signed.bytes.length, path });
      log('ok', `APK подписан ключом «${stored!.alias}»: ${name}`);
      toast('ok', 'APK подписан', `${name} · ${formatBytes(signed.bytes.length)}`);
    } catch (e) {
      log('err', `Ошибка подписи: ${e}`, 'E-5001');
      toast('err', 'Не удалось подписать', String(e));
    } finally {
      setSignBusy(false);
    }
  };

  const verifyApk = async (fs: File[]) => {
    const f = fs[0];
    if (!f) return;
    setVerifyBusy(true);
    try {
      const bytes = await readFileBytes(f);
      const info = await inspectSignature(bytes);
      setVerify({ name: f.name, info });
      log(info.signedV2 ? 'ok' : 'warn', `Проверка подписи ${f.name}: ${info.signedV2 ? 'v2 ✓' : 'подпись не найдена'}`);
    } catch (e) {
      toast('err', 'Не удалось проверить', String(e));
    } finally {
      setVerifyBusy(false);
    }
  };

  return (
    <Page>
      <PageHead
        num="05"
        eyebrow="Подпись"
        title={
          <>
            Ключи и <em>подпись APK</em>
          </>
        }
        sub="Каждый APK должен быть подписан. Создайте ключ, подпишите готовый APK или проверьте чужую подпись."
        actions={
          <Badge tone="accent" icon={<ShieldCheck size={11} />}>
            APK Signature Scheme v2
          </Badge>
        }
      />

      <div className="grid g-23" style={{ alignItems: 'start' }}>
        <div className="col gap-16">
          {/* ключи */}
          <Card>
            <CardHead
              icon={<KeyRound size={16} />}
              tone="teal"
              title="Ключи подписи"
              sub={`${keys.length} ключей · RSA-2048 · SHA-256`}
              right={
                <Dropzone accept=".json,.pem,.key" onFiles={importKeyFile} compact>
                  <div className="flex gap-6 center tiny" style={{ color: 'var(--text-2)' }}>
                    <Upload size={12} /> Импорт
                  </div>
                </Dropzone>
              }
            />
            <div style={{ padding: 16 }} className="col gap-12">
              <div className="input-group">
                <Input
                  mono
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="имя ключа, например release-key"
                  onKeyDown={(e) => e.key === 'Enter' && createKey()}
                />
                <Button variant="primary" icon={creating ? undefined : <Plus size={15} />} loading={creating} onClick={createKey}>
                  Создать
                </Button>
              </div>

              {keys.length === 0 ? (
                <Empty icon={<Lock size={18} />} title="Ключей пока нет" sub="Создайте ключ — он автоматически используется при сборке" />
              ) : (
                <div className="col gap-8">
                  {keys.map((k) => (
                    <div key={k.alias} className="row" style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
                      <div className="ico" style={{ color: 'var(--accent)' }}>
                        <KeyRound size={14} />
                      </div>
                      <div className="main">
                        <div className="t">{k.alias}</div>
                        <div className="s" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Fingerprint size={10} />
                          {k.fingerprint ? `${k.fingerprint.slice(0, 23)}…` : 'RSA-2048'}
                          <span>·</span>
                          <Calendar size={10} />
                          {new Date(k.createdAt).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" icon={<Download size={13} />} onClick={() => exportKeyFile(k)}>
                        Экспорт
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={13} />}
                        onClick={() => {
                          removeKey(k.alias);
                          log('warn', `Ключ «${k.alias}» удалён`);
                        }}
                      >
                        <span className="hide-sm">Удалить</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* подпись APK */}
          <Card>
            <CardHead
              icon={<FileCheck2 size={16} />}
              tone="pink"
              title="Подписать APK"
              sub="Старая подпись удаляется, ставится ваша"
              right={keys[0] ? <Badge tone="neutral">ключ: {keys[0].alias}</Badge> : null}
            />
            <div style={{ padding: 16 }} className="col gap-12">
              <Dropzone accept=".apk" onFiles={(fs) => signApk(fs)} style={signBusy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
                <div className="ico">
                  {signBusy ? <Loader2 size={20} className="pulse-soft" /> : <Upload size={20} />}
                </div>
                <div className="t">{signBusy ? 'Подписываем…' : 'Перетащите APK для подписи'}</div>
                <div className="s">или нажмите, чтобы выбрать файл</div>
              </Dropzone>
              {signResult && (
                <div className="flex gap-12" style={{ alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'rgba(52,211,153,.07)', border: '1px solid rgba(52,211,153,.2)' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 560 }}>{signResult.name}</div>
                    <div className="mono tiny" style={{ color: 'var(--text-3)' }}>{signResult.path} · {formatBytes(signResult.size)}</div>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Download size={13} />} onClick={() => {
                    const f = useStore.getState().files[signResult.path];
                    if (f) downloadBytes(f, signResult.name, 'application/vnd.android.package-archive');
                  }}>
                    Скачать
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* проверка */}
          <Card>
            <CardHead icon={<ShieldCheck size={16} />} tone="amber" title="Проверить подпись" sub="Разбор APK Signature Block и сертификата" />
            <div style={{ padding: 16 }} className="col gap-12">
              <Dropzone accept=".apk" onFiles={verifyApk}>
                <div className="ico">
                  {verifyBusy ? <Loader2 size={20} className="pulse-soft" /> : <Fingerprint size={20} />}
                </div>
                <div className="t">Перетащите APK для проверки</div>
                <div className="s">Покажем схему подписи, алгоритм и отпечаток сертификата</div>
              </Dropzone>
              {verify && (
                <div className="col gap-8">
                  <div className="flex between" style={{ fontSize: 12.5 }}>
                    <span className="muted">Файл</span>
                    <span className="mono">{verify.name}</span>
                  </div>
                  <div className="flex between" style={{ fontSize: 12.5 }}>
                    <span className="muted">APK Signature v2</span>
                    {verify.info.signedV2 ? <Badge tone="ok" icon={<CheckCircle2 size={11} />}>есть</Badge> : <Badge tone="err">нет</Badge>}
                  </div>
                  <div className="flex between" style={{ fontSize: 12.5 }}>
                    <span className="muted">APK Signature v3</span>
                    {verify.info.signedV3 ? <Badge tone="ok">есть</Badge> : <Badge tone="neutral">нет</Badge>}
                  </div>
                  <div className="flex between" style={{ fontSize: 12.5 }}>
                    <span className="muted">Алгоритм</span>
                    <span className="mono tiny">{verify.info.algorithms[0] ?? '—'}</span>
                  </div>
                  {verify.info.certificateSubject && (
                    <div className="flex between" style={{ fontSize: 12.5 }}>
                      <span className="muted">Владелец</span>
                      <span className="mono tiny">{verify.info.certificateSubject}</span>
                    </div>
                  )}
                  {verify.info.validTo && (
                    <div className="flex between" style={{ fontSize: 12.5 }}>
                      <span className="muted">Действителен до</span>
                      <span className="mono tiny">{verify.info.validTo}</span>
                    </div>
                  )}
                  {verify.info.certificateFingerprint && (
                    <div style={{ marginTop: 4 }}>
                      <div className="muted tiny" style={{ marginBottom: 4 }}>Отпечаток SHA-256</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                        {verify.info.certificateFingerprint}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="col gap-16">
          <Card pad>
            <div className="section-title">Как это работает</div>
            <div className="col gap-12" style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              <div className="flex gap-10">
                <span className="mono" style={{ color: 'var(--accent)' }}>01</span>
                <span>Генерируется пара RSA-2048 и самоподписанный сертификат X.509 — всё локально, в браузере.</span>
              </div>
              <div className="flex gap-10">
                <span className="mono" style={{ color: 'var(--accent)' }}>02</span>
                <span>APK подписывается по схеме v2 (RSA PKCS#1 v1.5 + SHA-256) — работает на Android 7.0+.</span>
              </div>
              <div className="flex gap-10">
                <span className="mono" style={{ color: 'var(--accent)' }}>03</span>
                <span>Ключи хранятся в IndexedDB. Экспортируйте их — без ключа обновить приложение будет нельзя.</span>
              </div>
            </div>
          </Card>

          <Card pad>
            <div className="flex gap-10" style={{ alignItems: 'flex-start' }}>
              <AlertTriangle size={15} style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Храните ключ в надёжном месте. Приложение, подписанное другим ключом, нельзя обновить поверх установленного.
              </div>
            </div>
          </Card>

          {keys[0] && (
            <Card pad>
              <div className="section-title">Отпечаток активного ключа</div>
              <div className="mono" style={{ fontSize: 10, lineHeight: 1.7, color: 'var(--text-2)', wordBreak: 'break-all' }}>
                {keys[0].fingerprint || '—'}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Copy size={13} />}
                className="mt-12"
                onClick={() => {
                  navigator.clipboard?.writeText(keys[0].fingerprint);
                  toast('ok', 'Скопировано');
                }}
              >
                Скопировать
              </Button>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

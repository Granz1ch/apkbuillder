/**
 * Работа с ключами: получение/создание ключа подписи.
 */
import { createSelfSignedCertificate, exportKey, importStoredKey, type StoredKey } from './cert';
import { fromBase64 } from './bytes';
import { useStore } from '../store';

export interface ActiveKey {
  privateKey: CryptoKey;
  certificate: Uint8Array;
  publicKeyDer: Uint8Array;
  stored: StoredKey;
}

/**
 * Возвращает ключ для подписи: выбранный или первый доступный.
 * Если ключей нет — создаёт новый.
 */
export async function getOrCreateKey(alias?: string): Promise<ActiveKey> {
  const { keys, addKey, log } = useStore.getState();
  const stored = (alias && keys.find((k) => k.alias === alias)) || keys[0];

  if (!stored) {
    const kp = await createSelfSignedCertificate({
      commonName: 'APK Builder',
      organization: 'APK Builder',
      country: 'RU',
    });
    const created = await exportKey(kp, 'apkbuilder-key');
    addKey(created);
    log('ok', 'Создан новый ключ подписи: apkbuilder-key', 'E-2001');
    return { privateKey: kp.privateKey, certificate: kp.certificate, publicKeyDer: kp.publicKeyDer, stored: created };
  }

  const { privateKey, certificate } = await importStoredKey(stored);
  return { privateKey, certificate, publicKeyDer: fromBase64(stored.publicKey), stored };
}

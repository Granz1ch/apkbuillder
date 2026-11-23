/**
 * Self-signed X.509 certificate and RSA key generation (WebCrypto).
 * Required for APK signing with the v2 scheme.
 */
import { concat, enc, fromBase64, toBase64 } from './bytes';

/* ----------------------------- DER ----------------------------- */

function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag: number, ...content: Uint8Array[]): Uint8Array {
  const body = concat(content);
  const head = new Uint8Array([tag, ...derLen(body.length)]);
  return concat([head, body]);
}

const der = {
  seq: (...c: Uint8Array[]) => tlv(0x30, ...c),
  set: (...c: Uint8Array[]) => tlv(0x31, ...c),
  int: (v: number | bigint) => {
    let hex = typeof v === 'bigint' ? v.toString(16) : (v >>> 0).toString(16);
    if (hex.length % 2) hex = '0' + hex;
    let bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    if (bytes[0] & 0x80) bytes = concat([new Uint8Array([0]), bytes]);
    return tlv(0x02, bytes);
  },
  uint: (v: number) => {
    let hex = (v >>> 0).toString(16);
    if (hex.length % 2) hex = '0' + hex;
    let bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    if (bytes[0] & 0x80) bytes = concat([new Uint8Array([0]), bytes]);
    return tlv(0x02, bytes);
  },
  oid: (hex: string) => tlv(0x06, new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)))),
  utf8: (s: string) => tlv(0x0c, enc.encode(s)),
  utc: (s: string) => tlv(0x17, enc.encode(s)),
  bitstring: (b: Uint8Array) => tlv(0x03, new Uint8Array([0]), b),
  null: () => new Uint8Array([0x05, 0x00]),
  ctx: (n: number, ...c: Uint8Array[]) => tlv(0xa0 | n, ...c),
};

const OID_SHA256_RSA = '2a864886f70d01010b';
const OID_RSA = '2a864886f70d010101';
const OID_CN = '550403';
const OID_O = '55040a';
const OID_C = '550406';

export interface KeyPairInfo {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  certificate: Uint8Array;
  publicKeyDer: Uint8Array;
  privateKeyPkcs8: Uint8Array;
}

function utcTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/**
 * Builds a self-signed certificate.
 * SubjectPublicKeyInfo comes from WebCrypto (already DER).
 */
export async function createSelfSignedCertificate(opts: {
  commonName: string;
  organization?: string;
  country?: string;
  validityDays?: number;
}): Promise<KeyPairInfo> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const publicKeyDer = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  const privateKeyPkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));

  const now = new Date();
  const notBefore = new Date(now.getTime() - 24 * 3600 * 1000);
  const notAfter = new Date(now.getTime() + (opts.validityDays ?? 3650) * 24 * 3600 * 1000);

  const algId = der.seq(der.oid(OID_SHA256_RSA), der.null());
  const rsaAlg = der.seq(der.oid(OID_RSA), der.null());

  const name = (cn: string) =>
    der.seq(
      der.set(der.seq(der.oid(OID_C), der.utf8(opts.country ?? 'RU'))),
      der.set(der.seq(der.oid(OID_O), der.utf8(opts.organization ?? 'APK Builder'))),
      der.set(der.seq(der.oid(OID_CN), der.utf8(cn))),
    );

  const spki = publicKeyDer;

  const tbs = der.seq(
    der.ctx(0, der.int(2)),
    der.int(Date.now() % 0x7fffffff),
    algId,
    name(opts.commonName),
    der.seq(der.utc(utcTime(notBefore)), der.utc(utcTime(notAfter))),
    name(opts.commonName),
    spki,
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, keyPair.privateKey, tbs as BufferSource),
  );

  const certificate = der.seq(tbs, algId, der.bitstring(signature));

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    certificate,
    publicKeyDer,
    privateKeyPkcs8,
  };
}

export interface StoredKey {
  alias: string;
  createdAt: number;
  certificate: string; // base64 DER
  publicKey: string; // base64 DER SPKI
  privateKey: string; // base64 PKCS#8
  fingerprint: string;
}

export async function exportKey(kp: KeyPairInfo, alias: string): Promise<StoredKey> {
  const digest = await crypto.subtle.digest('SHA-256', kp.certificate as BufferSource);
  const fp = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
  return {
    alias,
    createdAt: Date.now(),
    certificate: toBase64(kp.certificate),
    publicKey: toBase64(kp.publicKeyDer),
    privateKey: toBase64(kp.privateKeyPkcs8),
    fingerprint: fp,
  };
}

export async function importPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

export async function importStoredKey(k: StoredKey): Promise<{ privateKey: CryptoKey; certificate: Uint8Array }> {
  return {
    privateKey: await importPrivateKey(fromBase64(k.privateKey)),
    certificate: fromBase64(k.certificate),
  };
}

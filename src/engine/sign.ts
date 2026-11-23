/**
 * APK Signature Scheme v2 — signing and verification.
 * Implemented by hand, without apksigner.
 */
import { ByteWriter, concat } from './bytes';

const APK_SIG_MAGIC = encAscii('APK Sig Block 42');
const V2_SIGNATURE_ID = 0x7109871a;
const ALG_RSA_PKCS1_SHA256 = 0x0103;
const CHUNK_SIZE = 1024 * 1024;

function encAscii(s: string): Uint8Array {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0)));
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function u64(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(Math.round(n)), true);
  return b;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
}

/** Digest per the v2 spec: 1 MB chunks with a length prefix. */
export async function chunkedDigest(data: Uint8Array): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.subarray(i, Math.min(i + CHUNK_SIZE, data.length)));
  }
  const chunkDigests: Uint8Array[] = [];
  for (const c of chunks) {
    chunkDigests.push(await sha256(concat([u32(c.length), c])));
  }
  return sha256(concat([u32(chunks.length), ...chunkDigests]));
}

interface ZipInfo {
  cdOffset: number;
  cdSize: number;
  eocdOffset: number;
  eocd: Uint8Array;
}

export function findEocd(zip: Uint8Array): ZipInfo {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      return {
        cdOffset: dv.getUint32(i + 16, true),
        cdSize: dv.getUint32(i + 12, true),
        eocdOffset: i,
        eocd: zip.slice(i, i + 22),
      };
    }
  }
  throw new Error('ZIP: EOCD not found');
}

/**
 * Signs a finished ZIP with the v2 scheme.
 * Returns a new byte array with the signing block inserted before the central directory.
 */
export async function signApkV2(
  zip: Uint8Array,
  privateKey: CryptoKey,
  certificate: Uint8Array,
  publicKeyDer: Uint8Array,
): Promise<{ bytes: Uint8Array; digest: Uint8Array }> {
  const info = findEocd(zip);
  const signingBlockStart = info.cdOffset;

  // 1) content digest
  const entriesSection = zip.subarray(0, signingBlockStart);
  const cdSection = zip.subarray(info.cdOffset, info.cdOffset + info.cdSize);
  // EOCD: replace the CD offset field with the signing block offset
  const eocd = new Uint8Array(info.eocd);
  new DataView(eocd.buffer).setUint32(16, signingBlockStart, true);

  const digest = await chunkedDigest(concat([entriesSection, cdSection, eocd]));

  // 2) signed data — apksig format (encodeAsSequenceOfLengthPrefixedElements):
  //    [len] digests-blob    { [rec_len=8+n][algo u32][digest_len u32][digest] }
  //    [len] certs-blob      { [len][cert DER] }
  //    [len] attributes-blob { ... } — empty for v2
  //    [len] empty element   { }
  const digestRec = concat([u32(8 + digest.length), u32(ALG_RSA_PKCS1_SHA256), u32(digest.length), digest]);
  const certsBlob = concat([u32(certificate.length), certificate]);
  const signedData = concat([
    u32(digestRec.length),
    digestRec,
    u32(certsBlob.length),
    certsBlob,
    u32(0),
    u32(0),
  ]);

  // 3) signature
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, privateKey, signedData as BufferSource));
  // signatures: [len] blob { [rec_len=8+n][algo u32][sig_len u32][sig] }
  const sigRec = concat([u32(8 + sig.length), u32(ALG_RSA_PKCS1_SHA256), u32(sig.length), sig]);

  const signer = concat([
    u32(signedData.length),
    signedData,
    u32(sigRec.length),
    sigRec,
    u32(publicKeyDer.length),
    publicKeyDer,
  ]);
  const signers = concat([u32(signer.length), signer]);

  // 4) signing block
  const value = concat([u32(signers.length), signers]);
  const pair = concat([u32(V2_SIGNATURE_ID), value]);
  const pairWithLen = concat([u64(pair.length), pair]);
  const sizeOfBlock = pairWithLen.length + 24;
  const block = concat([u64(sizeOfBlock), pairWithLen, u64(sizeOfBlock), APK_SIG_MAGIC]);

  // 5) insert the block and patch the CD offset in EOCD
  const out = new Uint8Array(zip.length + block.length);
  out.set(zip.subarray(0, signingBlockStart), 0);
  out.set(block, signingBlockStart);
  out.set(zip.subarray(signingBlockStart), signingBlockStart + block.length);
  const newEocdOffset = info.eocdOffset + block.length;
  new DataView(out.buffer).setUint32(newEocdOffset + 16, signingBlockStart + block.length, true);

  return { bytes: out, digest };
}

/* ----------------------------- verification ----------------------------- */

export interface SignatureInfo {
  signedV2: boolean;
  signedV3: boolean;
  algorithms: string[];
  certificateFingerprint?: string;
  certificateSubject?: string;
  certificateIssuer?: string;
  validTo?: string;
}

export async function inspectSignature(apk: Uint8Array): Promise<SignatureInfo> {
  const info: SignatureInfo = { signedV2: false, signedV3: false, algorithms: [] };
  try {
    const z = findEocd(apk);
    if (z.cdOffset < 32) return info;
    const dv = new DataView(apk.buffer, apk.byteOffset, apk.byteLength);
    const magic = apk.subarray(z.cdOffset - 16, z.cdOffset);
    if (decAscii(magic) !== 'APK Sig Block 42') return info;
    const sizeOfBlock = Number(dv.getBigUint64(z.cdOffset - 24, true));
    const blockStart = z.cdOffset - sizeOfBlock - 8;
    let p = blockStart + 8;
    const end = z.cdOffset - 24;
    const ids: number[] = [];
    let certs: Uint8Array[] = [];

    while (p < end) {
      const len = Number(dv.getBigUint64(p, true));
      const id = dv.getUint32(p + 8, true);
      ids.push(id);
      if (id === V2_SIGNATURE_ID) {
        const v = apk.subarray(p + 12, p + 8 + len);
        // v = u32(signersLen) + signers; signers = u32(signerLen) + signer
        const signersOff = 4;
        const sdLen = dv.getUint32(p + 12 + signersOff + 4, true);
        const sdStart = p + 12 + signersOff + 8;
        let r = sdStart;
        const digestsLen = dv.getUint32(r, true);
        r += 4 + digestsLen;
        const certsLen = dv.getUint32(r, true);
        r += 4;
        const certsEnd = r + certsLen;
        while (r < certsEnd) {
          const cl = dv.getUint32(r, true);
          r += 4;
          certs.push(apk.subarray(r, r + cl));
          r += cl;
        }
        void sdLen;
      }
      p += 8 + len;
    }

    info.signedV2 = ids.includes(V2_SIGNATURE_ID);
    info.signedV3 = ids.includes(0xf05368c0);
    info.algorithms = ids.map((i) => (i === V2_SIGNATURE_ID ? 'APK Signature Scheme v2' : i === 0xf05368c0 ? 'APK Signature Scheme v3' : `0x${i.toString(16)}`));
    if (certs[0]) {
      const d = await crypto.subtle.digest('SHA-256', certs[0] as BufferSource);
      info.certificateFingerprint = [...new Uint8Array(d)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(':')
        .toUpperCase();
      info.certificateSubject = readCertField(certs[0], 'subject');
      info.certificateIssuer = readCertField(certs[0], 'issuer');
      info.validTo = readCertValidity(certs[0]);
    }
  } catch {
    /* ignore */
  }
  return info;
}

function decAscii(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Finds the CN value (or the whole subject/issuer string) in a certificate DER. */
function readCertField(der: Uint8Array, which: 'subject' | 'issuer'): string | undefined {
  // TBSCertificate: SEQ [0]version, serial, sigAlg, issuer, validity, subject, spki
  // Look for Name structures: SEQ { SET { SEQ { OID, value } } }
  // Simpler: find all occurrences of OID 2.5.4.3 (CN) and return the first (issuer) / last (subject)
  const oids: number[] = [];
  for (let i = 0; i < der.length - 5; i++) {
    if (der[i] === 0x06 && der[i + 1] === 0x03 && der[i + 2] === 0x55 && der[i + 3] === 0x04 && der[i + 4] === 0x03) {
      oids.push(i);
    }
  }
  const idx = which === 'subject' ? oids[oids.length - 1] : oids[0];
  if (idx === undefined) return undefined;
  let p = idx + 5;
  const tag = der[p++];
  const len = der[p++];
  if (tag !== 0x0c && tag !== 0x13 && tag !== 0x16) return undefined;
  return new TextDecoder().decode(der.subarray(p, p + len));
}

function readCertValidity(der: Uint8Array): string | undefined {
  // UTCTime: 17 0D "YYMMDDHHMMSSZ". TBS contains two of them: notBefore and notAfter.
  // We take the last one — the certificate expiry (notAfter).
  let out: string | undefined;
  for (let i = 0; i < der.length - 15; i++) {
    if (der[i] === 0x17 && der[i + 1] === 0x0d) {
      const s = new TextDecoder().decode(der.subarray(i + 2, i + 15));
      const y = parseInt(s.slice(0, 2), 10);
      const year = y < 50 ? 2000 + y : 1900 + y;
      out = `${s.slice(4, 6)}.${s.slice(2, 4)}.${year}`;
    }
  }
  return out;
}

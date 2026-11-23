#!/usr/bin/env python3
"""Full APK Signature Scheme v2 verification (like apksig does):
block structure, content digest, RSA signature and certificate."""
import sys, hashlib, io, struct, zlib
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature

path = sys.argv[1]
raw = open(path, 'rb').read()


def u32(b, o):
    return struct.unpack_from('<I', b, o)[0]


def u64(b, o):
    return struct.unpack_from('<Q', b, o)[0]


# --- EOCD ---
eocd_off = None
for i in range(len(raw) - 22, max(0, len(raw) - 70000), -1):
    if raw[i:i + 4] == b'PK\x05\x06':
        eocd_off = i
        break
assert eocd_off is not None, 'EOCD not found'
cd_off = u32(raw, eocd_off + 16)
cd_size = u32(raw, eocd_off + 12)

# --- APK Signing Block ---
magic = raw[cd_off - 16:cd_off]
assert magic == b'APK Sig Block 42', f'bad magic {magic!r}'
size_of_block = u64(raw, cd_off - 24)
sb = cd_off - size_of_block - 8
assert u64(raw, sb) == size_of_block, 'size_of_block mismatch'
assert raw[sb:sb + 8] == raw[cd_off - 24:cd_off - 16], 'footer != header'

pairs = {}
p = sb + 8
while p < cd_off - 24:
    plen = u64(raw, p)
    bid = u32(raw, p + 8)
    pairs[bid] = raw[p + 12:p + 8 + plen]
    p += 8 + plen

V2 = 0x7109871A
assert V2 in pairs, 'v2 block missing'
block = pairs[V2]
size_seq = u32(block, 0)
assert size_seq + 4 == len(block), 'size_sequence mismatch'

p = 4
size_signer = u32(block, p); p += 4
len_sd = u32(block, p); p += 4
signed_data = block[p:p + len_sd]; p += len_sd
len_sigs = u32(block, p); p += 4
sig_blob = block[p:p + len_sigs]; p += len_sigs
len_pk = u32(block, p); p += 4
pk_der = block[p:p + len_pk]; p += len_pk
assert p == len(block), 'trailing bytes'

# --- signed data ---
q = 0
len_dig = u32(signed_data, q); q += 4
dig_blob = signed_data[q:q + len_dig]; q += len_dig
len_cert = u32(signed_data, q); q += 4
cert_blob = signed_data[q:q + len_cert]; q += len_cert
len_attr = u32(signed_data, q); q += 4
attr_blob = signed_data[q:q + len_attr]; q += len_attr

# digests blob: [rec_len][algo][dlen][digest]
r = 0
rec_len = u32(dig_blob, r); r += 4
alg = u32(dig_blob, r); r += 4
dlen = u32(dig_blob, r); r += 4
stored_digest = dig_blob[r:r + dlen]; r += dlen
assert r == len(dig_blob), 'digest blob trailing'
print(f'digest algo: 0x{alg:04x}  len={dlen}  rec_len={rec_len} (expect {8 + dlen})')
assert rec_len == 8 + dlen

# certs blob
c = 0
certs = []
while c < len(cert_blob):
    cl = u32(cert_blob, c); c += 4
    certs.append(cert_blob[c:c + cl]); c += cl
assert certs, 'no certs'
cert = x509.load_der_x509_certificate(certs[0])
print('subject:', cert.subject.rfc4514_string())
print('issuer :', cert.issuer.rfc4514_string())
print('valid  :', cert.not_valid_before_utc, '→', cert.not_valid_after_utc)
fp = cert.fingerprint(hashes.SHA256()).hex(':').upper()
print('sha256 :', fp)

# sig blob: [rec_len][algo][slen][sig]
s = 0
srec = u32(sig_blob, s); s += 4
salg = u32(sig_blob, s); s += 4
slen = u32(sig_blob, s); s += 4
signature = sig_blob[s:s + slen]; s += slen
assert s == len(sig_blob)
print(f'sig algo: 0x{salg:04x}  len={slen}  rec_len={srec} (expect {8 + slen})')
assert srec == 8 + slen and salg == 0x0103

# --- content digest ---
CHUNK = 1024 * 1024
entries = raw[:sb]
central = raw[cd_off:cd_off + cd_size]
eocd = bytearray(raw[eocd_off:eocd_off + 22])
struct.pack_into('<I', eocd, 16, sb)
content = bytes(entries) + bytes(central) + bytes(eocd)
chunk_digests = b''
count = 0
for i in range(0, len(content), CHUNK):
    ch = content[i:i + CHUNK]
    chunk_digests += hashlib.sha256(struct.pack('<I', len(ch)) + ch).digest()
    count += 1
computed = hashlib.sha256(struct.pack('<I', count) + chunk_digests).digest()
print(f'chunks : {count}')
print('stored :', stored_digest.hex())
print('comput :', computed.hex())
assert stored_digest == computed, 'CONTENT DIGEST MISMATCH'
print('content digest OK')

# --- RSA verify ---
pub = serialization.load_der_public_key(pk_der)
try:
    pub.verify(signature, signed_data, padding.PKCS1v15(), hashes.SHA256())
    print('RSA signature OK')
except InvalidSignature:
    print('RSA SIGNATURE INVALID')
    sys.exit(1)

assert pub.public_numbers() == cert.public_key().public_numbers(), 'SPKI != cert key'
print('public key matches certificate')
print('\n=== APK SIGNATURE V2 FULLY VALID ===')

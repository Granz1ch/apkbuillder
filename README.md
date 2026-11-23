<div align="center">

<img src="public/icon-192.png" width="88" alt="APK Builder" />

# APK Builder

### An Android app build studio — in the browser and on the desktop

Code → APK converter · Decompiler · XAPK → APK · APK builder · v2 signing

**No Android SDK. No Java. No Gradle. No internet.** The whole engine is written in TypeScript and runs locally.

[Download a release](https://github.com/Granz1ch/apkbuillder/releases/latest) · [Features](#-features) · [Quick start](#-quick-start) · [How the engine works](#-how-the-engine-works) · [Error catalog](#-error-catalog)

</div>

---

## ✨ Features

| Module | What it does |
| --- | --- |
| **01 · Converter** | Paste HTML / CSS / JS / Python — the code is validated, errors are underlined in the editor, and every one of them gets an **identifier, a cause and a way to fix it**. When there are no errors, an installable `.apk` is built into `convertors/`. |
| **02 · Build APK** | Two modes: **PWA** (a WebView wrapper around a site) and **project folder** (drop a folder, get an APK with all files inside). |
| **03 · Decompiler** | Any APK is broken down into: binary `AndroidManifest.xml` → readable XML, `classes.dex` → smali listing, all resources and assets. The result lands in `decompilation/<name>/`. |
| **04 · XAPK → APK** | Split archives `.xapk` / `.apks`: module analysis, merging of `classes2..N.dex`, `lib/*`, `assets/*` into one APK and signing with your key. The result lands in `xapkconvs/`. |
| **05 · Signing** | RSA-2048 key generation, self-signed X.509, APK signing with **APK Signature Scheme v2**, verification of third-party signatures and certificates. |
| **06 · Error reference** | 36 errors with codes `E-1001…E-6003`, searchable by code, title and description. |
| **07 · Settings** | Engine parameters, project export/import as ZIP, cleanup, keyboard shortcuts. |

Plus: live build log, operation history, toasts, a dark "build lab" theme, mobile-friendly layout, PWA manifest, `Alt+1…8` shortcuts.

---

## 📦 Download

Ready builds live in the [`downloads/`](downloads) folder and in [**GitHub Releases**](https://github.com/Granz1ch/apkbuillder/releases/latest).

| File | Platform | Size | Description |
| --- | --- | --- | --- |
| [`APK-Builder-1.1.0-windows-x64.zip`](downloads/APK-Builder-1.1.0-windows-x64.zip) | Windows x64 | ~55 MB | **Portable** build: unpack and run `APK-Builder-1.1.0.exe`. No installation needed — every dependency is inside. |
| [`APK-Builder-1.1.0.apk`](downloads/APK-Builder-1.1.0.apk) | Android 7.0+ (API 24+) | ~1 MB | The same studio as an APK: works offline, signed with the v2 scheme. |
| [`SHA256SUMS.txt`](downloads/SHA256SUMS.txt) | — | — | Checksums for integrity verification. |

> **About the installer.** Electron/NSIS binaries could not be downloaded in the build environment, so the Windows version is shipped as **one self-contained .exe** (Bun runtime + embedded web build). That is exactly "all dependencies included": no installer, no Node.js and no internet required.

> **About GitHub Releases.** `uploads.github.com` is blocked from this environment, so binary assets cannot be attached to a release — the files live right in the repository under `downloads/` and are served via the **Raw / Download** button.

---

## 🚀 Quick start

### From source

```bash
git clone https://github.com/Granz1ch/apkbuillder.git
cd apkbuillder
npm install
npm run dev          # http://localhost:5173
```

### Building

```bash
npm run build        # web build into dist/
npm run apk:self     # studio APK → release/ and public/apk-builder.apk
npm run release      # everything at once: web + apk + windows exe
```

### Verifying the engine

```bash
npm run engine:test          # builds test.apk and checks the signature
python3 tools/verify-signature.py release/APK-Builder-1.1.0.apk
```

The `verify-signature.py` script does the same job as `apksigner verify`: it parses the APK Signing Block, recomputes the content digest over 1 MB chunks, verifies the RSA signature and matches the public key against the certificate.

---

## 🧠 How the engine works

Everything the Android SDK normally does is written by hand here:

```
src/engine/
├── bytes.ts        LE read/write, uleb128, CRC32, adler32, base64
├── zip.ts          ZIP writer (store/deflate, alignment) and reader
├── axml.ts         binary AndroidManifest.xml (string pool + chunks)
├── arsc.ts         resources.arsc resource table
├── dex.ts          DEX generator: classes, methods, fields, code_item, map_list
├── runtime.ts      WebView Activity wrapper (DEX) for the apps we build
├── apk.ts          orchestrator: manifest + resources + DEX + ZIP + signature
├── sign.ts         APK Signature Scheme v2 + signature inspection
├── cert.ts         RSA-2048 + self-signed X.509 (WebCrypto)
├── keyring.ts      key storage
├── icon.ts         PNG icons
├── validate.ts     Lezer parsers for HTML/CSS/JS/Python → issue list
├── xapk.ts         split archive analysis and merging
├── errors.ts       error catalog E-1001…E-6003
└── decompile/      AXML→XML, DEX→smali, decompilation orchestrator
```

**What is generated when an APK is built:**

1. `AndroidManifest.xml` — binary AXML: string pool, resource map, `uses-sdk`, `uses-permission`, `application`, `activity` chunks + intent-filter.
2. `resources.arsc` — a table with `string/app_name` and `drawable/ic_launcher`; id = `0x7f << 24 | typeId << 16 | entryIdx`.
3. `classes.dex` — Dalvik bytecode for `com.apkbuilder.runtime.WebAppActivity`: `onCreate` → `WebView` → `setJavaScriptEnabled` / `setDomStorageEnabled` → `loadUrl` → `setContentView`.
4. ZIP with alignment (`align: 4` for manifest/arsc/dex) — just like `zipalign` does.
5. **APK Signing Block v2** before the central directory: digests → certificates → attributes → signatures → public key; the EOCD receives the signing block offset.

**v2 signature format** (verified against `apksig`):

```
signer = [len] signed_data [len] signatures [len] public_key
signed_data = [len] digests{[len] [algo u32][digest_len u32][digest]}
              [len] certs{[len] DER}
              [len] attributes  [len] ∅
digest = SHA-256( [count u32] ‖ Σ SHA-256([chunk_len u32] ‖ chunk) )
         over entries ‖ central directory ‖ EOCD(cd_offset = signing_block_start)
```

---

## 🧾 Error catalog

Every error in the app has a **code**, a **cause** and a **fix** — they are shown in the UI and in the build log.

| Code | Error | Cause |
| --- | --- | --- |
| `E-1001` | Unclosed HTML tag | An opening tag has no matching closing tag |
| `E-1003` | Mismatched tags | The closing tag does not match the last opened one |
| `E-1004` | JavaScript syntax error | The inline script will not run |
| `E-1011` | Mixed tabs and spaces | Different indentation styles in one file |
| `E-1013` | Empty project | There are no files to build |
| `E-2001` | No signing key selected | An unsigned APK cannot be installed |
| `E-2006` | Invalid icon | A PNG of at least 48×48 is required |
| `E-3001` | File is not an APK | No `AndroidManifest.xml` inside |
| `E-4001` | Not a XAPK/APKS | No base APK in the archive |
| `E-5001` | Key error | The key cannot be decrypted or is corrupted |
| `E-6003` | Unknown error | An unexpected engine failure |

The full list is available in the **Reference** tab of the app.

---

## ⌨️ Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Alt` + `1…8` | Switch between sections |
| `` ` `` | Show / hide the console |
| `Esc` | Return to the current section |

---

## 🗂 Project structure

```
├── src/
│   ├── engine/          the engine (pure TypeScript, no DOM dependencies)
│   ├── components/      UI: Chrome, Panels, CodeEditor, Dropzone, ui, Page
│   ├── pages/           8 screens
│   ├── styles/          global.css design system
│   ├── lib/             idb, utils, nav
│   ├── store.ts         Zustand store + autosave to IndexedDB
│   ├── App.tsx          application shell
│   └── main.tsx
├── desktop/server.ts    launcher for the Windows build
├── tools/               APK build, asset embedding, engine tests
├── public/              icons, manifest, apk-builder.apk
└── release/             ready artifacts
```

---

## ⚠️ Limitations

- **The Android build (studio APK)** works offline, but the system WebView cannot save files to Downloads — results stay inside the project. Use the desktop version to export the APKs you build.
- The apps you build are **WebView wrappers** around an HTML project or a website. Native Java/Kotlin code is not compiled.
- **Python files** are syntax-checked and packed into the APK as assets, but they do not run on the device: that requires a separate Python runtime (Chaquopy and the like), which the offline engine does not include.
- Decompilation recovers the manifest, smali and resources; Java sources are not restored (only a specialised decompiler can do that).
- Signing keys are stored in the browser's IndexedDB. **Export them** — without the key the app cannot be updated.
- The studio APK is signed with the **project's public key** (`tools/release-key.json`). It is only used to build the studio itself — do not use it for your own apps, they get a personal key.
- The Windows version is portable (a single .exe), there is no installer: see the note above.

---

## 🔒 Privacy

Source code, keys and APKs **never leave the device**. The app does not send a single network request — the whole engine runs in the browser.

---

## 📄 License

MIT — use, study and distribute freely.

<div align="center">
<sub>Made with ❤️ for Android development without the Android SDK</sub>
</div>

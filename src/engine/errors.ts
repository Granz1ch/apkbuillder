/**
 * Error catalog: every entry has an identifier, a cause and a way to fix it.
 * Ranges:
 *   E-1xxx — code validation (HTML/CSS/JS/Python)
 *   E-2xxx — APK build
 *   E-3xxx — decompilation
 *   E-4xxx — XAPK
 *   E-5xxx — keys and signing
 *   E-6xxx — engine / environment
 */
export interface ErrorDef {
  id: string;
  title: string;
  cause: string;
  fix: string;
  severity: 'error' | 'warning' | 'info';
  scope: 'validator' | 'build' | 'decompile' | 'xapk' | 'sign' | 'engine';
}

export const ERROR_CATALOG: ErrorDef[] = [
  /* ---------------- validation ---------------- */
  {
    id: 'E-1001',
    title: 'Unclosed HTML tag',
    cause: 'An opening tag has no matching closing tag. The browser will close it automatically, but the document structure may break.',
    fix: 'Add the closing tag </...> or make the element self-closing.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1002',
    title: 'Stray closing tag',
    cause: 'A closing tag does not match any open element.',
    fix: 'Remove the tag or check the nesting — it may be meant to close another element.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1003',
    title: 'Mismatched tags',
    cause: 'The closing tag does not match the last opened element.',
    fix: 'Check the order of closing tags: last opened must be closed first.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1004',
    title: 'JavaScript syntax error',
    cause: 'An inline script contains a syntax error and will not run.',
    fix: 'Fix the reported position: check brackets, commas, quotes and keywords.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1005',
    title: 'CSS syntax error',
    cause: 'The browser will skip the broken rule, so the style will not apply.',
    fix: 'Check braces, colons and semicolons in the rule.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1006',
    title: 'Unclosed brace',
    cause: 'The number of { and } characters in the CSS does not match.',
    fix: 'Add the missing closing brace.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1007',
    title: 'Missing <!DOCTYPE html>',
    cause: 'Without a doctype the browser falls back to quirks mode, which breaks modern styles.',
    fix: 'Add <!DOCTYPE html> as the first line.',
    severity: 'warning',
    scope: 'validator',
  },
  {
    id: 'E-1008',
    title: 'Duplicate id',
    cause: 'The id attribute must be unique within a document.',
    fix: 'Rename the duplicate or use a class instead.',
    severity: 'warning',
    scope: 'validator',
  },
  {
    id: 'E-1009',
    title: 'Image without alt',
    cause: 'Without alternative text the image is inaccessible to screen readers and SEO.',
    fix: 'Add an alt attribute describing the image.',
    severity: 'info',
    scope: 'validator',
  },
  {
    id: 'E-1010',
    title: 'Python syntax error',
    cause: 'The interpreter will not be able to run the file.',
    fix: 'Fix the reported line: check indentation, colons and brackets.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1011',
    title: 'Mixed tabs and spaces',
    cause: 'Python forbids mixing tabs and spaces in indentation.',
    fix: 'Use spaces only (PEP 8 recommends 4 spaces per level).',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1012',
    title: 'Invalid package name',
    cause: 'An Android package name may contain only latin letters, digits, dots and underscores, must have at least two segments and must not start with a digit.',
    fix: 'For example: com.example.myapp',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-1013',
    title: 'Empty or too short source',
    cause: 'The project has no source files at all — there is nothing to build.',
    fix: 'Add an HTML file or pick another source.',
    severity: 'error',
    scope: 'validator',
  },
  {
    id: 'E-1014',
    title: 'Invalid URL',
    cause: 'The address must start with http:// or https://.',
    fix: 'Enter the full address, for example https://example.com',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-1015',
    title: 'index.html not found',
    cause: 'The project folder has no index.html entry point.',
    fix: 'Create index.html in the root of the project folder.',
    severity: 'error',
    scope: 'build',
  },

  /* ---------------- build ---------------- */
  {
    id: 'E-2001',
    title: 'No signing key selected',
    cause: 'An unsigned APK cannot be installed on a device.',
    fix: 'Create a key in the "Signing" section or pick an existing one.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2002',
    title: 'DEX generation failed',
    cause: 'The Activity bytecode could not be compiled.',
    fix: 'Check the class name and build again.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2003',
    title: 'Manifest build failed',
    cause: 'The binary AndroidManifest.xml could not be serialized.',
    fix: 'Check the package name, version and permissions.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2004',
    title: 'Project is too large',
    cause: 'The assets exceed the reasonable limit (512 MB).',
    fix: 'Remove unnecessary files or compress the media.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2005',
    title: 'Invalid app name',
    cause: 'The app name is empty.',
    fix: 'Enter the display name of the application.',
    severity: 'error',
    scope: 'build',
  },
  {
    id: 'E-2006',
    title: 'Invalid icon',
    cause: 'The icon must be a PNG of at least 48×48 px.',
    fix: 'Upload a 192×192 or 512×512 PNG.',
    severity: 'error',
    scope: 'build',
  },

  /* ---------------- decompilation ---------------- */
  {
    id: 'E-3001',
    title: 'File is not an APK',
    cause: 'No AndroidManifest.xml found inside the archive.',
    fix: 'Pick a valid .apk file.',
    severity: 'error',
    scope: 'decompile',
  },
  {
    id: 'E-3002',
    title: 'Corrupted archive',
    cause: 'The ZIP structure is broken or the archive is password protected.',
    fix: 'Try another file or re-pack the APK.',
    severity: 'error',
    scope: 'decompile',
  },
  {
    id: 'E-3003',
    title: 'No classes.dex',
    cause: 'The app has no executable code (resources only) or it is protected.',
    fix: 'Decompilation will be partial — manifest and resources only.',
    severity: 'warning',
    scope: 'decompile',
  },
  {
    id: 'E-3004',
    title: 'Manifest not decoded',
    cause: 'The binary XML has a non-standard structure.',
    fix: 'The original binary manifest will be saved instead.',
    severity: 'warning',
    scope: 'decompile',
  },

  /* ---------------- XAPK ---------------- */
  {
    id: 'E-4001',
    title: 'File is not a XAPK/APKS',
    cause: 'The archive has neither manifest.json nor base.apk.',
    fix: 'Pick a valid .xapk or .apks file.',
    severity: 'error',
    scope: 'xapk',
  },
  {
    id: 'E-4002',
    title: 'base.apk is missing',
    cause: 'The base APK was not found in the archive.',
    fix: 'Check the integrity of the XAPK.',
    severity: 'error',
    scope: 'xapk',
  },
  {
    id: 'E-4003',
    title: 'Incompatible split APKs',
    cause: 'The split modules are signed with different keys and cannot be merged into one APK.',
    fix: 'Only the base APK was kept, without split modules.',
    severity: 'warning',
    scope: 'xapk',
  },
  {
    id: 'E-4004',
    title: 'Resource conflict on merge',
    cause: 'A split module contains a resources.arsc that cannot be merged safely.',
    fix: 'Only dex/lib/assets were merged; the base APK resources were kept.',
    severity: 'warning',
    scope: 'xapk',
  },

  /* ---------------- keys ---------------- */
  {
    id: 'E-5001',
    title: 'Invalid key',
    cause: 'The key file is corrupted or is not PKCS#8.',
    fix: 'Import a valid PKCS#8 (.pem) key or create a new one.',
    severity: 'error',
    scope: 'sign',
  },
  {
    id: 'E-5002',
    title: 'APK is already signed',
    cause: 'The file already contains a signature. Signing again replaces it.',
    fix: 'That is fine — the old signature will be removed.',
    severity: 'info',
    scope: 'sign',
  },
  {
    id: 'E-5003',
    title: 'Key not found',
    cause: 'The selected key was deleted.',
    fix: 'Pick another key or create a new one.',
    severity: 'error',
    scope: 'sign',
  },

  /* ---------------- engine ---------------- */
  {
    id: 'E-6001',
    title: 'WebCrypto is unavailable',
    cause: 'The browser does not support SubtleCrypto (HTTPS or localhost is required).',
    fix: 'Open the app over HTTPS or in a browser with WebCrypto support.',
    severity: 'error',
    scope: 'engine',
  },
  {
    id: 'E-6002',
    title: 'Out of memory',
    cause: 'The project is too large to process in the browser.',
    fix: 'Reduce the project size or close other tabs.',
    severity: 'error',
    scope: 'engine',
  },
  {
    id: 'E-6003',
    title: 'File read failed',
    cause: 'The file could not be read from disk.',
    fix: 'Check the permissions and try again.',
    severity: 'error',
    scope: 'engine',
  },
];

const MAP = new Map(ERROR_CATALOG.map((e) => [e.id, e]));

export function getErrorDef(id: string): ErrorDef {
  return MAP.get(id) ?? {
    id,
    title: 'Unknown error',
    cause: 'No description available.',
    fix: 'Check the documentation.',
    severity: 'error',
    scope: 'engine',
  };
}

export interface AppError extends Error {
  code?: string;
}

/** Throws an error carrying an identifier from the catalog. */
export function fail(id: string, detail?: string): never {
  const def = getErrorDef(id);
  const e = new Error(detail ? `${def.title}: ${detail}` : def.title) as AppError;
  e.code = id;
  throw e;
}

export function describeError(e: unknown): { id: string; title: string; detail: string } {
  if (e instanceof Error) {
    const id = (e as AppError).code ?? 'E-6003';
    const def = getErrorDef(id);
    return { id, title: def.title, detail: e.message };
  }
  return { id: 'E-6003', title: 'Unknown error', detail: String(e) };
}

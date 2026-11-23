import React from 'react';
import { renderToString } from 'react-dom/server';
import { Dashboard } from '../src/pages/Dashboard';
import { Converter } from '../src/pages/Converter';
import { Builder } from '../src/pages/Builder';
import { Decompiler } from '../src/pages/Decompiler';
import { XapkPage } from '../src/pages/Xapk';
import { Signing } from '../src/pages/Signing';
import { ErrorsPage } from '../src/pages/Errors';
import { SettingsPage } from '../src/pages/Settings';
import { Topbar, Sidebar } from '../src/components/Chrome';
import { Console, Toasts } from '../src/components/Panels';

const cases: [string, () => any][] = [
  ['Dashboard', () => <Dashboard />],
  ['Converter', () => <Converter />],
  ['Builder', () => <Builder />],
  ['Decompiler', () => <Decompiler />],
  ['Xapk', () => <XapkPage />],
  ['Signing', () => <Signing />],
  ['Errors', () => <ErrorsPage />],
  ['Settings', () => <SettingsPage />],
  ['Topbar', () => <Topbar />],
  ['Sidebar', () => <Sidebar />],
  ['Console', () => <Console />],
  ['Toasts', () => <Toasts />],
];

let failed = 0;
for (const [name, el] of cases) {
  try {
    const html = renderToString(el());
    console.log(`OK   ${name} (${html.length} chars)`);
  } catch (e: any) {
    failed++;
    console.log(`FAIL ${name}: ${e?.message}`);
    console.log(String(e?.stack).split('\n').slice(0, 6).join('\n'));
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');

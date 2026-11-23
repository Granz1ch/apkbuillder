import { mkdirSync, writeFileSync } from 'node:fs';
import { buildWebAppDex } from '../src/engine/runtime';
import { DexBuilder } from '../src/engine/dex';

mkdirSync('out', { recursive: true });
const dex = buildWebAppDex({ url: 'file:///android_asset/app/index.html' });
writeFileSync('out/test.dex', dex);
console.log('DEX size:', dex.length, 'bytes');
console.log('magic:', Buffer.from(dex.subarray(0, 8)).toString('latin1').replace(/\0/g, '\\0'));
console.log('header_size:', Buffer.from(dex).readUInt32LE(36));
console.log('file_size:', Buffer.from(dex).readUInt32LE(32));

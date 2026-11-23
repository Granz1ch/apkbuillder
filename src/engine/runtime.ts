/**
 * Activity wrapper template: a WebView that loads the app from assets.
 * The same class is used for every APK we build.
 */
import { DexBuilder, DexClass, ACC } from './dex';

export const RUNTIME_PACKAGE = 'com.apkbuilder.runtime';
export const RUNTIME_ACTIVITY = 'com.apkbuilder.runtime.WebAppActivity';

export interface RuntimeDexOptions {
  /** The URL the WebView will open */
  url: string;
}

export function buildWebAppDex(opts: RuntimeDexOptions): Uint8Array {
  const thisType = `L${RUNTIME_ACTIVITY.replace(/\./g, '/')};`;
  const ACT = 'Landroid/app/Activity;';
  const WEBVIEW = 'Landroid/webkit/WebView;';
  const SETTINGS = 'Landroid/webkit/WebSettings;';
  const BUNDLE = 'Landroid/os/Bundle;';

  const cls: DexClass = {
    type: thisType,
    access: ACC.PUBLIC,
    superclass: ACT,
    sourceFile: 'WebAppActivity.java',
    instanceFields: [{ name: 'webView', type: WEBVIEW, access: ACC.PRIVATE }],
    directMethods: [
      {
        name: '<init>',
        proto: { ret: 'V', params: [] },
        access: ACC.PUBLIC | ACC.CONSTRUCTOR,
        code: {
          registers: 1,
          ins: 1,
          insns: [
            { op: 0x70, args: [0], method: { cls: ACT, name: '<init>', proto: { ret: 'V', params: [] } } },
            { op: 0x0e },
          ],
        },
      },
    ],
    virtualMethods: [
      {
        name: 'onCreate',
        proto: { ret: 'V', params: [BUNDLE] },
        access: ACC.PUBLIC,
        code: {
          registers: 5,
          ins: 2,
          insns: [
            { op: 0x6f, args: [3, 4], method: { cls: ACT, name: 'onCreate', proto: { ret: 'V', params: [BUNDLE] } } },
            { op: 0x22, reg: 0, type: WEBVIEW },
            { op: 0x70, args: [0, 3], method: { cls: WEBVIEW, name: '<init>', proto: { ret: 'V', params: ['Landroid/content/Context;'] } } },
            { op: 0x5b, obj: 3, value: 0, field: { cls: thisType, name: 'webView', type: WEBVIEW } },
            { op: 0x6e, args: [0], method: { cls: WEBVIEW, name: 'getSettings', proto: { ret: SETTINGS, params: [] } } },
            { op: 0x0c, reg: 1 },
            { op: 0x12, reg: 2, lit: 1 },
            { op: 0x6e, args: [1, 2], method: { cls: SETTINGS, name: 'setJavaScriptEnabled', proto: { ret: 'V', params: ['Z'] } } },
            { op: 0x12, reg: 2, lit: 1 },
            { op: 0x6e, args: [1, 2], method: { cls: SETTINGS, name: 'setDomStorageEnabled', proto: { ret: 'V', params: ['Z'] } } },
            { op: 0x12, reg: 2, lit: 1 },
            { op: 0x6e, args: [1, 2], method: { cls: SETTINGS, name: 'setAllowFileAccess', proto: { ret: 'V', params: ['Z'] } } },
            { op: 0x12, reg: 2, lit: 1 },
            { op: 0x6e, args: [1, 2], method: { cls: SETTINGS, name: 'setLoadWithOverviewMode', proto: { ret: 'V', params: ['Z'] } } },
            { op: 0x12, reg: 2, lit: 1 },
            { op: 0x6e, args: [1, 2], method: { cls: SETTINGS, name: 'setUseWideViewPort', proto: { ret: 'V', params: ['Z'] } } },
            { op: 0x1a, reg: 2, str: opts.url },
            { op: 0x6e, args: [0, 2], method: { cls: WEBVIEW, name: 'loadUrl', proto: { ret: 'V', params: ['Ljava/lang/String;'] } } },
            { op: 0x6e, args: [3, 0], method: { cls: ACT, name: 'setContentView', proto: { ret: 'V', params: ['Landroid/view/View;'] } } },
            { op: 0x0e },
          ],
        },
      },
    ],
  };

  return new DexBuilder().addClass(cls).build();
}

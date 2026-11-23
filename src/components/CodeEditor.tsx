import { useEffect, useRef } from 'react';
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  hoverTooltip,
  Decoration,
  type DecorationSet,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { tags } from '@lezer/highlight';
import type { Issue } from '../engine/validate';

const setDeco = StateEffect.define<DecorationSet>();

const decoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) if (e.is(setDeco)) value = e.value;
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  '&': { color: '#dfe5f2', backgroundColor: 'transparent', height: '100%' },
  '.cm-content': { caretColor: '#5eead4', fontFamily: "'JetBrains Mono Variable', monospace" },
  '.cm-scroller': { fontFamily: "'JetBrains Mono Variable', monospace", lineHeight: '1.65' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#4b5366', border: 'none', borderRight: '1px solid rgba(255,255,255,.07)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 16px', minWidth: 44 },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(129,140,248,.055)' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(129,140,248,.16)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#5eead4', borderLeftWidth: '2px' },
});

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#c4b5fd' },
  { tag: [tags.controlKeyword, tags.moduleKeyword], color: '#f0abfc' },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: '#7dd3fc' },
  { tag: [tags.function(tags.propertyName), tags.labelName], color: '#5eead4' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#fbbf24' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#e9edf6' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#fcd34d' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: '#f472b6' },
  { tag: [tags.meta, tags.comment], color: '#5b6478', fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#93c5fd', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: '700', color: '#e9edf6' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#fca5a5' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#86efac' },
  { tag: tags.invalid, color: '#fb7185' },
]);

const langExt = (lang: string) => {
  switch (lang) {
    case 'html':
      return html();
    case 'css':
      return css();
    case 'python':
      return python();
    case 'json':
      return javascript({ jsx: false });
    default:
      return javascript({ jsx: true });
  }
};

function buildDecos(issues: Issue[], state: EditorState): DecorationSet {
  if (!issues.length) return Decoration.none;
  const doc = state.doc;
  const sorted = [...issues].sort((a, b) => a.line - b.line || a.col - b.col);
  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = -1;
  for (const issue of sorted) {
    const line = Math.min(Math.max(issue.line, 1), doc.lines);
    const lineInfo = doc.line(line);
    const from = Math.min(lineInfo.from + Math.max(0, issue.col - 1), lineInfo.to);
    const endLine = Math.min(Math.max(issue.endLine ?? line, 1), doc.lines);
    const endInfo = doc.line(endLine);
    const to = Math.min(Math.max(from + 1, endInfo.from + Math.max(0, (issue.endCol ?? issue.col) - 1)), endInfo.to);
    if (from < lastEnd) continue;
    lastEnd = to;
    const cls = issue.severity === 'error' ? 'cm-error-underline' : 'cm-warn-underline';
    builder.add(
      from,
      Math.max(to, from + 1),
      Decoration.mark({
        class: cls,
        issue: JSON.stringify(issue),
      }),
    );
  }
  return builder.finish();
}

export function CodeEditor({
  value,
  onChange,
  lang = 'html',
  issues = [],
  readOnly,
  onReady,
}: {
  value: string;
  onChange?: (v: string) => void;
  lang?: string;
  issues?: Issue[];
  readOnly?: boolean;
  onReady?: (view: EditorView) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        syntaxHighlighting(highlight),
        theme,
        langExt(lang),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        decoField,
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
        }),
        hoverTooltip((view, pos) => {
          const decos = view.state.field(decoField);
          const cursor = decos.iter(pos);
          while (cursor.value !== null) {
            const mFrom = cursor.from;
            const mTo = cursor.to;
            const spec = (cursor.value.spec as any).issue as string | undefined;
            if (mFrom <= pos && mTo >= pos) {
              const raw = spec;
              if (!raw) continue;
              const issue: Issue = JSON.parse(raw);
              return {
                pos: mFrom,
                end: mTo,
                above: true,
                create: () => {
                  const dom = document.createElement('div');
                  dom.className = 'err-tip';
                  dom.innerHTML = `
                    <div class="id">${issue.id} · ${issue.severity === 'error' ? 'ошибка' : issue.severity === 'warning' ? 'предупреждение' : 'подсказка'}</div>
                    <div class="msg"></div>
                    ${issue.hint ? '<div class="hint"></div>' : ''}
                  `;
                  dom.querySelector('.msg')!.textContent = issue.message;
                  if (issue.hint) dom.querySelector('.hint')!.textContent = issue.hint;
                  return { dom };
                },
              };
            }
            cursor.next();
          }
          return null;
        }),
        ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    onReady?.(v);
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // синхронизация текста
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // подсветка ошибок
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setDeco.of(buildDecos(issues, v.state)) });
  }, [issues, value]);

  return <div ref={host} className="editor-shell" style={{ height: '100%' }} />;
}

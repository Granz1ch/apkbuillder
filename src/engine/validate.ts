/**
 * Валидация исходного кода: HTML / CSS / JS / Python.
 * Возвращает список проблем с точными позициями (строка/колонка, 1-based).
 */
import { htmlLanguage } from '@codemirror/lang-html';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import { pythonLanguage } from '@codemirror/lang-python';
import { cssLanguage } from '@codemirror/lang-css';

export type Lang = 'html' | 'css' | 'js' | 'python' | 'json';

export interface Issue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  message: string;
  hint?: string;
  source: string; // файл
}

const parsers: Record<string, any> = {};

function getParser(lang: Lang) {
  if (!parsers[lang]) {
    switch (lang) {
      case 'html':
        parsers[lang] = htmlLanguage.parser;
        break;
      case 'js':
        parsers[lang] = javascriptLanguage.parser;
        break;
      case 'python':
        parsers[lang] = pythonLanguage.parser;
        break;
      case 'css':
        parsers[lang] = cssLanguage.parser;
        break;
      case 'json':
        parsers[lang] = javascriptLanguage.parser;
        break;
    }
  }
  return parsers[lang];
}

/** Таблица смещений строк для перевода pos → (line, col). */
export class LineMap {
  private starts: number[] = [0];
  constructor(public text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
    }
  }
  pos(line: number, col: number): number {
    const s = this.starts[Math.min(line - 1, this.starts.length - 1)] ?? 0;
    return s + (col - 1);
  }
  lineCol(pos: number): { line: number; col: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: pos - this.starts[lo] + 1 };
  }
  get lines() {
    return this.starts.length;
  }
}

/** Ищет синтаксические ошибки парсера Lezer. */
function parserIssues(text: string, lang: Lang, source: string): Issue[] {
  const out: Issue[] = [];
  let parser: any;
  try {
    parser = getParser(lang);
    if (!parser) return out;
    const tree = parser.parse(text);
    const lm = new LineMap(text);
    tree.iterate({
      enter(node: any) {
        if (!node.type.isError) return;
        const from = node.from;
        const to = node.to;
        const a = lm.lineCol(from);
        const b = lm.lineCol(Math.max(to, from + 1));
        out.push({
          id: lang === 'python' ? 'E-1010' : lang === 'css' ? 'E-1005' : 'E-1004',
          severity: 'error',
          line: a.line,
          col: a.col,
          endLine: b.line,
          endCol: b.col,
          message:
            lang === 'python'
              ? 'Синтаксическая ошибка Python'
              : lang === 'css'
                ? 'Синтаксическая ошибка CSS'
                : 'Синтаксическая ошибка JavaScript',
          hint: `Не удалось разобрать конструкцию в позиции ${a.line}:${a.col}`,
          source,
        });
      },
    });
  } catch {
    /* парсер не справился — не критично */
  }
  return out;
}

/* ----------------------------- HTML ----------------------------- */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', '!doctype',
]);

interface TagTok {
  name: string;
  closing: boolean;
  selfClose: boolean;
  pos: number;
  end: number;
  attrs: string;
}

function tokenizeHtml(text: string): TagTok[] {
  const tags: TagTok[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt);
      i = end < 0 ? n : end + 3;
      continue;
    }
    const m = /^<\s*(\/?)\s*([a-zA-Z][\w:.-]*)/.exec(text.slice(lt, lt + 120));
    if (!m) {
      i = lt + 1;
      continue;
    }
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    // найдём конец тега
    let j = lt + 1;
    let quote: string | null = null;
    while (j < n) {
      const ch = text[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
      j++;
    }
    const raw = text.slice(lt, j + 1);
    const selfClose = /\/\s*>$/.test(raw);
    tags.push({
      name,
      closing,
      selfClose,
      pos: lt,
      end: j + 1,
      attrs: raw.slice(1, -1),
    });
    i = j + 1;
  }
  return tags;
}

function htmlIssues(text: string, source: string): Issue[] {
  const out: Issue[] = [];
  const lm = new LineMap(text);
  const tags = tokenizeHtml(text);
  const stack: { name: string; pos: number }[] = [];
  const ids = new Map<string, number>();

  for (const t of tags) {
    if (t.name === '!doctype' || VOID.has(t.name)) {
      if (!t.closing && !t.selfClose && VOID.has(t.name)) {
        const idm = /\bid\s*=\s*["']([^"']+)["']/i.exec(t.attrs);
        if (idm) {
          const c = (ids.get(idm[1]) ?? 0) + 1;
          ids.set(idm[1], c);
          if (c === 2) {
            const p = lm.lineCol(t.pos);
            out.push({
              id: 'E-1008',
              severity: 'warning',
              line: p.line,
              col: p.col,
              endLine: p.line,
              endCol: p.col + 6,
              message: `Дублирующийся id="${idm[1]}"`,
              hint: 'Атрибут id должен быть уникальным',
              source,
            });
          }
        }
      }
      continue;
    }
    if (t.closing) {
      const last = stack[stack.length - 1];
      if (!last) {
        const p = lm.lineCol(t.pos);
        out.push({
          id: 'E-1002',
          severity: 'error',
          line: p.line,
          col: p.col,
          endLine: p.line,
          endCol: p.col + 8,
          message: `Лишний закрывающий тег </${t.name}>`,
          hint: 'Удалите тег или проверьте вложенность',
          source,
        });
        continue;
      }
      if (last.name === t.name) {
        stack.pop();
      } else {
        const idx = stack.map((s) => s.name).lastIndexOf(t.name);
        if (idx >= 0) {
          // есть незакрытые между
          for (let k = stack.length - 1; k > idx; k--) {
            const s = stack[k];
            const p = lm.lineCol(s.pos);
            out.push({
              id: 'E-1001',
              severity: 'error',
              line: p.line,
              col: p.col,
              endLine: p.line,
              endCol: p.col + s.name.length + 2,
              message: `Незакрытый тег <${s.name}>`,
              hint: `Добавьте </${s.name}> перед </${t.name}>`,
              source,
            });
            stack.pop();
          }
          stack.pop();
        } else {
          const p = lm.lineCol(t.pos);
          out.push({
            id: 'E-1003',
            severity: 'error',
            line: p.line,
            col: p.col,
            endLine: p.line,
            endCol: p.col + t.name.length + 3,
            message: `Ожидался </${last.name}>, получен </${t.name}>`,
            hint: 'Проверьте порядок закрывающих тегов',
            source,
          });
        }
      }
    } else if (!t.selfClose) {
      stack.push({ name: t.name, pos: t.pos });
      // img без alt
      if (t.name === 'img' && !/\balt\s*=/i.test(t.attrs)) {
        const p = lm.lineCol(t.pos);
        out.push({
          id: 'E-1009',
          severity: 'info',
          line: p.line,
          col: p.col,
          endLine: p.line,
          endCol: p.col + 5,
          message: 'Изображение без alt',
          hint: 'Добавьте alt="описание"',
          source,
        });
      }
    }
  }
  for (const s of stack) {
    const p = lm.lineCol(s.pos);
    out.push({
      id: 'E-1001',
      severity: 'error',
      line: p.line,
      col: p.col,
      endLine: p.line,
      endCol: p.col + s.name.length + 2,
      message: `Незакрытый тег <${s.name}>`,
      hint: `Добавьте </${s.name}>`,
      source,
    });
  }

  if (text.trim() && !/^\s*(<!doctype|<html)/i.test(text)) {
    out.push({
      id: 'E-1007',
      severity: 'warning',
      line: 1,
      col: 1,
      endLine: 1,
      endCol: 2,
      message: 'Отсутствует <!DOCTYPE html>',
      hint: 'Добавьте первой строкой: <!DOCTYPE html>',
      source,
    });
  }

  // встроенные <script> и <style>
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(text))) {
    const code = m[1];
    if (!code.trim()) continue;
    const before = text.slice(0, m.index + m[0].indexOf(code));
    const baseLine = before.split('\n').length;
    const baseCol = baseLine === 1 ? m[0].indexOf(code) + 1 : 0;
    for (const issue of parserIssues(code, 'js', source)) {
      out.push({
        ...issue,
        line: issue.line + baseLine - 1,
        col: baseLine === 1 ? issue.col + baseCol - 1 : issue.col,
        message: 'Синтаксическая ошибка JavaScript в <script>',
      });
    }
  }
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRe.exec(text))) {
    const code = m[1];
    if (!code.trim()) continue;
    const before = text.slice(0, m.index + m[0].indexOf(code));
    const baseLine = before.split('\n').length;
    const baseCol = baseLine === 1 ? m[0].indexOf(code) + 1 : 0;
    for (const issue of parserIssues(code, 'css', source)) {
      out.push({
        ...issue,
        line: issue.line + baseLine - 1,
        col: baseLine === 1 ? issue.col + baseCol - 1 : issue.col,
        message: 'Синтаксическая ошибка CSS в <style>',
      });
    }
  }

  return dedupe(out);
}

/* ----------------------------- CSS ----------------------------- */

function cssIssues(text: string, source: string): Issue[] {
  const out = parserIssues(text, 'css', source);
  const lm = new LineMap(text);
  let depth = 0;
  let lastOpen = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      if (depth === 0) lastOpen = i;
      depth++;
    } else if (c === '}') depth--;
  }
  if (depth !== 0) {
    const p = lm.lineCol(lastOpen);
    out.push({
      id: 'E-1006',
      severity: 'error',
      line: p.line,
      col: p.col,
      endLine: p.line,
      endCol: p.col + 1,
      message: 'Незакрытая фигурная скобка',
      hint: 'Добавьте недостающую }',
      source,
    });
  }
  return dedupe(out);
}

/* ----------------------------- Python ----------------------------- */

function pythonIssues(text: string, source: string): Issue[] {
  const out = parserIssues(text, 'python', source);
  const lm = new LineMap(text);
  let hasTab = false;
  let hasSpace = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (/\t/.test(l.match(/^\s*/)?.[0] ?? '')) hasTab = true;
    if (/ /.test(l.match(/^\s*/)?.[0] ?? '')) hasSpace = true;
    if (hasTab && hasSpace) {
      out.push({
        id: 'E-1011',
        severity: 'error',
        line: i + 1,
        col: 1,
        endLine: i + 1,
        endCol: 5,
        message: 'Смешанные табы и пробелы в отступах',
        hint: 'Используйте только пробелы',
        source,
      });
      break;
    }
  }
  return dedupe(out);
}

/* ----------------------------- JSON ----------------------------- */

function jsonIssues(text: string, source: string): Issue[] {
  try {
    JSON.parse(text);
    return [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Некорректный JSON';
    const m = /position (\d+)/.exec(msg);
    const pos = m ? parseInt(m[1], 10) : 0;
    const lm = new LineMap(text);
    const p = lm.lineCol(pos);
    return [
      {
        id: 'E-1005',
        severity: 'error',
        line: p.line,
        col: p.col,
        endLine: p.line,
        endCol: p.col + 1,
        message: 'Синтаксическая ошибка JSON',
        hint: msg,
        source,
      },
    ];
  }
}

function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.id}:${i.line}:${i.col}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function detectLang(filename: string): Lang {
  const f = filename.toLowerCase();
  if (f.endsWith('.html') || f.endsWith('.htm')) return 'html';
  if (f.endsWith('.css')) return 'css';
  if (f.endsWith('.py')) return 'python';
  if (f.endsWith('.json')) return 'json';
  if (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.jsx')) return 'js';
  return 'html';
}

/** Главная точка входа: валидирует файл и возвращает проблемы. */
export function validateCode(filename: string, text: string): Issue[] {
  if (!text.trim()) return [];
  const lang = detectLang(filename);
  switch (lang) {
    case 'html':
      return htmlIssues(text, filename);
    case 'css':
      return cssIssues(text, filename);
    case 'python':
      return pythonIssues(text, filename);
    case 'json':
      return jsonIssues(text, filename);
    default:
      return parserIssues(text, 'js', filename);
  }
}

export function summarize(issues: Issue[]) {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}

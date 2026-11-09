import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-docker';
import type { CodeExample } from '../../types';

const grammarKey: Record<CodeExample['language'], string | null> = {
  javascript: 'javascript',
  typescript: 'typescript',
  bash: 'bash',
  json: 'json',
  sql: 'sql',
  http: 'http',
  yaml: 'yaml',
  dockerfile: 'docker',
  text: null,
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Returns highlighted HTML (Prism escapes its input; plain text is escaped here). */
export function highlight(code: string, language: CodeExample['language']): string {
  const key = grammarKey[language];
  const grammar = key ? Prism.languages[key] : undefined;
  return grammar ? Prism.highlight(code, grammar, key!) : escapeHtml(code);
}

/** Highlights and splits into lines, keeping token spans balanced across line breaks. */
export function highlightLines(code: string, language: CodeExample['language']): string[] {
  const html = highlight(code, language);
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';
  const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      open.push(m[1]);
      current += m[1];
    } else if (m[2]) {
      open.pop();
      current += m[2];
    } else if (m[3]) {
      current += '</span>'.repeat(open.length);
      lines.push(current);
      current = open.join('');
    } else {
      current += m[4];
    }
  }
  lines.push(current);
  return lines;
}

export const languageLabel: Record<CodeExample['language'], string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  bash: 'Shell',
  json: 'JSON',
  sql: 'SQL',
  http: 'HTTP',
  yaml: 'YAML',
  dockerfile: 'Dockerfile',
  text: 'Text',
};

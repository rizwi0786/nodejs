import type { ChallengeTest } from '../../types';

/** Removes the common leading indentation and the first/last blank lines. */
function dedent(src: string): string {
  const lines = src.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

/**
 * Tag for JavaScript source: keeps backslashes literal (String.raw) and dedents.
 * Code inside must not contain backticks or `${`.
 */
export const js = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  dedent(String.raw({ raw: strings.raw }, ...values));

/** Prompt / explanation text written as separate lines. */
export const md = (...lines: string[]): string => lines.join('\n');

/** A test case: `expected` is the JSON.stringify of the awaited value. */
export const t = (call: string, expected: unknown): ChallengeTest => ({ call, expected: JSON.stringify(expected) });

// ─────────────────────────────────────────────────────────────
// Authoring helpers for lesson content. Pure data — no React.
// See CONTENT_GUIDE.md for the conventions every lesson follows.
// ─────────────────────────────────────────────────────────────
import type {
  CodeExample,
  ContentBlock,
  DiagramId,
  FlowStep,
  LessonSection,
  SectionKind,
} from '../../types';

export const text = (t: string): ContentBlock => ({ type: 'text', text: t });
export const bullets = (...items: string[]): ContentBlock => ({ type: 'bullets', items });
export const steps = (...items: string[]): ContentBlock => ({ type: 'steps', items });
export const tip = (t: string): ContentBlock => ({ type: 'callout', variant: 'tip', text: t });
export const warn = (t: string): ContentBlock => ({ type: 'callout', variant: 'warning', text: t });
export const note = (t: string): ContentBlock => ({ type: 'callout', variant: 'note', text: t });
export const interviewTip = (t: string): ContentBlock => ({ type: 'callout', variant: 'interview', text: t });

export const table = (title: string, columns: string[], rows: string[][]): ContentBlock => ({
  type: 'table',
  table: { title, columns, rows },
});

export const diagram = (diagramId: DiagramId, caption?: string): ContentBlock => ({ type: 'diagram', diagramId, caption });

/** Flowchart from labels; use "Label: detail" to add a detail line. */
export const flow = (
  stepsIn: (string | FlowStep)[],
  opts: { title?: string; direction?: 'horizontal' | 'vertical'; caption?: string } = {},
): ContentBlock => ({
  type: 'flow',
  ...opts,
  steps: stepsIn.map((s) => {
    if (typeof s !== 'string') return s;
    const i = s.indexOf(': ');
    return i > 0 ? { label: s.slice(0, i), detail: s.slice(i + 2) } : { label: s };
  }),
});

let auto = 0;
/** Code example block. `id` is auto-generated when omitted. */
export const code = (ex: Omit<CodeExample, 'id' | 'language'> & { id?: string; language?: CodeExample['language'] }): ContentBlock => ({
  type: 'code',
  example: { language: 'javascript', ...ex, id: ex.id ?? `ex-${++auto}` },
});

/**
 * Removes the common leading indentation so code can be written indented
 * inside template literals:  js`  ...  `
 */
export function dedent(s: string): string {
  const lines = s.replace(/^\n/, '').replace(/\n[ \t]*$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

/** Section of a lesson. */
export const section = (kind: SectionKind, title: string | undefined, ...blocks: ContentBlock[]): LessonSection => ({
  kind,
  title,
  blocks,
});

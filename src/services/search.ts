import { loadAllContent } from '../data/content';
import { allLessons, lessonById, modules, moduleById } from '../data/modules/curriculum';
import { loadBanks } from '../data/questions/banks';
import { paths } from '../routes/paths';
import type { ContentBlock } from '../types';

export type SearchKind = 'module' | 'lesson' | 'code' | 'question' | 'challenge' | 'project';

export interface SearchEntry {
  kind: SearchKind;
  title: string;
  subtitle: string;
  to: string;
  haystack: string; // lower-cased searchable text
  /** Higher-weight text (title + keywords). */
  titleHay: string;
}

const entry = (e: Omit<SearchEntry, 'haystack' | 'titleHay'> & { body?: string; keywords?: string }): SearchEntry => ({
  kind: e.kind,
  title: e.title,
  subtitle: e.subtitle,
  to: e.to,
  titleHay: `${e.title} ${e.keywords ?? ''}`.toLowerCase(),
  haystack: `${e.title} ${e.keywords ?? ''} ${e.subtitle} ${e.body ?? ''}`.toLowerCase(),
});

// Base index: available instantly (curriculum outline only).
let index: SearchEntry[] = [
  ...modules.map((m) => entry({ kind: 'module', title: `Module ${m.number}: ${m.title}`, subtitle: m.description, to: paths.module(m) })),
  ...allLessons.map((l) =>
    entry({ kind: 'lesson', title: l.title, subtitle: `Module ${moduleById.get(l.moduleId)!.number} · ${moduleById.get(l.moduleId)!.title}`, to: paths.lesson(l) }),
  ),
];

let full: Promise<void> | null = null;

const blockText = (b: ContentBlock): string => {
  switch (b.type) {
    case 'text':
      return b.text;
    case 'bullets':
    case 'steps':
      return b.items.join(' ');
    case 'callout':
      return b.text;
    case 'table':
      return `${b.table.title} ${b.table.rows.flat().join(' ')}`;
    case 'flow':
      return b.steps.map((s) => s.label).join(' ');
    default:
      return '';
  }
};

/**
 * Loads lesson bodies, code examples, interview questions, challenges and projects
 * into the index (lazy chunks). Resolves once; safe to call repeatedly.
 */
export function ensureFullIndex(): Promise<void> {
  if (!full) {
    full = Promise.all([loadAllContent(), loadBanks(), import('../data/projects')]).then(([all, banks, proj]) => {
      const next: SearchEntry[] = modules.map((m) =>
        entry({ kind: 'module', title: `Module ${m.number}: ${m.title}`, subtitle: m.description, to: paths.module(m) }),
      );
      for (const l of allLessons) {
        const c = all.lessons.get(l.id);
        const m = moduleById.get(l.moduleId)!;
        const sub = `Module ${m.number} · ${m.title}`;
        next.push(
          entry({
            kind: 'lesson',
            title: l.title,
            subtitle: c?.summary ?? sub,
            to: paths.lesson(l),
            keywords: c?.topics.join(' '),
            body: c ? c.sections.flatMap((s) => s.blocks.map(blockText)).join(' ') + ' ' + c.revisionNotes.join(' ') : '',
          }),
        );
        if (!c) continue;
        for (const s of c.sections)
          for (const b of s.blocks)
            if (b.type === 'code' && b.example.title)
              next.push(entry({ kind: 'code', title: b.example.title, subtitle: `Code · ${l.title}`, to: paths.lesson(l), body: b.example.code }));
      }
      for (const q of [...all.interviewQuestions, ...banks.output, ...banks.scenario]) {
        const lesson = q.relatedLessonIds?.map((id) => lessonById.get(id)).find(Boolean);
        const lessonQuestion = q.id.startsWith('m');
        next.push(
          entry({
            kind: 'question',
            title: q.question,
            subtitle: `${q.kind === 'concept' ? 'Interview' : q.kind === 'output' ? 'Output question' : 'Scenario'} · ${q.topic}`,
            // Lesson questions open their lesson; bank questions open the interview bank filtered to this question.
            to: lessonQuestion && lesson ? paths.lesson(lesson) : `${paths.interview}?q=${encodeURIComponent(q.question.slice(0, 60))}`,
            keywords: q.topic,
            body: q.shortAnswer,
          }),
        );
      }
      for (const ch of banks.challenges)
        next.push(entry({ kind: 'challenge', title: ch.title, subtitle: `Coding challenge · ${ch.topic}`, to: paths.challenge(ch.id), keywords: ch.topic, body: ch.prompt }));
      for (const p of proj.projects)
        next.push(
          entry({ kind: 'project', title: p.title, subtitle: `Project ${p.number} · ${p.level}`, to: paths.project(p.id), keywords: p.skills.join(' '), body: p.summary }),
        );
      index = next;
    });
  }
  return full;
}

const kindBoost: Record<SearchKind, number> = { module: 2, lesson: 3, project: 1, challenge: 1, code: 0, question: 0 };

/** All query words must match; title/keyword matches rank above body matches. */
export function search(query: string, limit = 14): SearchEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of index) {
    if (!words.every((w) => e.haystack.includes(w))) continue;
    const t = e.title.toLowerCase();
    let score = kindBoost[e.kind];
    if (t === query.toLowerCase().trim()) score += 10;
    if (t.startsWith(words[0])) score += 3;
    score += words.filter((w) => e.titleHay.includes(w)).length * 3;
    scored.push({ e, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}

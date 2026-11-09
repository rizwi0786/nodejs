import { useMemo } from 'react';
import { useProgress } from '../context/ProgressContext';
import type { ResolvedLessonContent } from '../data/content';
import { allLessons, lessonById } from '../data/modules/curriculum';
import { sprintPlan, type SprintBlockDef } from '../data/sprint/plan';
import type { CodingChallenge, Importance, InterviewQuestion, Lesson, QuizQuestion, UserProgress } from '../types';
import { latestAttempts, solvedChallengeIds, weakLessons, wrongQuizIds } from '../utils/practice';
import { useAllContent } from './useContent';
import { useInterviewBank, type InterviewBank } from './useInterviewBank';

export interface SprintLesson {
  lesson: Lesson;
  content: ResolvedLessonContent | undefined;
}

export interface ResolvedBlock {
  def: SprintBlockDef;
  lessons: SprintLesson[];
  interview: InterviewQuestion[];
  output: InterviewQuestion[];
  scenario: InterviewQuestion[];
  quiz: QuizQuestion[];
  challenges: CodingChallenge[];
  /** Completed / total trackable items (notes reviewed, questions rated, quizzes answered, challenges solved). */
  done: number;
  total: number;
}

const rank: Record<Importance, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const moduleOf = (lessonId: string) => lessonId.slice(0, 3);

/** Round-robin across lessons so a capped list still covers every lesson. */
function roundRobin<T>(groups: T[][], max: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < max; i++) {
    let added = false;
    for (const g of groups) {
      if (i < g.length && out.length < max) {
        out.push(g[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

function pickLessons(def: SprintBlockDef): Lesson[] {
  if (!def.lessons) return [];
  const { modules, importance, max, include = [] } = def.lessons;
  const core = allLessons.filter((l) => modules.includes(l.moduleId) && importance.includes(l.importance));
  const critical = core.filter((l) => l.importance === 'critical');
  const extra = include.map((id) => lessonById.get(id)).filter((l): l is Lesson => Boolean(l));
  const rest = core.filter((l) => l.importance !== 'critical');
  const seen = new Set<string>();
  return [...critical, ...extra, ...rest].filter((l) => !seen.has(l.id) && seen.add(l.id)).slice(0, max);
}

function bankFor(list: InterviewQuestion[], modules: string[], categories: string[] | undefined, max: number) {
  const byModule = list.filter((q) => q.relatedLessonIds?.some((id) => modules.includes(moduleOf(id))));
  const byCategory = categories ? list.filter((q) => categories.includes(q.category)) : [];
  const seen = new Set<string>();
  return [...byModule, ...byCategory].filter((q) => !seen.has(q.id) && seen.add(q.id)).slice(0, max);
}

export const notesKey = (blockId: string, lessonId: string) => `${blockId}:${lessonId}`;
export const blockDoneKey = (blockId: string) => `${blockId}:done`;

function resolve(def: SprintBlockDef, bank: InterviewBank, lessons: Map<string, ResolvedLessonContent>, p: UserProgress): ResolvedBlock {
  const picked = pickLessons(def);
  const sprintLessons = picked.map((lesson) => ({ lesson, content: lessons.get(lesson.id) }));
  const modules = def.lessons?.modules ?? [];

  let interview: InterviewQuestion[] = [];
  let quiz: QuizQuestion[] = [];
  let output: InterviewQuestion[] = [];
  let scenario: InterviewQuestion[] = [];
  let challenges: CodingChallenge[] = [];
  let lessonList = sprintLessons;

  if (def.kind === 'diagnostic') {
    // First quiz question of every critical lesson, spread across modules.
    const critical = allLessons.filter((l) => l.importance === 'critical');
    const byModule = new Map<string, QuizQuestion[]>();
    for (const l of critical) {
      const q = lessons.get(l.id)?.quizQuestions[0];
      if (q) byModule.set(l.moduleId, [...(byModule.get(l.moduleId) ?? []), q]);
    }
    quiz = roundRobin([...byModule.values()], 20);
  } else if (def.kind === 'weak') {
    const quizById = new Map(bank.quizzes.map((q) => [q.id, q]));
    quiz = wrongQuizIds(p)
      .map((id) => quizById.get(id))
      .filter((q): q is QuizQuestion => Boolean(q))
      .slice(0, 15);
    interview = bank.questions.filter((q) => p.interviewReviewed[q.id] === 'review').slice(0, 20);
    const weakIds = [...weakLessons(p).map((w) => w.lessonId), ...allLessons.filter((l) => p.revision[l.id] === 'review').map((l) => l.id)];
    lessonList = [...new Set(weakIds)]
      .slice(0, 8)
      .map((id) => ({ lesson: lessonById.get(id)!, content: lessons.get(id) }))
      .filter((x) => x.lesson);
  } else if (def.kind === 'final') {
    lessonList = allLessons.filter((l) => l.importance === 'critical').map((lesson) => ({ lesson, content: lessons.get(lesson.id) }));
  } else {
    const sorted = [...sprintLessons].sort((a, b) => rank[a.lesson.importance] - rank[b.lesson.importance]);
    interview = roundRobin(
      sorted.map((s) => (s.content?.interviewQuestions ?? []).filter((q) => q.kind === 'concept' || q.kind === 'scenario')),
      def.interview ?? 0,
    );
    quiz = roundRobin(
      sorted.map((s) => s.content?.quizQuestions ?? []),
      def.quiz ?? 0,
    );
    if (def.output) output = bankFor(bank.questions.filter((q) => q.id.startsWith('out-')), modules, def.output.categories, def.output.max);
    if (def.scenario) scenario = bankFor(bank.questions.filter((q) => q.id.startsWith('sc-')), modules, def.scenario.categories, def.scenario.max);
    if (def.challenges) challenges = def.challenges.map((id) => bank.challenges.find((c) => c.id === id)).filter((c): c is CodingChallenge => Boolean(c));
  }

  // Progress from real activity.
  const since = p.sprint.startedAt ?? '';
  const answered = new Set(p.quizAttempts.filter((a) => a.answeredAt >= since).map((a) => a.quizId));
  const latest = latestAttempts(p);
  const solved = solvedChallengeIds(p);
  const rated = (q: InterviewQuestion) => Boolean(p.interviewReviewed[q.id]);
  const trackNotes = def.kind === 'study' || def.kind === 'design' || def.kind === 'weak';
  let done = 0;
  let total = 0;
  if (trackNotes)
    for (const l of lessonList) {
      total++;
      if (p.sprint.done[notesKey(def.id, l.lesson.id)]) done++;
    }
  for (const q of [...interview, ...output, ...scenario]) {
    total++;
    if (rated(q)) done++;
  }
  for (const q of quiz) {
    total++;
    // Weak-spot items count once you get them right; others once answered during the sprint.
    if (def.kind === 'weak' ? latest.get(q.id)?.correct : answered.has(q.id)) done++;
  }
  for (const c of challenges) {
    total++;
    if (solved.has(c.id)) done++;
  }
  if (total === 0) {
    // Breaks, sleep, mock and the final sheet are ticked off manually.
    total = 1;
    done = p.sprint.done[blockDoneKey(def.id)] ? 1 : 0;
  }

  return { def, lessons: lessonList, interview, output, scenario, quiz, challenges, done, total };
}

/** The sprint plan resolved into concrete content + progress. null while content loads. */
export function useSprint(): ResolvedBlock[] | null {
  const bank = useInterviewBank();
  const all = useAllContent();
  const { progress } = useProgress();
  return useMemo(() => {
    if (!bank || !all) return null;
    return sprintPlan.map((def) => resolve(def, bank, all.lessons, progress));
  }, [bank, all, progress]);
}

export type BlockStatus = 'upcoming' | 'now' | 'past';

/** Where the learner should be, given when the sprint started. */
export function sprintClock(startedAt: string | null, now = Date.now()) {
  if (!startedAt) return null;
  const elapsedMin = Math.max(0, (now - new Date(startedAt).getTime()) / 60000);
  const current = sprintPlan.find((b) => elapsedMin >= b.start && elapsedMin < b.start + b.duration) ?? null;
  return { elapsedMin, current, finished: elapsedMin >= 24 * 60 };
}

export function blockStatus(def: SprintBlockDef, elapsedMin: number | null): BlockStatus {
  if (elapsedMin === null) return 'upcoming';
  if (elapsedMin >= def.start + def.duration) return 'past';
  if (elapsedMin >= def.start) return 'now';
  return 'upcoming';
}

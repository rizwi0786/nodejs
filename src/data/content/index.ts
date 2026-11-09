// ─────────────────────────────────────────────────────────────
// Lazy content loader. Each module's lessons live in
// src/data/content/mNN/index.ts (default export: ModuleContent),
// loaded on demand so the dashboard stays small.
// ─────────────────────────────────────────────────────────────
import type { InterviewQuestion, LessonContent, ModuleContent, QuizQuestion } from '../../types';
import { modules } from '../modules/curriculum';

const loaders = import.meta.glob<{ default: ModuleContent }>('./m*/index.ts');

export interface ResolvedLessonContent extends LessonContent {
  lessonId: string;
  quizQuestions: QuizQuestion[];
  interviewQuestions: InterviewQuestion[];
}

export type ResolvedModuleContent = Map<string, ResolvedLessonContent>; // lessonId → content

const cache = new Map<string, Promise<ResolvedModuleContent>>();

function resolve(moduleId: string, raw: ModuleContent): ResolvedModuleContent {
  const m = modules.find((x) => x.id === moduleId)!;
  const out: ResolvedModuleContent = new Map();
  for (const lesson of m.lessons) {
    const c = raw[lesson.slug];
    if (!c) continue;
    out.set(lesson.id, {
      ...c,
      lessonId: lesson.id,
      quizQuestions: c.quiz.map((q, i) => ({ ...q, id: `${lesson.id}-q${i + 1}`, moduleId, lessonId: lesson.id })),
      interviewQuestions: c.interview.map((q, i) => ({ ...q, id: `${lesson.id}-i${i + 1}`, relatedLessonIds: [lesson.id] })),
    });
  }
  return out;
}

export function loadModuleContent(moduleId: string): Promise<ResolvedModuleContent> {
  let p = cache.get(moduleId);
  if (!p) {
    const loader = loaders[`./${moduleId}/index.ts`];
    p = loader ? loader().then((mod) => resolve(moduleId, mod.default)) : Promise.resolve(new Map());
    cache.set(moduleId, p);
  }
  return p;
}

export interface AllContent {
  lessons: Map<string, ResolvedLessonContent>;
  quizQuestions: QuizQuestion[];
  interviewQuestions: InterviewQuestion[]; // lesson-attached concept questions
}

let all: Promise<AllContent> | null = null;

export function loadAllContent(): Promise<AllContent> {
  if (!all) {
    all = Promise.all(modules.map((m) => loadModuleContent(m.id))).then((maps) => {
      const lessons = new Map<string, ResolvedLessonContent>();
      for (const mp of maps) for (const [k, v] of mp) lessons.set(k, v);
      const list = [...lessons.values()];
      return {
        lessons,
        quizQuestions: list.flatMap((l) => l.quizQuestions),
        interviewQuestions: list.flatMap((l) => l.interviewQuestions),
      };
    });
  }
  return all;
}

import type { UserProgress } from '../types';

export const emptyProgress = (): UserProgress => ({
  version: 1,
  completedLessons: {},
  bookmarks: {},
  quizAttempts: [],
  revision: {},
  interviewReviewed: {},
  studyLog: {},
  recentLessons: [],
  mode: 'learn',
  sprint: { startedAt: null, done: {} },
});

/** Accepts unknown JSON (e.g. an imported backup) and returns a valid UserProgress. */
export function normalizeProgress(raw: unknown): UserProgress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<UserProgress>;
  const obj = <T,>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d);
  return {
    version: 1,
    completedLessons: obj(r.completedLessons, base.completedLessons),
    bookmarks: obj(r.bookmarks, base.bookmarks),
    quizAttempts: Array.isArray(r.quizAttempts) ? r.quizAttempts : [],
    revision: obj(r.revision, base.revision),
    interviewReviewed: obj(r.interviewReviewed, base.interviewReviewed),
    studyLog: obj(r.studyLog, base.studyLog),
    recentLessons: Array.isArray(r.recentLessons) ? r.recentLessons : [],
    mode: r.mode === 'interview' ? 'interview' : 'learn',
    sprint: {
      startedAt: typeof r.sprint?.startedAt === 'string' ? r.sprint.startedAt : null,
      done: obj(r.sprint?.done, {} as Record<string, string>),
    },
  };
}


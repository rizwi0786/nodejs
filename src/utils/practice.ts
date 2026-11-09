import type { QuizAttempt, UserProgress } from '../types';

/** Latest attempt per question/challenge id. */
export function latestAttempts(p: UserProgress): Map<string, QuizAttempt> {
  const m = new Map<string, QuizAttempt>();
  for (const a of p.quizAttempts) {
    const prev = m.get(a.quizId);
    if (!prev || prev.answeredAt <= a.answeredAt) m.set(a.quizId, a);
  }
  return m;
}

export const isChallengeId = (id: string) => id.startsWith('ch-');

/** Lesson id of a lesson quiz id ("m05-promises-q2" → "m05-promises"). */
export const lessonOfQuiz = (quizId: string): string | null => {
  const m = /^(m\d{2}-.+)-q\d+$/.exec(quizId);
  return m ? m[1] : null;
};

/** Ids whose most recent answer was wrong (the "wrong answers" review list). */
export function wrongQuizIds(p: UserProgress): string[] {
  return [...latestAttempts(p).values()]
    .filter((a) => !a.correct && !isChallengeId(a.quizId))
    .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt))
    .map((a) => a.quizId);
}

export function solvedChallengeIds(p: UserProgress): Set<string> {
  return new Set(p.quizAttempts.filter((a) => a.correct && isChallengeId(a.quizId)).map((a) => a.quizId));
}

export interface LessonAccuracy {
  lessonId: string;
  answered: number;
  correct: number;
  accuracy: number; // 0–100, by latest attempt per question
}

/**
 * Weak topics: lessons where the latest answers are mostly wrong.
 * Uses the latest attempt per question so a retried question counts once.
 */
export function lessonAccuracy(p: UserProgress): LessonAccuracy[] {
  const acc = new Map<string, { answered: number; correct: number }>();
  for (const a of latestAttempts(p).values()) {
    const lessonId = lessonOfQuiz(a.quizId);
    if (!lessonId) continue;
    const e = acc.get(lessonId) ?? { answered: 0, correct: 0 };
    e.answered++;
    if (a.correct) e.correct++;
    acc.set(lessonId, e);
  }
  return [...acc].map(([lessonId, e]) => ({ lessonId, ...e, accuracy: Math.round((e.correct / e.answered) * 100) }));
}

export function weakLessons(p: UserProgress, threshold = 60): LessonAccuracy[] {
  return lessonAccuracy(p)
    .filter((l) => l.accuracy < threshold)
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered);
}

/** Deterministic shuffle (seeded) so a "random set" stays stable while the learner answers it. */
export function shuffled<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

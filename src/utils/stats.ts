import type { CourseModule, Lesson, UserProgress } from '../types';
import { addDays, dayKey } from './date';

export interface ModuleStat {
  module: CourseModule;
  total: number;
  done: number;
  percent: number;
}

export interface DashboardStats {
  totalLessons: number;
  completedLessons: number;
  percent: number;
  modules: ModuleStat[];
  completedModules: number;
  startedModules: number;
  streak: number;
  longestStreak: number;
  totalStudySeconds: number;
  todaySeconds: number;
  quizAnswered: number;
  quizCorrect: number;
  quizAccuracy: number | null; // null until a quiz is answered
  bookmarks: number;
  activeDays: Set<string>;
}

/** A day counts as active if the learner studied ≥ 1 minute or completed a lesson. */
export function activeDaySet(p: UserProgress): Set<string> {
  const days = new Set<string>();
  for (const [day, secs] of Object.entries(p.studyLog)) if (secs >= 60) days.add(day);
  for (const iso of Object.values(p.completedLessons)) days.add(dayKey(new Date(iso)));
  for (const a of p.quizAttempts) days.add(dayKey(new Date(a.answeredAt)));
  return days;
}

/** Consecutive active days ending today (or yesterday, so the streak survives until today ends). */
export function currentStreak(days: Set<string>, today: Date = new Date()): number {
  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && dayKey(addDays(new Date(prev + 'T12:00:00'), 1)) === d) run++;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function computeStats(modules: CourseModule[], p: UserProgress): DashboardStats {
  const moduleStats = modules.map((module) => {
    const total = module.lessons.length;
    const done = module.lessons.filter((l) => p.completedLessons[l.id]).length;
    return { module, total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  });
  const totalLessons = moduleStats.reduce((s, m) => s + m.total, 0);
  const completedLessons = moduleStats.reduce((s, m) => s + m.done, 0);
  const days = activeDaySet(p);
  const quizAnswered = p.quizAttempts.length;
  const quizCorrect = p.quizAttempts.filter((a) => a.correct).length;

  return {
    totalLessons,
    completedLessons,
    percent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
    modules: moduleStats,
    completedModules: moduleStats.filter((m) => m.total > 0 && m.done === m.total).length,
    startedModules: moduleStats.filter((m) => m.done > 0).length,
    streak: currentStreak(days),
    longestStreak: longestStreak(days),
    totalStudySeconds: Object.values(p.studyLog).reduce((s, n) => s + n, 0),
    todaySeconds: p.studyLog[dayKey()] ?? 0,
    quizAnswered,
    quizCorrect,
    quizAccuracy: quizAnswered ? Math.round((quizCorrect / quizAnswered) * 100) : null,
    bookmarks: Object.keys(p.bookmarks).length,
    activeDays: days,
  };
}

/**
 * Recommended next lesson: the first incomplete lesson (curriculum order)
 * whose prerequisites are all complete.
 */
export function recommendedLesson(lessons: Lesson[], p: UserProgress): Lesson | null {
  return lessons.find((l) => !p.completedLessons[l.id] && l.prerequisites.every((id) => p.completedLessons[id])) ?? null;
}

/** Continue learning: most recently visited lesson that is not yet complete. */
export function continueLesson(lessonById: Map<string, Lesson>, p: UserProgress): Lesson | null {
  for (const r of p.recentLessons) {
    const l = lessonById.get(r.lessonId);
    if (l && !p.completedLessons[l.id]) return l;
  }
  return null;
}

/** Seconds studied per day for the last `n` days, oldest first. */
export function studySeries(p: UserProgress, n = 14, today: Date = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(today, i - (n - 1));
    const key = dayKey(d);
    return {
      key,
      label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      minutes: Math.round((p.studyLog[key] ?? 0) / 60),
    };
  });
}

import { allLessons, lessonIndex, moduleById, modules } from '../data/modules/curriculum';
import type { CourseModule, Lesson } from '../types';

export interface LessonPosition {
  module: CourseModule;
  lesson: Lesson;
  /** 0-based index inside its module */
  indexInModule: number;
  moduleTotal: number;
  /** 0-based index across the whole course */
  globalIndex: number;
  courseTotal: number;
  prev: Lesson | null;
  next: Lesson | null;
  isFirstInModule: boolean;
  isLastInModule: boolean;
  /** Module that starts after this one (only meaningful when isLastInModule) */
  nextModule: CourseModule | null;
}

/** Where a lesson sits in the course, and what comes before/after it. */
export function lessonPosition(lesson: Lesson): LessonPosition {
  const module = moduleById.get(lesson.moduleId)!;
  const indexInModule = module.lessons.findIndex((l) => l.id === lesson.id);
  const globalIndex = lessonIndex.get(lesson.id)!;
  const mi = modules.indexOf(module);
  return {
    module,
    lesson,
    indexInModule,
    moduleTotal: module.lessons.length,
    globalIndex,
    courseTotal: allLessons.length,
    prev: allLessons[globalIndex - 1] ?? null,
    next: allLessons[globalIndex + 1] ?? null,
    isFirstInModule: indexInModule === 0,
    isLastInModule: indexInModule === module.lessons.length - 1,
    nextModule: modules[mi + 1] ?? null,
  };
}

/** Resolve route params to a module + lesson (either may be undefined). */
export function resolveLesson(moduleSlug?: string, lessonSlug?: string) {
  const module = modules.find((m) => m.slug === moduleSlug);
  const lesson = module?.lessons.find((l) => l.slug === lessonSlug);
  return { module, lesson };
}

/** Where to resume inside a module: most recently visited incomplete lesson, else first incomplete. */
export function moduleResumePoint(
  module: CourseModule,
  completed: Record<string, string>,
  recent: { lessonId: string }[],
): Lesson | null {
  const ids = new Set(module.lessons.map((l) => l.id));
  const recentHit = recent.find((r) => ids.has(r.lessonId) && !completed[r.lessonId]);
  if (recentHit) return module.lessons.find((l) => l.id === recentHit.lessonId) ?? null;
  return module.lessons.find((l) => !completed[l.id]) ?? null;
}

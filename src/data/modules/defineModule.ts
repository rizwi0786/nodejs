import type { CourseModule, Difficulty, Importance, Lesson } from '../../types';

/** A lesson entry in the outline: a title, or a title with overrides. */
export type LessonSpec = string | [string, Partial<Pick<Lesson, 'difficulty' | 'importance' | 'estMinutes' | 'summary'>>];

const DEFAULT_MINUTES: Record<Difficulty, number> = { beginner: 15, intermediate: 20, advanced: 25 };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface ModuleSpec {
  number: number;
  title: string;
  description: string;
  difficulty: Difficulty;
  icon: string;
  priority?: 'high';
  defaultImportance?: Importance;
  lessons: LessonSpec[];
}

/**
 * Builds a CourseModule from a compact outline. Each lesson gets a stable id
 * (`m05-event-loop-phases`) and depends on the previous lesson, so the
 * prerequisite chain always follows curriculum order.
 *
 * Phase 6 replaces `sections: []` with real content per lesson, keeping ids stable.
 */
export function defineModule(spec: ModuleSpec): CourseModule {
  const id = `m${String(spec.number).padStart(2, '0')}`;
  const lessons: Lesson[] = spec.lessons.map((entry, i, all) => {
    const [title, o] = typeof entry === 'string' ? [entry, {}] : entry;
    const difficulty = o.difficulty ?? spec.difficulty;
    const slug = slugify(title);
    const prev = i > 0 ? all[i - 1] : null;
    const prevTitle = prev ? (typeof prev === 'string' ? prev : prev[0]) : null;
    return {
      id: `${id}-${slug}`,
      moduleId: id,
      slug,
      title,
      summary: o.summary,
      difficulty,
      importance: o.importance ?? spec.defaultImportance ?? 'medium',
      estMinutes: o.estMinutes ?? DEFAULT_MINUTES[difficulty],
      prerequisites: prevTitle ? [`${id}-${slugify(prevTitle)}`] : [],
      topics: [],
      status: 'outline',
      sections: [],
    };
  });
  return {
    id,
    number: spec.number,
    slug: slugify(spec.title),
    title: spec.title,
    description: spec.description,
    difficulty: spec.difficulty,
    priority: spec.priority,
    icon: spec.icon,
    lessons,
  };
}

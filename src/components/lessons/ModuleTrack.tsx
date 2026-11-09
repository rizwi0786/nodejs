import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import { paths } from '../../routes/paths';
import type { CourseModule } from '../../types';

/** One segment per lesson in the module: done, current or to-do. Each segment links to its lesson. */
export function ModuleTrack({ module, currentLessonId }: { module: CourseModule; currentLessonId: string }) {
  const { progress } = useProgress();
  return (
    <ol className="flex gap-[3px]" aria-label={`${module.title} lessons`}>
      {module.lessons.map((l, i) => {
        const done = Boolean(progress.completedLessons[l.id]);
        const current = l.id === currentLessonId;
        return (
          <li key={l.id} className="min-w-0 flex-1">
            <Link
              to={paths.lesson(l)}
              title={`${i + 1}. ${l.title}${done ? ' (completed)' : ''}`}
              aria-label={`Lesson ${i + 1}: ${l.title}${done ? ', completed' : ''}`}
              aria-current={current ? 'step' : undefined}
              className="block py-1.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-colors ${
                  current ? 'bg-ink' : done ? 'bg-accent' : 'bg-raised hover:bg-line'
                }`}
              />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

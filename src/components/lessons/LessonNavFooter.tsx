import { ArrowLeft, ArrowRight, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { paths } from '../../routes/paths';
import type { LessonPosition } from '../../utils/navigation';

/** Previous / next lesson cards. Crossing a module boundary is called out explicitly. */
export function LessonNavFooter({ pos }: { pos: LessonPosition }) {
  const { prev, next, isFirstInModule, isLastInModule, nextModule, module } = pos;
  return (
    <nav className="mt-10 grid gap-3 border-t border-line pt-6 sm:grid-cols-2" aria-label="Lesson navigation">
      {prev ? (
        <Link to={paths.lesson(prev)} className="card group p-4 hover:bg-raised" rel="prev">
          <div className="flex items-center gap-1 text-xs text-faint">
            <ArrowLeft size={12} aria-hidden /> {isFirstInModule ? 'Previous module' : 'Previous'}
            <kbd className="ml-auto hidden rounded border border-line px-1 font-mono text-[10px] sm:inline">←</kbd>
          </div>
          <div className="mt-1 truncate text-sm font-medium group-hover:text-accent">{prev.title}</div>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}

      {next ? (
        <Link to={paths.lesson(next)} className="card group p-4 text-right hover:bg-raised" rel="next">
          <div className="flex items-center justify-end gap-1 text-xs text-faint">
            <kbd className="mr-auto hidden rounded border border-line px-1 font-mono text-[10px] sm:inline">→</kbd>
            {isLastInModule && nextModule ? `Next module · ${nextModule.number}` : 'Next'} <ArrowRight size={12} aria-hidden />
          </div>
          <div className="mt-1 truncate text-sm font-medium group-hover:text-accent">{next.title}</div>
          {isLastInModule && nextModule && <div className="truncate text-xs text-muted">{nextModule.title}</div>}
        </Link>
      ) : (
        <div className="card flex items-center justify-end gap-2 p-4 text-sm text-muted">
          <Flag size={14} className="text-accent" aria-hidden /> End of the course — {module.title} was the last module.
        </div>
      )}
    </nav>
  );
}

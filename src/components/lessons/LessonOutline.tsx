import { CheckCircle2, ChevronRight, Circle, CircleDot, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import { modules } from '../../data/modules/curriculum';
import { paths } from '../../routes/paths';

interface Props {
  currentLessonId: string;
  /** Called after a link is followed — lets the mobile drawer close itself. */
  onNavigate?: () => void;
}

/**
 * Course outline: every module, with the current one expanded and the current
 * lesson highlighted and scrolled into view. A filter box narrows all 290 lessons.
 */
export function LessonOutline({ currentLessonId, onNavigate }: Props) {
  const { progress } = useProgress();
  const currentModuleId = currentLessonId.slice(0, 3);
  const [open, setOpen] = useState<Set<string>>(() => new Set([currentModuleId]));
  const [filter, setFilter] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLAnchorElement>(null);

  // When the lesson changes, make sure its module is open.
  useEffect(() => {
    setOpen((s) => (s.has(currentModuleId) ? s : new Set(s).add(currentModuleId)));
  }, [currentModuleId]);

  // Centre the current lesson inside the outline (without scrolling the page).
  useEffect(() => {
    const box = scrollRef.current;
    const el = currentRef.current;
    if (box && el) {
      const top = el.offsetTop - box.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
      box.scrollTo({ top: Math.max(0, top) });
    }
  }, [currentLessonId]);

  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      modules
        .map((m) => ({ m, lessons: q ? m.lessons.filter((l) => l.title.toLowerCase().includes(q)) : m.lessons }))
        .filter((x) => x.lessons.length > 0),
    [q],
  );

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pb-2">
        <Search size={13} className="pointer-events-none absolute left-5 top-1/2 -translate-y-[calc(50%+4px)] text-faint" aria-hidden />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter lessons"
          aria-label="Filter lessons"
          className="h-8 w-full rounded-md border border-line bg-bg pl-7 pr-2 text-xs placeholder:text-faint focus:border-accent/60"
        />
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {visible.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted">No lessons match.</div>}
        {visible.map(({ m, lessons }) => {
          const expanded = q ? true : open.has(m.id);
          const done = m.lessons.filter((l) => progress.completedLessons[l.id]).length;
          const isCurrentModule = m.id === currentModuleId;
          return (
            <div key={m.id} className="mb-0.5">
              <button
                onClick={() => toggle(m.id)}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-raised ${
                  isCurrentModule ? 'text-ink' : 'text-muted'
                }`}
              >
                <ChevronRight size={13} className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden />
                <span className="w-4 shrink-0 text-faint tabular-nums">{m.number}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                <span className={`shrink-0 tabular-nums ${done === m.lessons.length ? 'text-accent' : 'text-faint'}`}>
                  {done}/{m.lessons.length}
                </span>
              </button>
              {expanded && (
                <ul className="mb-1 ml-[13px] border-l border-line pl-2">
                  {lessons.map((l) => {
                    const isCurrent = l.id === currentLessonId;
                    const isDone = Boolean(progress.completedLessons[l.id]);
                    const Icon = isDone ? CheckCircle2 : isCurrent ? CircleDot : Circle;
                    return (
                      <li key={l.id}>
                        <Link
                          ref={isCurrent ? currentRef : undefined}
                          to={paths.lesson(l)}
                          onClick={onNavigate}
                          aria-current={isCurrent ? 'page' : undefined}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] leading-snug ${
                            isCurrent ? 'bg-accent/10 font-medium text-ink' : 'text-muted hover:bg-raised hover:text-ink'
                          }`}
                        >
                          <Icon
                            size={13}
                            className={`shrink-0 ${isDone || isCurrent ? 'text-accent' : 'text-faint'}`}
                            aria-label={isDone ? 'Completed' : undefined}
                          />
                          <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

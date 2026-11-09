import { ArrowRight, Bookmark, CheckCircle2, Circle, Clock, Keyboard, ListTree, PartyPopper, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DifficultyBadge, ImportanceBadge } from '../../components/common/Badges';
import { PageHeader } from '../../components/common/PageHeader';
import { LearnView, LessonSkeleton, RevisionView } from '../../components/lessons/LessonBody';
import { LessonNavFooter } from '../../components/lessons/LessonNavFooter';
import { LessonOutline } from '../../components/lessons/LessonOutline';
import { ModuleTrack } from '../../components/lessons/ModuleTrack';
import { useProgress } from '../../context/ProgressContext';
import { lessonById } from '../../data/modules/curriculum';
import { OPEN_SHORTCUTS_EVENT, useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useReadingProgress } from '../../hooks/useReadingProgress';
import { useModuleContent } from '../../hooks/useContent';
import { paths } from '../../routes/paths';
import { lessonPosition, resolveLesson } from '../../utils/navigation';
import NotFoundPage from '../NotFoundPage';

export default function LessonPage() {
  const { moduleSlug, lessonSlug } = useParams();
  const { lesson } = resolveLesson(moduleSlug, lessonSlug);
  if (!lesson) return <NotFoundPage />;
  // key resets per-lesson UI state (drawer, etc.) when navigating between lessons
  return <LessonView key={lesson.id} lessonId={lesson.id} />;
}

function LessonView({ lessonId }: { lessonId: string }) {
  const lesson = lessonById.get(lessonId)!;
  const pos = useMemo(() => lessonPosition(lesson), [lesson]);
  const { module: m, prev, next } = pos;
  const navigate = useNavigate();
  const { isCompleted, isBookmarked, toggleComplete, toggleBookmark, visitLesson, progress } = useProgress();
  const [outlineOpen, setOutlineOpen] = useState(false);
  const reading = useReadingProgress();
  const moduleContent = useModuleContent(lesson.moduleId);
  const content = moduleContent?.get(lesson.id);

  const done = isCompleted(lesson.id);
  const marked = isBookmarked(lesson.id);
  const moduleDone = m.lessons.every((l) => progress.completedLessons[l.id]);
  const missingPrereqs = lesson.prerequisites.filter((id) => !progress.completedLessons[id]).map((id) => lessonById.get(id)!);

  useEffect(() => {
    visitLesson(lesson.id);
  }, [lesson.id, visitLesson]);

  const completeAndNext = () => {
    if (!done) toggleComplete(lesson.id);
    if (next) navigate(paths.lesson(next));
  };

  useKeyboardShortcuts({
    ArrowLeft: () => prev && navigate(paths.lesson(prev)),
    ArrowRight: () => next && navigate(paths.lesson(next)),
    m: () => toggleComplete(lesson.id),
    n: completeAndNext,
    b: () => toggleBookmark(lesson.id),
    o: () => {
      // Desktop shows the outline permanently — focus its filter instead of opening a drawer.
      if (window.matchMedia('(min-width: 1280px)').matches) {
        document.querySelector<HTMLInputElement>('aside[data-outline] input')?.focus();
      } else {
        setOutlineOpen((o) => !o);
      }
    },
  });
  useKeyboardShortcuts({ Escape: () => setOutlineOpen(false) }, outlineOpen);

  // Lock page scroll while the mobile outline drawer is open.
  useEffect(() => {
    if (!outlineOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [outlineOpen]);

  const outlineHeader = (
    <div className="flex items-center justify-between px-4 pb-3 pt-4">
      <div>
        <div className="text-sm font-semibold">Course outline</div>
        <div className="text-xs text-faint tabular-nums">
          Lesson {pos.globalIndex + 1} of {pos.courseTotal}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Reading progress, pinned under the top bar */}
      <div className="fixed left-0 right-0 top-14 z-10 h-0.5 lg:left-64" aria-hidden>
        <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${reading}%` }} />
      </div>

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_288px] xl:gap-8">
        <article className="mx-auto w-full max-w-3xl min-w-0">
          {/* Position in module */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <Link to={paths.module(m)} className="truncate hover:text-ink">
                Module {m.number} · {m.title}
              </Link>
              <span className="shrink-0 pl-3 tabular-nums">
                Lesson {pos.indexInModule + 1} of {pos.moduleTotal}
              </span>
            </div>
            <ModuleTrack module={m} currentLessonId={lesson.id} />
          </div>

          <PageHeader
            title={lesson.title}
            crumbs={[
              { label: 'Modules', to: paths.modules },
              { label: `Module ${m.number}`, to: paths.module(m) },
              { label: lesson.title },
            ]}
            meta={
              <>
                <DifficultyBadge level={lesson.difficulty} />
                <ImportanceBadge level={lesson.importance} />
                <span className="chip">
                  <Clock size={12} aria-hidden /> {lesson.estMinutes} min
                </span>
                {done && (
                  <span className="chip border-accent/40 text-accent">
                    <CheckCircle2 size={12} aria-hidden /> Completed
                  </span>
                )}
              </>
            }
            actions={
              <>
                <button
                  onClick={() => toggleBookmark(lesson.id)}
                  className={marked ? 'btn-outline text-accent' : 'btn-outline'}
                  aria-pressed={marked}
                  aria-label={marked ? 'Bookmarked' : 'Bookmark'}
                  title="Bookmark (B)"
                >
                  <Bookmark size={15} fill={marked ? 'currentColor' : 'none'} />
                  <span className="hidden sm:inline">{marked ? 'Bookmarked' : 'Bookmark'}</span>
                </button>
                <button onClick={() => setOutlineOpen(true)} className="btn-outline xl:hidden" title="Course outline (O)" aria-label="Outline">
                  <ListTree size={15} />
                  <span className="hidden sm:inline">Outline</span>
                </button>
              </>
            }
          />

          {missingPrereqs.length > 0 && (
            <div className="mb-4 rounded-lg border border-line px-4 py-3 text-sm text-muted">
              Recommended first:{' '}
              {missingPrereqs.map((p) => (
                <Link key={p.id} to={paths.lesson(p)} className="text-accent hover:underline">
                  {p.title}
                </Link>
              ))}
            </div>
          )}

          {!moduleContent ? (
            <LessonSkeleton />
          ) : !content ? (
            <div className="card p-5 text-sm text-muted">This lesson's content has not been written yet.</div>
          ) : progress.mode === 'interview' ? (
            <RevisionView lesson={lesson} content={content} />
          ) : (
            <LearnView lesson={lesson} content={content} />
          )}

          {/* Completion */}
          {done && pos.isLastInModule && moduleDone ? (
            <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 p-6 text-center">
              <PartyPopper size={22} className="text-accent" aria-hidden />
              <div className="font-semibold">Module {m.number} complete</div>
              <div className="text-sm text-muted">All {m.lessons.length} lessons in “{m.title}” are done.</div>
              <div className="flex flex-wrap justify-center gap-2">
                {next && (
                  <Link to={paths.lesson(next)} className="btn-primary">
                    Start Module {pos.nextModule?.number} <ArrowRight size={15} />
                  </Link>
                )}
                <button onClick={() => toggleComplete(lesson.id)} className="btn-ghost">
                  Mark incomplete
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {done ? (
                <>
                  {next && (
                    <Link to={paths.lesson(next)} className="btn-primary">
                      Continue <ArrowRight size={15} />
                    </Link>
                  )}
                  <button onClick={() => toggleComplete(lesson.id)} className="btn-outline" title="Mark incomplete (M)">
                    <CheckCircle2 size={16} className="text-accent" /> Completed — undo
                  </button>
                </>
              ) : (
                <>
                  <button onClick={completeAndNext} className="btn-primary" title="Mark complete and go to next (N)">
                    <Circle size={16} /> {next ? 'Mark complete & continue' : 'Mark complete'}
                  </button>
                  {next && (
                    <button onClick={() => toggleComplete(lesson.id)} className="btn-ghost" title="Mark complete (M)">
                      Mark complete only
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <LessonNavFooter pos={pos} />

          <button
            onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}
            className="mx-auto mt-6 hidden items-center gap-1.5 text-xs text-faint hover:text-muted sm:flex"
          >
            <Keyboard size={13} aria-hidden /> Keyboard shortcuts: press <kbd className="font-mono">?</kbd>
          </button>
        </article>

        {/* Desktop outline */}
        <aside data-outline className="card sticky top-20 hidden h-[calc(100vh-6.5rem)] flex-col overflow-hidden xl:flex" aria-label="Course outline">
          {outlineHeader}
          <LessonOutline currentLessonId={lesson.id} />
        </aside>
      </div>

      {/* Mobile / tablet outline drawer */}
      {outlineOpen && (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Course outline">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOutlineOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-80 max-w-[88vw] flex-col border-l border-line bg-surface">
            <div className="flex items-start justify-between">
              {outlineHeader}
              <button className="btn-ghost m-3 p-1.5" onClick={() => setOutlineOpen(false)} aria-label="Close outline">
                <X size={18} />
              </button>
            </div>
            <LessonOutline currentLessonId={lesson.id} onNavigate={() => setOutlineOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

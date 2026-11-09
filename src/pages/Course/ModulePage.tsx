import { ArrowLeft, ArrowRight, CheckCircle2, Clock, ListFilter } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DifficultyBadge } from '../../components/common/Badges';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { Segmented } from '../../components/common/Segmented';
import { LessonRow } from '../../components/lessons/LessonRow';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { useProgress } from '../../context/ProgressContext';
import { modules } from '../../data/modules/curriculum';
import { useQueryParam } from '../../hooks/useQueryParam';
import { paths } from '../../routes/paths';
import { moduleResumePoint } from '../../utils/navigation';
import NotFoundPage from '../NotFoundPage';

const SHOW = ['all', 'todo', 'done', 'saved'] as const;
type Show = (typeof SHOW)[number];

export default function ModulePage() {
  const { moduleSlug } = useParams();
  const { progress } = useProgress();
  const [show, setShow] = useQueryParam<Show>('show', SHOW, 'all');
  const mi = modules.findIndex((x) => x.slug === moduleSlug);
  const m = modules[mi];

  const counts = useMemo(() => {
    if (!m) return null;
    const done = m.lessons.filter((l) => progress.completedLessons[l.id]).length;
    const saved = m.lessons.filter((l) => progress.bookmarks[l.id]).length;
    return { all: m.lessons.length, done, todo: m.lessons.length - done, saved };
  }, [m, progress]);

  if (!m || !counts) return <NotFoundPage />;

  const percent = Math.round((counts.done / counts.all) * 100);
  const minutes = m.lessons.reduce((s, l) => s + l.estMinutes, 0);
  const remaining = m.lessons.filter((l) => !progress.completedLessons[l.id]).reduce((s, l) => s + l.estMinutes, 0);
  const resume = moduleResumePoint(m, progress.completedLessons, progress.recentLessons);
  const prevModule = modules[mi - 1];
  const nextModule = modules[mi + 1];

  const visible = m.lessons
    .map((l, i) => ({ l, i }))
    .filter(({ l }) =>
      show === 'all'
        ? true
        : show === 'done'
          ? progress.completedLessons[l.id]
          : show === 'todo'
            ? !progress.completedLessons[l.id]
            : progress.bookmarks[l.id],
    );

  return (
    <>
      <PageHeader
        title={m.title}
        description={m.description}
        crumbs={[{ label: 'Modules', to: paths.modules }, { label: `Module ${m.number}` }]}
        meta={
          <>
            <DifficultyBadge level={m.difficulty} />
            <span className="chip">{m.lessons.length} lessons</span>
            <span className="chip">
              <Clock size={12} aria-hidden /> ~{Math.round(minutes / 60)}h total
            </span>
          </>
        }
        actions={
          resume && (
            <Link to={paths.lesson(resume)} className="btn-primary">
              {counts.done || progress.recentLessons.some((r) => r.lessonId === resume.id) ? 'Resume' : 'Start module'}{' '}
              <ArrowRight size={15} />
            </Link>
          )
        }
      />

      <div className="card mb-4 p-4">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted tabular-nums">
          <span>
            {counts.done}/{counts.all} lessons · {percent}%
          </span>
          {resume ? (
            <span>
              Next up: <Link to={paths.lesson(resume)} className="text-ink hover:text-accent">{resume.title}</Link> · ~{remaining} min left
            </span>
          ) : (
            <span className="flex items-center gap-1 text-accent">
              <CheckCircle2 size={13} aria-hidden /> Module complete
            </span>
          )}
        </div>
        <ProgressBar value={percent} className="mt-2" label="Module progress" />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <ListFilter size={14} className="text-faint" aria-hidden />
        <Segmented<Show>
          label="Show lessons"
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'todo', label: 'To do', count: counts.todo },
            { value: 'done', label: 'Completed', count: counts.done },
            { value: 'saved', label: 'Bookmarked', count: counts.saved },
          ]}
        />
      </div>

      {visible.length ? (
        <ul className="card divide-y divide-line overflow-hidden">
          {visible.map(({ l, i }) => (
            <LessonRow key={l.id} lesson={l} index={i} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={ListFilter} title="No lessons in this view">
          {show === 'done' ? 'Complete a lesson and it will show up here.' : show === 'saved' ? 'Bookmark lessons to collect them here.' : 'Everything here is done.'}
        </EmptyState>
      )}

      <nav className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Module navigation">
        {prevModule ? (
          <Link to={paths.module(prevModule)} className="card group p-4 hover:bg-raised">
            <div className="flex items-center gap-1 text-xs text-faint">
              <ArrowLeft size={12} aria-hidden /> Module {prevModule.number}
            </div>
            <div className="mt-1 truncate text-sm font-medium group-hover:text-accent">{prevModule.title}</div>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {nextModule && (
          <Link to={paths.module(nextModule)} className="card group p-4 text-right hover:bg-raised">
            <div className="flex items-center justify-end gap-1 text-xs text-faint">
              Module {nextModule.number} <ArrowRight size={12} aria-hidden />
            </div>
            <div className="mt-1 truncate text-sm font-medium group-hover:text-accent">{nextModule.title}</div>
          </Link>
        )}
      </nav>
    </>
  );
}

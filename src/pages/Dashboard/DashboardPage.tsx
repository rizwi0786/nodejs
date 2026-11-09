import {
  ArrowRight, Bookmark, BookOpenCheck, CheckCircle2, Clock, Flame, Layers, MessagesSquare, PlayCircle, Target, Trophy,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DifficultyBadge, ImportanceBadge } from '../../components/common/Badges';
import { EmptyState } from '../../components/common/EmptyState';
import { StatTile } from '../../components/common/StatTile';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { ProgressRing } from '../../components/progress/ProgressRing';
import { StudyChart } from '../../components/progress/StudyChart';
import { SprintBanner } from '../../components/progress/SprintBanner';
import { useProgress } from '../../context/ProgressContext';
import { lessonById, moduleById } from '../../data/modules/curriculum';
import { useInterviewBank } from '../../hooks/useInterviewBank';
import { useStats } from '../../hooks/useStats';
import { paths } from '../../routes/paths';
import type { Lesson } from '../../types';
import { formatDuration, relativeTime } from '../../utils/date';
import { studySeries } from '../../utils/stats';
import { moduleIcon } from '../../utils/icons';

function LessonMeta({ lesson }: { lesson: Lesson }) {
  const m = moduleById.get(lesson.moduleId)!;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>Module {m.number}</span>
      <span className="text-faint">·</span>
      <span className="flex items-center gap-1">
        <Clock size={12} aria-hidden /> {lesson.estMinutes} min
      </span>
      <DifficultyBadge level={lesson.difficulty} />
      <ImportanceBadge level={lesson.importance} />
    </div>
  );
}

export default function DashboardPage() {
  const { progress } = useProgress();
  const { stats, recommended, continueWith } = useStats();
  const series = useMemo(() => studySeries(progress, 14), [progress]);
  const isNew = stats.completedLessons === 0 && progress.recentLessons.length === 0;
  const primary = continueWith ?? recommended;

  // Interview prep = questions the learner marked "I knew it", out of the whole bank.
  const bank = useInterviewBank();
  const known = Object.values(progress.interviewReviewed).filter((s) => s === 'known').length;
  const toReview = Object.values(progress.interviewReviewed).filter((s) => s === 'review').length;
  const interviewPct = bank && bank.questions.length ? Math.round((known / bank.questions.length) * 100) : null;

  const bookmarks = Object.entries(progress.bookmarks)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id, at]) => ({ lesson: lessonById.get(id), at }))
    .filter((b): b is { lesson: Lesson; at: string } => Boolean(b.lesson))
    .slice(0, 5);

  const weekMinutes = series.slice(-7).reduce((s, d) => s + d.minutes, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{isNew ? 'Welcome to Node.js Mastery' : 'Welcome back'}</h1>
        <p className="mt-1 text-sm text-muted">
          {progress.mode === 'interview'
            ? 'Interview & Revision mode — quick definitions, tricky outputs and practice questions.'
            : isNew
              ? `${stats.totalLessons} lessons across ${stats.modules.length} modules, from JavaScript basics to production deployment.`
              : 'Pick up where you left off. Every number here comes from your own activity.'}
        </p>
      </header>

      <SprintBanner />

      {/* Hero: continue + overall */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card flex flex-col justify-between p-5 lg:col-span-2">
          <div>
            <div className="section-title flex items-center gap-2">
              <PlayCircle size={14} aria-hidden />
              {continueWith ? 'Continue learning' : isNew ? 'Start here' : 'Up next'}
            </div>
            {primary ? (
              <>
                <h2 className="mt-3 text-lg font-semibold">{primary.title}</h2>
                <div className="text-sm text-muted">{moduleById.get(primary.moduleId)!.title}</div>
                <LessonMeta lesson={primary} />
              </>
            ) : (
              <h2 className="mt-3 text-lg font-semibold">You have completed every lesson.</h2>
            )}
          </div>
          {primary && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to={paths.lesson(primary)} className="btn-primary">
                {continueWith ? 'Resume lesson' : 'Start lesson'} <ArrowRight size={15} />
              </Link>
              <Link to={paths.roadmap} className="btn-outline">
                View roadmap
              </Link>
            </div>
          )}
        </div>

        <div className="card flex items-center gap-5 p-5">
          <ProgressRing value={stats.percent} size={104} stroke={8}>
            <div>
              <div className="text-2xl font-semibold tabular-nums">{stats.percent}%</div>
              <div className="text-[10px] uppercase tracking-wide text-faint">complete</div>
            </div>
          </ProgressRing>
          <div className="min-w-0 text-sm">
            <div className="font-medium">Overall progress</div>
            <div className="mt-1 text-muted tabular-nums">
              {stats.completedLessons} / {stats.totalLessons} lessons
            </div>
            <div className="text-muted tabular-nums">
              {stats.completedModules} / {stats.modules.length} modules
            </div>
          </div>
        </div>
      </section>

      {/* KPI tiles */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Key statistics">
        <StatTile icon={CheckCircle2} label="Lessons done" value={stats.completedLessons} hint={`of ${stats.totalLessons}`} />
        <StatTile icon={Layers} label="Modules done" value={stats.completedModules} hint={`${stats.startedModules} started`} />
        <StatTile
          icon={Flame}
          label="Streak"
          value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`}
          hint={`Best: ${stats.longestStreak}`}
        />
        <StatTile
          icon={Clock}
          label="Study time"
          value={formatDuration(stats.totalStudySeconds)}
          hint={`Today: ${formatDuration(stats.todaySeconds)}`}
        />
        <StatTile
          icon={Trophy}
          label="Quiz accuracy"
          value={stats.quizAccuracy === null ? '—' : `${stats.quizAccuracy}%`}
          hint={stats.quizAnswered ? `${stats.quizCorrect}/${stats.quizAnswered} correct` : 'No quizzes yet'}
        />
        <StatTile
          icon={MessagesSquare}
          label="Interview prep"
          value={interviewPct === null ? '—' : `${interviewPct}%`}
          hint={bank ? `${known}/${bank.questions.length} known${toReview ? ` · ${toReview} to review` : ''}` : 'Loading question bank…'}
        />
      </section>

      {/* Activity + side column */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Study activity</h2>
            <span className="text-xs text-muted tabular-nums">Last 7 days: {weekMinutes} min</span>
          </div>
          <p className="text-xs text-faint">Minutes per day, last 14 days. Counted only while you are active on the page.</p>
          <div className="mt-4">
            <StudyChart data={series} height={260} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Target size={16} className="text-accent" aria-hidden /> Recommended next
            </h2>
            {recommended ? (
              <Link to={paths.lesson(recommended)} className="mt-3 block rounded-lg border border-line p-3 hover:bg-raised">
                <div className="text-sm font-medium">{recommended.title}</div>
                <div className="text-xs text-muted">
                  First lesson whose prerequisites you have completed.
                </div>
                <LessonMeta lesson={recommended} />
              </Link>
            ) : (
              <p className="mt-2 text-sm text-muted">Nothing left — time for mock interviews.</p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <Bookmark size={16} className="text-accent" aria-hidden /> Bookmarks
              </h2>
              {stats.bookmarks > 0 && (
                <Link to={paths.bookmarks} className="text-xs text-muted hover:text-ink">
                  View all ({stats.bookmarks})
                </Link>
              )}
            </div>
            {bookmarks.length ? (
              <ul className="mt-3 space-y-1">
                {bookmarks.map(({ lesson, at }) => (
                  <li key={lesson.id}>
                    <Link to={paths.lesson(lesson)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-raised">
                      <span className="truncate">{lesson.title}</span>
                      <span className="shrink-0 text-xs text-faint">{relativeTime(at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Bookmark a lesson to keep it one click away.</p>
            )}
          </div>
        </div>
      </section>

      {/* Module progress */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Module progress</h2>
          <Link to={paths.modules} className="text-xs text-muted hover:text-ink">
            All modules
          </Link>
        </div>
        {stats.modules.length ? (
          <ul className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {stats.modules.map(({ module: m, done, total, percent }) => {
              const Icon = moduleIcon(m.icon);
              return (
                <li key={m.id}>
                  <Link to={paths.module(m)} className="group block">
                    <div className="flex items-center gap-3">
                      <Icon size={16} className="shrink-0 text-muted group-hover:text-accent" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm group-hover:text-ink">
                        <span className="text-faint tabular-nums">{String(m.number).padStart(2, '0')}</span> {m.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {done}/{total}
                      </span>
                    </div>
                    <ProgressBar value={percent} className="mt-1.5" label={`${m.title} progress`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={BookOpenCheck} title="No modules yet" />
        )}
      </section>
    </div>
  );
}

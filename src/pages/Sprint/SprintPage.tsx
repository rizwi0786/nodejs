import { ArrowRight, BedDouble, Brain, CheckCircle2, Gauge, Play, RotateCcw, Stethoscope, Target, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { useProgress } from '../../context/ProgressContext';
import { SPRINT_MINUTES } from '../../data/sprint/plan';
import { useNow } from '../../hooks/useNow';
import { clockAt, fmtDuration, fmtOffset, kindIcon } from '../../utils/sprint';
import { blockStatus, sprintClock, useSprint, type ResolvedBlock } from '../../hooks/useSprint';
import { paths } from '../../routes/paths';

export default function SprintPage() {
  const blocks = useSprint();
  const { progress, startSprint, resetSprint } = useProgress();
  const now = useNow();
  const startedAt = progress.sprint.startedAt;
  const clock = sprintClock(startedAt, now);

  return (
    <>
      <PageHeader
        title="24-Hour Interview Sprint"
        description="Interview tomorrow? This plan uses every hour well: the must-know concepts, the most-asked questions, a coding round, sleep, a weak-spot review and a mock interview — all from this course."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: '24-Hour Sprint' }]}
        actions={
          startedAt && (
            <button
              className="btn-ghost text-xs"
              onClick={() => {
                if (window.confirm('Restart the sprint? The clock and your ticked notes reset; quiz answers and ratings are kept.')) resetSprint();
              }}
            >
              <RotateCcw size={14} /> Restart
            </button>
          )
        }
      />

      {!blocks ? (
        <div className="py-16 text-center text-sm text-faint">Building your sprint…</div>
      ) : !startedAt ? (
        <Intro blocks={blocks} onStart={startSprint} />
      ) : (
        <Clock blocks={blocks} startedAt={startedAt} elapsedMin={clock!.elapsedMin} />
      )}

      {blocks && <Timeline blocks={blocks} startedAt={startedAt} elapsedMin={clock?.elapsedMin ?? null} />}
    </>
  );
}

function Intro({ blocks, onStart }: { blocks: ResolvedBlock[]; onStart: () => void }) {
  const lessons = new Set(blocks.filter((b) => b.def.kind !== 'final').flatMap((b) => b.lessons.map((l) => l.lesson.id))).size;
  const questions = blocks.reduce((s, b) => s + b.interview.length + b.output.length + b.scenario.length, 0);
  const quiz = blocks.reduce((s, b) => s + b.quiz.length, 0);
  const challenges = blocks.reduce((s, b) => s + b.challenges.length, 0);
  const studyMin = blocks.filter((b) => !['break', 'sleep'].includes(b.def.kind)).reduce((s, b) => s + b.def.duration, 0);
  return (
    <section className="card mb-6 p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <h2 className="font-semibold">How it works</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li className="flex gap-2">
              <Stethoscope size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /> A 20-question diagnostic finds your gaps first.
            </li>
            <li className="flex gap-2">
              <Brain size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /> Study blocks give you a cheat sheet of must-know lessons plus the questions that test them.
            </li>
            <li className="flex gap-2">
              <BedDouble size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /> Seven hours of sleep is part of the plan — it is when memory consolidates.
            </li>
            <li className="flex gap-2">
              <Target size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden /> The morning targets your own mistakes, then a timed mock interview and a printable final sheet.
            </li>
          </ul>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 lg:grid-cols-2">
            <Stat label="study time" value={fmtDuration(studyMin)} />
            <Stat label="core lessons" value={lessons} />
            <Stat label="interview Qs" value={questions} />
            <Stat label="quiz + coding" value={`${quiz} + ${challenges}`} />
          </div>
          <button className="btn-primary" onClick={onStart}>
            <Play size={15} /> Start the 24-hour clock
          </button>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-faint">{label}</div>
    </div>
  );
}

function Clock({ blocks, startedAt, elapsedMin }: { blocks: ResolvedBlock[]; startedAt: string; elapsedMin: number }) {
  const finished = elapsedMin >= SPRINT_MINUTES;
  const current = blocks.find((b) => blockStatus(b.def, elapsedMin) === 'now');
  const done = blocks.reduce((s, b) => s + b.done, 0);
  const total = blocks.reduce((s, b) => s + b.total, 0);
  // On track = items done vs items scheduled in blocks that have already ended.
  const due = blocks.filter((b) => blockStatus(b.def, elapsedMin) === 'past').reduce((s, b) => s + b.total, 0);
  const behind = Math.max(0, due - done);
  const left = current ? current.def.start + current.def.duration - elapsedMin : 0;
  const Icon = current ? kindIcon[current.def.kind] : CheckCircle2;

  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-3">
      <div className="card p-5 lg:col-span-2">
        <div className="section-title flex items-center gap-2">
          <Timer size={14} aria-hidden /> {finished ? 'Sprint complete' : 'Right now'}
        </div>
        {current && !finished ? (
          <Link to={paths.sprintBlock(current.def.id)} className="mt-3 flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4 hover:bg-accent/10">
            <Icon size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{current.def.title}</div>
              <div className="mt-0.5 text-sm text-muted">{current.def.goal.replace(/`/g, '')}</div>
              <div className="mt-2 text-xs text-faint tabular-nums">
                {fmtDuration(Math.max(1, Math.round(left)))} left in this block · {current.done}/{current.total} done
              </div>
            </div>
            <ArrowRight size={18} className="mt-1 shrink-0 text-accent" aria-hidden />
          </Link>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {finished ? 'Your 24 hours are up — good luck in the interview. Everything here stays available for later revision.' : 'Between blocks.'}
          </p>
        )}
      </div>
      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <span className="section-title flex items-center gap-2">
            <Gauge size={14} aria-hidden /> Clock
          </span>
          <span className="text-xs text-faint">started {clockAt(startedAt, 0)}</span>
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
          {fmtOffset(Math.min(elapsedMin, SPRINT_MINUTES))}
          <span className="text-base font-normal text-faint"> / 24:00</span>
        </div>
        <ProgressBar value={(Math.min(elapsedMin, SPRINT_MINUTES) / SPRINT_MINUTES) * 100} className="mt-2" label="Time elapsed" />
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <span className="text-muted">Items done</span>
          <span className="tabular-nums">
            {done}/{total}
          </span>
        </div>
        <div className={`mt-1 text-xs ${behind ? 'text-warn' : 'text-accent'}`}>
          {behind ? `${behind} items behind schedule — skim, don't stall.` : 'On track.'}
        </div>
      </div>
    </section>
  );
}

function Timeline({ blocks, startedAt, elapsedMin }: { blocks: ResolvedBlock[]; startedAt: string | null; elapsedMin: number | null }) {
  return (
    <section>
      <h2 className="section-title mb-3">The plan</h2>
      <ol className="space-y-2">
        {blocks.map((b) => {
          const status = blockStatus(b.def, elapsedMin);
          const Icon = kindIcon[b.def.kind];
          const complete = b.done >= b.total;
          const rest = b.def.kind === 'break' || b.def.kind === 'sleep';
          return (
            <li key={b.def.id}>
              <Link
                to={paths.sprintBlock(b.def.id)}
                className={`card flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/40 ${status === 'now' ? 'border-accent/60' : ''} ${rest ? 'bg-surface/50' : ''}`}
              >
                <div className="w-16 shrink-0 text-xs tabular-nums text-faint sm:w-24">
                  {startedAt ? clockAt(startedAt, b.def.start) : `+${fmtOffset(b.def.start)}`}
                </div>
                <Icon size={17} className={`shrink-0 ${status === 'now' ? 'text-accent' : complete ? 'text-accent/70' : 'text-faint'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className={`truncate font-medium ${rest ? 'text-muted' : ''}`}>{b.def.title}</span>
                    {status === 'now' && <span className="chip border-accent/50 text-accent">Now</span>}
                    {status === 'past' && !complete && !rest && <span className="chip border-warn/40 text-warn">Unfinished</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-faint">
                    {fmtDuration(b.def.duration)}
                    {!rest && b.total > 1 && ` · ${summary(b)}`}
                  </div>
                </div>
                {!rest && (
                  <div className="hidden w-32 shrink-0 sm:block">
                    <ProgressBar value={(b.done / b.total) * 100} label={`${b.def.title} progress`} />
                    <div className="mt-1 text-right text-[11px] text-faint tabular-nums">
                      {b.done}/{b.total}
                    </div>
                  </div>
                )}
                {complete && <CheckCircle2 size={17} className="shrink-0 text-accent" aria-label="Complete" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function summary(b: ResolvedBlock): string {
  const parts: string[] = [];
  if (b.lessons.length && b.def.kind !== 'final') parts.push(`${b.lessons.length} lessons`);
  const qs = b.interview.length + b.output.length + b.scenario.length;
  if (qs) parts.push(`${qs} questions`);
  if (b.quiz.length) parts.push(`${b.quiz.length} quiz`);
  if (b.challenges.length) parts.push(`${b.challenges.length} challenges`);
  return parts.join(' · ');
}

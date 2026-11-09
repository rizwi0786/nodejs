import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Code2, Lightbulb, Printer, Target } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DifficultyBadge } from '../../components/common/Badges';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { RichText } from '../../components/common/RichText';
import { Segmented } from '../../components/common/Segmented';
import { InterviewCard } from '../../components/interview/InterviewCard';
import { MockInterview } from '../../components/interview/MockInterview';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { QuizCard } from '../../components/quizzes/QuizCard';
import { useProgress } from '../../context/ProgressContext';
import { moduleById } from '../../data/modules/curriculum';
import { interviewTactics, sprintPlan } from '../../data/sprint/plan';
import { useInterviewBank } from '../../hooks/useInterviewBank';
import { useQueryParam } from '../../hooks/useQueryParam';
import { blockDoneKey, notesKey, useSprint, type ResolvedBlock, type SprintLesson } from '../../hooks/useSprint';
import { paths } from '../../routes/paths';
import { solvedChallengeIds } from '../../utils/practice';
import { clockAt, fmtDuration, fmtOffset, kindIcon } from '../../utils/sprint';
import NotFoundPage from '../NotFoundPage';

const TABS = ['notes', 'questions', 'output', 'scenarios', 'quiz', 'challenges', 'mock', 'sheet'] as const;
type Tab = (typeof TABS)[number];

export default function SprintBlockPage() {
  const { blockId } = useParams();
  const index = sprintPlan.findIndex((b) => b.id === blockId);
  const blocks = useSprint();
  if (index < 0) return <NotFoundPage />;
  if (!blocks) return <div className="py-16 text-center text-sm text-faint">Building this block…</div>;
  // key: reset the tab state when moving between blocks
  return <BlockView key={blockId} block={blocks[index]} prev={blocks[index - 1]} next={blocks[index + 1]} />;
}

function BlockView({ block: b, prev, next }: { block: ResolvedBlock; prev?: ResolvedBlock; next?: ResolvedBlock }) {
  const { progress, toggleSprintItem } = useProgress();
  const startedAt = progress.sprint.startedAt;
  const Icon = kindIcon[b.def.kind];
  const rest = b.def.kind === 'break' || b.def.kind === 'sleep';

  const available: { value: Tab; label: string; count?: number }[] = [];
  if (b.def.kind === 'final') available.push({ value: 'sheet', label: 'Cheat sheet' });
  else if (b.lessons.length) available.push({ value: 'notes', label: b.def.kind === 'weak' ? 'Weak lessons' : 'Cheat sheet', count: b.lessons.length });
  if (b.quiz.length || b.def.kind === 'diagnostic' || b.def.kind === 'weak')
    available.push({ value: 'quiz', label: b.def.kind === 'diagnostic' ? 'Diagnostic' : b.def.kind === 'weak' ? 'Wrong answers' : 'Quick quiz', count: b.quiz.length });
  if (b.interview.length || b.def.kind === 'weak') available.push({ value: 'questions', label: b.def.kind === 'weak' ? 'Flagged questions' : 'Interview Qs', count: b.interview.length });
  if (b.output.length) available.push({ value: 'output', label: 'Output drills', count: b.output.length });
  if (b.scenario.length) available.push({ value: 'scenarios', label: 'Scenarios', count: b.scenario.length });
  if (b.challenges.length) available.push({ value: 'challenges', label: 'Challenges', count: b.challenges.length });
  if (b.def.kind === 'mock') available.push({ value: 'mock', label: 'Mock interview' });
  // Diagnostic and weak-spot blocks open on their quiz.
  const preferred: Tab = b.def.kind === 'diagnostic' || b.def.kind === 'weak' ? 'quiz' : available[0]?.value ?? 'notes';
  const [tab, setTab] = useQueryParam<Tab>('tab', TABS, preferred);
  const activeTab = available.some((t) => t.value === tab) ? tab : preferred;

  const manualDone = Boolean(progress.sprint.done[blockDoneKey(b.def.id)]);
  const manual = b.total === 1 && (rest || b.def.kind === 'mock' || b.def.kind === 'final' || (b.def.kind === 'weak' && b.quiz.length + b.interview.length + b.lessons.length === 0));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={b.def.title}
        crumbs={[{ label: '24-Hour Sprint', to: paths.sprint }, { label: b.def.title }]}
        meta={
          <>
            <span className="chip">
              <Icon size={12} aria-hidden /> {startedAt ? `${clockAt(startedAt, b.def.start)} – ${clockAt(startedAt, b.def.start + b.def.duration)}` : `Hour ${fmtOffset(b.def.start)}`}
            </span>
            <span className="chip">{fmtDuration(b.def.duration)}</span>
            {!rest && !manual && (
              <span className="chip tabular-nums">
                {b.done}/{b.total} done
              </span>
            )}
          </>
        }
        actions={
          b.def.kind === 'final' && (
            <button className="btn-outline print:hidden" onClick={() => window.print()}>
              <Printer size={15} /> Print
            </button>
          )
        }
      />

      <p className="max-w-prose leading-7 text-ink/90">
        <RichText text={b.def.goal} />
      </p>
      {!rest && !manual && <ProgressBar value={(b.done / b.total) * 100} className="mt-3 max-w-md print:hidden" label="Block progress" />}

      {(b.def.outcomes?.length || b.def.tips.length > 0) && (
        <div className="mt-5 grid gap-3 md:grid-cols-2 print:hidden">
          {b.def.outcomes && (
            <div className="card min-w-0 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Target size={15} className="text-accent" aria-hidden /> By the end you can explain
              </div>
              <ul className="space-y-1.5 text-sm text-muted">
                {b.def.outcomes.map((o) => (
                  <li key={o} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden />
                    <span className="min-w-0">
                      <RichText text={o} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {b.def.tips.length > 0 && (
            <div className="card min-w-0 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Lightbulb size={15} className="text-warn" aria-hidden /> Tips
              </div>
              <ul className="space-y-1.5 text-sm text-muted">
                {b.def.tips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn/70" aria-hidden />
                    <span className="min-w-0">
                      <RichText text={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {available.length > 1 && (
        <div className="mt-6 print:hidden">
          <Segmented label="Block sections" value={activeTab} onChange={setTab} options={available} />
        </div>
      )}

      <div className="mt-5">
        {activeTab === 'notes' && <Notes block={b} />}
        {activeTab === 'quiz' &&
          (b.quiz.length ? (
            <div className="space-y-3">
              {b.quiz.map((q, i) => (
                <QuizCard key={q.id} question={q} index={i} showLesson />
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="No wrong answers to retry">
              Do the diagnostic and study blocks first — anything you get wrong collects here.
            </EmptyState>
          ))}
        {activeTab === 'questions' &&
          (b.interview.length ? (
            <div className="space-y-2">
              {b.interview.map((q, i) => (
                <InterviewCard key={q.id} q={q} index={i} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="Nothing flagged">
              Mark questions “Review later” during the sprint and they appear here.
            </EmptyState>
          ))}
        {activeTab === 'output' && (
          <div className="space-y-2">
            {b.output.map((q, i) => (
              <InterviewCard key={q.id} q={q} index={i} />
            ))}
          </div>
        )}
        {activeTab === 'scenarios' && (
          <div className="space-y-2">
            {b.scenario.map((q, i) => (
              <InterviewCard key={q.id} q={q} index={i} />
            ))}
          </div>
        )}
        {activeTab === 'challenges' && <Challenges block={b} />}
        {activeTab === 'mock' && <Mock onFinish={() => !manualDone && toggleSprintItem(blockDoneKey(b.def.id))} />}
        {activeTab === 'sheet' && <FinalSheet block={b} />}
      </div>

      {manual && (
        <button
          className={`mt-6 print:hidden ${manualDone ? 'btn-outline text-accent' : 'btn-primary'}`}
          onClick={() => toggleSprintItem(blockDoneKey(b.def.id))}
          aria-pressed={manualDone}
        >
          {manualDone ? <CheckCircle2 size={15} /> : <Circle size={15} />} {manualDone ? 'Done' : 'Mark block done'}
        </button>
      )}

      <nav className="mt-10 flex justify-between gap-3 border-t border-line pt-4 text-sm print:hidden" aria-label="Sprint navigation">
        {prev ? (
          <Link to={paths.sprintBlock(prev.def.id)} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-ink">
            <ArrowLeft size={15} className="shrink-0" /> <span className="truncate">{prev.def.title}</span>
          </Link>
        ) : (
          <Link to={paths.sprint} className="flex items-center gap-1.5 text-muted hover:text-ink">
            <ArrowLeft size={15} /> Sprint plan
          </Link>
        )}
        {next && (
          <Link to={paths.sprintBlock(next.def.id)} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-ink">
            <span className="truncate">{next.def.title}</span> <ArrowRight size={15} className="shrink-0" />
          </Link>
        )}
      </nav>
    </div>
  );
}

function NoteCard({ blockId, item, trackable }: { blockId: string; item: SprintLesson; trackable: boolean }) {
  const { progress, toggleSprintItem } = useProgress();
  const key = notesKey(blockId, item.lesson.id);
  const done = Boolean(progress.sprint.done[key]);
  const notes = item.content?.revisionNotes ?? [];
  return (
    <article className={`card min-w-0 p-4 ${done ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link to={paths.lesson(item.lesson)} className="font-medium hover:text-accent">
            {item.lesson.title}
          </Link>
          <span className="ml-2 text-xs text-faint">Module {moduleById.get(item.lesson.moduleId)!.number}</span>
          {item.content?.summary && (
            <p className="mt-1 text-sm text-muted">
              <RichText text={item.content.summary} />
            </p>
          )}
        </div>
        {trackable && (
          <button
            onClick={() => toggleSprintItem(key)}
            className={`btn-outline shrink-0 px-2.5 py-1 text-xs ${done ? 'border-accent/60 text-accent' : ''}`}
            aria-pressed={done}
            title="Mark these notes as reviewed"
          >
            {done ? <CheckCircle2 size={13} /> : <Circle size={13} />} Got it
          </button>
        )}
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {notes.map((n, i) => (
            <li key={i} className="flex gap-2 text-sm leading-6">
              <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden />
              <span className="min-w-0">
                <RichText text={n} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Notes({ block: b }: { block: ResolvedBlock }) {
  if (!b.lessons.length)
    return (
      <EmptyState icon={CheckCircle2} title="No weak lessons yet">
        Lessons where your quiz accuracy is below 60%, or that you flagged “Needs review”, collect here.
      </EmptyState>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Read each card, say the key points out loud, then tick “Got it”. Open the lesson only if a point is unclear.</p>
      {b.lessons.map((item) => (
        <NoteCard key={item.lesson.id} blockId={b.def.id} item={item} trackable />
      ))}
    </div>
  );
}

function Challenges({ block: b }: { block: ResolvedBlock }) {
  const { progress } = useProgress();
  const solved = solvedChallengeIds(progress);
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {b.challenges.map((c, i) => (
        <li key={c.id}>
          <Link to={paths.challenge(c.id)} className="card flex h-full min-w-0 items-start gap-3 p-4 hover:bg-raised/40">
            {solved.has(c.id) ? (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-accent" aria-label="Solved" />
            ) : (
              <Code2 size={17} className="mt-0.5 shrink-0 text-faint" aria-hidden />
            )}
            <div className="min-w-0">
              <div className="font-medium">
                <span className="text-faint tabular-nums">{i + 1}.</span> {c.title}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <DifficultyBadge level={c.difficulty} />
                <span className="chip">{c.topic}</span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Mock({ onFinish }: { onFinish: () => void }) {
  const bank = useInterviewBank();
  if (!bank) return <div className="py-8 text-center text-sm text-faint">Loading…</div>;
  return <MockInterview bank={bank} defaultSize="15" onFinish={onFinish} />;
}

function FinalSheet({ block: b }: { block: ResolvedBlock }) {
  const byModule = new Map<string, SprintLesson[]>();
  for (const l of b.lessons) byModule.set(l.lesson.moduleId, [...(byModule.get(l.lesson.moduleId) ?? []), l]);
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="font-semibold">Interview-day tactics</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {interviewTactics.map((t, i) => (
            <li key={i} className="flex gap-3 leading-6">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-line text-center text-[11px] leading-[1.15rem] text-muted tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">
                <RichText text={t} />
              </span>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-sm text-muted print:hidden">
        Every “must know” concept in the course: the one-line definition and its top three facts. Read it once, top to bottom.
      </p>
      {[...byModule].map(([mid, items]) => {
        const m = moduleById.get(mid)!;
        return (
          <section key={mid} className="break-inside-avoid-page">
            <h2 className="section-title mb-2">
              Module {m.number} · {m.title}
            </h2>
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              {items.map(({ lesson, content }) => (
                <div key={lesson.id} className="break-inside-avoid px-4 py-3">
                  <div className="text-sm">
                    <Link to={paths.lesson(lesson)} className="font-semibold hover:text-accent">
                      {lesson.title}
                    </Link>
                    {content?.summary && (
                      <span className="text-muted">
                        {' — '}
                        <RichText text={content.summary} />
                      </span>
                    )}
                  </div>
                  {content && content.revisionNotes.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {content.revisionNotes.slice(0, 3).map((n, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-6 text-ink/85">
                          <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                          <span className="min-w-0">
                            <RichText text={n} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

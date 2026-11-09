import { BookOpenCheck, Brain, CheckCircle2, Gauge, Hash, ListChecks, MessagesSquare, Sparkles, Target } from 'lucide-react';
import type { ResolvedLessonContent } from '../../data/content';
import { useProgress } from '../../context/ProgressContext';
import type { ContentBlock, Lesson, RevisionStatus, SectionKind } from '../../types';
import { CodeBlock } from '../code/CodeBlock';
import { RichText } from '../common/RichText';
import { sectionTitle } from '../../utils/labels';
import { InterviewCard } from '../interview/InterviewCard';
import { QuizCard } from '../quizzes/QuizCard';
import { BlockRenderer, TableBlock } from './BlockRenderer';

const anchor = (i: number) => `sec-${i}`;

/** Concept card: one-line definition + topics. */
export function ConceptCard({ lesson, content }: { lesson: Lesson; content: ResolvedLessonContent }) {
  return (
    <div className="card mb-6 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-1 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-faint">In one line</div>
          <p className="mt-0.5 leading-7">
            <RichText text={content.summary} />
          </p>
          {content.topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {content.topics.slice(0, 8).map((t) => (
                <span key={t} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <Gauge size={13} aria-hidden /> <span className="capitalize">{lesson.difficulty}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Target size={13} aria-hidden /> Interview weight: <span className="capitalize">{lesson.importance}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <ListChecks size={13} aria-hidden /> {content.quizQuestions.length} practice · {content.interviewQuestions.length} interview Qs
        </span>
      </div>
    </div>
  );
}

function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  if (items.length < 4) return null;
  return (
    <nav aria-label="On this page" className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} onClick={(e) => jump(e, it.id)} className="chip shrink-0 hover:bg-raised hover:text-ink">
          {it.label}
        </a>
      ))}
    </nav>
  );
}

// HashRouter owns the URL hash, so in-page anchors scroll manually.
function jump(e: React.MouseEvent, id: string) {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function H2({ id, icon: Icon, children }: { id: string; icon?: typeof Hash; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-2 mt-10 flex scroll-mt-20 items-center gap-2 text-lg font-semibold tracking-tight first:mt-0">
      {Icon && <Icon size={17} className="text-accent" aria-hidden />}
      {children}
    </h2>
  );
}

const revisionOptions: { value: RevisionStatus; label: string; hint: string }[] = [
  { value: 'new', label: 'Still new', hint: 'Not confident yet' },
  { value: 'review', label: 'Needs review', hint: 'Shows in Revision Center' },
  { value: 'confident', label: 'Confident', hint: 'I can explain it' },
];

export function ConfidencePicker({ lessonId }: { lessonId: string }) {
  const { progress, setRevision } = useProgress();
  const current = progress.revision[lessonId];
  return (
    <div className="card mt-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Brain size={16} className="text-accent" aria-hidden /> How well do you know this?
      </div>
      <div role="radiogroup" aria-label="Confidence" className="flex flex-wrap gap-1.5 sm:ml-auto">
        {revisionOptions.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={current === o.value}
            title={o.hint}
            onClick={() => setRevision(lessonId, o.value)}
            className={`btn-outline px-2.5 py-1 text-xs ${current === o.value ? 'border-accent/60 bg-accent/10 text-accent' : ''}`}
          >
            {current === o.value && <CheckCircle2 size={13} aria-hidden />} {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PracticeAndInterview({ content, startId }: { content: ResolvedLessonContent; startId: number }) {
  return (
    <>
      {content.quizQuestions.length > 0 && (
        <section>
          <H2 id={anchor(startId)} icon={ListChecks}>
            Check yourself
          </H2>
          <p className="mb-3 text-sm text-muted">Answers are saved to your progress and feed the Revision Center.</p>
          <div className="space-y-3">
            {content.quizQuestions.map((q, i) => (
              <QuizCard key={q.id} question={q} index={i} />
            ))}
          </div>
        </section>
      )}
      {content.interviewQuestions.length > 0 && (
        <section>
          <H2 id={anchor(startId + 1)} icon={MessagesSquare}>
            Interview questions
          </H2>
          <p className="mb-3 text-sm text-muted">Answer out loud first, then reveal.</p>
          <div className="space-y-2">
            {content.interviewQuestions.map((q, i) => (
              <InterviewCard key={q.id} q={q} index={i} showLesson={false} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Detailed Learning mode: the full lesson. */
export function LearnView({ lesson, content }: { lesson: Lesson; content: ResolvedLessonContent }) {
  const n = content.sections.length;
  const nav = [
    ...content.sections.map((s, i) => ({ id: anchor(i), label: s.title ?? sectionTitle[s.kind] })),
    ...(content.quizQuestions.length ? [{ id: anchor(n), label: 'Check yourself' }] : []),
    ...(content.interviewQuestions.length ? [{ id: anchor(n + 1), label: 'Interview questions' }] : []),
  ];
  return (
    <>
      <ConceptCard lesson={lesson} content={content} />
      <SectionNav items={nav} />
      <div className="max-w-prose">
        {content.sections.map((s, i) => (
          <section key={i} aria-labelledby={anchor(i)}>
            <H2 id={anchor(i)}>{s.title ?? sectionTitle[s.kind]}</H2>
            {s.blocks.map((b, j) => (
              <BlockRenderer key={j} block={b} />
            ))}
          </section>
        ))}
      </div>
      <PracticeAndInterview content={content} startId={n} />
      <ConfidencePicker lessonId={lesson.id} />
    </>
  );
}

/** Interview & Revision mode: key points, comparisons, tricky outputs, questions. */
export function RevisionView({ lesson, content }: { lesson: Lesson; content: ResolvedLessonContent }) {
  const blocks = content.sections.flatMap((s) => s.blocks.map((b) => ({ kind: s.kind, b })));
  const tables = blocks.filter((x): x is { kind: SectionKind; b: Extract<ContentBlock, { type: 'table' }> } => x.b.type === 'table');
  const outputs = blocks
    .filter((x): x is { kind: SectionKind; b: Extract<ContentBlock, { type: 'code' }> } => x.b.type === 'code' && x.b.example.expectedOutput != null)
    .slice(0, 3);
  const mistakes = content.sections.filter((s) => s.kind === 'mistakes').flatMap((s) => s.blocks).filter((b) => b.type !== 'code');
  const interviewTips = blocks.filter((x) => x.b.type === 'callout' && x.b.variant === 'interview').map((x) => x.b);

  return (
    <>
      <ConceptCard lesson={lesson} content={content} />
      <div className="max-w-prose">
        {content.revisionNotes.length > 0 && (
          <section>
            <H2 id="rev-key" icon={BookOpenCheck}>
              Key points
            </H2>
            <ul className="space-y-1.5">
              {content.revisionNotes.map((n, i) => (
                <li key={i} className="flex gap-2.5 leading-7">
                  <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="min-w-0">
                    <RichText text={n} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {interviewTips.length > 0 && (
          <section>
            <H2 id="rev-focus" icon={Target}>
              What interviewers probe
            </H2>
            {interviewTips.map((b, i) => (
              <BlockRenderer key={i} block={b} />
            ))}
          </section>
        )}
        {tables.length > 0 && (
          <section>
            <H2 id="rev-compare">Comparisons</H2>
            {tables.map((t, i) => (
              <TableBlock key={i} table={t.b.table} />
            ))}
          </section>
        )}
        {outputs.length > 0 && (
          <section>
            <H2 id="rev-output">Code & output</H2>
            {outputs.map((o) => (
              <CodeBlock key={o.b.example.id} example={o.b.example} compact />
            ))}
          </section>
        )}
        {mistakes.length > 0 && (
          <section>
            <H2 id="rev-mistakes">Common mistakes</H2>
            {mistakes.map((b, i) => (
              <BlockRenderer key={i} block={b} />
            ))}
          </section>
        )}
      </div>
      <PracticeAndInterview content={content} startId={100} />
      <ConfidencePicker lessonId={lesson.id} />
    </>
  );
}

export function LessonSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-label="Loading lesson">
      <div className="h-24 rounded-xl bg-raised" />
      <div className="h-4 w-2/3 rounded bg-raised" />
      <div className="h-4 w-full rounded bg-raised" />
      <div className="h-4 w-5/6 rounded bg-raised" />
      <div className="h-40 rounded-xl bg-raised" />
    </div>
  );
}

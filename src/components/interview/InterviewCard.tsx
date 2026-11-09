import { AlertTriangle, Check, ChevronDown, CornerDownRight, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import { lessonById } from '../../data/modules/curriculum';
import { paths } from '../../routes/paths';
import type { InterviewQuestion } from '../../types';
import { CodeBlock } from '../code/CodeBlock';
import { DifficultyBadge } from '../common/Badges';
import { RichText } from '../common/RichText';
import { kindLabel } from '../../utils/labels';

interface Props {
  q: InterviewQuestion;
  index?: number;
  defaultOpen?: boolean;
  showLesson?: boolean;
}

/** Interview question with the answer hidden until revealed; learner can mark it Known / Review. */
export function InterviewCard({ q, index, defaultOpen = false, showLesson = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const { progress, setInterview } = useProgress();
  const status = progress.interviewReviewed[q.id];
  const lesson = q.relatedLessonIds?.map((id) => lessonById.get(id)).find(Boolean);
  // Output questions show their code up-front, with the expected output hidden in the answer.
  const promptCode = q.kind === 'output' && q.code ? { ...q.code, expectedOutput: undefined, explanation: undefined } : null;

  return (
    <article className="card overflow-hidden">
      <button
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-raised/40 sm:px-5"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {index !== undefined && <span className="mt-0.5 text-xs font-medium text-faint tabular-nums">{index + 1}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-6">
            <RichText text={q.question} />
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <DifficultyBadge level={q.difficulty} />
            <span className="chip">{kindLabel[q.kind]}</span>
            <span className="chip">{q.topic}</span>
            {status === 'known' && (
              <span className="chip border-accent/40 text-accent">
                <Check size={12} aria-hidden /> Known
              </span>
            )}
            {status === 'review' && (
              <span className="chip border-warn/40 text-warn">
                <RotateCcw size={12} aria-hidden /> Review
              </span>
            )}
          </span>
        </span>
        <ChevronDown size={18} className={`mt-0.5 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {promptCode && (
        <div className="px-4 sm:px-5">
          <CodeBlock example={promptCode} compact />
        </div>
      )}

      {open && (
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <div className="rounded-lg bg-accent/5 px-3 py-2 text-sm leading-6">
            <span className="mr-1 font-semibold text-accent">Answer:</span>
            <RichText text={q.shortAnswer} />
          </div>
          {q.kind === 'output' && q.code?.expectedOutput != null && (
            <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-code px-4 py-3 font-mono text-[13px] leading-6">
              {q.code.expectedOutput}
            </pre>
          )}
          <ul className="mt-3 space-y-1.5">
            {q.detailedAnswer.map((d, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-6 text-ink/90">
                <span className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden />
                <span className="min-w-0">
                  <RichText text={d} />
                </span>
              </li>
            ))}
          </ul>
          {q.code && q.kind !== 'output' && <CodeBlock example={q.code} compact />}
          {q.followUp && (
            <div className="mt-3 flex gap-2 text-sm text-muted">
              <CornerDownRight size={15} className="mt-0.5 shrink-0 text-info" aria-hidden />
              <span>
                <span className="font-medium text-ink">Follow-up: </span>
                <RichText text={q.followUp} />
              </span>
            </div>
          )}
          {q.trap && (
            <div className="mt-2 flex gap-2 text-sm text-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              <span>
                <span className="font-medium text-ink">Interviewer trap: </span>
                <RichText text={q.trap} />
              </span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-faint">How did you do?</span>
            <button
              className={`btn-outline px-2.5 py-1 text-xs ${status === 'known' ? 'border-accent/60 text-accent' : ''}`}
              onClick={() => setInterview(q.id, status === 'known' ? null : 'known')}
              aria-pressed={status === 'known'}
            >
              <Check size={13} /> I knew it
            </button>
            <button
              className={`btn-outline px-2.5 py-1 text-xs ${status === 'review' ? 'border-warn/60 text-warn' : ''}`}
              onClick={() => setInterview(q.id, status === 'review' ? null : 'review')}
              aria-pressed={status === 'review'}
            >
              <RotateCcw size={13} /> Review later
            </button>
            {showLesson && lesson && (
              <Link to={paths.lesson(lesson)} className="ml-auto text-xs text-muted hover:text-accent">
                Lesson: {lesson.title} →
              </Link>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

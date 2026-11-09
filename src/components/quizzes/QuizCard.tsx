import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import { lessonById } from '../../data/modules/curriculum';
import { paths } from '../../routes/paths';
import type { QuizQuestion } from '../../types';
import { CodeLines } from '../code/CodeBlock';
import { DifficultyBadge } from '../common/Badges';
import { RichText } from '../common/RichText';
import { quizKindLabel } from '../../utils/labels';

const looksLikeCode = (s: string) => /[\n;{}()=]|^\s*[\w.]+\(|=>/.test(s) && s.length < 400;

interface Props {
  question: QuizQuestion;
  index?: number;
  /** Show a link to the lesson the question belongs to. */
  showLesson?: boolean;
  onAnswered?: (correct: boolean) => void;
}

export function QuizCard({ question: q, index, showLesson, onAnswered }: Props) {
  const { recordQuiz } = useProgress();
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = selected === q.answer;
  const lesson = q.lessonId ? lessonById.get(q.lessonId) : undefined;
  const codeOptions = q.kind === 'predict-output' || q.kind === 'complete-code' || q.options.some((o) => o.includes('\n'));

  const submit = () => {
    if (selected === null) return;
    setSubmitted(true);
    recordQuiz(q.id, selected === q.answer);
    onAnswered?.(selected === q.answer);
  };

  return (
    <div className="card min-w-0 p-4 sm:p-5" data-no-shortcuts>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {index !== undefined && <span className="font-medium text-faint tabular-nums">Q{index + 1}</span>}
        <span className="chip">{quizKindLabel[q.kind]}</span>
        <DifficultyBadge level={q.difficulty} />
        {showLesson && lesson && (
          <Link to={paths.lesson(lesson)} className="ml-auto truncate text-muted hover:text-accent">
            {lesson.title}
          </Link>
        )}
      </div>
      <div className="font-medium leading-7">
        <RichText text={q.prompt} />
      </div>
      {q.code && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line bg-code">
          <CodeLines code={q.code} language="javascript" />
        </div>
      )}

      <fieldset className="mt-3 min-w-0 space-y-2" disabled={submitted}>
        <legend className="sr-only">Answer options</legend>
        {q.options.map((opt, i) => {
          const isSel = selected === i;
          const state = submitted ? (i === q.answer ? 'right' : isSel ? 'wrong' : 'idle') : isSel ? 'sel' : 'idle';
          const cls = {
            right: 'border-accent/60 bg-accent/10',
            wrong: 'border-danger/60 bg-danger/10',
            sel: 'border-info/60 bg-info/5',
            idle: 'border-line hover:bg-raised',
          }[state];
          return (
            <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${cls} ${submitted ? 'cursor-default' : ''}`}>
              <input
                type="radio"
                name={q.id}
                className="mt-1 accent-[rgb(var(--accent))]"
                checked={isSel}
                onChange={() => setSelected(i)}
              />
              <span className="min-w-0 flex-1">
                {codeOptions || looksLikeCode(opt) ? (
                  <code className="whitespace-pre-wrap break-words font-mono text-[13px] [overflow-wrap:anywhere]">{opt}</code>
                ) : (
                  <RichText text={opt} />
                )}
              </span>
              {state === 'right' && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" aria-label="Correct answer" />}
              {state === 'wrong' && <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-label="Your answer" />}
            </label>
          );
        })}
      </fieldset>

      {!submitted ? (
        <button className="btn-primary mt-3" onClick={submit} disabled={selected === null}>
          Check answer
        </button>
      ) : (
        <div className={`mt-3 rounded-lg border px-4 py-3 text-sm ${correct ? 'border-accent/40 bg-accent/5' : 'border-danger/40 bg-danger/5'}`} aria-live="polite">
          <div className={`mb-1 font-medium ${correct ? 'text-accent' : 'text-danger'}`}>{correct ? 'Correct' : 'Not quite'}</div>
          <div className="leading-6 text-muted">
            <RichText text={q.explanation} />
          </div>
          <button
            className="btn-ghost mt-2 -ml-2 text-xs"
            onClick={() => {
              setSubmitted(false);
              setSelected(null);
            }}
          >
            <RotateCcw size={13} /> Try again
          </button>
        </div>
      )}
    </div>
  );
}

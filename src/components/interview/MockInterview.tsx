import { ArrowRight, Check, Play, RotateCcw, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import type { InterviewBank } from '../../hooks/useInterviewBank';
import { paths } from '../../routes/paths';
import type { InterviewQuestion } from '../../types';
import { categoryLabel } from '../../utils/labels';
import { shuffled } from '../../utils/practice';
import { Segmented } from '../common/Segmented';
import { ProgressBar } from '../progress/ProgressBar';
import { InterviewCard } from './InterviewCard';

const CATS = ['all', 'javascript', 'nodejs', 'express-backend', 'advanced'] as const;

const MOCK_SIZES = ['5', '10', '15'] as const;
const MOCK_LEVELS = ['mixed', 'beginner', 'intermediate', 'advanced'] as const;

interface Props {
  bank: InterviewBank;
  /** Default number of questions. */
  defaultSize?: (typeof MOCK_SIZES)[number];
  /** Called when the learner finishes a session. */
  onFinish?: () => void;
}

/** Timed mock interview: one question at a time, self-rated. */
export function MockInterview({ bank, defaultSize = '10', onFinish }: Props) {
  const { progress } = useProgress();
  const [cat, setCat] = useState<(typeof CATS)[number]>('all');
  const [size, setSize] = useState<(typeof MOCK_SIZES)[number]>(defaultSize);
  const [level, setLevel] = useState<(typeof MOCK_LEVELS)[number]>('mixed');
  const [session, setSession] = useState<{ questions: InterviewQuestion[]; startedAt: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - session.startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [session]);

  const start = () => {
    const pool = bank.questions.filter((q) => (cat === 'all' || q.category === cat) && (level === 'mixed' || q.difficulty === level));
    // Prefer questions not yet marked known.
    const fresh = pool.filter((q) => progress.interviewReviewed[q.id] !== 'known');
    const source = fresh.length >= Number(size) ? fresh : pool;
    const picked = shuffled(source, Date.now() % 1000003).slice(0, Number(size));
    if (level === 'mixed') picked.sort((a, b) => rank(a) - rank(b)); // warm up → harder
    setSession({ questions: picked, startedAt: Date.now() });
    setIndex(0);
    setElapsed(0);
  };

  if (!session) {
    return (
      <div className="card max-w-2xl p-5">
        <h2 className="font-semibold">Mock interview</h2>
        <p className="mt-1 text-sm text-muted">
          One question at a time, timed. Say your answer out loud (aim for under two minutes), reveal, then rate yourself honestly — your ratings feed
          your readiness score and the Revision Center.
        </p>
        <div className="mt-4 space-y-3">
          <Segmented label="Area" value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c === 'all' ? 'All areas' : categoryLabel[c] }))} />
          <div className="flex flex-wrap gap-2">
            <Segmented label="Questions" value={size} onChange={setSize} options={MOCK_SIZES.map((s) => ({ value: s, label: `${s} questions` }))} />
            <Segmented
              label="Level"
              value={level}
              onChange={setLevel}
              options={MOCK_LEVELS.map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))}
            />
          </div>
        </div>
        <button className="btn-primary mt-5" onClick={start}>
          <Play size={15} /> Start interview
        </button>
      </div>
    );
  }

  const done = index >= session.questions.length;
  const rated = session.questions.map((q) => progress.interviewReviewed[q.id]);
  const known = rated.filter((r) => r === 'known').length;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  if (done) {
    return (
      <div className="card max-w-2xl p-5">
        <h2 className="font-semibold">Interview complete</h2>
        <p className="mt-1 text-sm text-muted">
          You rated <span className="font-medium text-ink">{known}</span> of {session.questions.length} as known in {mm}:{ss}.
        </p>
        <ul className="mt-4 space-y-1.5">
          {session.questions.map((q, i) => (
            <li key={q.id} className="flex items-start gap-2 text-sm">
              {rated[i] === 'known' ? (
                <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-label="Known" />
              ) : (
                <RotateCcw size={15} className="mt-0.5 shrink-0 text-warn" aria-label="Review" />
              )}
              <span className="min-w-0">{q.question}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={start}>
            <RotateCcw size={15} /> New interview
          </button>
          <button className="btn-ghost" onClick={() => setSession(null)}>
            Change settings
          </button>
          <Link to={paths.revision} className="btn-ghost">
            Revision Center <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  const q = session.questions[index];
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="font-medium tabular-nums">
          Question {index + 1} / {session.questions.length}
        </span>
        <ProgressBar value={(index / session.questions.length) * 100} className="max-w-48 flex-1" label="Interview progress" />
        <span className="ml-auto flex items-center gap-1 text-muted tabular-nums">
          <Timer size={14} aria-hidden /> {mm}:{ss}
        </span>
      </div>
      <InterviewCard key={q.id} q={q} />
      <div className="mt-3 flex justify-between">
        <button className="btn-ghost" onClick={() => setSession(null)}>
          End
        </button>
        <button
          className="btn-primary"
          onClick={() => {
            if (index + 1 === session.questions.length) onFinish?.();
            setIndex((i) => i + 1);
          }}
        >
          {index + 1 === session.questions.length ? 'Finish' : 'Next question'} <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

const rank = (q: InterviewQuestion) => ({ beginner: 0, intermediate: 1, advanced: 2 })[q.difficulty];

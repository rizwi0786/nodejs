import { CheckCircle2, Code2, ListChecks, Shuffle, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DifficultyBadge } from '../../components/common/Badges';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { Segmented } from '../../components/common/Segmented';
import { StatTile } from '../../components/common/StatTile';
import { categoryLabel, quizKindLabel } from '../../utils/labels';
import { QuizCard } from '../../components/quizzes/QuizCard';
import { useProgress } from '../../context/ProgressContext';
import { modules } from '../../data/modules/curriculum';
import { useInterviewBank, type InterviewBank } from '../../hooks/useInterviewBank';
import { useQueryParam } from '../../hooks/useQueryParam';
import { paths } from '../../routes/paths';
import type { QuizKind } from '../../types';
import { isChallengeId, latestAttempts, shuffled, solvedChallengeIds } from '../../utils/practice';

const TABS = ['quiz', 'challenges'] as const;
const KINDS = ['all', 'mcq', 'predict-output', 'find-bug', 'complete-code', 'scenario'] as const;
const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'] as const;
const STATUS = ['all', 'unanswered', 'wrong', 'correct'] as const;
const CATS = ['all', 'javascript', 'nodejs', 'express-backend', 'advanced'] as const;
const MODULE_IDS = ['all', ...modules.map((m) => m.id)] as const;
const PAGE = 10;

export default function PracticePage() {
  const [tab, setTab] = useQueryParam('tab', TABS, 'quiz');
  const bank = useInterviewBank();
  const { progress } = useProgress();
  const latest = useMemo(() => latestAttempts(progress), [progress]);
  const solved = useMemo(() => solvedChallengeIds(progress), [progress]);

  const quizAnswered = [...latest.values()].filter((a) => !isChallengeId(a.quizId));
  const quizCorrect = quizAnswered.filter((a) => a.correct).length;

  return (
    <>
      <PageHeader
        title="Coding Practice"
        description="Predict outputs, find bugs, complete code and write real functions — instant feedback, and every answer feeds your Revision Center."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Coding Practice' }]}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ListChecks} label="Questions answered" value={quizAnswered.length} hint={bank ? `of ${bank.quizzes.length}` : undefined} />
        <StatTile
          icon={Trophy}
          label="Accuracy (latest)"
          value={quizAnswered.length ? `${Math.round((quizCorrect / quizAnswered.length) * 100)}%` : '—'}
          hint={`${quizCorrect} correct`}
        />
        <StatTile icon={Code2} label="Challenges solved" value={solved.size} hint={bank ? `of ${bank.challenges.length}` : undefined} />
        <StatTile
          icon={CheckCircle2}
          label="To retry"
          value={quizAnswered.length - quizCorrect}
          hint="Latest answer was wrong"
        />
      </div>

      <div className="mb-4">
        <Segmented
          label="Practice type"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'quiz', label: 'Quiz questions', count: bank?.quizzes.length },
            { value: 'challenges', label: 'Coding challenges', count: bank?.challenges.length },
          ]}
        />
      </div>

      {!bank ? (
        <div className="py-16 text-center text-sm text-faint">Loading practice bank…</div>
      ) : tab === 'quiz' ? (
        <QuizTab bank={bank} />
      ) : (
        <ChallengesTab bank={bank} />
      )}
    </>
  );
}

function QuizTab({ bank }: { bank: InterviewBank }) {
  const { progress } = useProgress();
  const latest = useMemo(() => latestAttempts(progress), [progress]);
  const [kind, setKind] = useQueryParam('kind', KINDS, 'all');
  const [level, setLevel] = useQueryParam('level', LEVELS, 'all');
  const [status, setStatus] = useQueryParam('status', STATUS, 'all');
  const [mod, setMod] = useQueryParam('module', MODULE_IDS, 'all');
  const [seed, setSeed] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  // Freeze the status filter's view of answers while the learner works through the list,
  // so answering a question doesn't make it vanish mid-session.
  const [snapshot, setSnapshot] = useState(() => latest);
  const filterKey = `${kind}|${level}|${status}|${mod}|${seed}`;
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setSnapshot(latest);
    setLimit(PAGE);
  }

  const list = useMemo(() => {
    const filtered = bank.quizzes.filter((q) => {
      if (kind !== 'all' && q.kind !== kind) return false;
      if (level !== 'all' && q.difficulty !== level) return false;
      if (mod !== 'all' && q.moduleId !== mod) return false;
      const a = snapshot.get(q.id);
      if (status === 'unanswered' && a) return false;
      if (status === 'wrong' && (!a || a.correct)) return false;
      if (status === 'correct' && (!a || !a.correct)) return false;
      return true;
    });
    return seed ? shuffled(filtered, seed) : filtered;
  }, [bank.quizzes, kind, level, mod, status, snapshot, seed]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="quiz-module">
            Module
          </label>
          <select
            id="quiz-module"
            value={mod}
            onChange={(e) => setMod(e.target.value as (typeof MODULE_IDS)[number])}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
          >
            <option value="all">All modules</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.number}. {m.title}
              </option>
            ))}
          </select>
          <Segmented
            label="Difficulty"
            value={level}
            onChange={setLevel}
            options={LEVELS.map((l) => ({ value: l, label: l === 'all' ? 'Any level' : l[0].toUpperCase() + l.slice(1) }))}
          />
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unanswered', label: 'Unanswered' },
              { value: 'wrong', label: 'Got wrong' },
              { value: 'correct', label: 'Got right' },
            ]}
          />
          <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => setSeed(Date.now() % 100000)} title="Shuffle the list">
            <Shuffle size={13} /> Shuffle
          </button>
        </div>
        <Segmented
          label="Question kind"
          value={kind}
          onChange={setKind}
          options={KINDS.map((k) => ({ value: k, label: k === 'all' ? 'All kinds' : quizKindLabel[k as QuizKind] }))}
        />
      </div>
      <div className="mb-3 text-xs text-muted tabular-nums">{list.length} questions</div>
      {list.length === 0 ? (
        <EmptyState icon={ListChecks} title="No questions match">
          Try another filter{status === 'wrong' ? ' — or celebrate: nothing to retry!' : '.'}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {list.slice(0, limit).map((q, i) => (
            <QuizCard key={q.id} question={q} index={i} showLesson />
          ))}
          {limit < list.length && (
            <button className="btn-outline mx-auto flex" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, list.length - limit)} more
            </button>
          )}
        </div>
      )}
    </>
  );
}

function ChallengesTab({ bank }: { bank: InterviewBank }) {
  const { progress } = useProgress();
  const solved = useMemo(() => solvedChallengeIds(progress), [progress]);
  const [level, setLevel] = useQueryParam('level', LEVELS, 'all');
  const [cat, setCat] = useQueryParam('cat', CATS, 'all');
  const list = bank.challenges.filter((c) => (level === 'all' || c.difficulty === level) && (cat === 'all' || c.category === cat));

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented
          label="Difficulty"
          value={level}
          onChange={setLevel}
          options={LEVELS.map((l) => ({ value: l, label: l === 'all' ? 'Any level' : l[0].toUpperCase() + l.slice(1) }))}
        />
        <Segmented
          label="Category"
          value={cat}
          onChange={setCat}
          options={CATS.map((c) => ({ value: c, label: c === 'all' ? 'All' : categoryLabel[c] }))}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Code2} title="No challenges match" />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}>
              <Link to={paths.challenge(c.id)} className="card flex h-full items-start gap-3 p-4 hover:bg-raised/40">
                {solved.has(c.id) ? (
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-accent" aria-label="Solved" />
                ) : (
                  <Code2 size={17} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <DifficultyBadge level={c.difficulty} />
                    <span className="chip">{c.topic}</span>
                    <span className="text-faint">{c.tests.length} tests</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

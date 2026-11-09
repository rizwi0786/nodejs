import { Braces, Code2, Cpu, Hexagon, MessagesSquare, Route, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { Segmented } from '../../components/common/Segmented';
import { InterviewCard } from '../../components/interview/InterviewCard';
import { MockInterview } from '../../components/interview/MockInterview';
import { categoryLabel, kindLabel } from '../../utils/labels';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { useProgress } from '../../context/ProgressContext';
import { interviewTargets } from '../../data/questions';
import { useInterviewBank, type InterviewBank } from '../../hooks/useInterviewBank';
import { useQueryParam } from '../../hooks/useQueryParam';
import { paths } from '../../routes/paths';
import type { InterviewCategory } from '../../types';

const TABS = ['browse', 'mock'] as const;
const CATS = ['all', 'javascript', 'nodejs', 'express-backend', 'advanced'] as const;
const KINDS = ['all', 'concept', 'output', 'scenario'] as const;
const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'] as const;
const STATUS = ['all', 'unseen', 'review', 'known'] as const;
const PAGE = 20;

const catIcon: Record<InterviewCategory, typeof Braces> = { javascript: Braces, nodejs: Hexagon, 'express-backend': Route, advanced: Cpu };

export default function InterviewPage() {
  const bank = useInterviewBank();
  const [tab, setTab] = useQueryParam('tab', TABS, 'browse');
  return (
    <>
      <PageHeader
        title="Interview Preparation"
        description="Concise, technically accurate answers with the follow-ups and traps interviewers use. Answer out loud, then reveal and rate yourself."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Interview Preparation' }]}
      />
      {!bank ? (
        <div className="py-16 text-center text-sm text-faint">Loading question bank…</div>
      ) : (
        <>
          <Overview bank={bank} />
          <div className="mb-4 mt-6">
            <Segmented
              label="Mode"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'browse', label: 'Question bank', count: bank.questions.length },
                { value: 'mock', label: 'Mock interview' },
              ]}
            />
          </div>
          {tab === 'browse' ? <Browse bank={bank} /> : <MockInterview bank={bank} />}
        </>
      )}
    </>
  );
}

function Overview({ bank }: { bank: InterviewBank }) {
  const { progress } = useProgress();
  const counts = useMemo(() => {
    const c = { beginner: 0, intermediate: 0, advanced: 0, output: 0, scenario: 0, coding: bank.challenges.length };
    // Difficulty counts span the whole bank; output/scenario are also counted by kind.
    for (const q of bank.questions) {
      c[q.difficulty]++;
      if (q.kind !== 'concept') c[q.kind]++;
    }
    return c;
  }, [bank]);
  const byCat = useMemo(() => {
    const m = new Map<InterviewCategory, { total: number; known: number }>();
    for (const q of bank.questions) {
      const e = m.get(q.category) ?? { total: 0, known: 0 };
      e.total++;
      if (progress.interviewReviewed[q.id] === 'known') e.known++;
      m.set(q.category, e);
    }
    return m;
  }, [bank, progress.interviewReviewed]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="card p-5 lg:col-span-2">
        <h2 className="font-semibold">Your readiness by area</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {(Object.keys(categoryLabel) as InterviewCategory[]).map((c) => {
            const e = byCat.get(c) ?? { total: 0, known: 0 };
            const Icon = catIcon[c];
            const pct = e.total ? Math.round((e.known / e.total) * 100) : 0;
            return (
              <li key={c}>
                <div className="flex items-center gap-2 text-sm">
                  <Icon size={15} className="text-accent" aria-hidden />
                  <span className="flex-1">{categoryLabel[c]}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {e.known}/{e.total}
                  </span>
                </div>
                <ProgressBar value={pct} className="mt-1.5" label={`${categoryLabel[c]} readiness`} />
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold">Bank coverage</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {interviewTargets.map((t) => {
            const n = counts[t.key];
            return (
              <li key={t.key} className="flex items-center justify-between">
                <span className="text-muted">{t.label}</span>
                <span className={`tabular-nums ${n >= t.target ? 'text-accent' : 'text-warn'}`}>
                  {n} <span className="text-faint">/ {t.target}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <Link to={`${paths.practice}?tab=challenges`} className="btn-outline mt-4 w-full justify-center">
          <Code2 size={15} /> Coding challenges
        </Link>
      </section>
    </div>
  );
}

function Browse({ bank }: { bank: InterviewBank }) {
  const { progress } = useProgress();
  const [cat, setCat] = useQueryParam('cat', CATS, 'all');
  const [kind, setKind] = useQueryParam('kind', KINDS, 'all');
  const [level, setLevel] = useQueryParam('level', LEVELS, 'all');
  const [status, setStatus] = useQueryParam('status', STATUS, 'all');
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [cat, kind, level, status, query]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const list = bank.questions.filter((q) => {
    if (cat !== 'all' && q.category !== cat) return false;
    if (kind !== 'all' && q.kind !== kind) return false;
    if (level !== 'all' && q.difficulty !== level) return false;
    const s = progress.interviewReviewed[q.id];
    if (status === 'unseen' && s) return false;
    if ((status === 'known' || status === 'review') && s !== status) return false;
    if (words.length) {
      const hay = `${q.question} ${q.topic} ${q.shortAnswer}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  return (
    <>
      <div className="mb-4 space-y-2">
        <div className="relative max-w-md">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter questions — e.g. “nextTick”, “JWT”, “pool”"
            aria-label="Filter questions"
            className="w-full rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm placeholder:text-faint"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented label="Category" value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c === 'all' ? 'All areas' : categoryLabel[c] }))} />
          <Segmented label="Kind" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: k === 'all' ? 'All kinds' : kindLabel[k] }))} />
        </div>
        <div className="flex flex-wrap gap-2">
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
              { value: 'unseen', label: 'Not rated' },
              { value: 'review', label: 'To review' },
              { value: 'known', label: 'Known' },
            ]}
          />
        </div>
      </div>
      <div className="mb-3 text-xs text-muted tabular-nums">{list.length} questions</div>
      {list.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No questions match these filters" />
      ) : (
        <div className="space-y-2">
          {list.slice(0, limit).map((q, i) => (
            <InterviewCard key={q.id} q={q} index={i} />
          ))}
          {limit < list.length && (
            <button className="btn-outline mx-auto flex" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({list.length - limit} left)
            </button>
          )}
        </div>
      )}
    </>
  );
}

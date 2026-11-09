import { Clock, Layers, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DifficultyBadge } from '../../components/common/Badges';
import { EmptyState } from '../../components/common/EmptyState';
import { Segmented } from '../../components/common/Segmented';
import { useQueryParam } from '../../hooks/useQueryParam';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { useStats } from '../../hooks/useStats';
import { paths } from '../../routes/paths';
import { moduleIcon } from '../../utils/icons';

const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'] as const;
const STATUSES = ['all', 'not-started', 'in-progress', 'completed'] as const;
type Level = (typeof LEVELS)[number];
type Status = (typeof STATUSES)[number];

export default function ModulesPage() {
  const { stats } = useStats();
  const [level, setLevel] = useQueryParam<Level>('level', LEVELS, 'all');
  const [status, setStatus] = useQueryParam<Status>('status', STATUSES, 'all');

  const statusOf = (done: number, total: number): Status =>
    done === 0 ? 'not-started' : done === total ? 'completed' : 'in-progress';
  const visible = stats.modules.filter(
    (s) => (level === 'all' || s.module.difficulty === level) && (status === 'all' || statusOf(s.done, s.total) === status),
  );
  return (
    <>
      <PageHeader
        title="Modules"
        description="Fifteen learning modules in prerequisite order. Projects and interview preparation have their own sections."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Modules' }]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<Level>
          label="Filter by level"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'all', label: 'All levels' },
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
          ]}
        />
        <Segmented<Status>
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'not-started', label: 'Not started' },
            { value: 'in-progress', label: 'In progress' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
      </div>
      {visible.length === 0 && (
        <EmptyState icon={Layers} title="No modules match these filters" />
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map(({ module: m, done, total, percent }) => {
          const Icon = moduleIcon(m.icon);
          const minutes = m.lessons.reduce((s, l) => s + l.estMinutes, 0);
          return (
            <Link key={m.id} to={paths.module(m)} className="card group flex flex-col p-5 transition-colors hover:border-accent/50">
              <div className="flex items-center justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-muted group-hover:text-accent">
                  <Icon size={18} aria-hidden />
                </div>
                <div className="flex items-center gap-2">
                  {m.priority && (
                    <span className="chip border-warn/40 text-warn">
                      <Star size={11} aria-hidden /> High priority
                    </span>
                  )}
                  <DifficultyBadge level={m.difficulty} />
                </div>
              </div>
              <div className="mt-4 text-xs text-faint">Module {m.number}</div>
              <h2 className="font-semibold leading-snug">{m.title}</h2>
              <p className="mt-1.5 flex-1 text-sm text-muted">{m.description}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted tabular-nums">
                <span>
                  {done}/{total} lessons
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} aria-hidden /> ~{Math.round(minutes / 60)}h
                </span>
              </div>
              <ProgressBar value={percent} className="mt-2" label={`${m.title} progress`} />
            </Link>
          );
        })}
      </div>
    </>
  );
}

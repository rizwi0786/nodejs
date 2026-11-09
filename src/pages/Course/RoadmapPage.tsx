import { CheckCircle2, CircleDashed, CircleDot, FolderKanban, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { useStats } from '../../hooks/useStats';
import { paths } from '../../routes/paths';

const stages = [
  { title: 'Foundations', goal: 'Solid JavaScript and a clear mental model of the Node.js runtime.', modules: [1, 2] },
  { title: 'Node.js core', goal: 'Modules, npm, asynchronous execution and data streaming.', modules: [3, 4, 5, 6] },
  { title: 'Building backends', goal: 'HTTP, REST, Express, databases and authentication.', modules: [7, 8, 9, 10] },
  { title: 'Professional skills', goal: 'Internals at scale, security and testing.', modules: [11, 12, 13] },
  { title: 'Production & architecture', goal: 'Deploy, operate and design systems that grow.', modules: [14, 15] },
];

export default function RoadmapPage() {
  const { stats } = useStats();
  const byNumber = new Map(stats.modules.map((s) => [s.module.number, s]));

  return (
    <>
      <PageHeader
        title="Learning Roadmap"
        description="Follow the stages in order — each one builds on the previous. Interview practice runs alongside every stage."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Learning Roadmap' }]}
      />
      <ol className="relative space-y-6 border-l border-line pl-6 sm:pl-8">
        {stages.map((stage, si) => {
          const items = stage.modules.map((n) => byNumber.get(n)!);
          const total = items.reduce((s, x) => s + x.total, 0);
          const done = items.reduce((s, x) => s + x.done, 0);
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <li key={stage.title} className="relative">
              <span
                className={`absolute -left-[33px] top-1 grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold sm:-left-[41px] ${
                  pct === 100 ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
                }`}
              >
                {si + 1}
              </span>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{stage.title}</h2>
                <span className="text-xs text-muted tabular-nums">{pct}%</span>
              </div>
              <p className="text-sm text-muted">{stage.goal}</p>
              <ProgressBar value={pct} className="mt-2 max-w-md" label={`${stage.title} progress`} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {items.map(({ module: m, done: d, total: t }) => {
                  const Icon = d === t ? CheckCircle2 : d > 0 ? CircleDot : CircleDashed;
                  return (
                    <Link key={m.id} to={paths.module(m)} className="card flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-raised">
                      <Icon size={16} className={d > 0 ? 'text-accent' : 'text-faint'} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="text-faint">{m.number}.</span> {m.title}
                      </span>
                      <span className="text-xs text-faint tabular-nums">
                        {d}/{t}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </li>
          );
        })}
        <li className="relative">
          <span className="absolute -left-[33px] top-1 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-[11px] font-semibold text-muted sm:-left-[41px]">
            6
          </span>
          <h2 className="font-semibold">Prove it</h2>
          <p className="text-sm text-muted">Build the portfolio projects and run full mock interviews.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link to={paths.projects} className="card flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-raised">
              <FolderKanban size={16} className="text-faint" /> 16. Real-World Projects
            </Link>
            <Link to={paths.interview} className="card flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-raised">
              <MessagesSquare size={16} className="text-faint" /> 17. Interview Preparation
            </Link>
          </div>
        </li>
      </ol>
    </>
  );
}

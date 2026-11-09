import { DifficultyBadge } from '../../components/common/Badges';
import { PageHeader } from '../../components/common/PageHeader';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { projects } from '../../data/projects';
import { paths } from '../../routes/paths';
import type { Difficulty } from '../../types';

const levels: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Twelve projects, each with requirements, architecture, database design, endpoints, tests, security and deployment."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Projects' }]}
      />
      <div className="space-y-6">
        {levels.map((lvl) => (
          <section key={lvl}>
            <h2 className="section-title mb-3 capitalize">{lvl}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects
                .filter((p) => p.level === lvl)
                .map((p) => (
                  <Link key={p.id} to={paths.project(p.id)} className="card flex flex-col p-4 transition-colors hover:bg-raised/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-faint tabular-nums">Project {p.number}</span>
                      <DifficultyBadge level={p.level} />
                    </div>
                    <div className="mt-2 font-medium">{p.title}</div>
                    <p className="mt-1 flex-1 text-sm text-muted">{p.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.skills.map((s) => (
                        <span key={s} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                          {s}
                        </span>
                      ))}
                    </div>
                    {p.estHours && (
                      <div className="mt-3 flex items-center gap-1 text-xs text-faint">
                        <Clock size={12} aria-hidden /> ~{p.estHours} hours · {p.steps?.length ?? 0} steps
                      </div>
                    )}
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

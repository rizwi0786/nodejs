import { ArrowLeft, ArrowRight, Clock, Database, FolderTree, ListChecks, Lock, Network, Rocket, Route, Sparkles, TestTube2, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CodeBlock } from '../../components/code/CodeBlock';
import { DifficultyBadge } from '../../components/common/Badges';
import { PageHeader } from '../../components/common/PageHeader';
import { RichText } from '../../components/common/RichText';
import { DiagramBlock, FlowChart, TableBlock } from '../../components/lessons/BlockRenderer';
import { useProgress } from '../../context/ProgressContext';
import { lessonById } from '../../data/modules/curriculum';
import { projects } from '../../data/projects';
import { paths } from '../../routes/paths';
import NotFoundPage from '../NotFoundPage';

const methodStyle: Record<string, string> = {
  GET: 'text-info border-info/40',
  POST: 'text-accent border-accent/40',
  PUT: 'text-warn border-warn/40',
  PATCH: 'text-warn border-warn/40',
  DELETE: 'text-danger border-danger/40',
  WS: 'text-muted border-line',
  CLI: 'text-muted border-line',
};

function Section({ id, icon: Icon, title, children }: { id: string; icon: typeof Wrench; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 mt-10 flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Icon size={17} className="text-accent" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 leading-7 text-ink/90">
          <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden />
          <span className="min-w-0">
            <RichText text={t} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ProjectPage() {
  const { id } = useParams();
  const { progress } = useProgress();
  const i = projects.findIndex((p) => p.id === id);
  if (i < 0) return <NotFoundPage />;
  const p = projects[i];
  const prev = projects[i - 1];
  const next = projects[i + 1];
  const prereqs = (p.prerequisites ?? []).map((pid) => lessonById.get(pid)).filter((l) => l !== undefined);

  const toc = [
    p.requirements && ['req', 'Requirements'],
    p.architecture && ['arch', 'Architecture'],
    p.folderStructure && ['folders', 'Folder structure'],
    p.databaseDesign?.length && ['db', 'Data design'],
    p.endpoints?.length && ['api', 'API'],
    p.steps?.length && ['steps', 'Implementation'],
    p.testing && ['test', 'Testing'],
    p.security?.length && ['sec', 'Security'],
    p.deployment && ['deploy', 'Deployment'],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={p.title}
        description={p.summary}
        crumbs={[{ label: 'Projects', to: paths.projects }, { label: `Project ${p.number}` }]}
        meta={
          <>
            <DifficultyBadge level={p.level} />
            {p.estHours && (
              <span className="chip">
                <Clock size={12} aria-hidden /> ~{p.estHours} h
              </span>
            )}
            {p.skills.map((s) => (
              <span key={s} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {s}
              </span>
            ))}
          </>
        }
      />

      {toc.length > 3 && (
        <nav aria-label="Project sections" className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {toc.map(([tid, label]) => (
            <a
              key={tid}
              href={`#${tid}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(tid)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="chip shrink-0 hover:bg-raised hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>
      )}

      {prereqs.length > 0 && (
        <div className="card mt-4 p-4">
          <div className="mb-2 text-sm font-medium">Finish these lessons first</div>
          <div className="flex flex-wrap gap-1.5">
            {prereqs.map((l) => (
              <Link
                key={l!.id}
                to={paths.lesson(l!)}
                className={`chip hover:bg-raised ${progress.completedLessons[l!.id] ? 'border-accent/40 text-accent' : ''}`}
              >
                {progress.completedLessons[l!.id] ? '✓ ' : ''}
                {l!.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {p.status !== 'ready' && <div className="card mt-6 p-5 text-sm text-muted">The full walkthrough for this project is being written.</div>}

      {p.requirements && (
        <Section id="req" icon={ListChecks} title="Requirements">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card min-w-0 break-words p-4 [overflow-wrap:anywhere]">
              <div className="mb-2 text-sm font-medium">Functional</div>
              <Bullets items={p.requirements.functional} />
            </div>
            <div className="card min-w-0 break-words p-4 [overflow-wrap:anywhere]">
              <div className="mb-2 text-sm font-medium">Non-functional</div>
              <Bullets items={p.requirements.nonFunctional} />
            </div>
          </div>
        </Section>
      )}

      {p.architecture && (
        <Section id="arch" icon={Network} title="Architecture">
          {p.architecture.diagramId && <DiagramBlock id={p.architecture.diagramId} />}
          {p.architecture.flow && <FlowChart steps={p.architecture.flow} title="Request path" direction="vertical" />}
          {p.architecture.notes && <Bullets items={p.architecture.notes} />}
        </Section>
      )}

      {p.folderStructure && (
        <Section id="folders" icon={FolderTree} title="Folder structure">
          <pre className="overflow-x-auto rounded-xl border border-line bg-code px-4 py-3 font-mono text-[13px] leading-6">{p.folderStructure}</pre>
        </Section>
      )}

      {p.databaseDesign && p.databaseDesign.length > 0 && (
        <Section id="db" icon={Database} title="Data design">
          {p.databaseDesign.map((t, k) => (
            <TableBlock key={k} table={t} />
          ))}
        </Section>
      )}

      {p.endpoints && p.endpoints.length > 0 && (
        <Section id="api" icon={Route} title={p.endpoints.every((e) => e.method === 'CLI') ? 'Commands' : 'API endpoints'}>
          <div className="overflow-hidden rounded-xl border border-line">
            <ul className="divide-y divide-line">
              {p.endpoints.map((e, k) => (
                <li key={k} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`chip w-16 justify-center font-mono ${methodStyle[e.method] ?? ''}`}>{e.method}</span>
                    <code className="font-mono text-[13px] text-ink">{e.path}</code>
                  </div>
                  <span className="text-sm text-muted sm:ml-auto sm:text-right">
                    <RichText text={e.description} />
                    {e.auth && <span className="ml-2 text-xs text-faint">({e.auth})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {p.steps && p.steps.length > 0 && (
        <Section id="steps" icon={Wrench} title="Implementation steps">
          <ol className="space-y-6">
            {p.steps.map((s, k) => (
              <li key={k}>
                <div className="flex items-baseline gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent tabular-nums">
                    {k + 1}
                  </span>
                  <h3 className="font-medium">{s.title}</h3>
                </div>
                <div className="ml-9">
                  {s.text && (
                    <p className="mt-1 leading-7 text-ink/90">
                      <RichText text={s.text} />
                    </p>
                  )}
                  {s.bullets && (
                    <div className="mt-1">
                      <Bullets items={s.bullets} />
                    </div>
                  )}
                  {s.code && <CodeBlock example={s.code} />}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {p.testing && (
        <Section id="test" icon={TestTube2} title="Testing">
          <Bullets items={p.testing.bullets} />
          {p.testing.code && <CodeBlock example={p.testing.code} />}
        </Section>
      )}

      {p.security && p.security.length > 0 && (
        <Section id="sec" icon={Lock} title="Security considerations">
          <Bullets items={p.security} />
        </Section>
      )}

      {p.deployment && (
        <Section id="deploy" icon={Rocket} title="Deployment">
          <Bullets items={p.deployment.bullets} />
          {p.deployment.code && <CodeBlock example={p.deployment.code} />}
        </Section>
      )}

      {p.extensions && p.extensions.length > 0 && (
        <Section id="ext" icon={Sparkles} title="Stretch goals">
          <Bullets items={p.extensions} />
        </Section>
      )}

      <nav className="mt-10 flex justify-between gap-3 border-t border-line pt-4 text-sm" aria-label="Project navigation">
        {prev ? (
          <Link to={paths.project(prev.id)} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-ink">
            <ArrowLeft size={15} className="shrink-0" /> <span className="truncate">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={paths.project(next.id)} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-ink">
            <span className="truncate">{next.title}</span> <ArrowRight size={15} className="shrink-0" />
          </Link>
        )}
      </nav>
    </div>
  );
}

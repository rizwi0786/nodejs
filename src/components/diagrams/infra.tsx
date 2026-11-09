import { CheckCircle2, Container, Database, GitBranch, Globe, Laptop, Radio, Rocket, Server, ShieldCheck, Smartphone } from 'lucide-react';
import { Arrow, Box, Frame, Spotlight, Tag, Travel } from './primitives';
import { cx } from './tokens';

/* ================================================================================================ */
/* reverse-proxy                                                                                     */
/* ================================================================================================ */

export function ReverseProxy() {
  return (
    <Frame label="Reverse proxy in front of Node. Clients connect over HTTPS on port 443 to Nginx. Nginx terminates TLS, serves static files, compresses responses, applies rate limits and load-balances requests over plain HTTP on a private network to three Node.js instances on ports 3001, 3002 and 3003. It adds X-Forwarded-For and X-Forwarded-Proto headers so the app, configured with trust proxy, knows the real client IP and protocol. Unhealthy upstreams are taken out of rotation.">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex flex-row gap-1.5 md:w-28 md:flex-col">
          <Box className="flex-1" icon={<Laptop size={14} />} title="Browser" />
          <Box className="flex-1" icon={<Smartphone size={14} />} title="Mobile" />
        </div>
        <div className="relative flex shrink-0 items-center justify-center md:w-16">
          <Arrow label="HTTPS :443" tone="accent" />
        </div>
        <Box tone="accent" icon={<ShieldCheck size={14} />} className="md:w-52" title="Nginx (reverse proxy)">
          <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted">
            <li>• TLS termination (certificates)</li>
            <li>• load balancing (round-robin / least_conn)</li>
            <li>• static files, gzip/brotli, caching</li>
            <li>• rate limiting, request size limits</li>
            <li>• adds X-Forwarded-For / -Proto</li>
          </ul>
        </Box>
        <div className="relative flex shrink-0 items-center justify-center md:w-16">
          <Arrow label="HTTP (private)" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {[3001, 3002, 3003].map((port, i) => (
            <div key={port} className="relative">
              <Box tone={i === 2 ? 'muted' : 'neutral'} icon={<Server size={14} />} title={<span>Node.js <span className="font-mono text-xs text-muted">:{port}</span></span>} sub={i === 2 ? 'failing health check → removed from upstream' : 'app.set(\'trust proxy\', 1)'} />
              {i < 2 && <Spotlight index={i} count={2} period={3} />}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-muted">
        Node never sees TLS or public traffic directly; it binds to localhost/private IPs. The same role is played by cloud load balancers, Caddy, HAProxy or a Kubernetes ingress.
      </p>
    </Frame>
  );
}

/* ================================================================================================ */
/* ci-cd-pipeline                                                                                    */
/* ================================================================================================ */

const STAGES = [
  { name: 'Push / PR', sub: 'git push, pull request', icon: <GitBranch size={14} />, group: 'trigger' },
  { name: 'Install', sub: 'npm ci (lockfile, cached)', group: 'CI' },
  { name: 'Lint + typecheck', sub: 'eslint · tsc --noEmit', group: 'CI' },
  { name: 'Test', sub: 'unit + integration (DB in service container), coverage', group: 'CI' },
  { name: 'Build image', sub: 'docker build · tag :<git-sha>', icon: <Container size={14} />, group: 'CD' },
  { name: 'Push to registry', sub: 'GHCR / ECR / Docker Hub', group: 'CD' },
  { name: 'Deploy staging', sub: 'migrations · smoke tests', group: 'CD' },
  { name: 'Deploy production', sub: 'manual approval · rolling / blue-green · health checks', icon: <Rocket size={14} />, group: 'CD' },
];

export function CiCdPipeline() {
  const period = 12;
  return (
    <Frame label="CI/CD pipeline for a Node.js service. A push or pull request triggers continuous integration: npm ci installs exact dependencies, then lint and type checks run, then unit and integration tests. If they pass on the main branch, continuous delivery builds a Docker image tagged with the commit SHA, pushes it to a container registry, deploys it to staging with migrations and smoke tests, and after approval deploys to production with a rolling or blue-green rollout and health checks. Any failing stage stops the pipeline; a failed health check rolls back to the previous image.">
      <ol className="grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2 md:grid-cols-4">
        {STAGES.map((s, i) => (
          <li key={s.name} className="relative">
            <div
              className={cx(
                'relative h-full rounded-lg border px-2.5 py-2',
                s.group === 'trigger' ? 'border-line bg-raised' : s.group === 'CI' ? 'border-info/50 bg-info/5' : 'border-accent/50 bg-accent/5',
              )}
            >
              <Spotlight index={i} count={STAGES.length} period={period} tone={s.group === 'CI' ? 'info' : 'accent'} />
              <div className="relative flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-faint">{i + 1}</span>
                {s.icon ? <span className="text-muted">{s.icon}</span> : <CheckCircle2 size={13} className={s.group === 'CI' ? 'text-info' : 'text-accent'} aria-hidden />}
                <span className="text-sm font-semibold">{s.name}</span>
              </div>
              <div className="relative mt-0.5 text-[11px] leading-snug text-muted">{s.sub}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <Tag tone="info">CI: every push</Tag>
        <Tag tone="accent">CD: main branch only</Tag>
        <span>Any red stage stops the pipeline · failed health check → roll back to the previous image tag.</span>
      </div>
    </Frame>
  );
}

/* ================================================================================================ */
/* microservices                                                                                     */
/* ================================================================================================ */

const SERVICES = [
  { name: 'Users', db: 'PostgreSQL', role: 'auth, profiles' },
  { name: 'Orders', db: 'PostgreSQL', role: 'publishes order.created' },
  { name: 'Payments', db: 'PostgreSQL', role: 'subscribes, publishes payment.succeeded' },
  { name: 'Notifications', db: 'MongoDB', role: 'subscribes → email / push' },
];

export function Microservices() {
  return (
    <Frame label="Microservices architecture. Web and mobile clients call a single API gateway, which handles authentication, routing, rate limiting and aggregation. The gateway forwards synchronous REST or gRPC calls to independent services: Users, Orders, Payments and Notifications. Each service owns its own database, which no other service queries directly. For asynchronous work, services publish and subscribe to events through a message broker such as Kafka or RabbitMQ: Orders publishes order.created, Payments and Notifications consume it.">
      <div className="flex flex-col items-stretch gap-1.5">
        <div className="flex justify-center gap-1.5">
          <Box icon={<Globe size={14} />} title="Web" className="w-28 text-center" />
          <Box icon={<Smartphone size={14} />} title="Mobile" className="w-28 text-center" />
        </div>
        <Arrow dir="down" />
        <Box tone="accent" icon={<ShieldCheck size={14} />} title="API Gateway" sub="auth (JWT) · routing · rate limiting · aggregation" className="mx-auto w-full max-w-md" />
        <div className="flex items-center justify-center gap-2 text-[10px] text-muted">
          <Arrow dir="down" />
          <span className="font-mono">REST / gRPC (sync)</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          {SERVICES.map((s) => (
            <div key={s.name} className="flex min-w-0 flex-col gap-1">
              <Box tone="info" title={s.name} sub={s.role} className="flex-1" />
              <div className="flex items-center gap-1 rounded-md border border-dashed border-line bg-raised/60 px-2 py-1 text-[10px] text-muted">
                <Database size={12} aria-hidden className="shrink-0" /> {s.db}
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-1 overflow-hidden rounded-lg border border-warn/50 bg-warn/10 px-3 py-2">
          <div className="relative flex flex-wrap items-center gap-2">
            <Radio size={14} className="text-warn" aria-hidden />
            <span className="text-sm font-semibold">Message broker</span>
            <span className="text-[11px] text-muted">Kafka / RabbitMQ / NATS — async events</span>
          </div>
          <div className="relative mt-1.5 h-2">
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-warn/50" />
            <Travel tone="warn" duration={3.5} />
            <Travel tone="warn" duration={3.5} delay={1.75} />
          </div>
          <div className="relative mt-1 flex flex-wrap gap-1">
            <Tag tone="warn">order.created</Tag>
            <Tag tone="warn">payment.succeeded</Tag>
            <Tag>user.registered</Tag>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-muted">
        Database-per-service: no shared tables — data is exchanged through APIs or events. Each service deploys and scales independently; tracing (correlation IDs) ties a request together across services.
      </p>
    </Frame>
  );
}

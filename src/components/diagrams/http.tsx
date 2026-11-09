import { Globe, Laptop, Server } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Arrow, Box, FlowRow, Frame, Label, Legend, Sequence, Travel } from './primitives';
import { cx } from './tokens';

/* ================================================================================================ */
/* request-response                                                                                  */
/* ================================================================================================ */

export function RequestResponse() {
  return (
    <Frame label="Lifecycle of an HTTPS request. The client asks a DNS resolver for the server's IP address. It then opens a TCP connection with a three-way handshake (SYN, SYN-ACK, ACK) and performs a TLS handshake (ClientHello, ServerHello with certificate, key exchange). The client sends the HTTP request, for example GET /users/42. On the server, Node's http module parses it and emits a request event; middleware and the route handler run, possibly querying a database asynchronously, then the server writes the response: status 200, headers and a JSON body. The connection can be kept alive for further requests.">
      <Sequence
        lanes={[
          { name: 'Client', sub: 'browser / app', icon: <Laptop size={14} /> },
          { name: 'DNS', sub: 'resolver', icon: <Globe size={14} />, tone: 'muted' },
          { name: 'Node server', sub: 'http.createServer', icon: <Server size={14} />, tone: 'accent' },
        ]}
        items={[
          { kind: 'msg', from: 0, to: 1, label: 'resolve api.example.com', tone: 'neutral' },
          { kind: 'msg', from: 1, to: 0, label: '93.184.216.34', dashed: true },
          { kind: 'divider', text: 'TCP 3-way handshake' },
          { kind: 'msg', from: 0, to: 2, label: 'SYN', tone: 'info' },
          { kind: 'msg', from: 2, to: 0, label: 'SYN-ACK', tone: 'info', dashed: true },
          { kind: 'msg', from: 0, to: 2, label: 'ACK', tone: 'info' },
          { kind: 'divider', text: 'TLS handshake (HTTPS)' },
          { kind: 'msg', from: 0, to: 2, label: 'ClientHello', tone: 'warn' },
          { kind: 'msg', from: 2, to: 0, label: 'ServerHello + certificate', tone: 'warn', dashed: true },
          { kind: 'msg', from: 0, to: 2, label: 'key exchange · Finished', tone: 'warn' },
          { kind: 'divider', text: 'HTTP' },
          { kind: 'msg', from: 0, to: 2, label: 'GET /users/42', detail: 'Host, Accept, Authorization', tone: 'accent', animate: true },
          {
            kind: 'note',
            lane: 2,
            tone: 'accent',
            text: (
              <>
                parse → <span className="font-mono">'request'</span> event → middleware → handler → await db
              </>
            ),
          },
          { kind: 'msg', from: 2, to: 0, label: '200 OK', detail: 'Content-Type: application/json', tone: 'accent', dashed: true, animate: true },
          { kind: 'note', lane: 0, span: 3, text: 'Connection: keep-alive — the TCP/TLS connection is reused for the next request' },
        ]}
      />
    </Frame>
  );
}

/* ================================================================================================ */
/* middleware-pipeline                                                                               */
/* ================================================================================================ */

const MW = [
  { name: 'express.json()', sub: 'parse body → req.body' },
  { name: 'cors()', sub: 'set CORS headers' },
  { name: 'auth', sub: 'verify token → req.user', branch: '401 if invalid' },
  { name: 'GET /users/:id', sub: 'route handler', route: true },
];

export function MiddlewarePipeline() {
  return (
    <Frame label="Express middleware pipeline. A request passes through middleware in the order they were registered: express.json parses the body, cors sets headers, auth verifies the token and may end the request early with 401, and finally the route handler sends the response. Each middleware calls next() to pass control on. If any middleware calls next(err) or throws, Express skips the remaining normal middleware and jumps to the error-handling middleware, which has four arguments (err, req, res, next) and sends an error response.">
      <FlowRow bp="lg">
        <Box tone="muted" title="req" className="lg:w-14 lg:text-center" mono />
        {MW.map((m) => (
          <div key={m.name} className="contents">
            <Arrow bp="lg" label="next()" />
            <div className="relative min-w-0 flex-1">
              <Box tone={m.route ? 'accent' : 'neutral'} title={m.name} sub={m.sub} mono />
              {m.branch && (
                <div className="mt-1 text-center font-mono text-[10px] text-warn lg:absolute lg:inset-x-0 lg:top-full">↳ res.status(401) ends early</div>
              )}
            </div>
          </div>
        ))}
        <Arrow bp="lg" label="res.json()" tone="accent" />
        <Box tone="accent" title="res" className="lg:w-14 lg:text-center" mono />
      </FlowRow>
      <div className="mt-4 lg:mt-8">
        <div className="flex items-center gap-2 text-[11px] text-danger">
          <span className="h-px flex-1 border-t border-dashed border-danger/60" />
          <span className="font-mono">next(err) / throw — skips remaining middleware</span>
          <span className="h-px flex-1 border-t border-dashed border-danger/60" />
        </div>
        <div className="mt-2 flex flex-col gap-1.5 md:flex-row md:items-center">
          <Box tone="danger" className="flex-1" mono title="(err, req, res, next) => { … }" sub="Error-handling middleware — registered last, has 4 parameters" />
          <Arrow label="res.status(500)" tone="danger" />
          <Box tone="danger" title="error response" className="md:w-36" />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Order of <span className="font-mono">app.use()</span> = order of execution. A middleware must either call <span className="font-mono">next()</span> or end the response — otherwise the request hangs.
        Express 5 forwards rejected promises from async handlers to the error handler automatically.
      </p>
    </Frame>
  );
}

/* ================================================================================================ */
/* layered-architecture                                                                              */
/* ================================================================================================ */

const LAYERS = [
  { name: 'Route', file: 'routes/users.routes.js', does: 'Maps HTTP method + path to a controller; attaches middleware', tone: 'neutral' as const },
  { name: 'Controller', file: 'controllers/users.controller.js', does: 'Reads req, validates input, calls service, maps result/errors to HTTP status', tone: 'info' as const },
  { name: 'Service', file: 'services/users.service.js', does: 'Business rules & transactions — no req/res, framework-agnostic, unit-testable', tone: 'accent' as const },
  { name: 'Repository', file: 'repositories/users.repo.js', does: 'Data access only: SQL / ORM queries, maps rows to domain objects', tone: 'warn' as const },
  { name: 'Database', file: 'PostgreSQL · MongoDB', does: 'Persistent storage', tone: 'muted' as const },
];

export function LayeredArchitecture() {
  return (
    <Frame label="Layered architecture for a Node.js API. A request flows down through five layers: the route maps a URL to a controller; the controller handles HTTP concerns such as validation and status codes; the service holds business rules and knows nothing about HTTP; the repository performs database queries; and the database stores the data. Results flow back up. Each layer depends only on the layer below it.">
      <div className="flex gap-2 sm:gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {LAYERS.map((l, i) => (
            <div key={l.name}>
              <Box tone={l.tone}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm font-semibold">{l.name}</span>
                  <span className="font-mono text-[10px] text-faint">{l.file}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">{l.does}</div>
              </Box>
              {i < LAYERS.length - 1 && (
                <div aria-hidden className="flex justify-center py-0.5 text-faint">
                  <Arrow dir="down" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div aria-hidden className="flex w-6 shrink-0 flex-col items-center gap-1 sm:w-8">
          <span className="text-[10px] font-medium text-accent [writing-mode:vertical-rl]">request ↓</span>
          <div className="relative w-px flex-1 bg-line">
            <span
              className="absolute -left-1 h-2 w-2 rounded-full bg-accent"
              style={{ animation: 'dg-travel-y 4s linear infinite', opacity: 0 } as CSSProperties}
            />
          </div>
          <span className="text-[10px] font-medium text-info [writing-mode:vertical-rl]">↑ response</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">Dependencies point downward only. Swapping Express for Fastify touches routes/controllers; swapping the database touches repositories.</p>
    </Frame>
  );
}

/* ================================================================================================ */
/* stream-pipeline                                                                                   */
/* ================================================================================================ */

function BufferBar({ fill, tone, label }: { fill: number; tone: string; label: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-faint">
        <span>internal buffer</span>
        <span>{label}</span>
      </div>
      <div className="relative mt-0.5 h-2 overflow-hidden rounded-full bg-raised">
        <div className={cx('h-full rounded-full', tone)} style={{ width: `${fill}%` }} />
        <div className="absolute inset-y-0 left-[80%] w-px bg-ink/40" title="highWaterMark" />
      </div>
    </div>
  );
}

function Pipe() {
  return (
    <div aria-hidden className="relative flex h-8 w-full shrink-0 items-center justify-center md:h-auto md:w-12 md:self-stretch">
      <div className="h-full w-px bg-line md:h-px md:w-full" />
      <div className="absolute inset-0 hidden md:block">
        <Travel tone="info" duration={1.6} />
        <Travel tone="info" duration={1.6} delay={0.8} />
      </div>
      <span className="absolute font-mono text-[10px] text-muted md:-top-0.5 md:left-1/2 md:-translate-x-1/2">chunks</span>
    </div>
  );
}

export function StreamPipeline() {
  return (
    <Frame label="Stream pipeline: a readable file stream reads 64 KiB chunks into its internal buffer, pipes them through a gzip transform stream, and into a writable file stream. Each stream has a buffer limit called highWaterMark. When the writable's buffer is full, write() returns false and the readable pauses — this is backpressure. When the writable drains, it emits 'drain' and the flow resumes. stream.pipeline() wires this up and destroys all streams if any one errors.">
      <FlowRow className="md:items-stretch">
        <Box tone="info" className="md:flex-1" title="Readable" sub={<span className="font-mono">fs.createReadStream()</span>}>
          <div className="mt-1 text-[11px] text-muted">reads 64 KiB chunks from disk</div>
          <BufferBar fill={45} tone="bg-info/70" label="45%" />
        </Box>
        <Pipe />
        <Box tone="warn" className="md:flex-1" title="Transform" sub={<span className="font-mono">zlib.createGzip()</span>}>
          <div className="mt-1 text-[11px] text-muted">readable + writable: compresses each chunk</div>
          <BufferBar fill={70} tone="bg-warn/70" label="70%" />
        </Box>
        <Pipe />
        <Box tone="accent" className="md:flex-1" title="Writable" sub={<span className="font-mono">fs.createWriteStream()</span>}>
          <div className="mt-1 text-[11px] text-muted">slow disk / network sink</div>
          <BufferBar fill={95} tone="bg-danger/70" label="full" />
        </Box>
      </FlowRow>

      <div className="mt-3 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2">
        <Label className="mb-1 text-danger">Backpressure loop</Label>
        <ol className="grid gap-1 text-xs text-muted sm:grid-cols-3">
          <li><span className="font-mono text-ink">write(chunk)</span> returns <span className="font-mono text-danger">false</span> once buffer ≥ highWaterMark</li>
          <li>upstream <span className="font-mono text-ink">pause()</span>s — memory stays bounded</li>
          <li>buffer flushes → <span className="font-mono text-ink">'drain'</span> → <span className="font-mono text-ink">resume()</span></li>
        </ol>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-code px-3 py-2 font-mono text-[11px] leading-5 text-muted">
{`await pipeline(
  fs.createReadStream('in.log'),
  zlib.createGzip(),
  fs.createWriteStream('in.log.gz'),
); // handles backpressure + errors + cleanup`}
      </pre>
      <Legend items={[{ tone: 'neutral', label: '| marker = highWaterMark (buffer threshold, not a hard cap)' }]} />
    </Frame>
  );
}

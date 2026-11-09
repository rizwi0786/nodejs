import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p11: Project = {
  id: 'p11',
  number: 11,
  level: 'advanced',
  title: 'URL Shortener',
  status: 'ready',
  summary: 'Short links with base62 codes from a scrambled sequence, a Redis cache-aside read path with negative caching, Redis rate limiting, and click analytics captured through a Redis Stream and batch-written to PostgreSQL.',
  skills: ['Base62 encoding', 'Redis cache-aside', 'Rate limiting (Redis)', 'Redis Streams', 'Batch inserts', 'Indexes', 'Read-heavy scaling'],
  estHours: 14,
  prerequisites: [
    'm11-caching',
    'm11-redis',
    'm07-rate-limiting',
    'm09-indexes',
    'm09-node-js-postgresql-integration',
    'm14-horizontal-scaling',
    'm12-ssrf',
    'm11-performance-optimization',
  ],
  requirements: {
    functional: [
      'Create a short link: `{ url, alias?, expiresAt? }` → `{ code, shortUrl }`; 7-character base62 codes.',
      'Custom aliases (3–30 chars) with conflict detection; reserved words (`api`, `health`, `admin`…) blocked.',
      '`GET /:code` → `302` redirect; `404` unknown, `410` expired/disabled.',
      'Click analytics per link: total, per day, top referrers, top countries.',
      'Owners can list, update the target, disable and delete their links.',
      'Anonymous creation allowed with a stricter rate limit than authenticated users.',
    ],
    nonFunctional: [
      'Read-heavy (~100:1): redirect p99 < 10 ms on cache hit; database touched only on cache miss.',
      'Redirect path never waits for analytics — click events are fire-and-forget to a Redis Stream.',
      'Analytics are eventually consistent (seconds) and idempotent on reprocessing.',
      'Codes are unique without retries and not trivially sequential.',
      'Stateless app instances; scale horizontally behind a load balancer.',
      'Rate limits shared across instances (stored in Redis), standard `RateLimit-*` headers.',
    ],
  },
  architecture: {
    diagramId: 'cache-aside',
    flow: [
      { label: 'GET /aZ3kQ9x', detail: 'validate code format' },
      { label: 'Redis GET link:<code>', detail: 'hit → skip DB' },
      { label: 'Miss → Postgres', detail: 'SELECT by unique code index' },
      { label: 'Populate cache', detail: 'SET EX 1h (or 60 s for "not found")' },
      { label: 'XADD clicks', detail: 'fire-and-forget event' },
      { label: '302 Location', detail: 'browser follows to target' },
    ],
    notes: [
      'Cache-aside: the app owns the cache. Writes (update/disable/delete) update Postgres and then `DEL` the key.',
      'Negative caching (`""` for 60 s) stops repeated lookups of non-existent codes from hammering the DB.',
      '`302` (not `301`) so browsers do not cache the redirect permanently — otherwise clicks bypass you and target edits do not apply.',
      'A separate click-writer process consumes the stream with a consumer group, inserts in batches of 500 and updates daily aggregates in the same statement.',
      'Redis client here is `ioredis` (third-party).',
    ],
  },
  folderStructure: dedent(`
    shortener/
    ├── migrations/001_links.sql
    ├── src/
    │   ├── app.js / server.js
    │   ├── config.js
    │   ├── db.js / redis.js
    │   ├── lib/
    │   │   ├── base62.js            # encode/decode + scrambled code
    │   │   └── url-policy.js        # normalizeUrl, private IP block list
    │   ├── middleware/rate-limit.js
    │   ├── links/
    │   │   ├── links.routes.js      # CRUD under /api/v1/links
    │   │   ├── links.service.js     # create, update, cache invalidation
    │   │   ├── resolve.js           # cache-aside lookup
    │   │   └── redirect.route.js    # GET /:code
    │   ├── analytics/
    │   │   ├── track.js             # XADD
    │   │   └── stats.service.js
    │   └── workers/click-writer.js  # XREADGROUP → batch INSERT
    └── test/
        ├── base62.test.js
        └── redirect.test.js
  `),
  databaseDesign: [
    entity('links', [
      ['id', 'BIGINT', "PK DEFAULT nextval('links_id_seq')", 'Source of the generated code'],
      ['code', 'TEXT', 'NOT NULL UNIQUE', 'B-tree index → O(log n) lookup'],
      ['target_url', 'TEXT', 'NOT NULL, ≤ 2048', 'Normalised `URL.href`'],
      ['owner_id', 'UUID', 'NULL', 'NULL = anonymous; Index (owner_id, created_at DESC)'],
      ['custom', 'BOOLEAN', 'DEFAULT false', ''],
      ['expires_at', 'TIMESTAMPTZ', 'NULL', ''],
      ['disabled_at', 'TIMESTAMPTZ', 'NULL', 'Abuse / owner disabled'],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
    ]),
    entity('clicks', [
      ['id', 'BIGINT', 'PK identity', ''],
      ['link_id', 'BIGINT', 'NOT NULL FK links ON DELETE CASCADE', 'Index (link_id, clicked_at)'],
      ['clicked_at', 'TIMESTAMPTZ', 'NOT NULL', 'BRIN index for time-range scans'],
      ['referrer_host', 'TEXT', 'NULL', 'Host only, not the full referrer URL'],
      ['country', 'TEXT', 'NULL', 'From CDN header (e.g. CF-IPCountry)'],
      ['user_agent', 'TEXT', 'NULL', 'Truncated to 200 chars'],
      ['ip_hash', 'TEXT', 'NULL', 'HMAC(ip + day) — unique visitors without storing IPs'],
      ['stream_id', 'TEXT', 'NOT NULL UNIQUE', 'Redis stream entry id → idempotent reprocessing'],
    ]),
    entity('link_daily_stats', [
      ['link_id', 'BIGINT', 'FK links ON DELETE CASCADE', 'PK (link_id, day)'],
      ['day', 'DATE', 'NOT NULL', 'UTC'],
      ['clicks', 'BIGINT', 'NOT NULL', 'Incremented by the click writer'],
    ]),
    entity('Redis keys', [
      ['link:<code>', 'STRING (JSON or "")', 'EX 3600 / 60', 'Cache-aside entry; "" = negative cache'],
      ['rl:<scope>:<client>:<window>', 'STRING counter', 'EX window', 'Fixed-window rate limit'],
      ['clicks', 'STREAM', 'MAXLEN ~ 1 000 000', 'Consumer group `click-writers`'],
    ]),
  ],
  endpoints: [
    { method: 'POST', path: '/api/v1/links', description: '{ url, alias?, expiresAt? } → 201 { code, shortUrl }.', auth: 'public (rate-limited) / user' },
    { method: 'GET', path: '/api/v1/links', description: 'My links, newest first.', auth: 'user' },
    { method: 'GET', path: '/api/v1/links/:code', description: 'Link details.', auth: 'owner' },
    { method: 'PATCH', path: '/api/v1/links/:code', description: 'Change target / expiry / disabled; invalidates cache.', auth: 'owner' },
    { method: 'DELETE', path: '/api/v1/links/:code', description: 'Delete; invalidates cache.', auth: 'owner' },
    { method: 'GET', path: '/api/v1/links/:code/stats?days=30', description: 'Totals, daily series, top referrers/countries.', auth: 'owner' },
    { method: 'GET', path: '/:code', description: '302 redirect (404 / 410).', auth: 'public' },
    { method: 'GET', path: '/health', description: 'Liveness/readiness (DB + Redis ping).', auth: 'public' },
  ],
  steps: [
    {
      title: 'Base62 codes from a scrambled sequence',
      bullets: [
        'Plain base62 of 1, 2, 3… is unique but enumerable (`…01`, `…02`). Multiply by a constant **coprime** with 62⁷ modulo 62⁷: still a one-to-one mapping (no collisions), but consecutive ids look random.',
        '62⁷ ≈ 3.5 trillion codes. `BigInt` avoids precision loss above 2⁵³.',
        'This is obfuscation, not security — do not rely on codes being unguessable for private links.',
      ],
      code: {
        id: 'p11-s1',
        title: 'src/lib/base62.js',
        language: 'javascript',
        code: dedent(`
          const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
          const BASE = 62n;
          export const CODE_LENGTH = 7;
          const SPACE = BASE ** BigInt(CODE_LENGTH); // 3_521_614_606_208
          const MULTIPLIER = 1_580_030_173n; // odd and not a multiple of 31 -> coprime with 62^7 = 2^7 * 31^7

          export function encodeBase62(value, minLength = 0) {
            let n = BigInt(value);
            if (n < 0n) throw new RangeError('Value must be non-negative');
            let out = '';
            do {
              out = ALPHABET[Number(n % BASE)] + out;
              n /= BASE;
            } while (n > 0n);
            return out.padStart(minLength, ALPHABET[0]);
          }

          export function decodeBase62(text) {
            let n = 0n;
            for (const ch of text) {
              const digit = ALPHABET.indexOf(ch);
              if (digit === -1) throw new RangeError(\`Invalid base62 character "\${ch}"\`);
              n = n * BASE + BigInt(digit);
            }
            return n;
          }

          /** Bijective: different ids always give different codes (for id < 62^7). */
          export function codeForId(id) {
            const scrambled = (BigInt(id) * MULTIPLIER) % SPACE;
            return encodeBase62(scrambled, CODE_LENGTH);
          }
        `),
        expectedOutput: "codeForId(1) → '01ive1d'",
      },
    },
    {
      title: 'Validate target URLs',
      bullets: [
        'Only `http:`/`https:` (blocks `javascript:`, `data:`, `file:`), no embedded credentials, ≤ 2048 chars.',
        'Reject IP literals in private ranges and `localhost` with `net.BlockList` — your preview/unfurl features must not be turned into SSRF.',
        'Refuse links to your own short domain (redirect loops).',
      ],
      code: {
        id: 'p11-s2',
        title: 'src/lib/url-policy.js',
        language: 'javascript',
        code: dedent(`
          import { BlockList, isIP } from 'node:net';
          import { BadRequestError } from '../errors.js';
          import { config } from '../config.js';

          const privateRanges = new BlockList();
          privateRanges.addSubnet('0.0.0.0', 8);
          privateRanges.addSubnet('10.0.0.0', 8);
          privateRanges.addSubnet('127.0.0.0', 8);
          privateRanges.addSubnet('169.254.0.0', 16);
          privateRanges.addSubnet('172.16.0.0', 12);
          privateRanges.addSubnet('192.168.0.0', 16);
          privateRanges.addAddress('::1', 'ipv6');
          privateRanges.addSubnet('fc00::', 7, 'ipv6');
          privateRanges.addSubnet('fe80::', 10, 'ipv6');

          export function normalizeUrl(input) {
            if (typeof input !== 'string' || input.length > 2048) throw new BadRequestError('URL must be at most 2048 characters');
            let url;
            try {
              url = new URL(input);
            } catch {
              throw new BadRequestError('Invalid URL');
            }
            if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BadRequestError('Only http and https URLs are allowed');
            if (url.username || url.password) throw new BadRequestError('URLs with credentials are not allowed');

            const host = url.hostname.replace(/^\\[|\\]$/g, ''); // strip IPv6 brackets
            if (host === 'localhost' || host.endsWith('.localhost')) throw new BadRequestError('Local addresses are not allowed');
            const family = isIP(host);
            if (family && privateRanges.check(host, family === 6 ? 'ipv6' : 'ipv4')) {
              throw new BadRequestError('Private network addresses are not allowed');
            }
            if (host === config.SHORT_DOMAIN) throw new BadRequestError('Cannot shorten a short link');
            return url.href;
          }
        `),
      },
    },
    {
      title: 'Create links (generated or custom alias)',
      bullets: [
        'Take `nextval()` first, derive the code, insert both — no "generate, check, retry" loop.',
        'Custom aliases go through the unique index: Postgres error `23505` → `409 Alias taken`.',
        'Aliases may not look like generated codes (exactly 7 alphanumerics) so they can never collide with a future id.',
      ],
      code: {
        id: 'p11-s3',
        title: 'src/links/links.service.js',
        language: 'javascript',
        code: dedent(`
          import { pool as db } from '../db.js';
          import { redis } from '../redis.js';
          import { codeForId, CODE_LENGTH } from '../lib/base62.js';
          import { normalizeUrl } from '../lib/url-policy.js';
          import { BadRequestError, ConflictError, NotFoundError } from '../errors.js';

          const ALIAS_RE = /^[A-Za-z0-9_-]{3,30}$/;
          const LOOKS_GENERATED = new RegExp(\`^[A-Za-z0-9]{\${CODE_LENGTH}}$\`);
          const RESERVED = new Set(['api', 'health', 'admin', 'login', 'static', 'favicon.ico']);

          export async function createLink({ url, alias, expiresAt, ownerId = null }) {
            const target = normalizeUrl(url);

            if (alias !== undefined) {
              if (!ALIAS_RE.test(alias) || LOOKS_GENERATED.test(alias) || RESERVED.has(alias.toLowerCase())) {
                throw new BadRequestError('Alias must be 3-30 chars [A-Za-z0-9_-], not 7 plain characters, not reserved');
              }
              try {
                const { rows } = await db.query(
                  \`INSERT INTO links (code, target_url, owner_id, custom, expires_at)
                   VALUES ($1, $2, $3, true, $4) RETURNING *\`,
                  [alias, target, ownerId, expiresAt ?? null],
                );
                return rows[0];
              } catch (err) {
                if (err.code === '23505') throw new ConflictError('Alias already taken');
                throw err;
              }
            }

            const { rows: [{ id }] } = await db.query("SELECT nextval('links_id_seq') AS id");
            const { rows } = await db.query(
              \`INSERT INTO links (id, code, target_url, owner_id, custom, expires_at)
               VALUES ($1, $2, $3, $4, false, $5) RETURNING *\`,
              [id, codeForId(id), target, ownerId, expiresAt ?? null],
            );
            return rows[0];
          }

          export async function updateLink(ownerId, code, changes) {
            const { rows } = await db.query(
              \`UPDATE links SET
                 target_url = COALESCE($3, target_url),
                 expires_at = CASE WHEN $4::boolean THEN $5 ELSE expires_at END,
                 disabled_at = CASE WHEN $6::boolean IS NULL THEN disabled_at WHEN $6 THEN now() ELSE NULL END
               WHERE code = $1 AND owner_id = $2
               RETURNING *\`,
              [
                code,
                ownerId,
                changes.url ? normalizeUrl(changes.url) : null,
                'expiresAt' in changes,
                changes.expiresAt ?? null,
                changes.disabled ?? null,
              ],
            );
            if (!rows[0]) throw new NotFoundError('Link not found');
            await redis.del(\`link:\${code}\`); // invalidate AFTER the DB write
            return rows[0];
          }
        `),
      },
    },
    {
      title: 'Cache-aside lookup with negative caching',
      bullets: [
        'Hit → no DB query. Miss → query by the unique index, then `SET ... EX`.',
        'Unknown codes cached as `""` for 60 s; expiring links cached no longer than their remaining lifetime.',
        'On a popular key expiring, many requests miss at once (stampede). Mitigate with a short lock (`SET lock NX EX 5`) or early refresh — see extensions.',
      ],
      code: {
        id: 'p11-s4',
        title: 'src/links/resolve.js',
        language: 'javascript',
        code: dedent(`
          import { pool as db } from '../db.js';
          import { redis } from '../redis.js';

          const TTL_SECONDS = 3600;
          const NEGATIVE_TTL_SECONDS = 60;
          const key = (code) => \`link:\${code}\`;

          export async function resolveLink(code) {
            const cached = await redis.get(key(code));
            if (cached !== null) return cached === '' ? null : JSON.parse(cached);

            const { rows } = await db.query(
              'SELECT id, target_url, expires_at FROM links WHERE code = $1 AND disabled_at IS NULL',
              [code],
            );
            const row = rows[0];
            if (!row) {
              await redis.set(key(code), '', 'EX', NEGATIVE_TTL_SECONDS);
              return null;
            }

            const link = { id: row.id, url: row.target_url, expiresAt: row.expires_at };
            let ttl = TTL_SECONDS;
            if (row.expires_at) {
              const secondsLeft = Math.floor((row.expires_at.getTime() - Date.now()) / 1000);
              ttl = Math.max(1, Math.min(ttl, secondsLeft));
            }
            await redis.set(key(code), JSON.stringify(link), 'EX', ttl);
            return link;
          }
        `),
      },
    },
    {
      title: 'Redirect route and fire-and-forget click tracking',
      bullets: [
        'Reject malformed codes before touching Redis.',
        '`XADD` is not awaited by the response path; failures are logged, never shown to the user.',
        'Store only the referrer **host** and an HMAC of the IP with a daily salt — useful analytics, less personal data.',
        'Express 5 signature: `res.redirect(status, url)`.',
      ],
      code: {
        id: 'p11-s5',
        title: 'src/links/redirect.route.js + src/analytics/track.js',
        language: 'javascript',
        code: dedent(`
          // analytics/track.js
          import { createHmac } from 'node:crypto';
          import { redis } from '../redis.js';
          import { config } from '../config.js';

          function referrerHost(referer) {
            try {
              return referer ? new URL(referer).hostname : '';
            } catch {
              return '';
            }
          }

          const hashIp = (ip) =>
            createHmac('sha256', config.IP_HASH_SECRET).update(\`\${ip}|\${new Date().toISOString().slice(0, 10)}\`).digest('hex').slice(0, 16);

          export function trackClick(req, link) {
            redis
              .xadd(
                'clicks', 'MAXLEN', '~', '1000000', '*',
                'linkId', String(link.id),
                'at', new Date().toISOString(),
                'referrer', referrerHost(req.get('referer')),
                'country', req.get('cf-ipcountry') ?? '',
                'ua', (req.get('user-agent') ?? '').slice(0, 200),
                'ipHash', hashIp(req.ip),
              )
              .catch((err) => console.error('click tracking failed:', err.message));
          }

          // links/redirect.route.js
          import { Router } from 'express';
          import { resolveLink } from './resolve.js';

          const CODE_RE = /^[A-Za-z0-9_-]{3,30}$/;
          export const redirectRouter = Router();

          redirectRouter.get('/:code', async (req, res) => {
            const { code } = req.params;
            if (!CODE_RE.test(code)) return res.status(404).send('Not found');

            const link = await resolveLink(code);
            if (!link) return res.status(404).send('Link not found');
            if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return res.status(410).send('Link expired');

            trackClick(req, link); // not awaited
            res.set({ 'Cache-Control': 'private, max-age=0', 'Referrer-Policy': 'unsafe-url' });
            res.redirect(302, link.url);
          });
        `),
      },
    },
    {
      title: 'Click writer: consumer group + batch insert',
      bullets: [
        '`XREADGROUP ... COUNT 500 BLOCK 5000` gives each consumer its own batch; several writers share the load.',
        'One SQL statement inserts the batch with `unnest` arrays **and** bumps daily aggregates from the rows actually inserted (`RETURNING` in a CTE). `stream_id` is unique, so reprocessing never double-counts.',
        '`XACK` only after the insert succeeds. Entries from a crashed consumer stay pending; `XAUTOCLAIM` takes them over after 60 s.',
      ],
      code: {
        id: 'p11-s6',
        title: 'src/workers/click-writer.js',
        language: 'javascript',
        code: dedent(`
          import { hostname } from 'node:os';
          import { pool as db } from '../db.js';
          import { redis } from '../redis.js';

          const STREAM = 'clicks';
          const GROUP = 'click-writers';
          const CONSUMER = \`\${hostname()}-\${process.pid}\`;
          let running = true;

          const toObject = (fields) => {
            const o = {};
            for (let i = 0; i < fields.length; i += 2) o[fields[i]] = fields[i + 1];
            return o;
          };

          async function writeBatch(entries) {
            if (entries.length === 0) return;
            const rows = entries.map(([streamId, fields]) => ({ streamId, ...toObject(fields) }));
            const col = (name) => rows.map((r) => r[name] || null);

            await db.query(
              \`WITH inserted AS (
                 INSERT INTO clicks (link_id, clicked_at, referrer_host, country, user_agent, ip_hash, stream_id)
                 SELECT * FROM unnest($1::bigint[], $2::timestamptz[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
                 ON CONFLICT (stream_id) DO NOTHING
                 RETURNING link_id, clicked_at
               )
               INSERT INTO link_daily_stats (link_id, day, clicks)
               SELECT link_id, (clicked_at AT TIME ZONE 'UTC')::date, count(*) FROM inserted GROUP BY 1, 2
               ON CONFLICT (link_id, day) DO UPDATE SET clicks = link_daily_stats.clicks + EXCLUDED.clicks\`,
              [col('linkId'), col('at'), col('referrer'), col('country'), col('ua'), col('ipHash'), col('streamId')],
            );
            await redis.xack(STREAM, GROUP, ...entries.map(([id]) => id));
          }

          async function ensureGroup() {
            try {
              await redis.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM');
            } catch (err) {
              if (!err.message.includes('BUSYGROUP')) throw err; // group already exists
            }
          }

          async function claimAbandoned() {
            const [, entries] = await redis.xautoclaim(STREAM, GROUP, CONSUMER, 60_000, '0-0', 'COUNT', 500);
            await writeBatch(entries.filter(Boolean));
          }

          async function main() {
            await ensureGroup();
            const timer = setInterval(() => claimAbandoned().catch(console.error), 60_000);
            while (running) {
              try {
                const result = await redis.xreadgroup('GROUP', GROUP, CONSUMER, 'COUNT', 500, 'BLOCK', 5_000, 'STREAMS', STREAM, '>');
                if (result) await writeBatch(result[0][1]);
              } catch (err) {
                console.error('batch failed, will retry from pending list:', err.message);
                await new Promise((r) => setTimeout(r, 1_000));
              }
            }
            clearInterval(timer);
            await Promise.all([db.end(), redis.quit()]);
          }

          process.once('SIGTERM', () => (running = false));
          process.once('SIGINT', () => (running = false));
          await main();
        `),
        versionNote: '`XAUTOCLAIM` requires Redis 6.2+ (7.0+ also returns deleted ids as a third element).',
      },
    },
    {
      title: 'Distributed rate limiting middleware',
      bullets: [
        'Fixed window counter: `INCR` + `EXPIRE key ttl NX` inside `MULTI`, so the TTL is set once per window and the pair is atomic.',
        'Key by user id when authenticated, else by IP (`app.set(\'trust proxy\', 1)` behind a load balancer).',
        'Fail open if Redis is down (log + allow) for redirects; fail closed for link creation if abuse is a bigger risk than downtime.',
        'For smoother limits use a sliding window (sorted set) or token bucket in a Lua script.',
      ],
      code: {
        id: 'p11-s7',
        title: 'src/middleware/rate-limit.js',
        language: 'javascript',
        code: dedent(`
          import { redis } from '../redis.js';

          export function rateLimit({ scope, limit, windowSec, keyFor = (req) => req.user?.id ?? req.ip, failOpen = true }) {
            return async function rateLimiter(req, res, next) {
              const nowSec = Math.floor(Date.now() / 1000);
              const window = Math.floor(nowSec / windowSec);
              const key = \`rl:\${scope}:\${keyFor(req)}:\${window}\`;
              let count;
              try {
                const [[incrErr, value]] = await redis.multi().incr(key).expire(key, windowSec, 'NX').exec();
                if (incrErr) throw incrErr;
                count = value;
              } catch (err) {
                console.error('rate limiter unavailable:', err.message);
                return failOpen ? next() : res.status(503).json({ error: { code: 'RATE_LIMITER_UNAVAILABLE' } });
              }

              const resetIn = windowSec - (nowSec % windowSec);
              res.set({
                'RateLimit-Limit': String(limit),
                'RateLimit-Remaining': String(Math.max(0, limit - count)),
                'RateLimit-Reset': String(resetIn),
              });
              if (count > limit) {
                res.set('Retry-After', String(resetIn));
                return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
              }
              next();
            };
          }

          // usage:
          // linksRouter.post('/', optionalAuth, (req, res, next) =>
          //   (req.user ? userLimit : anonLimit)(req, res, next), createHandler);
          export const anonLimit = rateLimit({ scope: 'create-anon', limit: 10, windowSec: 3600 });
          export const userLimit = rateLimit({ scope: 'create-user', limit: 500, windowSec: 3600 });
        `),
        versionNote: '`EXPIRE ... NX` needs Redis 7.0+.',
      },
    },
    {
      title: 'Stats queries',
      bullets: [
        'Daily series from `link_daily_stats` (tiny, pre-aggregated); top referrers/countries from `clicks` over the index `(link_id, clicked_at)`.',
        'Always filter by owner — stats leak who clicks what.',
      ],
      code: {
        id: 'p11-s8',
        title: 'src/analytics/stats.service.js',
        language: 'javascript',
        code: dedent(`
          import { pool as db } from '../db.js';
          import { NotFoundError } from '../errors.js';

          export async function linkStats(ownerId, code, days = 30) {
            const { rows: [link] } = await db.query('SELECT id FROM links WHERE code = $1 AND owner_id = $2', [code, ownerId]);
            if (!link) throw new NotFoundError('Link not found');

            const [daily, referrers, countries] = await Promise.all([
              db.query(
                \`SELECT day, clicks FROM link_daily_stats
                 WHERE link_id = $1 AND day > current_date - $2::int ORDER BY day\`,
                [link.id, days],
              ),
              db.query(
                \`SELECT COALESCE(referrer_host, 'direct') AS referrer, count(*)::int AS clicks
                 FROM clicks WHERE link_id = $1 AND clicked_at > now() - make_interval(days => $2::int)
                 GROUP BY 1 ORDER BY 2 DESC LIMIT 10\`,
                [link.id, days],
              ),
              db.query(
                \`SELECT COALESCE(country, '??') AS country, count(*)::int AS clicks
                 FROM clicks WHERE link_id = $1 AND clicked_at > now() - make_interval(days => $2::int)
                 GROUP BY 1 ORDER BY 2 DESC LIMIT 10\`,
                [link.id, days],
              ),
            ]);

            const total = daily.rows.reduce((sum, d) => sum + Number(d.clicks), 0);
            return { total, daily: daily.rows, topReferrers: referrers.rows, topCountries: countries.rows };
          }
        `),
      },
    },
  ],
  testing: {
    bullets: [
      'Unit: base62 round-trip, fixed length, 100 000 consecutive ids → 100 000 distinct codes; URL policy rejects `javascript:`, `http://127.0.0.1`, `http://[::1]`.',
      'Integration (Vitest + Supertest, real Redis + Postgres): redirect returns 302 + `Location`; second request is served from cache; PATCH invalidates.',
      'Rate limit: the 11th anonymous create within the window returns 429 with `Retry-After`.',
      'Click writer: feed the same stream entries twice → counts unchanged (idempotency).',
    ],
    code: {
      id: 'p11-test',
      title: 'test/redirect.test.js',
      language: 'javascript',
      code: dedent(`
        import { describe, it, expect, beforeEach, afterAll } from 'vitest';
        import request from 'supertest';
        import { app } from '../src/app.js';
        import { pool as db } from '../src/db.js';
        import { redis } from '../src/redis.js';
        import { codeForId, decodeBase62, encodeBase62 } from '../src/lib/base62.js';
        import { normalizeUrl } from '../src/lib/url-policy.js';
        import { tokenFor } from './helpers.js';

        beforeEach(async () => {
          await db.query('TRUNCATE links, clicks, link_daily_stats RESTART IDENTITY CASCADE');
          await redis.flushdb();
        });
        afterAll(async () => {
          await db.end();
          await redis.quit();
        });

        describe('base62', () => {
          it('round-trips and produces unique fixed-length codes', () => {
            expect(decodeBase62(encodeBase62(123456789n))).toBe(123456789n);
            const codes = new Set(Array.from({ length: 100_000 }, (_, i) => codeForId(i + 1)));
            expect(codes.size).toBe(100_000);
            expect([...codes].every((c) => c.length === 7)).toBe(true);
          });
        });

        describe('url policy', () => {
          it.each(['javascript:alert(1)', 'http://127.0.0.1/admin', 'http://[::1]/', 'http://user:pw@example.com'])(
            'rejects %s',
            (url) => expect(() => normalizeUrl(url)).toThrow(),
          );
        });

        describe('redirect', () => {
          it('redirects, caches and invalidates on update', async () => {
            const token = tokenFor('owner-1');
            const created = await request(app)
              .post('/api/v1/links')
              .set('Authorization', \`Bearer \${token}\`)
              .send({ url: 'https://example.com/a' })
              .expect(201);
            const { code } = created.body.data;

            const first = await request(app).get(\`/\${code}\`).expect(302);
            expect(first.headers.location).toBe('https://example.com/a');
            expect(await redis.get(\`link:\${code}\`)).not.toBeNull();

            // change the DB behind the cache's back: the cache still answers
            await db.query("UPDATE links SET target_url = 'https://example.com/b' WHERE code = $1", [code]);
            expect((await request(app).get(\`/\${code}\`)).headers.location).toBe('https://example.com/a');

            // updating through the API invalidates the cache
            await request(app)
              .patch(\`/api/v1/links/\${code}\`)
              .set('Authorization', \`Bearer \${token}\`)
              .send({ url: 'https://example.com/c' })
              .expect(200);
            expect((await request(app).get(\`/\${code}\`)).headers.location).toBe('https://example.com/c');
          });

          it('returns 404 and negative-caches unknown codes', async () => {
            await request(app).get('/zzzzzzz').expect(404);
            expect(await redis.get('link:zzzzzzz')).toBe('');
          });
        });

        describe('rate limiting', () => {
          it('limits anonymous creation to 10 per hour', async () => {
            for (let i = 0; i < 10; i++) {
              await request(app).post('/api/v1/links').send({ url: \`https://example.com/\${i}\` }).expect(201);
            }
            const blocked = await request(app).post('/api/v1/links').send({ url: 'https://example.com/x' });
            expect(blocked.status).toBe(429);
            expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
          });
        });
      `),
    },
  },
  security: [
    'Phishing/malware is the main abuse: check targets against a reputation API (e.g. Google Safe Browsing) on create, allow reporting, disable links quickly (`disabled_at` + cache `DEL`).',
    'Only `http(s)` targets; block private/loopback IP literals; never fetch the target server-side without SSRF protections (DNS resolution check, no redirects to private IPs).',
    'Strict rate limits for anonymous creation; CAPTCHA after repeated limits.',
    'Ownership checks on every management and stats endpoint.',
    'Privacy: store referrer host only, HMAC IPs with a secret daily salt, honour data-retention limits (drop old `clicks` partitions).',
    'Short codes are guessable — never use short links for confidential documents without an extra secret.',
  ],
  deployment: {
    bullets: [
      'Stateless API replicas behind a load balancer; a separate `click-writer` service (1–N replicas, same consumer group).',
      'Redis `maxmemory-policy volatile-lru`: cache keys (with TTL) can be evicted, the `clicks` stream (no TTL) cannot. Or use two Redis instances: cache vs. stream.',
      'Put a CDN in front only for static assets — caching redirects at the edge would hide clicks.',
      'Scale reads further with Postgres read replicas for cache misses and stats.',
    ],
    code: {
      id: 'p11-deploy',
      title: 'docker-compose.yml',
      language: 'yaml',
      code: dedent(`
        services:
          api:
            build: .
            command: ["node", "src/server.js"]
            environment: &env
              DATABASE_URL: postgres://short:short@db:5432/short
              REDIS_URL: redis://redis:6379
              SHORT_DOMAIN: sho.rt
              IP_HASH_SECRET: \${IP_HASH_SECRET:?required}
            deploy:
              replicas: 3
            depends_on: [db, redis]
          click-writer:
            build: .
            command: ["node", "src/workers/click-writer.js"]
            environment: *env
            depends_on: [db, redis]
          redis:
            image: redis:7-alpine
            command: ["redis-server", "--maxmemory", "512mb", "--maxmemory-policy", "volatile-lru", "--appendonly", "yes"]
          db:
            image: postgres:17-alpine
            environment:
              POSTGRES_USER: short
              POSTGRES_PASSWORD: short
              POSTGRES_DB: short
            volumes: ["./migrations:/docker-entrypoint-initdb.d:ro"]
          lb:
            image: nginx:1.27-alpine
            volumes: ["./nginx.conf:/etc/nginx/conf.d/default.conf:ro"]
            ports: ["80:80"]
            depends_on: [api]
      `),
    },
  },
  extensions: [
    'Cache stampede protection: per-key mutex (`SET lock:<code> NX EX 5`) or probabilistic early refresh.',
    'In-process LRU (e.g. `lru-cache`) in front of Redis for the hottest codes (two-level cache).',
    'Partition `clicks` by month and drop old partitions for retention.',
    'QR code generation endpoint.',
    'Custom domains per user (Host header → tenant).',
    'Unique visitors per day with HyperLogLog (`PFADD`/`PFCOUNT`).',
  ],
};

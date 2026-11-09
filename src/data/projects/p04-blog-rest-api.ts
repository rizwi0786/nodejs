import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p04: Project = {
  id: 'p04',
  number: 4,
  level: 'intermediate',
  title: 'Blog REST API',
  status: 'ready',
  summary: 'Posts, comments and tags on Express 5 + PostgreSQL (`pg`), with zod validation, a route → controller → service → repository structure, pagination, filtering and full-text search.',
  skills: ['Express 5', 'PostgreSQL (pg)', 'zod validation', 'Layered architecture', 'Pagination', 'Full-text search', 'Transactions', 'Supertest'],
  estHours: 12,
  prerequisites: [
    'm08-middleware',
    'm08-route-organization',
    'm08-request-validation',
    'm08-centralized-error-handling',
    'm09-node-js-postgresql-integration',
    'm09-parameterized-queries',
    'm07-pagination',
    'm15-layered-architecture',
  ],
  requirements: {
    functional: [
      'Public: list published posts with `page`/`limit`, filter by `tag` and `author`, search with `q`, sort `newest|oldest|title`.',
      'Public: get a post by slug with its tags; list a post\'s comments with cursor pagination.',
      'Authenticated authors: create, update (PATCH), delete their own posts; admins can edit any post.',
      'Authenticated users: add comments; delete their own comments.',
      'Posts have `draft`/`published` status; `published_at` is set on first publish.',
      'Tags are created on the fly, lower-cased and de-duplicated.',
    ],
    nonFunctional: [
      'Every input (body, query, params) validated with zod → consistent `400` error shape.',
      'All SQL parameterised; sort columns from a whitelist only.',
      'List endpoint p95 < 50 ms with 100k posts (indexes on `status, published_at`, GIN on the search vector).',
      'Creating a post + its tags is atomic (one transaction).',
      'Versioned under `/api/v1`; JSON errors `{ error: { code, message, details? } }`.',
    ],
  },
  architecture: {
    diagramId: 'layered-architecture',
    flow: [
      { label: 'Router', detail: '/api/v1/posts' },
      { label: 'Middleware', detail: 'requireAuth → validate(zod)' },
      { label: 'Controller', detail: 'HTTP in/out only' },
      { label: 'Service', detail: 'rules: ownership, slug, publish' },
      { label: 'Repository', detail: 'parameterised SQL via pg' },
      { label: 'PostgreSQL', detail: 'pool (max 10)' },
    ],
    notes: [
      'Controllers never touch SQL; repositories never see `req`/`res`. Services are unit-testable with fake repositories.',
      'Express 5 forwards rejected promises from async handlers to the error middleware — no `asyncHandler` wrapper needed.',
      'Express 5 makes `req.query` a getter, so validated data is stored on `req.valid` instead of overwriting `req.query`.',
      'Authentication here is a minimal JWT check; the full system (refresh tokens, verification, reset) is p05.',
    ],
  },
  folderStructure: dedent(`
    blog-api/
    ├── package.json
    ├── .env.example
    ├── docker-compose.yml
    ├── migrations/
    │   └── 001_init.sql
    ├── src/
    │   ├── server.js            # listen + graceful shutdown
    │   ├── app.js               # express app (exported for tests)
    │   ├── config.js            # env parsed with zod
    │   ├── db/
    │   │   ├── pool.js
    │   │   └── transaction.js
    │   ├── middleware/
    │   │   ├── require-auth.js
    │   │   ├── validate.js
    │   │   └── error-handler.js
    │   ├── errors.js
    │   ├── modules/
    │   │   ├── posts/
    │   │   │   ├── posts.routes.js
    │   │   │   ├── posts.controller.js
    │   │   │   ├── posts.service.js
    │   │   │   ├── posts.repository.js
    │   │   │   └── posts.schema.js
    │   │   ├── comments/ ...    # same 5 files
    │   │   ├── tags/ ...
    │   │   └── auth/            # POST /auth/login (minimal)
    │   └── utils/slugify.js
    └── test/
        └── posts.test.js
  `),
  databaseDesign: [
    entity('users', [
      ['id', 'BIGINT', 'PK, GENERATED ALWAYS AS IDENTITY', ''],
      ['email', 'TEXT', 'NOT NULL, UNIQUE', 'Stored lower-cased'],
      ['name', 'TEXT', 'NOT NULL', ''],
      ['password_hash', 'TEXT', 'NOT NULL', 'bcrypt'],
      ['role', 'TEXT', "NOT NULL DEFAULT 'author', CHECK IN ('author','admin')", ''],
      ['created_at', 'TIMESTAMPTZ', 'NOT NULL DEFAULT now()', ''],
    ]),
    entity('posts', [
      ['id', 'BIGINT', 'PK, identity', ''],
      ['author_id', 'BIGINT', 'NOT NULL, FK users(id) ON DELETE CASCADE', 'Index'],
      ['title', 'TEXT', 'NOT NULL, 3–200 chars', ''],
      ['slug', 'TEXT', 'NOT NULL, UNIQUE', 'URL id: `hello-postgres-a1b2c3`'],
      ['body', 'TEXT', 'NOT NULL', 'Markdown'],
      ['status', 'TEXT', "NOT NULL DEFAULT 'draft', CHECK IN ('draft','published')", ''],
      ['published_at', 'TIMESTAMPTZ', 'NULL', 'Index (status, published_at DESC)'],
      ['search', 'TSVECTOR', 'GENERATED ALWAYS AS (...) STORED', 'GIN index for `q`'],
      ['created_at / updated_at', 'TIMESTAMPTZ', 'NOT NULL DEFAULT now()', ''],
    ]),
    entity('comments', [
      ['id', 'BIGINT', 'PK, identity', 'Also the pagination cursor'],
      ['post_id', 'BIGINT', 'NOT NULL, FK posts(id) ON DELETE CASCADE', 'Index (post_id, id DESC)'],
      ['author_id', 'BIGINT', 'NOT NULL, FK users(id) ON DELETE CASCADE', ''],
      ['body', 'TEXT', 'NOT NULL, ≤ 2000 chars', ''],
      ['created_at', 'TIMESTAMPTZ', 'NOT NULL DEFAULT now()', ''],
    ]),
    entity('tags', [
      ['id', 'INT', 'PK, identity', ''],
      ['name', 'TEXT', 'NOT NULL, UNIQUE', 'Lower-case, ≤ 30 chars'],
    ]),
    entity('post_tags (join table)', [
      ['post_id', 'BIGINT', 'FK posts(id) ON DELETE CASCADE', 'PK (post_id, tag_id)'],
      ['tag_id', 'INT', 'FK tags(id) ON DELETE CASCADE', 'Index (tag_id) for tag filter'],
    ]),
  ],
  endpoints: [
    { method: 'POST', path: '/api/v1/auth/login', description: 'Email + password → short-lived access token (minimal; see p05).', auth: 'public' },
    { method: 'GET', path: '/api/v1/posts?page=1&limit=20&tag=node&author=3&q=stream&sort=newest', description: 'Paginated published posts.', auth: 'public' },
    { method: 'GET', path: '/api/v1/posts/:slug', description: 'One published post with tags and author.', auth: 'public' },
    { method: 'POST', path: '/api/v1/posts', description: 'Create post (+ tags) → 201.', auth: 'user' },
    { method: 'PATCH', path: '/api/v1/posts/:id', description: 'Partial update; owner or admin.', auth: 'owner / admin' },
    { method: 'DELETE', path: '/api/v1/posts/:id', description: '204; owner or admin.', auth: 'owner / admin' },
    { method: 'GET', path: '/api/v1/posts/:id/comments?cursor=123&limit=20', description: 'Comments, newest first, cursor-paginated.', auth: 'public' },
    { method: 'POST', path: '/api/v1/posts/:id/comments', description: 'Add a comment → 201.', auth: 'user' },
    { method: 'DELETE', path: '/api/v1/comments/:id', description: 'Delete own comment (or admin).', auth: 'owner / admin' },
    { method: 'GET', path: '/api/v1/tags', description: 'All tags with post counts.', auth: 'public' },
  ],
  steps: [
    {
      title: 'Project setup and validated config',
      bullets: [
        'Install: `express@5 pg zod jsonwebtoken bcrypt` (all third-party). Dev: `vitest supertest`.',
        'Parse `process.env` once with zod at startup — a missing `DATABASE_URL` fails fast, not on the first request.',
        'Run with `node --env-file=.env --watch src/server.js` (Node 20.6+), no `dotenv` needed.',
      ],
      code: {
        id: 'p04-s1',
        title: 'src/config.js',
        language: 'javascript',
        code: dedent(`
          import { z } from 'zod';

          const Env = z.object({
            NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
            PORT: z.coerce.number().int().positive().default(3000),
            DATABASE_URL: z.string().url(),
            JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
          });

          const parsed = Env.safeParse(process.env);
          if (!parsed.success) {
            console.error('Invalid environment:', parsed.error.issues);
            process.exit(1);
          }
          export const config = parsed.data;
        `),
      },
    },
    {
      title: 'Write the schema migration',
      bullets: [
        'Identity columns instead of `SERIAL`; `CHECK` constraints keep enums honest at the DB level.',
        'A generated `tsvector` column + GIN index gives fast full-text search without triggers.',
        'Indexes match the queries: list (`status, published_at`), tag filter (`post_tags.tag_id`), comments (`post_id, id`).',
      ],
      code: {
        id: 'p04-s2',
        title: 'migrations/001_init.sql',
        language: 'sql',
        code: dedent(`
          CREATE TABLE users (
            id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            email         TEXT NOT NULL UNIQUE,
            name          TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'author' CHECK (role IN ('author', 'admin')),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
          );

          CREATE TABLE posts (
            id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            author_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
            slug         TEXT NOT NULL UNIQUE,
            body         TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
            published_at TIMESTAMPTZ,
            search       TSVECTOR GENERATED ALWAYS AS (
                           setweight(to_tsvector('english', title), 'A') ||
                           setweight(to_tsvector('english', body), 'B')
                         ) STORED,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX posts_author_idx ON posts (author_id);
          CREATE INDEX posts_published_idx ON posts (status, published_at DESC);
          CREATE INDEX posts_search_idx ON posts USING GIN (search);

          CREATE TABLE comments (
            id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body       TEXT NOT NULL CHECK (char_length(body) <= 2000),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX comments_post_idx ON comments (post_id, id DESC);

          CREATE TABLE tags (
            id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
          );

          CREATE TABLE post_tags (
            post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            tag_id  INT    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (post_id, tag_id)
          );
          CREATE INDEX post_tags_tag_idx ON post_tags (tag_id);
        `),
      },
    },
    {
      title: 'Connection pool and transaction helper',
      bullets: [
        'One `Pool` per process; `pool.query` for single statements.',
        'Transactions must run on **one** client: `connect()` → `BEGIN` → work → `COMMIT`/`ROLLBACK` → `release()` in `finally`.',
        'Return BIGINT ids as numbers for this app (`pg.types.setTypeParser(20, Number)`) — safe while ids stay below 2^53.',
      ],
      code: {
        id: 'p04-s3',
        title: 'src/db/pool.js + src/db/transaction.js',
        language: 'javascript',
        code: dedent(`
          // pool.js
          import pg from 'pg';
          import { config } from '../config.js';

          pg.types.setTypeParser(20, Number); // int8 -> number

          export const pool = new pg.Pool({
            connectionString: config.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
          });

          // transaction.js
          export async function withTransaction(fn) {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              const result = await fn(client);
              await client.query('COMMIT');
              return result;
            } catch (err) {
              await client.query('ROLLBACK');
              throw err;
            } finally {
              client.release();
            }
          }
        `),
      },
    },
    {
      title: 'zod schemas and a validate() middleware',
      bullets: [
        '`z.coerce.number()` turns query-string `"20"` into `20`; `.max(100)` caps `limit` so nobody requests a million rows.',
        'The update schema has **no defaults** — otherwise a PATCH would silently reset `status`/`tags`.',
        'Validated values go to `req.valid.{params,query,body}`.',
      ],
      code: {
        id: 'p04-s4',
        title: 'posts.schema.js + middleware/validate.js',
        language: 'javascript',
        code: dedent(`
          // modules/posts/posts.schema.js
          import { z } from 'zod';

          const fields = {
            title: z.string().trim().min(3).max(200),
            body: z.string().min(1).max(50_000),
            tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10),
            status: z.enum(['draft', 'published']),
          };

          export const createPostBody = z.object({
            ...fields,
            tags: fields.tags.default([]),
            status: fields.status.default('draft'),
          });

          export const updatePostBody = z
            .object(fields)
            .partial()
            .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field' });

          export const idParams = z.object({ id: z.coerce.number().int().positive() });

          export const listPostsQuery = z.object({
            page: z.coerce.number().int().min(1).default(1),
            limit: z.coerce.number().int().min(1).max(100).default(20),
            tag: z.string().trim().toLowerCase().optional(),
            author: z.coerce.number().int().positive().optional(),
            q: z.string().trim().min(2).max(100).optional(),
            sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
          });

          // middleware/validate.js
          import { ValidationError } from '../errors.js';

          export const validate = (schemas) => (req, res, next) => {
            req.valid ??= {};
            for (const key of ['params', 'query', 'body']) {
              if (!schemas[key]) continue;
              const result = schemas[key].safeParse(req[key] ?? {});
              if (!result.success) {
                return next(new ValidationError(result.error.issues.map((i) => ({
                  path: [key, ...i.path].join('.'),
                  message: i.message,
                }))));
              }
              req.valid[key] = result.data;
            }
            next();
          };
        `),
        versionNote: 'Works with zod 3.23+ and zod 4.',
      },
    },
    {
      title: 'Repository: dynamic but safe SQL',
      bullets: [
        'Build the `WHERE` from validated filters; every value goes through a `$n` placeholder.',
        '`ORDER BY` cannot be parameterised — map the validated enum to a whitelisted SQL fragment.',
        'Run the page query and the count query in parallel with `Promise.all`.',
      ],
      code: {
        id: 'p04-s5',
        title: 'modules/posts/posts.repository.js',
        language: 'javascript',
        code: dedent(`
          import { pool } from '../../db/pool.js';

          const SORTS = {
            newest: 'p.published_at DESC, p.id DESC',
            oldest: 'p.published_at ASC, p.id ASC',
            title: 'p.title ASC, p.id ASC',
          };

          const TAGS_SUBQUERY = \`
            COALESCE((SELECT array_agg(t.name ORDER BY t.name)
                      FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
                      WHERE pt.post_id = p.id), '{}') AS tags\`;

          export async function listPublished({ page, limit, tag, author, q, sort }) {
            const where = ["p.status = 'published'"];
            const values = [];
            const param = (value) => {
              values.push(value);
              return \`$\${values.length}\`;
            };

            if (author) where.push(\`p.author_id = \${param(author)}\`);
            if (tag) {
              where.push(\`EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
                                  WHERE pt.post_id = p.id AND t.name = \${param(tag)})\`);
            }
            if (q) where.push(\`p.search @@ websearch_to_tsquery('english', \${param(q)})\`);

            const whereSql = where.join(' AND ');
            const filterValues = [...values];
            const limitSql = param(limit);
            const offsetSql = param((page - 1) * limit);

            const [items, count] = await Promise.all([
              pool.query(
                \`SELECT p.id, p.title, p.slug, p.published_at, u.id AS author_id, u.name AS author_name, \${TAGS_SUBQUERY}
                 FROM posts p JOIN users u ON u.id = p.author_id
                 WHERE \${whereSql}
                 ORDER BY \${SORTS[sort]}
                 LIMIT \${limitSql} OFFSET \${offsetSql}\`,
                values,
              ),
              pool.query(\`SELECT count(*)::int AS total FROM posts p WHERE \${whereSql}\`, filterValues),
            ]);
            return { items: items.rows, total: count.rows[0].total };
          }

          export async function findById(id, db = pool) {
            const { rows } = await db.query('SELECT * FROM posts WHERE id = $1', [id]);
            return rows[0] ?? null;
          }

          export async function findPublishedBySlug(slug) {
            const { rows } = await pool.query(
              \`SELECT p.id, p.title, p.slug, p.body, p.published_at, u.name AS author_name, \${TAGS_SUBQUERY}
               FROM posts p JOIN users u ON u.id = p.author_id
               WHERE p.slug = $1 AND p.status = 'published'\`,
              [slug],
            );
            return rows[0] ?? null;
          }

          export async function insert(db, { authorId, title, slug, body, status }) {
            const { rows } = await db.query(
              \`INSERT INTO posts (author_id, title, slug, body, status, published_at)
               VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'published' THEN now() END)
               RETURNING *\`,
              [authorId, title, slug, body, status],
            );
            return rows[0];
          }

          export async function update(db, id, { title, body, status }) {
            const { rows } = await db.query(
              \`UPDATE posts SET
                 title = COALESCE($2, title),
                 body = COALESCE($3, body),
                 status = COALESCE($4, status),
                 published_at = CASE WHEN COALESCE($4, status) = 'published' THEN COALESCE(published_at, now()) END,
                 updated_at = now()
               WHERE id = $1
               RETURNING *\`,
              [id, title ?? null, body ?? null, status ?? null],
            );
            return rows[0];
          }

          export async function remove(id) {
            await pool.query('DELETE FROM posts WHERE id = $1', [id]);
          }
        `),
      },
    },
    {
      title: 'Service: business rules and the transaction',
      bullets: [
        'Slug = slugified title + 6 random hex chars → unique without a "does it exist?" race.',
        'Upsert tags with `unnest($1::text[])` — one round trip for any number of tags.',
        'Ownership rule lives here, not in the controller: owner **or** admin.',
      ],
      code: {
        id: 'p04-s6',
        title: 'modules/posts/posts.service.js',
        language: 'javascript',
        code: dedent(`
          import { randomBytes } from 'node:crypto';
          import { withTransaction } from '../../db/transaction.js';
          import * as postsRepo from './posts.repository.js';
          import { NotFoundError, ForbiddenError } from '../../errors.js';

          export function slugify(title) {
            const base = title
              .toLowerCase()
              .normalize('NFKD')
              .replace(/[\\u0300-\\u036f]/g, '') // strip accents
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 80);
            return \`\${base || 'post'}-\${randomBytes(3).toString('hex')}\`;
          }

          async function setTags(client, postId, names) {
            await client.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);
            const unique = [...new Set(names)];
            if (unique.length === 0) return [];
            const { rows } = await client.query(
              \`INSERT INTO tags (name) SELECT unnest($1::text[])
               ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
               RETURNING id, name\`,
              [unique],
            );
            await client.query(
              'INSERT INTO post_tags (post_id, tag_id) SELECT $1, unnest($2::int[])',
              [postId, rows.map((r) => r.id)],
            );
            return unique;
          }

          export const list = (filters) => postsRepo.listPublished(filters);

          export async function getBySlug(slug) {
            const post = await postsRepo.findPublishedBySlug(slug);
            if (!post) throw new NotFoundError('Post not found');
            return post;
          }

          export function create(user, input) {
            return withTransaction(async (client) => {
              const post = await postsRepo.insert(client, { ...input, authorId: user.id, slug: slugify(input.title) });
              const tags = await setTags(client, post.id, input.tags);
              return { ...post, tags };
            });
          }

          async function loadOwned(user, id, db) {
            const post = await postsRepo.findById(id, db);
            if (!post) throw new NotFoundError('Post not found');
            if (post.author_id !== user.id && user.role !== 'admin') throw new ForbiddenError('Not your post');
            return post;
          }

          export function update(user, id, changes) {
            return withTransaction(async (client) => {
              await loadOwned(user, id, client);
              const post = await postsRepo.update(client, id, changes);
              const tags = changes.tags ? await setTags(client, id, changes.tags) : undefined;
              return tags ? { ...post, tags } : post;
            });
          }

          export async function remove(user, id) {
            await loadOwned(user, id);
            await postsRepo.remove(id);
          }
        `),
      },
    },
    {
      title: 'Controller and routes',
      bullets: [
        'Controllers read `req.valid` / `req.user`, call one service function, shape the response.',
        'Return `201` + `Location` on create, `204` on delete, pagination metadata on lists.',
      ],
      code: {
        id: 'p04-s7',
        title: 'posts.controller.js + posts.routes.js',
        language: 'javascript',
        code: dedent(`
          // posts.controller.js
          import * as postsService from './posts.service.js';

          export async function list(req, res) {
            const { page, limit } = req.valid.query;
            const { items, total } = await postsService.list(req.valid.query);
            res.json({ data: items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
          }

          export async function getBySlug(req, res) {
            res.json({ data: await postsService.getBySlug(req.params.slug) });
          }

          export async function create(req, res) {
            const post = await postsService.create(req.user, req.valid.body);
            res.status(201).location(\`/api/v1/posts/\${post.slug}\`).json({ data: post });
          }

          export async function update(req, res) {
            res.json({ data: await postsService.update(req.user, req.valid.params.id, req.valid.body) });
          }

          export async function remove(req, res) {
            await postsService.remove(req.user, req.valid.params.id);
            res.status(204).end();
          }

          // posts.routes.js
          import { Router } from 'express';
          import * as ctrl from './posts.controller.js';
          import { validate } from '../../middleware/validate.js';
          import { requireAuth } from '../../middleware/require-auth.js';
          import { createPostBody, updatePostBody, idParams, listPostsQuery } from './posts.schema.js';

          export const postsRouter = Router();

          postsRouter.get('/', validate({ query: listPostsQuery }), ctrl.list);
          postsRouter.get('/:slug', ctrl.getBySlug);
          postsRouter.post('/', requireAuth, validate({ body: createPostBody }), ctrl.create);
          postsRouter.patch('/:id', requireAuth, validate({ params: idParams, body: updatePostBody }), ctrl.update);
          postsRouter.delete('/:id', requireAuth, validate({ params: idParams }), ctrl.remove);
        `),
      },
    },
    {
      title: 'Errors, auth middleware and the app',
      bullets: [
        'Map Postgres error codes: `23505` unique violation → `409`, `23503` FK violation → `400`.',
        '`express.json()` parse failures arrive with `err.type === \'entity.parse.failed\'` → `400`.',
        'Pin `algorithms: [\'HS256\']` when verifying JWTs.',
      ],
      code: {
        id: 'p04-s8',
        title: 'errors.js, require-auth.js, error-handler.js, app.js',
        language: 'javascript',
        code: dedent(`
          // errors.js
          export class AppError extends Error {
            constructor(status, code, message, details) {
              super(message);
              Object.assign(this, { status, code, details });
            }
          }
          export class ValidationError extends AppError {
            constructor(details) { super(400, 'VALIDATION_ERROR', 'Invalid request', details); }
          }
          export class NotFoundError extends AppError {
            constructor(message = 'Not found') { super(404, 'NOT_FOUND', message); }
          }
          export class ForbiddenError extends AppError {
            constructor(message = 'Forbidden') { super(403, 'FORBIDDEN', message); }
          }
          export class UnauthorizedError extends AppError {
            constructor(message = 'Authentication required') { super(401, 'UNAUTHORIZED', message); }
          }

          // middleware/require-auth.js
          import jwt from 'jsonwebtoken';
          import { config } from '../config.js';
          // import { UnauthorizedError } from '../errors.js';

          export function requireAuth(req, res, next) {
            const [scheme, token] = (req.get('authorization') ?? '').split(' ');
            if (scheme !== 'Bearer' || !token) return next(new UnauthorizedError());
            try {
              const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
              req.user = { id: Number(payload.sub), role: payload.role };
              next();
            } catch {
              next(new UnauthorizedError('Invalid or expired token'));
            }
          }

          // middleware/error-handler.js
          // import { AppError } from '../errors.js';

          export function errorHandler(err, req, res, next) {
            if (err instanceof AppError) {
              return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
            }
            if (err.type === 'entity.parse.failed') {
              return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
            }
            if (err.code === '23505') {
              return res.status(409).json({ error: { code: 'CONFLICT', message: 'Resource already exists' } });
            }
            if (err.code === '23503') {
              return res.status(400).json({ error: { code: 'BAD_REFERENCE', message: 'Referenced resource does not exist' } });
            }
            console.error(err);
            res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
          }

          // app.js
          import express from 'express';
          import { postsRouter } from './modules/posts/posts.routes.js';
          import { commentsRouter } from './modules/comments/comments.routes.js';
          import { tagsRouter } from './modules/tags/tags.routes.js';
          import { authRouter } from './modules/auth/auth.routes.js';
          // import { NotFoundError } from './errors.js';
          // import { errorHandler } from './middleware/error-handler.js';

          export const app = express();
          app.disable('x-powered-by');
          app.use(express.json({ limit: '100kb' }));

          app.use('/api/v1/auth', authRouter);
          app.use('/api/v1/posts', postsRouter);
          app.use('/api/v1', commentsRouter); // /posts/:id/comments and /comments/:id
          app.use('/api/v1/tags', tagsRouter);

          app.use((req, res, next) => next(new NotFoundError('Route not found')));
          app.use(errorHandler);
        `),
        versionNote: 'Express 5: async handler rejections reach errorHandler automatically.',
      },
    },
    {
      title: 'Comments with cursor pagination',
      bullets: [
        'Offset pagination gets slower and skips/duplicates rows when new comments arrive; a cursor (`id < $cursor`) does not.',
        'Return `nextCursor` = last row id when the page is full, else `null`.',
      ],
      code: {
        id: 'p04-s9',
        title: 'modules/comments/comments.repository.js',
        language: 'javascript',
        code: dedent(`
          import { pool } from '../../db/pool.js';

          export async function listForPost(postId, { cursor, limit }) {
            const { rows } = await pool.query(
              \`SELECT c.id, c.body, c.created_at, u.name AS author_name
               FROM comments c JOIN users u ON u.id = c.author_id
               WHERE c.post_id = $1 AND ($2::bigint IS NULL OR c.id < $2)
               ORDER BY c.id DESC
               LIMIT $3\`,
              [postId, cursor ?? null, limit],
            );
            return { items: rows, nextCursor: rows.length === limit ? rows.at(-1).id : null };
          }
        `),
      },
    },
    {
      title: 'Server with graceful shutdown',
      bullets: [
        'On `SIGTERM`: stop the HTTP server, then `pool.end()` so in-flight queries finish.',
      ],
      code: {
        id: 'p04-s10',
        title: 'src/server.js',
        language: 'javascript',
        code: dedent(`
          import { app } from './app.js';
          import { pool } from './db/pool.js';
          import { config } from './config.js';

          const server = app.listen(config.PORT, () => console.log(\`API on :\${config.PORT}\`));

          async function shutdown() {
            server.close(async () => {
              await pool.end();
              process.exit(0);
            });
            setTimeout(() => process.exit(1), 10_000).unref();
          }
          process.once('SIGTERM', shutdown);
          process.once('SIGINT', shutdown);
        `),
      },
    },
  ],
  testing: {
    bullets: [
      'Integration tests with **Vitest + Supertest** (third-party) against a real Postgres (docker compose service `db-test`).',
      'Import `app` (not `server`) — Supertest binds an ephemeral port itself.',
      '`TRUNCATE ... RESTART IDENTITY CASCADE` in `beforeEach`; run test files serially (`fileParallelism: false`) because they share one DB.',
      'Unit-test `slugify` and the ownership rule in the service with a mocked repository (`vi.mock`).',
    ],
    code: {
      id: 'p04-test',
      title: 'test/posts.test.js',
      language: 'javascript',
      code: dedent(`
        import { describe, it, expect, beforeEach, afterAll } from 'vitest';
        import request from 'supertest';
        import jwt from 'jsonwebtoken';
        import { app } from '../src/app.js';
        import { pool } from '../src/db/pool.js';
        import { config } from '../src/config.js';

        let token;

        beforeEach(async () => {
          await pool.query('TRUNCATE post_tags, tags, comments, posts, users RESTART IDENTITY CASCADE');
          const { rows } = await pool.query(
            "INSERT INTO users (email, name, password_hash) VALUES ('ada@test.dev', 'Ada', 'x') RETURNING id",
          );
          token = jwt.sign({ sub: String(rows[0].id), role: 'author' }, config.JWT_SECRET, { expiresIn: '5m' });
        });
        afterAll(() => pool.end());

        const createPost = (body) =>
          request(app).post('/api/v1/posts').set('Authorization', \`Bearer \${token}\`).send(body);

        describe('POST /api/v1/posts', () => {
          it('creates a post with normalised tags', async () => {
            const res = await createPost({ title: 'Hello Postgres', body: 'Hi', tags: ['SQL', 'node', 'sql'], status: 'published' });
            expect(res.status).toBe(201);
            expect(res.body.data.slug).toMatch(/^hello-postgres-[0-9a-f]{6}$/);
            expect(res.body.data.tags).toEqual(['sql', 'node']);
          });

          it('requires a token', async () => {
            const res = await request(app).post('/api/v1/posts').send({ title: 'Nope', body: 'x' });
            expect(res.status).toBe(401);
          });

          it('returns 400 with field details', async () => {
            const res = await createPost({ title: 'x' });
            expect(res.status).toBe(400);
            expect(res.body.error.details.map((d) => d.path)).toContain('body.title');
          });
        });

        describe('GET /api/v1/posts', () => {
          it('paginates and filters by tag, hiding drafts', async () => {
            await createPost({ title: 'Node streams', body: 'a', tags: ['node'], status: 'published' });
            await createPost({ title: 'SQL joins', body: 'b', tags: ['sql'], status: 'published' });
            await createPost({ title: 'Secret draft', body: 'c', tags: ['node'] });

            const res = await request(app).get('/api/v1/posts').query({ tag: 'node', limit: 10 });
            expect(res.status).toBe(200);
            expect(res.body.data.map((p) => p.title)).toEqual(['Node streams']);
            expect(res.body.meta).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
          });

          it('rejects limit > 100', async () => {
            const res = await request(app).get('/api/v1/posts?limit=500');
            expect(res.status).toBe(400);
          });
        });
      `),
    },
  },
  security: [
    'SQL injection: every value is a `$n` parameter; `ORDER BY` comes from a whitelist map, never from the client string.',
    'Broken access control: ownership checked in the service for PATCH/DELETE on both posts and comments.',
    'Mass assignment: zod objects strip unknown keys, so `author_id` or `published_at` in the body is ignored.',
    'Limit `express.json` to `100kb` and `limit` to `100` rows to prevent resource exhaustion.',
    'Render post bodies (Markdown) safely on the client — sanitize HTML output (e.g. DOMPurify) to prevent stored XSS.',
    'Drafts are never returned by public endpoints (`status = \'published\'` is part of every public query).',
  ],
  deployment: {
    bullets: [
      'Docker Compose for local dev: `api` + `db` (Postgres 17) with a health check; the API waits for `service_healthy`.',
      'Apply migrations before starting the new version (`psql -f` here, or a tool like `node-pg-migrate` — third-party).',
      'Configure the pool size so `instances × max` stays below Postgres `max_connections`.',
    ],
    code: {
      id: 'p04-deploy',
      title: 'docker-compose.yml',
      language: 'yaml',
      code: dedent(`
        services:
          db:
            image: postgres:17-alpine
            environment:
              POSTGRES_USER: blog
              POSTGRES_PASSWORD: blog
              POSTGRES_DB: blog
            volumes:
              - pgdata:/var/lib/postgresql/data
              - ./migrations:/docker-entrypoint-initdb.d:ro
            healthcheck:
              test: ["CMD-SHELL", "pg_isready -U blog"]
              interval: 5s
              retries: 10
          api:
            build: .
            environment:
              DATABASE_URL: postgres://blog:blog@db:5432/blog
              JWT_SECRET: \${JWT_SECRET:?set JWT_SECRET}
              PORT: 3000
            ports:
              - "3000:3000"
            depends_on:
              db:
                condition: service_healthy
        volumes:
          pgdata:
      `),
    },
  },
  extensions: [
    'OpenAPI spec generated from the zod schemas (e.g. `zod-to-openapi`) + Swagger UI.',
    'Cursor pagination for posts too (`published_at, id` composite cursor).',
    'Soft delete (`deleted_at`) and an admin restore endpoint.',
    'Image uploads for posts (multer → object storage).',
    'Switch the repository layer to Prisma and compare the code.',
    'Cache the public list in Redis for 30 s (see p11).',
  ],
};

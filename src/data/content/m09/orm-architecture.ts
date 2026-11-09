import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ─────────────────────────────────────────────────────────────
  prisma: {
    summary: 'Prisma (third-party) is a schema-first, type-safe ORM: you declare models in schema.prisma, generate migrations with Prisma Migrate, and query through a generated, fully typed Prisma Client.',
    topics: ['schema.prisma', 'datasource', 'generator', 'model', '@relation', 'prisma migrate dev', 'prisma migrate deploy', 'prisma generate', 'PrismaClient', 'findMany', 'include', 'select', 'nested writes', '$transaction', 'interactive transactions', '$queryRaw'],
    sections: [
      section('introduction', undefined,
        text('Prisma flips the usual ORM flow: instead of classes with decorators, you write a single **schema file**, and Prisma generates both SQL migrations and a **type-safe client** whose return types match exactly what you selected.'),
      ),
      section('definition', 'The three parts',
        table('Prisma toolkit', ['Part', 'What it is', 'Command'],
          [
            ['Prisma Schema', '`prisma/schema.prisma`: datasource, generator, models', '—'],
            ['Prisma Migrate', 'Diffs the schema and generates/applies SQL migration files', '`npx prisma migrate dev` / `migrate deploy`'],
            ['Prisma Client', 'Generated typed query API in node_modules', '`npx prisma generate`'],
            ['Prisma Studio', 'GUI to browse data', '`npx prisma studio`'],
          ]),
      ),
      section('why', 'Why teams choose Prisma',
        bullets(
          'End-to-end types: `select: { id: true }` returns `{ id: number }` — typos are compile errors.',
          'Readable relation queries (`include`, nested writes).',
          'Migration history as plain SQL files you can review.',
          'Trade-offs: its own query API to learn; complex SQL needs `$queryRaw`; a generation step after every schema change.',
        ),
      ),
      section('internals', 'Workflow',
        flow(['Edit schema.prisma', 'migrate dev: diff → SQL migration file → apply to dev DB', 'generate: typed client', 'Commit migration + schema', 'CI/prod: migrate deploy'], { title: 'Prisma development loop', direction: 'horizontal' }),
        table('migrate dev vs migrate deploy', ['', 'migrate dev', 'migrate deploy'],
          [
            ['Where', 'Local development', 'CI / staging / production'],
            ['Creates new migrations', 'Yes', 'No — applies existing ones only'],
            ['May reset the DB', 'Yes (on drift, asks first)', 'Never'],
            ['Runs generate', 'Yes', 'No'],
          ]),
      ),
      section('example', 'Schema, migration, queries',
        code({
          title: 'prisma/schema.prisma',
          language: 'text',
          code: dedent(`
            datasource db {
              provider = "postgresql"
              url      = env("DATABASE_URL")
            }

            generator client {
              provider = "prisma-client-js"
            }

            model User {
              id        Int      @id @default(autoincrement())
              email     String   @unique
              name      String?
              posts     Post[]                       // 1:N (virtual relation field)
              createdAt DateTime @default(now())
            }

            model Post {
              id        Int      @id @default(autoincrement())
              title     String
              published Boolean  @default(false)
              author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
              authorId  Int
              tags      Tag[]                        // implicit N:M (Prisma creates _PostToTag)

              @@index([authorId, published])
            }

            model Tag {
              id    Int    @id @default(autoincrement())
              name  String @unique
              posts Post[]
            }
          `),
          explanation: [
            '`posts Post[]` and `author User` are relation fields — not columns. `authorId` is the actual FK column.',
            '`?` marks optional (nullable) fields.',
            '`@@index` declares a composite index; `@unique` a unique constraint.',
            'Prisma 6+ also supports `prisma.config.ts` and a newer `prisma-client` generator; the classic setup above still works.',
          ],
        }),
        code({
          title: 'Create and apply the migration',
          language: 'bash',
          code: dedent(`
            npx prisma migrate dev --name init
          `),
          expectedOutput: dedent(`
            Applying migration \`20261108100000_init\`

            The following migration(s) have been created and applied from new schema changes:

            migrations/
              └─ 20261108100000_init/
                └─ migration.sql

            Your database is now in sync with your schema.
            ✔ Generated Prisma Client
          `),
          explanation: ['The SQL file is committed to git; production runs `npx prisma migrate deploy`.'],
        }),
        code({
          title: 'Client queries',
          code: dedent(`
            import { PrismaClient } from '@prisma/client';
            const prisma = new PrismaClient(); // one instance per process

            // Create with nested write (user + 2 posts in one transaction)
            const user = await prisma.user.create({
              data: {
                email: 'ana@example.com',
                posts: { create: [{ title: 'Hello', published: true }, { title: 'Draft' }] },
              },
              include: { posts: true },
            });
            console.log(user.posts.length);

            // Filter, relation filter, sort, paginate, select
            const authors = await prisma.user.findMany({
              where: { posts: { some: { published: true } } },
              select: { email: true, _count: { select: { posts: true } } },
              orderBy: { createdAt: 'desc' },
              take: 10,
            });
            console.log(authors);

            // Update / upsert / delete
            await prisma.post.updateMany({ where: { authorId: user.id, published: false }, data: { published: true } });
            await prisma.tag.upsert({ where: { name: 'node' }, update: {}, create: { name: 'node' } });
            await prisma.post.delete({ where: { id: 999 } }).catch((e) => console.log(e.code));
          `),
          expectedOutput: "2\n[ { email: 'ana@example.com', _count: { posts: 2 } } ]\nP2025",
          explanation: [
            'Nested `create` runs inside one transaction automatically.',
            '`some` / `every` / `none` filter by related records.',
            '`select` and `include` shape the result and its TypeScript type.',
            'Prisma error `P2025` = record to delete/update not found; `P2002` = unique constraint violation.',
          ],
        }),
        code({
          title: 'Transactions',
          code: dedent(`
            // 1) Batch: array of queries, all-or-nothing
            const [debit, credit] = await prisma.$transaction([
              prisma.account.update({ where: { id: 1 }, data: { balance: { decrement: 30 } } }),
              prisma.account.update({ where: { id: 2 }, data: { balance: { increment: 30 } } }),
            ]);

            // 2) Interactive: logic between queries, same transaction (tx client)
            await prisma.$transaction(async (tx) => {
              const from = await tx.account.update({ where: { id: 1 }, data: { balance: { decrement: 30 } } });
              if (from.balance < 0) throw new Error('Insufficient funds'); // → rollback
              await tx.account.update({ where: { id: 2 }, data: { balance: { increment: 30 } } });
            }, { isolationLevel: 'Serializable', timeout: 5000 });
          `),
          expectedOutput: '(throws "Insufficient funds" and rolls back both updates when balance would go negative)',
          explanation: [
            'Inside the interactive callback you **must** use `tx`, not `prisma` — `prisma` calls would run outside the transaction.',
            'Throwing inside the callback rolls back.',
            '`decrement` is an atomic `SET balance = balance - 30`.',
          ],
        }),
        code({
          title: 'Safe raw SQL',
          language: 'typescript',
          code: dedent(`
            const minTotal = 100;
            const rows = await prisma.$queryRaw<{ customer_id: number; revenue: number }[]>\`
              SELECT customer_id, sum(total)::float AS revenue
              FROM orders WHERE total > \${minTotal}
              GROUP BY customer_id ORDER BY revenue DESC LIMIT 5\`;
          `),
          expectedOutput: '[ { customer_id: 3, revenue: 410 }, { customer_id: 1, revenue: 150 } ]',
          explanation: ['The tagged template sends `${minTotal}` as a bound parameter, not interpolated text.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Instantiate PrismaClient once (in dev with hot reload, store it on `globalThis` to avoid many clients).',
          'Run `prisma migrate deploy` as a release step before new app instances start.',
          'For serverless/edge, use a pooled connection URL (e.g. PgBouncer with `?pgbouncer=true` where required, or Prisma Accelerate / driver adapters).',
          'Seed data with `prisma db seed`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `prisma` instead of `tx` inside an interactive transaction.',
          'Running `migrate dev` against production (it can reset the database).',
          'Forgetting `prisma generate` after schema changes → client types out of date.',
          'Using `include` everywhere — loads whole related rows; prefer `select`.',
          'Long work inside interactive transactions (default timeout 5 s).',
        ),
        code({
          title: 'Wrong vs right: tx client',
          code: dedent(`
            // ❌ second update escapes the transaction
            await prisma.$transaction(async (tx) => {
              await tx.order.create({ data: order });
              await prisma.stock.update({ where: { id }, data: { qty: { decrement: 1 } } });
            });

            // ✅
            await prisma.$transaction(async (tx) => {
              await tx.order.create({ data: order });
              await tx.stock.update({ where: { id }, data: { qty: { decrement: 1 } } });
            });
          `),
          expectedOutput: '(first: stock decrement survives even if the transaction rolls back)',
          explanation: ['`tx` is bound to the transaction\'s connection; `prisma` uses any pooled connection.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Contrast `migrate dev` and `migrate deploy` — it shows you have shipped Prisma to production.'),
        interviewTip('Explain batch vs interactive `$transaction` and the `tx` rule.'),
      ),
      section('practice', 'Practice',
        steps(
          'Add a `Comment` model (belongs to Post and User), create a migration, and query a post with its 5 latest comments and authors\' names.',
          'Write a `transfer()` with an interactive transaction and a unit test for the insufficient-funds path.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'schema.prisma → migrate (SQL files) → generate (typed client).',
          '`migrate dev` locally, `migrate deploy` in prod.',
          'findMany/create/update/upsert/delete with where/select/include/orderBy/take/skip.',
          '`$transaction([...])` batch or `$transaction(async tx => ...)` interactive.',
          '`$queryRaw` tagged template for safe raw SQL.',
        ),
      ),
    ],
    revisionNotes: [
      'Relation fields (posts Post[]) are not columns; FK scalar (authorId) is.',
      'migrate dev: creates + applies + generate; may reset dev DB. migrate deploy: applies only.',
      'P2002 unique violation, P2025 record not found.',
      'Interactive transaction: use tx; default timeout 5000 ms.',
      'Nested writes are transactional.',
      'One PrismaClient per process.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which command should run in a production deployment pipeline?',
        options: ['npx prisma migrate dev', 'npx prisma migrate deploy', 'npx prisma db push --force-reset', 'npx prisma studio'],
        answer: 1,
        explanation: 'migrate deploy applies committed migrations without generating new ones or resetting. migrate dev is for development and may reset the database.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Why is the audit row kept even when the transaction fails?',
        code: "await prisma.$transaction(async (tx) => {\n  await prisma.audit.create({ data: { action: 'transfer' } });\n  await tx.account.update({ where: { id: 1 }, data: { balance: { decrement: 500 } } });\n  throw new Error('fail');\n});",
        options: ['$transaction does not support create', 'prisma.audit.create runs outside the transaction because it uses the global client, not tx', 'Errors do not roll back interactive transactions', 'audit needs @relation'],
        answer: 1,
        explanation: 'Only queries made through tx join the transaction. The account update rolls back; the audit insert was already committed on another connection.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Find users who have at least one published post.',
        code: 'prisma.user.findMany({ where: { posts: { /* ??? */: { published: true } } } })',
        options: ['every', 'some', 'none', 'any'],
        answer: 1,
        explanation: 'some = at least one related record matches. every would also match users with zero posts; none is the opposite.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Prisma',
        question: 'How does Prisma\'s workflow differ from traditional ORMs like Sequelize?',
        shortAnswer: 'Prisma is schema-first: one schema.prisma file is the source of truth, from which it generates SQL migrations and a type-safe client; traditional ORMs define models in code classes and often rely on runtime reflection.',
        detailedAnswer: [
          'Results are typed according to select/include, catching mistakes at compile time.',
          'Models are not classes with methods — Prisma returns plain objects (data mapper flavour).',
          'Migrations are SQL files generated by diffing the schema.',
          'A generate step is required after schema changes.',
        ],
        followUp: 'How do you add custom logic per model with Prisma (e.g. client extensions)?',
        trap: 'Saying Prisma returns model instances with save().',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Prisma',
        question: 'Compare Prisma batch transactions and interactive transactions. What are the pitfalls of interactive ones?',
        shortAnswer: 'Batch `$transaction([q1, q2])` runs independent queries atomically in one round of work; interactive `$transaction(async tx => …)` allows logic between queries but holds a connection and locks for the callback\'s duration, so it must be short, use only tx, and has a default 5-second timeout.',
        detailedAnswer: [
          'Batch: no reading results between queries; great for simple multi-writes.',
          'Interactive: read-then-decide flows (check balance then debit).',
          'Pitfall: using the global prisma client inside the callback escapes the transaction.',
          'Pitfall: external API calls inside hold connections → pool exhaustion.',
          'Isolation level and timeout can be configured per transaction.',
        ],
        followUp: 'How would you retry on serialization failures with Prisma?',
        trap: 'Doing HTTP calls inside the interactive transaction.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  sequelize: {
    summary: 'Sequelize (third-party) is a promise-based Active Record ORM for Postgres, MySQL, MariaDB, SQLite and MSSQL, with models, associations (hasOne/hasMany/belongsTo/belongsToMany), eager loading and CLI migrations.',
    topics: ['Sequelize', 'define', 'Model.init', 'DataTypes', 'hasOne', 'hasMany', 'belongsTo', 'belongsToMany', 'through', 'include', 'eager loading', 'migrations', 'sequelize-cli', 'sync', 'transactions', 'paranoid', 'scopes'],
    sections: [
      section('introduction', undefined,
        text('Sequelize is one of the oldest Node ORMs and still common in existing codebases. Models are classes that read and save themselves (**Active Record**), and relationships are declared with association methods.'),
      ),
      section('definition', 'Core concepts',
        table('Sequelize building blocks', ['Concept', 'API'],
          [
            ['Connection', '`new Sequelize(url, { dialect: \'postgres\', pool: {...} })` (uses `pg` underneath)'],
            ['Model', '`sequelize.define(\'User\', attrs, opts)` or `class User extends Model {}; User.init(...)`'],
            ['Queries', '`findAll`, `findOne`, `findByPk`, `create`, `update`, `destroy`, `findOrCreate`, `upsert`'],
            ['Associations', '`hasOne`, `belongsTo`, `hasMany`, `belongsToMany({ through })`'],
            ['Eager loading', '`include: [{ model: Post, as: \'posts\' }]`'],
            ['Migrations', '`sequelize-cli` (`npx sequelize-cli migration:generate`, `db:migrate`, `db:migrate:undo`)'],
          ]),
        table('Associations — where the FK goes', ['Call', 'Relationship', 'FK location'],
          [
            ['User.hasOne(Profile)', '1:1', 'profiles.userId'],
            ['Profile.belongsTo(User)', '1:1 / N:1', 'profiles.userId (on the source model)'],
            ['User.hasMany(Post)', '1:N', 'posts.userId'],
            ['Post.belongsToMany(Tag, { through: \'PostTags\' })', 'N:M', 'Junction table PostTags(postId, tagId)'],
          ]),
        note('Define associations in **pairs** (hasMany + belongsTo) so both sides get accessor methods and include works in both directions.'),
      ),
      section('why', 'When you meet Sequelize',
        bullets(
          'Many existing Express apps use it — reading and maintaining it is a practical skill.',
          'Supports several SQL dialects with one API.',
          'Weaker TypeScript ergonomics than Prisma/Drizzle (Sequelize v7 improves this; v6 is the stable line).',
        ),
      ),
      section('internals', 'sync() vs migrations',
        table('Schema management', ['', 'sequelize.sync()', 'Migrations (sequelize-cli)'],
          [
            ['How', 'Creates tables from models at startup', 'Versioned up/down files in git'],
            ['alter / force', '`alter: true` guesses changes; `force: true` DROPS tables', 'Explicit changes you review'],
            ['Use in', 'Prototypes, tests', 'Everything that has real data'],
            ['History', 'None', 'SequelizeMeta table records applied migrations'],
          ]),
        warn('`sync({ force: true })` drops and recreates tables — never in production.'),
      ),
      section('example', 'Models, associations and queries',
        code({
          title: 'models.js',
          code: dedent(`
            import { Sequelize, DataTypes } from 'sequelize';

            export const sequelize = new Sequelize(process.env.DATABASE_URL, {
              dialect: 'postgres',
              logging: false,
              pool: { max: 10, idle: 10_000, acquire: 30_000 },
            });

            export const User = sequelize.define('User', {
              email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
              name: DataTypes.STRING,
            }, { tableName: 'users', underscored: true, paranoid: true }); // soft delete via deleted_at

            export const Post = sequelize.define('Post', {
              title: { type: DataTypes.STRING, allowNull: false },
              published: { type: DataTypes.BOOLEAN, defaultValue: false },
            }, { tableName: 'posts', underscored: true });

            export const Tag = sequelize.define('Tag', { name: { type: DataTypes.STRING, unique: true } }, { tableName: 'tags', underscored: true });

            User.hasMany(Post, { as: 'posts', foreignKey: 'userId', onDelete: 'CASCADE' });
            Post.belongsTo(User, { as: 'author', foreignKey: 'userId' });
            Post.belongsToMany(Tag, { through: 'post_tags', as: 'tags' });
            Tag.belongsToMany(Post, { through: 'post_tags', as: 'posts' });
          `),
          expectedOutput: '(models and associations registered)',
          explanation: [
            'Sequelize adds `id`, `createdAt`, `updatedAt` by default; `underscored: true` maps them to snake_case columns.',
            '`paranoid: true` makes `destroy()` set `deletedAt` and hides those rows from queries.',
            'Model validators (`isEmail`) run on create/save; DB constraints (`unique`) are enforced by Postgres.',
          ],
        }),
        code({
          title: 'Queries with eager loading',
          code: dedent(`
            import { Op } from 'sequelize';

            const ana = await User.create({ email: 'ana@example.com', name: 'Ana' });
            await Post.bulkCreate([{ title: 'Hello', published: true, userId: ana.id }, { title: 'Draft', userId: ana.id }]);

            const users = await User.findAll({
              where: { email: { [Op.iLike]: '%@example.com' } },
              include: [{ model: Post, as: 'posts', where: { published: true }, required: false, attributes: ['title'] }],
              attributes: ['id', 'email'],
            });
            console.log(JSON.stringify(users.map((u) => u.toJSON())));

            const [count] = await Post.update({ published: true }, { where: { userId: ana.id, published: false } });
            console.log(count);
          `),
          expectedOutput: dedent(`
            [{"id":1,"email":"ana@example.com","posts":[{"title":"Hello"}]}]
            1
          `),
          explanation: [
            '`include` generates a LEFT OUTER JOIN; `required: false` keeps users without published posts (without it, a `where` inside include makes it an INNER JOIN).',
            '`Op.iLike` is Postgres case-insensitive LIKE; Sequelize parameterises the value.',
            'Static `Model.update` returns `[affectedCount]` (plus rows with `returning: true` on Postgres).',
          ],
        }),
        code({
          title: 'A migration and a managed transaction',
          code: dedent(`
            // migrations/20261108-add-slug-to-posts.js
            export async function up(queryInterface, Sequelize) {
              await queryInterface.addColumn('posts', 'slug', { type: Sequelize.STRING, allowNull: true });
              await queryInterface.addIndex('posts', ['slug'], { unique: true });
            }
            export async function down(queryInterface) {
              await queryInterface.removeColumn('posts', 'slug');
            }

            // Managed transaction: commit on resolve, rollback on throw
            await sequelize.transaction(async (t) => {
              const post = await Post.create({ title: 'T', userId: 1 }, { transaction: t });
              await post.setTags([1, 2], { transaction: t });
            });
          `),
          expectedOutput: '== 20261108-add-slug-to-posts: migrated (0.021s)',
          explanation: [
            'Every query in the transaction must receive `{ transaction: t }` — or enable CLS (`Sequelize.useCLS`) to pass it implicitly.',
            '`setTags` is an accessor method generated by `belongsToMany`.',
            'sequelize-cli traditionally expects CommonJS `module.exports = { up, down }`; ESM support depends on your config/version.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Run `npx sequelize-cli db:migrate` in the deploy pipeline; never `sync({ alter: true })` on production.',
          'Use `attributes` to avoid fetching sensitive columns; use `defaultScope` to exclude `passwordHash`.',
          'Turn on `logging: console.log` in development to see generated SQL and spot N+1 or huge joins.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting `{ transaction: t }` on one query — it runs outside the transaction.',
          'Declaring only one side of an association, then `include` fails ("X is not associated to Y").',
          'Using `sync({ force: true })` in a shared environment.',
          'Including several hasMany associations at once → row explosion; use `separate: true` for hasMany includes.',
          '`sequelize.query` with string interpolation instead of `replacements`/`bind`.',
        ),
        code({
          title: 'Wrong vs right: transaction option',
          code: dedent(`
            // ❌
            await sequelize.transaction(async (t) => {
              await Order.create(data, { transaction: t });
              await Stock.decrement('qty', { where: { id } });        // outside!
            });

            // ✅
            await sequelize.transaction(async (t) => {
              await Order.create(data, { transaction: t });
              await Stock.decrement('qty', { where: { id }, transaction: t });
            });
          `),
          expectedOutput: '(first: decrement commits independently even if the order insert rolls back)',
          explanation: ['Without CLS, Sequelize cannot know a query belongs to the transaction.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Know which side gets the FK: hasOne/hasMany put it on the target; belongsTo puts it on the source.'),
        interviewTip('Say clearly that sync() is not a migration strategy.'),
      ),
      section('practice', 'Practice',
        steps(
          'Add Comment (belongs to Post and User) with a migration.',
          'Fetch a post with author name, tags and comment count in one call (hint: include + attributes with sequelize.fn).',
          'Wrap "create post + attach tags" in a managed transaction.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Active Record ORM over several SQL dialects (uses pg for Postgres).',
          'Associations: hasOne, belongsTo, hasMany, belongsToMany({ through }).',
          'Eager loading with include (LEFT JOIN unless required/where).',
          'Migrations via sequelize-cli; sync() only for prototypes/tests.',
          'Pass `{ transaction: t }` to every query in a transaction.',
        ),
      ),
    ],
    revisionNotes: [
      'hasOne/hasMany → FK on target; belongsTo → FK on source.',
      'belongsToMany requires `through` (junction table).',
      'include + where → INNER JOIN unless required: false.',
      'paranoid: true → soft delete with deletedAt.',
      'sync({ force: true }) drops tables.',
      'Managed transaction: sequelize.transaction(async t => …) — pass { transaction: t }.',
      'Raw queries: replacements / bind, never interpolation.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'After `Post.belongsTo(User)`, which table holds the foreign key?',
        options: ['users (userId column)', 'posts (userId column)', 'A junction table', 'Neither; it is virtual'],
        answer: 1,
        explanation: 'belongsTo places the FK on the source model (Post). hasMany(Post) from User would also put it on posts.',
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'A developer wants to add a column in production by changing the model and calling sequelize.sync({ force: true }) on startup. What do you recommend?',
        options: ['Fine, it is the official way', 'Use a migration with queryInterface.addColumn and run db:migrate; force: true drops the table', 'Use sync({ alter: true }) on every boot', 'Edit the table manually in production'],
        answer: 1,
        explanation: 'force: true deletes all data. Migrations are reviewed, versioned and reversible; alter: true guesses changes and is risky with real data.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'Ana has 0 published posts, Ben has 1. How many users are returned?',
        code: "await User.findAll({\n  include: [{ model: Post, as: 'posts', where: { published: true } }],\n});",
        options: ['0', '1', '2', 'Error'],
        answer: 1,
        explanation: 'A where inside include makes it required (INNER JOIN), so Ana is dropped. Add required: false to keep her.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Sequelize',
        question: 'What are Sequelize associations and how do you define a many-to-many relationship?',
        shortAnswer: 'Associations declare relationships between models (hasOne, belongsTo, hasMany, belongsToMany); many-to-many uses belongsToMany on both models with a `through` junction table.',
        detailedAnswer: [
          '`Post.belongsToMany(Tag, { through: \'post_tags\' })` and the inverse on Tag.',
          'Sequelize creates accessors like `post.getTags()`, `post.addTag()`, `post.setTags()`.',
          'A through model can hold extra columns (e.g. addedAt).',
          'Declare both directions to include from either side.',
        ],
        followUp: 'How would you add an extra column to the junction table?',
        trap: 'Declaring only one side and expecting include to work both ways.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Sequelize',
        question: 'Why should you use migrations instead of sequelize.sync() in production?',
        shortAnswer: 'Migrations are explicit, versioned, reviewable and reversible schema changes recorded in the database, whereas sync() infers changes from models at runtime, can drop data with force, and keeps no history.',
        detailedAnswer: [
          'sync({ force: true }) drops tables; sync({ alter: true }) may drop or change columns unexpectedly.',
          'Migrations can include data backfills and zero-downtime steps.',
          'SequelizeMeta tracks which migrations ran in each environment.',
          'CI applies migrations before deploying new code.',
        ],
        followUp: 'How do you make a column rename zero-downtime?',
        trap: 'Thinking alter: true is safe because it does not drop the table.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'database-architecture': {
    summary: 'Database architecture covers how data is shaped (normalisation vs denormalisation), evolved (migrations), and scaled (read replicas, partitioning, sharding), and how you choose a database for a workload.',
    topics: ['normalization', '1NF', '2NF', '3NF', 'denormalization', 'migrations', 'expand and contract', 'read replicas', 'replication lag', 'partitioning', 'sharding', 'shard key', 'vertical scaling', 'choosing a database', 'polyglot persistence'],
    sections: [
      section('introduction', undefined,
        text('Writing queries is only half the job. As an app grows you must decide how data is structured, how the schema changes safely while the app runs, and how the database scales beyond one server.'),
      ),
      section('definition', 'Normalisation vs denormalisation',
        table('Normal forms (simplified)', ['Form', 'Rule', 'Violation example'],
          [
            ['1NF', 'Atomic values, no repeating groups', '`tags = \'a,b,c\'` in one column'],
            ['2NF', '1NF + no partial dependency on part of a composite key', 'order_items(order_id, product_id, product_name)'],
            ['3NF', '2NF + no transitive dependency (non-key → non-key)', 'orders(customer_id, customer_email)'],
          ]),
        table('Trade-off', ['', 'Normalised', 'Denormalised'],
          [
            ['Duplication', 'Each fact once', 'Copies of data'],
            ['Writes', 'Simple, consistent', 'Must update every copy'],
            ['Reads', 'Joins needed', 'Fewer joins, faster hot reads'],
            ['Typical use', 'OLTP source of truth', 'Read models, caches, analytics, documents'],
          ]),
      ),
      section('why', 'Why architecture decisions matter',
        bullets(
          'Schema mistakes are expensive to fix once tables hold millions of rows.',
          'A migration that locks a big table can take the whole API down.',
          'Scaling strategy (replicas vs sharding) shapes your code: routing reads, choosing shard keys.',
        ),
      ),
      section('internals', 'Scaling patterns',
        table('Scaling options, roughly in order of adoption', ['Technique', 'What it does', 'Cost / caveat'],
          [
            ['Indexes + query tuning', 'Make existing queries cheap', 'Cheapest; do first'],
            ['Vertical scaling', 'Bigger CPU/RAM/disk', 'Simple; has a ceiling'],
            ['Caching (Redis)', 'Serve hot reads from memory', 'Invalidation complexity'],
            ['Read replicas', 'Async copies serve reads', 'Replication lag → stale reads'],
            ['Partitioning', 'Split one table into parts on the **same** server (by range/list/hash)', 'Partition key in queries; easier retention'],
            ['Sharding', 'Split data across **multiple** servers by a shard key', 'Cross-shard queries/transactions are hard; resharding is painful'],
          ]),
        bullets(
          '**Replication lag**: after a write to the primary, a replica may not have it yet — read-your-own-writes from the primary for that user/session.',
          '**Shard key** choice: high cardinality, even distribution, and present in most queries (e.g. `tenant_id`). A monotonically increasing key (timestamp) creates a hot shard.',
          'Postgres has native declarative partitioning; sharding uses extensions/services (e.g. Citus) or app-level routing. MongoDB shards natively.',
        ),
      ),
      section('visual', 'Primary with read replicas',
        flow(['API writes: → Primary', 'Primary: streams WAL', 'Replica 1 / Replica 2: replay WAL (lag ms–s)', 'API reads: → replicas (except read-your-writes)'], { title: 'Read scaling with replicas', direction: 'vertical' }),
      ),
      section('example', 'Migrations and routing',
        code({
          title: 'Zero-downtime column rename: expand and contract',
          language: 'sql',
          code: dedent(`
            -- 1. Expand: add the new column (nullable, no default rewrite)
            ALTER TABLE users ADD COLUMN full_name text;

            -- 2. Deploy code that writes BOTH name and full_name
            -- 3. Backfill in batches to avoid long locks
            UPDATE users SET full_name = name WHERE full_name IS NULL AND id BETWEEN 1 AND 10000;

            -- 4. Deploy code that reads full_name only
            -- 5. Contract: drop the old column
            ALTER TABLE users DROP COLUMN name;
          `),
          expectedOutput: dedent(`
            ALTER TABLE
            UPDATE 10000
            ALTER TABLE
          `),
          explanation: [
            'A direct `RENAME COLUMN` breaks the old app version still running during a rolling deploy.',
            'Each step is backward compatible with the code running at that time.',
            'Add indexes with `CREATE INDEX CONCURRENTLY`; add NOT NULL via a `CHECK ... NOT VALID` constraint then `VALIDATE CONSTRAINT` on big tables.',
          ],
        }),
        code({
          title: 'Routing reads to a replica',
          code: dedent(`
            import pg from 'pg';
            const primary = new pg.Pool({ connectionString: process.env.DATABASE_URL });
            const replica = new pg.Pool({ connectionString: process.env.DATABASE_REPLICA_URL });

            export const db = {
              write: (text, values) => primary.query(text, values),
              read: (text, values, { fresh = false } = {}) => (fresh ? primary : replica).query(text, values),
            };

            // After updating a profile, read it back from the primary to avoid stale data
            await db.write('UPDATE users SET name = $1 WHERE id = $2', ['Ana S.', 1]);
            const { rows } = await db.read('SELECT name FROM users WHERE id = $1', [1], { fresh: true });
            console.log(rows[0].name);
          `),
          expectedOutput: 'Ana S.',
          explanation: ['Reading from the replica immediately could return the old name due to replication lag.'],
        }),
        code({
          title: 'Declarative partitioning by month',
          language: 'sql',
          code: dedent(`
            CREATE TABLE events (
              id bigint GENERATED ALWAYS AS IDENTITY,
              occurred_at timestamptz NOT NULL,
              payload jsonb,
              PRIMARY KEY (id, occurred_at)            -- PK must include the partition key
            ) PARTITION BY RANGE (occurred_at);

            CREATE TABLE events_2026_11 PARTITION OF events
              FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

            -- Retention: drop a whole month instantly instead of a huge DELETE
            DROP TABLE events_2026_05;
          `),
          expectedOutput: 'CREATE TABLE\nCREATE TABLE\nDROP TABLE',
          explanation: ['Queries filtering on `occurred_at` scan only matching partitions (partition pruning).'],
        }),
      ),
      section('real-world', 'Choosing a database',
        table('Workload → typical choice', ['Workload', 'Typical choice', 'Why'],
          [
            ['Transactions, money, inventory', 'PostgreSQL / MySQL', 'ACID, constraints, joins'],
            ['Flexible content, catalogs', 'MongoDB or Postgres jsonb', 'Document shape varies'],
            ['Cache, sessions, rate limits, queues', 'Redis', 'In-memory, TTL, atomic ops'],
            ['Full-text search, facets', 'Elasticsearch / OpenSearch / Meilisearch', 'Inverted indexes, relevance'],
            ['Huge write-heavy time series', 'Cassandra / TimescaleDB / ClickHouse', 'Partitioned writes, columnar analytics'],
            ['Relationship traversal', 'Neo4j', 'Graph queries'],
          ]),
        bullets('Default to one boring, well-understood relational database; add others when a measured need appears.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Sharding before exhausting indexes, query fixes, vertical scaling and replicas.',
          'Reading from replicas right after writes (stale UI).',
          'Destructive migrations (rename/drop) in the same deploy as the code change.',
          'Over-normalising read-heavy paths or denormalising without a plan to keep copies in sync.',
          'Choosing a shard key with low cardinality (country) or monotonic values (timestamps).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('System design rounds: describe the scaling ladder (index → cache → replicas → partition → shard) and the trade-off at each step.'),
        interviewTip('Distinguish partitioning (same server) from sharding (many servers) clearly.'),
      ),
      section('practice', 'Practice',
        steps(
          'Normalise a spreadsheet-like `orders(customer_name, customer_email, product_name, product_price, qty)` table to 3NF.',
          'Plan an expand/contract migration that splits `name` into `first_name` and `last_name`.',
          'Pick a shard key for a multi-tenant SaaS and justify it.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Normalise the source of truth (3NF); denormalise read models deliberately.',
          'Migrations are versioned and backward compatible (expand → migrate → contract).',
          'Replicas scale reads but lag; partitioning splits tables on one server; sharding splits across servers.',
          'Choose databases by workload; start simple.',
        ),
      ),
    ],
    revisionNotes: [
      '1NF atomic, 2NF no partial dependency, 3NF no transitive dependency.',
      'Expand → dual write → backfill → switch reads → contract.',
      'Replicas: async, lag → read-your-writes from primary.',
      'Partitioning = one server; sharding = many servers.',
      'Good shard key: high cardinality, even, used in queries; avoid monotonic.',
      'Partitioned PK must include partition key; DROP partition for retention.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the key difference between partitioning and sharding?',
        options: ['There is none', 'Partitioning splits a table within one database server; sharding distributes data across multiple servers', 'Sharding only applies to indexes', 'Partitioning requires NoSQL'],
        answer: 1,
        explanation: 'Both split data by a key, but sharding spreads it across machines, bringing cross-shard query and transaction complexity.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'After users edit their profile, they sometimes see the old values on the next page load. Reads go to replicas. What is the fix?',
        options: ['Disable replication', 'Read-your-own-writes: route that user\'s reads to the primary for a short time after a write (or the immediate read-back)', 'Add an index', 'Increase the pool size'],
        answer: 1,
        explanation: 'This is replication lag. Routing post-write reads to the primary (or waiting for the replica to catch up) fixes it without giving up replicas.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'This migration runs during a rolling deploy where old and new app versions coexist. What breaks?',
        code: 'ALTER TABLE users RENAME COLUMN name TO full_name;',
        options: ['Nothing; renames are instant', 'Old app instances still query "name" and start failing; use expand/contract instead', 'Postgres cannot rename columns', 'The table is dropped'],
        answer: 1,
        explanation: 'The rename is fast but not backward compatible. Add the new column, dual-write, backfill, switch reads, then drop the old column.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Database architecture',
        question: 'What is the difference between normalisation and denormalisation, and when would you denormalise?',
        shortAnswer: 'Normalisation removes duplication so each fact is stored once (consistent writes); denormalisation deliberately duplicates data to make hot reads cheaper — you do it for read-heavy paths, reporting, or document models, accepting the work of keeping copies in sync.',
        detailedAnswer: [
          'Normalise the transactional source of truth to 3NF.',
          'Denormalise with counters (comment_count), snapshots (order price), materialised views, or read models.',
          'Keep copies in sync via transactions, triggers, or events.',
          'Measure first — joins on indexed keys are often fast enough.',
        ],
        followUp: 'How would you keep a denormalised comment_count accurate under concurrency?',
        trap: 'Saying denormalisation is always faster with no downside.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Database architecture',
        question: 'Your single Postgres primary is at 90% CPU. Walk through how you would scale it.',
        shortAnswer: 'First find what is consuming CPU (pg_stat_statements) and fix queries and indexes; then add caching for hot reads, move reads to replicas with read-your-writes handling, scale vertically, use partitioning for huge tables, and only shard (e.g. by tenant) when a single primary truly cannot handle the write load.',
        detailedAnswer: [
          'Often a few queries dominate — EXPLAIN them, add indexes, remove N+1s.',
          'Connection pooling (PgBouncer) if connection churn is high.',
          'Cache aside with Redis for expensive, frequently read data.',
          'Read replicas for read-heavy workloads; route analytics there.',
          'Sharding: pick a key present in most queries; plan for cross-shard operations.',
        ],
        followUp: 'What metrics would tell you that sharding is necessary?',
        trap: 'Jumping straight to sharding or switching to NoSQL.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'repository-pattern': {
    summary: 'A repository hides data-access code behind a small interface (findById, create, …) so services depend on the interface, and you can swap a Postgres implementation for an in-memory one in tests.',
    topics: ['repository', 'data access layer', 'interface', 'dependency injection', 'in-memory repository', 'PostgreSQL repository', 'mapping rows to entities', 'unit tests', 'transactions across repositories', 'unit of work'],
    sections: [
      section('introduction', undefined,
        text('When SQL lives inside route handlers, every handler is tied to the database, hard to test and full of duplicated queries. A **repository** collects all data access for one entity in one place behind a stable interface.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **repository** is an object with collection-like methods for an aggregate: `findById`, `findByEmail`, `create`, `update`, `delete`, `list`.',
          'Services call the repository; only the repository knows SQL, Mongoose or Prisma.',
          'It maps database rows/documents to plain domain objects (camelCase, no driver types).',
          'This lesson focuses on the practical data-access side; Module 15 covers the pattern from a design-patterns perspective.',
        ),
      ),
      section('why', 'Why bother',
        table('Without vs with a repository', ['', 'SQL in handlers', 'Repository'],
          [
            ['Testing services', 'Needs a real DB or mocking pg', 'Inject an in-memory repo'],
            ['Changing ORM/DB', 'Edit every handler', 'Edit one implementation'],
            ['Query reuse', 'Copy-paste', 'One method'],
            ['Error mapping (23505 → Conflict)', 'Scattered', 'Centralised'],
          ]),
      ),
      section('internals', 'Where it sits',
        diagram('layered-architecture', 'Route → controller → service → repository → database. Only the repository talks to the driver.'),
        steps(
          'Define the contract (TypeScript interface or JSDoc).',
          'Implement it for Postgres (pg) — and/or Mongo, Prisma.',
          'Implement it in memory (a Map) for tests and prototypes.',
          'Wire the real implementation in a composition root (`app.js`) and inject it into services.',
          'For transactions spanning several repositories, pass a transaction client (unit of work) into repository factories.',
        ),
      ),
      section('visual', 'Swapping implementations',
        flow(['UserService(repo)', 'Production: PgUserRepository(pool)', 'Tests: InMemoryUserRepository()'], { title: 'Same service, different repositories', direction: 'horizontal' }),
      ),
      section('example', 'Interface + two implementations',
        code({
          title: 'user-repository.ts (contract)',
          language: 'typescript',
          code: dedent(`
            export interface User { id: string; email: string; name: string | null; createdAt: Date }
            export interface NewUser { email: string; name?: string }

            export interface UserRepository {
              findById(id: string): Promise<User | null>;
              findByEmail(email: string): Promise<User | null>;
              create(data: NewUser): Promise<User>;
              list(opts: { limit: number; afterId?: string }): Promise<User[]>;
            }

            export class EmailTakenError extends Error {}
          `),
          explanation: ['The interface speaks in domain types (`User`), not `QueryResult` or Mongoose documents.'],
        }),
        code({
          title: 'pg-user-repository.ts',
          language: 'typescript',
          code: dedent(`
            import type { Pool, PoolClient } from 'pg';
            import { EmailTakenError, type NewUser, type User, type UserRepository } from './user-repository';

            const toUser = (r: any): User => ({ id: String(r.id), email: r.email, name: r.name, createdAt: r.created_at });

            export class PgUserRepository implements UserRepository {
              constructor(private db: Pool | PoolClient) {}   // pool, or a client inside a transaction

              async findById(id: string) {
                const { rows } = await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
                return rows[0] ? toUser(rows[0]) : null;
              }
              async findByEmail(email: string) {
                const { rows } = await this.db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
                return rows[0] ? toUser(rows[0]) : null;
              }
              async create(data: NewUser) {
                try {
                  const { rows } = await this.db.query(
                    'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *',
                    [data.email.toLowerCase(), data.name ?? null],
                  );
                  return toUser(rows[0]);
                } catch (err: any) {
                  if (err.code === '23505') throw new EmailTakenError(data.email);
                  throw err;
                }
              }
              async list({ limit, afterId }: { limit: number; afterId?: string }) {
                const { rows } = await this.db.query(
                  'SELECT * FROM users WHERE ($1::bigint IS NULL OR id > $1) ORDER BY id LIMIT $2',
                  [afterId ?? null, limit],
                );
                return rows.map(toUser);
              }
            }
          `),
          explanation: [
            'Accepting `Pool | PoolClient` lets the same class run inside a transaction.',
            'DB-specific details (snake_case, bigint strings, SQLSTATE codes) stop here.',
            'Keyset pagination keeps the contract efficient.',
          ],
        }),
        code({
          title: 'In-memory repository + service + test (pure JS, runnable)',
          code: dedent(`
            class EmailTakenError extends Error {}

            class InMemoryUserRepository {
              #rows = new Map();
              #seq = 0;
              async findById(id) { return this.#rows.get(id) ?? null; }
              async findByEmail(email) {
                for (const u of this.#rows.values()) if (u.email === email.toLowerCase()) return u;
                return null;
              }
              async create({ email, name = null }) {
                if (await this.findByEmail(email)) throw new EmailTakenError(email);
                const user = { id: String(++this.#seq), email: email.toLowerCase(), name, createdAt: new Date(0) };
                this.#rows.set(user.id, user);
                return user;
              }
              async list({ limit, afterId }) {
                return [...this.#rows.values()].filter((u) => !afterId || Number(u.id) > Number(afterId)).slice(0, limit);
              }
            }

            class UserService {
              constructor(repo) { this.repo = repo; }
              async register(email, name) {
                try { return await this.repo.create({ email, name }); }
                catch (e) { if (e instanceof EmailTakenError) return { error: 'EMAIL_TAKEN' }; throw e; }
              }
            }

            (async () => {
              const service = new UserService(new InMemoryUserRepository());
              const a = await service.register('Ana@Example.com', 'Ana');
              const b = await service.register('ana@example.com', 'Imposter');
              console.log(a.id, a.email);
              console.log(b);
              console.log((await service.repo.list({ limit: 10 })).length);
            })();
          `),
          expectedOutput: "1 ana@example.com\n{ error: 'EMAIL_TAKEN' }\n1",
          explanation: [
            'The service never knows which repository it has — the test injects the in-memory one.',
            'The fake mimics the real contract, including the duplicate-email behaviour (same normalisation, same error type).',
            'Keep a few integration tests against real Postgres too: fakes cannot catch SQL bugs.',
          ],
          runnable: true,
        }),
        code({
          title: 'Wiring and transactions across repositories',
          code: dedent(`
            // composition root (app.js)
            const users = new PgUserRepository(pool);
            const userService = new UserService(users);
            app.post('/users', makeCreateUserHandler(userService));

            // Unit of work: repositories share one transaction client
            await withTransaction(async (client) => {
              const usersTx = new PgUserRepository(client);
              const auditTx = new PgAuditRepository(client);
              const user = await usersTx.create({ email });
              await auditTx.record('user.created', user.id);
            });
          `),
          expectedOutput: '(both inserts commit together or roll back together)',
          explanation: ['`withTransaction` is the helper from the transactions lesson (pool.connect + BEGIN/COMMIT/ROLLBACK + release).'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'One repository per aggregate (UserRepository, OrderRepository) — not one per table, and not a generic `Repository<T>` with 30 methods.',
          'Name methods after use cases (`findActiveByTenant`) rather than exposing a query language.',
          'With Prisma/Mongoose, the repository still adds value: mapping, error translation, and a seam for tests.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Leaking ORM objects (Mongoose documents, Prisma types with relations) out of the repository.',
          'Putting business rules (pricing, permissions) in repositories — they belong in services.',
          'A fake that behaves differently from the real implementation (e.g. no uniqueness check).',
          'Opening transactions inside each repository method, so multi-step use cases are not atomic.',
        ),
        code({
          title: 'Wrong vs right: what the service sees',
          code: dedent(`
            // ❌ service depends on pg directly
            async function register(email) {
              const { rows } = await pool.query('INSERT INTO users (email) VALUES ($1) RETURNING *', [email]);
              return rows[0];               // snake_case row with bigint string id
            }

            // ✅ service depends on the contract
            async function register2(repo, email) {
              return repo.create({ email }); // returns a domain User
            }
          `),
          expectedOutput: '(second version can be unit-tested with InMemoryUserRepository)',
          explanation: ['Dependency injection is what makes the swap possible — pass the repository in.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show the interface, one real implementation and one fake — and mention integration tests against a real DB (e.g. Testcontainers).'),
        interviewTip('Explain how transactions spanning repositories work (shared client / unit of work).'),
      ),
      section('practice', 'Practice',
        steps(
          'Create `ProductRepository` with `findBySku`, `create`, `decrementStock(id, qty)` (returns false if insufficient).',
          'Implement it for Postgres (conditional UPDATE + rowCount) and in memory.',
          'Write a service test for "order fails when stock is insufficient" using the in-memory version.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Repository = interface + implementations; services depend on the interface.',
          'Repositories map rows to domain objects and translate DB errors.',
          'In-memory implementations make fast, deterministic service tests.',
          'Share a transaction client across repositories for atomic use cases.',
        ),
      ),
    ],
    revisionNotes: [
      'Only repositories touch the driver/ORM.',
      'Return domain objects, never driver/ORM types.',
      'Translate errors (23505 → EmailTakenError).',
      'Inject repos into services (composition root).',
      'In-memory fake must honour the same contract (uniqueness, normalisation).',
      'Transactions: construct repos with the tx client.',
      'Still run integration tests against a real DB.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the main testing benefit of the repository pattern?',
        options: ['Queries run faster', 'Services can be tested with an in-memory implementation instead of a real database', 'It removes the need for integration tests', 'It encrypts data'],
        answer: 1,
        explanation: 'Injecting a fake repository makes service tests fast and deterministic. You still need some integration tests to verify the real SQL.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'A service test passes, but production returns 500 on duplicate signups. What is wrong with the fake?',
        code: 'class FakeUserRepo {\n  rows = [];\n  async create(u) { this.rows.push(u); return u; }\n}',
        options: ['It should use a Map', 'It does not reproduce the real contract: duplicate emails should throw EmailTakenError like the Postgres version', 'create must be synchronous', 'Fakes cannot be classes'],
        answer: 1,
        explanation: 'A fake must honour the same behaviour as the real implementation, including error cases; otherwise tests give false confidence.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Creating a user and writing an audit record must be atomic, but each repository uses pool.query. What change do you make?',
        options: ['Call both inside Promise.all', 'Construct both repositories with the same transaction client from pool.connect() inside a withTransaction helper', 'Add a retry loop', 'Merge the tables'],
        answer: 1,
        explanation: 'A transaction lives on one connection. Repositories that accept a client can participate in the same unit of work. Promise.all only runs them concurrently, not atomically.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Repository pattern',
        question: 'How would you structure data access in an Express app so services can be unit tested without a database?',
        shortAnswer: 'Put all queries in repositories behind an interface, inject repositories into services from a composition root, and use an in-memory implementation of the same interface in unit tests, keeping integration tests for the real implementation.',
        detailedAnswer: [
          'Routes → controllers → services → repositories → driver.',
          'Repositories return domain objects and throw domain errors.',
          'Services receive repos via constructor or factory parameters.',
          'In-memory fakes honour the same contract (uniqueness, ordering).',
          'Integration tests run the Pg repository against a disposable Postgres.',
        ],
        followUp: 'Mocks vs fakes: which would you use for repositories and why?',
        trap: 'Mocking pool.query in every service test, coupling tests to SQL strings.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Repository pattern',
        question: 'How do you support transactions that span multiple repositories without leaking database details into services?',
        shortAnswer: 'Introduce a unit-of-work abstraction: a `withTransaction(fn)` function that opens one transaction and passes the service a set of repositories bound to that transaction\'s client, committing or rolling back based on the callback\'s outcome.',
        detailedAnswer: [
          'Repositories accept a "queryable" (pool or transaction client).',
          'The unit of work creates tx-bound repositories: `uow.run(async ({ users, audit }) => ...)`.',
          'Services depend on the unit-of-work interface, not on pg.',
          'The in-memory unit of work can just run the callback (or snapshot/restore for rollback).',
          'With Prisma, pass the `tx` client; with Sequelize, the `t` transaction or CLS.',
        ],
        followUp: 'How would you emit domain events only after the transaction commits (outbox pattern)?',
        trap: 'Starting a separate transaction inside each repository method.',
      },
    ],
  },
};

export default content;

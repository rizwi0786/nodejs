import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ─────────────────────────────────────────────────────────────
  relationships: {
    summary: 'In MongoDB you model relationships by embedding related data inside a document or by referencing other documents by _id; Mongoose populate() resolves references with extra queries.',
    topics: ['embedding', 'referencing', 'one-to-few', 'one-to-many', 'one-to-squillions', 'populate', 'N+1 problem', 'denormalization', 'subset pattern', 'extended reference', '$lookup'],
    sections: [
      section('introduction', undefined,
        text('MongoDB has no foreign keys and joins are not its main tool. The central design decision is: **embed** the related data in the parent document, or **reference** it by id in another collection?'),
      ),
      section('definition', 'Embedding vs referencing',
        table('Embed or reference?', ['Factor', 'Embed', 'Reference'],
          [
            ['Read pattern', 'Always read together with parent', 'Read independently / sometimes'],
            ['Cardinality', 'One-to-few (addresses, line items)', 'One-to-many / many-to-many, unbounded'],
            ['Growth', 'Bounded, small', 'Unbounded (comments, logs) → reference'],
            ['Updates', 'Atomic with parent in one write', 'Separate writes; may need transaction'],
            ['Duplication', 'Data copied if shared', 'Single source of truth'],
            ['Document size', 'Counts toward 16 MB', 'Separate documents'],
          ]),
        bullets(
          '**Child referencing**: parent stores an array of child ids (`post.commentIds`) — fine for bounded lists.',
          '**Parent referencing**: child stores the parent id (`comment.postId`) — scales to millions (one-to-squillions).',
          '**Extended reference**: store id + a few frequently read fields (e.g. `author: { _id, name }`) to avoid lookups.',
        ),
      ),
      section('why', 'Rule of thumb',
        bullets(
          '"Data that is accessed together should be stored together."',
          'Design for your queries, not for normal forms.',
          'Duplication is acceptable if the duplicated data rarely changes (author name) — and you accept updating copies.',
        ),
      ),
      section('internals', 'How populate works',
        steps(
          'Schema field: `author: { type: Schema.Types.ObjectId, ref: \'User\' }`.',
          '`Post.find().populate(\'author\')` runs the posts query first.',
          'Mongoose collects all distinct author ids and runs **one** `User.find({ _id: { $in: ids } })`.',
          'It stitches the users into the posts in memory.',
          'So it is 2 queries, not N+1 — but it is still an application-side join, not a database join.',
          'Nested `populate({ path, populate: {...} })` adds one query per level.',
        ),
        warn('Writing your own loop `for (post of posts) await User.findById(post.author)` **is** the N+1 problem: 1 query for posts + N for authors.'),
      ),
      section('visual', 'N+1 vs populate',
        flow(['Query posts: 1 query → 50 posts', 'Loop: findById × 50 = N+1 (51 queries)', 'populate: 1 $in query (2 total)', '$lookup: 1 aggregation (1 total)'], { title: 'Round trips for 50 posts with authors', direction: 'vertical' }),
      ),
      section('example', 'Modelling a blog',
        code({
          title: 'Schemas: embed, reference, extended reference',
          code: dedent(`
            const userSchema = new Schema({ name: String, email: String });

            const postSchema = new Schema({
              title: String,
              author: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // reference
              tags: [String],                                                         // embedded (few)
              lastComments: [{ by: String, text: String, at: Date }],                 // subset pattern (≤ 3)
            });
            postSchema.index({ author: 1 });

            const commentSchema = new Schema({
              post: { type: Schema.Types.ObjectId, ref: 'Post', index: true },       // parent reference
              author: { _id: Schema.Types.ObjectId, name: String },                   // extended reference
              text: String,
            });
          `),
          expectedOutput: '(schemas compile; no output)',
          explanation: [
            'Tags are few and always shown with the post → embed.',
            'Comments are unbounded → separate collection referencing the post.',
            'The post keeps only the latest 3 comments embedded for the list view (subset pattern), updated with `$push` + `$slice: -3`.',
          ],
        }),
        code({
          title: 'populate with select and nested populate',
          code: dedent(`
            const posts = await Post.find({ tags: 'node' })
              .select('title author')
              .populate({ path: 'author', select: 'name -_id' })
              .lean();
            console.log(posts);
          `),
          expectedOutput: dedent(`
            [
              { _id: new ObjectId('672de3a0f1c2b84d5e9a1b30'), title: 'Streams 101', author: { name: 'Ana' } },
              { _id: new ObjectId('672de3a0f1c2b84d5e9a1b31'), title: 'Event loop', author: { name: 'Ben' } }
            ]
          `),
          explanation: [
            'Mongoose executed two queries: posts, then users with `$in`.',
            '`select` inside populate limits the fields fetched from users.',
            'If a referenced user was deleted, `author` becomes `null` — there is no FK to stop it.',
          ],
        }),
        code({
          title: 'The N+1 anti-pattern (pure JS simulation)',
          code: dedent(`
            let queries = 0;
            const db = {
              posts: [{ id: 1, authorId: 'a' }, { id: 2, authorId: 'b' }, { id: 3, authorId: 'a' }],
              users: { a: 'Ana', b: 'Ben' },
              findPosts() { queries++; return this.posts; },
              findUser(id) { queries++; return this.users[id]; },
              findUsers(ids) { queries++; return ids.map((id) => this.users[id]); },
            };

            const posts = db.findPosts();
            posts.forEach((p) => db.findUser(p.authorId));
            console.log('N+1 queries:', queries);

            queries = 0;
            const ps = db.findPosts();
            db.findUsers([...new Set(ps.map((p) => p.authorId))]);
            console.log('batched queries:', queries);
          `),
          expectedOutput: 'N+1 queries: 4\nbatched queries: 2',
          explanation: ['1 + N (3 posts) = 4 round trips vs 2 with a batched `$in` — the gap grows linearly with N.', 'Populate and DataLoader-style batching both use the second approach.'],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'E-commerce order: embed line items with a **snapshot** of product name and price at purchase time (historical truth), reference the product id.',
          'Social app: followers as a separate `follows` collection `{ follower, followee }` with a compound unique index — never an unbounded array on the user.',
          'For reporting across collections, use `$lookup` in an aggregation (database-side join).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Embedding unbounded arrays (all comments, all orders) → huge documents, slow updates, 16 MB limit.',
          'Normalising everything like SQL and then populating 5 levels deep.',
          'Forgetting to index the reference field used for lookups (`comment.post`).',
          'Assuming populate is a database join with referential integrity.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Walk through the embed-vs-reference criteria: access pattern, cardinality, growth, update frequency, atomicity.'),
        interviewTip('Explain that populate runs one extra query per path with $in — and why a manual loop is N+1.'),
      ),
      section('practice', 'Practice',
        steps(
          'Model a course platform: courses, lessons (ordered, ≤ 50), students (thousands), enrollments.',
          'Decide what to embed and what to reference; justify each.',
          'Write the query for "a student\'s courses with titles" using populate and again with `$lookup`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Embed when read together, bounded, owned; reference when unbounded, shared or independent.',
          'Extended reference / subset patterns trade duplication for fewer lookups.',
          'populate = app-side join with one $in query per path.',
          'Loops of findById are N+1 — batch instead.',
        ),
      ),
    ],
    revisionNotes: [
      'Embed: one-to-few, read together, atomic single-doc update.',
      'Reference: one-to-many/squillions, many-to-many, independent access.',
      'populate: 1 query + 1 $in query per path; null if referenced doc missing.',
      'N+1 = 1 parent query + N child queries in a loop.',
      'No FKs in MongoDB — integrity is your code\'s job.',
      'Snapshot prices in orders (embed), reference product id.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A blog post can receive tens of thousands of comments. How should comments be modelled?',
        options: ['Embed all comments in the post document', 'Separate comments collection with a postId reference (indexed)', 'Store comments as a single string field', 'One collection per post'],
        answer: 1,
        explanation: 'Unbounded growth would hit the 16 MB limit and make every post update heavy. Parent referencing scales; embed only a small subset if needed.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Post.find() returns 20 posts by 5 distinct authors. How many queries does this run?',
        code: "await Post.find().populate('author');",
        options: ['1', '2', '6', '21'],
        answer: 1,
        explanation: 'One query for posts and one User.find({ _id: { $in: [...5 ids] } }). 21 would be the manual N+1 loop.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'When is embedding usually the right choice?',
        options: ['When the child data grows without limit', 'When the child data is small, bounded and always read with the parent', 'When many parents share the same child', 'When children are queried independently most of the time'],
        answer: 1,
        explanation: 'Embedding gives single-read, atomic access for bounded owned data. The other options point to referencing.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'MongoDB relationships',
        question: 'How do you decide between embedding and referencing in MongoDB?',
        shortAnswer: 'Embed data that is bounded, owned by the parent and read together with it; reference data that is unbounded, shared across parents, frequently updated on its own, or queried independently.',
        detailedAnswer: [
          'Consider read/write patterns first: what does each endpoint load?',
          'Cardinality: one-to-few embed, one-to-many/squillions reference.',
          'Single-document writes are atomic — embedding avoids multi-doc transactions.',
          'Watch the 16 MB limit and update amplification on large documents.',
          'Hybrid: extended reference or subset pattern for the hot fields.',
        ],
        followUp: 'How would you model many-to-many in MongoDB?',
        trap: 'Answering "always embed, that is the point of NoSQL".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'MongoDB relationships',
        question: 'What is the N+1 query problem and how do you avoid it with Mongoose or any ORM?',
        shortAnswer: 'Loading a list (1 query) and then one extra query per item for related data (N queries); avoid it by batching related lookups — populate/include/eager loading with an IN query, a database join/$lookup, or a DataLoader.',
        detailedAnswer: [
          'Symptom: latency grows linearly with page size; query logs show repeated identical queries with different ids.',
          'Mongoose populate and Prisma include batch with IN/$in.',
          'SQL: JOIN; MongoDB: $lookup in aggregation.',
          'GraphQL resolvers: DataLoader batches per tick.',
          'Also select only needed fields to keep payloads small.',
        ],
        followUp: 'How would you detect N+1 queries in production?',
        trap: 'Thinking lazy loading in a loop is fine because each query is fast.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  aggregation: {
    summary: 'The aggregation pipeline transforms documents through ordered stages ($match, $group, $sort, $project, $unwind, $lookup, …) to compute reports and reshaped results inside MongoDB.',
    topics: ['aggregation pipeline', '$match', '$group', '$sort', '$project', '$unwind', '$lookup', '$limit', '$facet', 'accumulators', '$sum', '$avg', '$push', 'allowDiskUse', '100MB stage limit', 'pipeline optimisation'],
    sections: [
      section('introduction', undefined,
        text('`find()` can filter and project, but it cannot answer "revenue per category last month". The **aggregation pipeline** processes documents through a sequence of stages — like Unix pipes or `Array.prototype` chains — on the server.'),
      ),
      section('definition', 'Core stages',
        table('Common stages', ['Stage', 'Does', 'SQL analogy'],
          [
            ['$match', 'Filter documents', 'WHERE / HAVING'],
            ['$group', 'Group by `_id` expression with accumulators', 'GROUP BY'],
            ['$sort', 'Order documents', 'ORDER BY'],
            ['$project / $addFields / $set', 'Reshape, compute fields', 'SELECT expressions'],
            ['$unwind', 'One output document per array element', '(like joining to a child table)'],
            ['$lookup', 'Left outer join to another collection', 'LEFT JOIN'],
            ['$limit / $skip', 'Pagination', 'LIMIT / OFFSET'],
            ['$facet', 'Several sub-pipelines on the same input', 'Multiple queries in one'],
            ['$count', 'Count documents', 'count(*)'],
          ]),
        bullets('Accumulators in `$group`: `$sum`, `$avg`, `$min`, `$max`, `$push`, `$addToSet`, `$first`, `$last`, `$count` (5.0+).'),
      ),
      section('why', 'Why aggregate in the database',
        bullets(
          'Moves computation to the data — no shipping millions of docs to Node to sum them.',
          'Can use indexes for an initial `$match` / `$sort`.',
          'One round trip for complex reports, dashboards and analytics endpoints.',
        ),
      ),
      section('internals', 'Execution and limits',
        steps(
          'Stages run in order; each stage\'s output is the next stage\'s input.',
          'Only an early `$match`/`$sort` (before reshaping) can use indexes — put them first.',
          'The optimiser reorders some stages (e.g. moves `$match` before `$project` when safe, coalesces `$sort` + `$limit`).',
          'Each blocking stage (`$group`, `$sort`) has a 100 MB memory limit; beyond it, it spills to disk if `allowDiskUse` is true (default true since MongoDB 6.0).',
          'Results are returned as a cursor; the final result per document is still capped at 16 MB.',
        ),
      ),
      section('visual', 'Revenue pipeline',
        flow(['orders (all)', '$match: status paid', '$unwind: items', '$group: by category, $sum', '$sort: revenue desc', '$limit: 3'], { title: 'Top categories by revenue', direction: 'horizontal' }),
      ),
      section('example', 'Input → output examples',
        code({
          title: 'Sample orders collection',
          language: 'json',
          code: dedent(`
            [
              { "_id": 1, "customer": "ana", "status": "paid",    "items": [ { "cat": "books", "price": 20, "qty": 2 }, { "cat": "toys", "price": 15, "qty": 1 } ] },
              { "_id": 2, "customer": "ben", "status": "paid",    "items": [ { "cat": "books", "price": 30, "qty": 1 } ] },
              { "_id": 3, "customer": "ana", "status": "pending", "items": [ { "cat": "games", "price": 60, "qty": 1 } ] },
              { "_id": 4, "customer": "cy",  "status": "paid",    "items": [ { "cat": "toys",  "price": 10, "qty": 3 } ] }
            ]
          `),
          explanation: ['All following pipelines use these four documents.'],
        }),
        code({
          title: '$match → $unwind → $group → $sort',
          code: dedent(`
            const result = await db.collection('orders').aggregate([
              { $match: { status: 'paid' } },
              { $unwind: '$items' },
              { $group: {
                  _id: '$items.cat',
                  revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
                  units: { $sum: '$items.qty' },
              } },
              { $sort: { revenue: -1 } },
            ]).toArray();
            console.log(result);
          `),
          expectedOutput: dedent(`
            [
              { _id: 'books', revenue: 70, units: 3 },
              { _id: 'toys', revenue: 45, units: 4 }
            ]
          `),
          explanation: [
            '`$match` drops order 3 (pending) — so games never appears.',
            '`$unwind` turns order 1 into two documents (books, toys); 4 item documents remain.',
            'books: 20×2 + 30×1 = 70; toys: 15×1 + 10×3 = 45.',
            '`$items.cat` with a `$` prefix means "the value of this field path".',
          ],
        }),
        code({
          title: '$group per customer then $project',
          code: dedent(`
            await orders.aggregate([
              { $match: { status: 'paid' } },
              { $group: { _id: '$customer', orders: { $sum: 1 }, ids: { $push: '$_id' } } },
              { $project: { _id: 0, customer: '$_id', orders: 1, ids: 1 } },
              { $sort: { customer: 1 } },
            ]).toArray();
          `),
          expectedOutput: dedent(`
            [
              { orders: 1, ids: [ 1 ], customer: 'ana' },
              { orders: 1, ids: [ 2 ], customer: 'ben' },
              { orders: 1, ids: [ 4 ], customer: 'cy' }
            ]
          `),
          explanation: ['`{ $sum: 1 }` counts documents per group.', '`$project` renames `_id` to `customer` and hides `_id`.'],
        }),
        code({
          title: '$lookup (join) with customers',
          code: dedent(`
            // customers: { _id: 'ana', name: 'Ana Silva', tier: 'gold' }, { _id: 'ben', name: 'Ben Ode', tier: 'basic' }
            await orders.aggregate([
              { $match: { _id: { $in: [1, 2] } } },
              { $lookup: { from: 'customers', localField: 'customer', foreignField: '_id', as: 'cust' } },
              { $unwind: '$cust' },
              { $project: { _id: 1, name: '$cust.name', tier: '$cust.tier' } },
            ]).toArray();
          `),
          expectedOutput: dedent(`
            [
              { _id: 1, name: 'Ana Silva', tier: 'gold' },
              { _id: 2, name: 'Ben Ode', tier: 'basic' }
            ]
          `),
          explanation: [
            '`$lookup` adds an **array** field `cust` with all matching customer docs (left outer join — empty array if none).',
            '`$unwind` flattens the single-element array; use `preserveNullAndEmptyArrays: true` to keep orders without a customer.',
            'Index `customers._id` (always indexed) or the `foreignField` you join on.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Dashboard endpoints: `$facet` returns totals, per-day series and top items in one call.',
          'Paginated search with total count: `$facet: { data: [{ $skip }, { $limit }], total: [{ $count: \'n\' }] }`.',
          'Precompute heavy reports on a schedule with `$merge` / `$out` into a summary collection.',
          'Run analytics on a secondary (`readPreference: \'secondary\'`) to protect the primary.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`$match` placed after `$unwind`/`$group` when it could be first — no index use, more work.',
          'Forgetting the `$` prefix: `{ $sum: \'price\' }` sums a literal string (result 0).',
          '`$unwind` on a field missing in some documents silently drops those documents.',
          '`$lookup` on an unindexed foreignField → collection scan per input document.',
        ),
        code({
          title: 'Wrong vs right: stage order',
          code: dedent(`
            // ❌ unwinds and groups everything, then filters
            [{ $unwind: '$items' }, { $group: { _id: '$status', n: { $sum: 1 } } }, { $match: { _id: 'paid' } }]

            // ✅ filter first (can use an index on status)
            [{ $match: { status: 'paid' } }, { $unwind: '$items' }, { $group: { _id: null, n: { $sum: 1 } } }]
          `),
          expectedOutput: "[ { _id: 'paid', n: 4 } ]\n[ { _id: null, n: 4 } ]",
          explanation: ['Same count (4 paid items), but the second pipeline processes far fewer documents.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Be ready to write a pipeline live: $match → $group → $sort → $limit, and explain each stage\'s output shape.'),
        interviewTip('Mention index use only for leading $match/$sort and the 100 MB per-stage memory limit.'),
      ),
      section('practice', 'Practice',
        steps(
          'Using the sample orders, compute the average order value per customer for paid orders.',
          'Return the top-selling category per customer (hint: $unwind, $group by {customer, cat}, $sort, $group with $first).',
          'Add a $lookup to attach customer tiers and group revenue by tier.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Pipeline = ordered stages; output of one feeds the next.',
          '$match early, $group with accumulators, $sort/$limit, $project to shape.',
          '$unwind flattens arrays; $lookup = left outer join returning an array.',
          'Indexes only help leading stages; blocking stages have a 100 MB limit.',
        ),
      ),
    ],
    revisionNotes: [
      '$match first to use indexes.',
      '$group requires _id (null = whole collection).',
      '$sum: 1 counts; field references need "$field".',
      '$unwind drops docs with missing/empty arrays unless preserveNullAndEmptyArrays.',
      '$lookup → array field, left outer join.',
      '100 MB per blocking stage; allowDiskUse (default true in 6.0+).',
      '$facet for multi-result dashboards.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Collection: { a: 1, tags: ["x", "y"] }, { a: 2, tags: [] }, { a: 3 }. What does this return?',
        code: "db.c.aggregate([{ $unwind: '$tags' }, { $count: 'n' }])",
        options: ['[ { n: 3 } ]', '[ { n: 2 } ]', '[ { n: 4 } ]', '[ { n: 1 } ]'],
        answer: 1,
        explanation: 'Only the first document has elements, producing 2 documents. Empty and missing arrays are dropped by default.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which stage is the aggregation equivalent of SQL GROUP BY?',
        options: ['$match', '$project', '$group', '$unwind'],
        answer: 2,
        explanation: '$group groups by the _id expression and computes accumulators. $match is like WHERE.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The total is always 0. Why?',
        code: "db.orders.aggregate([{ $group: { _id: null, total: { $sum: 'amount' } } }])",
        options: ['$sum only works on arrays', "'amount' is a literal string; it must be '$amount' to reference the field", '_id cannot be null', '$group needs $match first'],
        answer: 1,
        explanation: 'Without the $ prefix, $sum receives the string "amount", which is non-numeric and contributes 0.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Aggregation',
        question: 'Explain the MongoDB aggregation pipeline and how you would optimise one.',
        shortAnswer: 'It is an ordered list of stages that transform documents server-side; optimise by filtering ($match) and sorting early so indexes are used, projecting away unneeded fields, and indexing $lookup foreign fields.',
        detailedAnswer: [
          'Stages: $match, $group, $sort, $project, $unwind, $lookup, $facet, $limit.',
          'Only leading $match/$sort stages can use indexes.',
          '$sort followed by $limit lets the server keep only the top N in memory.',
          'Check with `explain(\'executionStats\')` on the aggregate.',
          'Precompute with $merge for expensive dashboards.',
        ],
        followUp: 'What happens when a $group exceeds 100 MB?',
        trap: 'Putting $match after $group by habit.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Aggregation',
        question: 'How does $lookup compare to a SQL JOIN, and when is it a sign of a modelling problem?',
        shortAnswer: '$lookup is a left outer join that adds an array of matched documents; it works, but if hot request paths depend on many $lookups, the data is probably over-normalised for a document database and should be embedded or denormalised.',
        detailedAnswer: [
          'Semantics: like LEFT JOIN, but results are nested as an array field.',
          'Supports equality (localField/foreignField) and pipeline-based joins with `let`.',
          'Performance depends on an index on the foreign field; it is generally slower than relational joins at scale.',
          'Historically $lookup into sharded collections was restricted (allowed since 5.1).',
          'Fine for reporting; for frequent reads prefer modelling data together.',
        ],
        followUp: 'How would you keep denormalised copies in sync?',
        trap: 'Treating $lookup as equivalent to relational joins in performance and integrity.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'indexes-in-mongodb': {
    summary: 'MongoDB indexes are B-tree structures on fields; single-field, compound (ordered by the ESR rule), multikey, unique, partial, TTL and text indexes speed queries, verified with explain().',
    topics: ['single-field index', 'compound index', 'ESR rule', 'multikey', 'unique index', 'partial index', 'TTL index', 'text index', 'explain', 'IXSCAN', 'COLLSCAN', 'covered query', 'hidden index'],
    sections: [
      section('introduction', undefined,
        text('Without an index, MongoDB performs a **COLLSCAN** — it reads every document. Indexes work like they do in Postgres: sorted B-trees mapping field values to document locations.'),
      ),
      section('definition', 'Index types',
        table('MongoDB index types', ['Type', 'Create', 'Use for'],
          [
            ['Single field', '`{ email: 1 }`', 'Equality / range / sort on one field'],
            ['Compound', '`{ userId: 1, createdAt: -1 }`', 'Multi-field queries + sort'],
            ['Multikey', 'Automatic on array fields', 'Query by array element (`tags: \'node\'`)'],
            ['Unique', '`{ email: 1 }, { unique: true }`', 'Enforce uniqueness (E11000 on dup)'],
            ['Partial', '`{ partialFilterExpression: { status: \'active\' } }`', 'Index only a subset'],
            ['TTL', '`{ createdAt: 1 }, { expireAfterSeconds: 3600 }`', 'Auto-delete sessions, tokens, logs'],
            ['Text', '`{ title: \'text\', body: \'text\' }`', 'Keyword search with $text (one per collection)'],
            ['Hashed / 2dsphere / wildcard', '`{ id: \'hashed\' }`, `{ loc: \'2dsphere\' }`', 'Sharding, geo, dynamic fields'],
          ]),
        note('Every collection has a unique index on `_id` automatically.'),
      ),
      section('why', 'Why it matters',
        bullets(
          'Indexed lookups examine a handful of keys instead of millions of documents.',
          'A compound index can also satisfy the sort, avoiding an in-memory SORT stage (limited to 100 MB).',
          'Like any database, each index slows writes and uses RAM — the working set of indexes should fit in memory.',
        ),
      ),
      section('internals', 'The ESR rule for compound indexes',
        text('Order compound index fields as **E**quality → **S**ort → **R**ange.'),
        table('Query: { status: "open", priority: { $gte: 3 } } sorted by createdAt: -1', ['Index', 'Result'],
          [
            ['{ status: 1, createdAt: -1, priority: 1 }  (E, S, R)', 'Seeks on status, reads in sort order, filters priority — no in-memory sort ✅'],
            ['{ status: 1, priority: 1, createdAt: -1 }  (E, R, S)', 'Range on priority breaks sort order → blocking SORT stage'],
            ['{ createdAt: -1 }', 'Scans all docs in date order, filters the rest — many keys examined'],
          ]),
        bullets(
          'Prefix rule like SQL: `{ a: 1, b: 1, c: 1 }` supports queries on a, a+b, a+b+c.',
          'Sort direction matters for multi-field sorts: `{ a: 1, b: -1 }` supports sort `{ a: 1, b: -1 }` and `{ a: -1, b: 1 }`, not `{ a: 1, b: 1 }`.',
          'A **covered query** returns only indexed fields (and projects out `_id` if not in the index), so no document fetch is needed (`totalDocsExamined: 0`).',
        ),
      ),
      section('visual', 'Reading explain output',
        flow(['COLLSCAN: no index — read all docs', 'IXSCAN: walk index keys', 'FETCH: load matching docs', 'SORT: in-memory sort (avoid)'], { title: 'Common winning-plan stages', direction: 'horizontal' }),
      ),
      section('example', 'Creating and verifying indexes',
        code({
          title: 'explain() before and after',
          code: dedent(`
            const tickets = db.collection('tickets');
            const q = { status: 'open', priority: { $gte: 3 } };

            let plan = await tickets.find(q).sort({ createdAt: -1 }).explain('executionStats');
            console.log(plan.queryPlanner.winningPlan.stage, plan.executionStats.totalDocsExamined);

            await tickets.createIndex({ status: 1, createdAt: -1, priority: 1 }); // ESR
            plan = await tickets.find(q).sort({ createdAt: -1 }).explain('executionStats');
            const s = plan.executionStats;
            console.log(s.nReturned, s.totalKeysExamined, s.totalDocsExamined);
          `),
          expectedOutput: 'SORT 200000\n1240 1302 1240',
          explanation: [
            'Before: a SORT over a COLLSCAN examining all 200,000 documents.',
            'After: keys examined (1302) ≈ returned (1240) — a healthy ratio; docs examined = returned.',
            'The goal is `nReturned ≈ totalKeysExamined ≈ totalDocsExamined`. Plan shapes vary slightly by server version.',
          ],
        }),
        code({
          title: 'Unique, partial, TTL and text indexes',
          code: dedent(`
            await users.createIndex({ email: 1 }, { unique: true });

            // Unique among non-deleted users only
            await users.createIndex({ username: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

            // Delete sessions ~1 hour after createdAt (background TTL monitor runs every 60 s)
            await sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 });

            // Expire at an exact time stored in the doc
            await resetTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

            await articles.createIndex({ title: 'text', body: 'text' }, { weights: { title: 5 } });
            const hits = await articles
              .find({ $text: { $search: 'event loop' } }, { projection: { title: 1, score: { $meta: 'textScore' } } })
              .sort({ score: { $meta: 'textScore' } })
              .limit(2).toArray();
            console.log(hits.map((h) => h.title));
          `),
          expectedOutput: "[ 'The Node.js event loop', 'Loop phases explained' ]",
          explanation: [
            'TTL fields must be BSON Dates; deletion is approximate (monitor runs every 60 seconds).',
            'Partial filters accept a limited operator set; `{ deletedAt: null }` matches missing or null.',
            'Text indexes tokenize and stem words; for typo tolerance/relevance tuning, use Atlas Search or a search engine.',
          ],
        }),
        code({
          title: 'Mongoose schema indexes',
          code: dedent(`
            const ticketSchema = new Schema({ status: String, priority: Number, createdAt: Date });
            ticketSchema.index({ status: 1, createdAt: -1, priority: 1 });
            // In production: autoIndex: false, and run Model.syncIndexes()/createIndexes in a deploy step
          `),
          expectedOutput: '(index definitions registered on the schema)',
          explanation: ['Index builds on large collections are resource-intensive; schedule them deliberately.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Sessions, password-reset tokens, OTPs → TTL indexes instead of cleanup cron jobs.',
          'Feeds: `{ userId: 1, createdAt: -1 }` for "my latest items".',
          'Use the database profiler or Atlas Performance Advisor to find slow queries and suggested indexes.',
          'Before dropping an index, `hideIndex` it to test the impact safely.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Range field before sort field in compound indexes (violating ESR).',
          'Separate single-field indexes for every field instead of one compound index matching the query.',
          'Unanchored/case-insensitive `$regex` expecting index-speed lookups.',
          'Storing TTL field as a string — the document never expires.',
          'Indexing too much: each multikey array element creates index entries.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain ESR with a concrete query and how you would confirm it with explain("executionStats").'),
        interviewTip('Know TTL indexes — a very practical answer for expiring sessions and tokens.'),
      ),
      section('practice', 'Practice',
        steps(
          'For `find({ tenantId, archived: false }).sort({ updatedAt: -1 })` design the best index.',
          'Add a TTL index that removes audit logs after 90 days.',
          'Write a covered query and confirm `totalDocsExamined: 0`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Single, compound, multikey, unique, partial, TTL, text indexes.',
          'Compound order: Equality, Sort, Range.',
          'explain("executionStats"): IXSCAN vs COLLSCAN, keys/docs examined vs returned.',
          'TTL needs a Date field; monitor runs every 60 s.',
        ),
      ),
    ],
    revisionNotes: [
      'ESR: Equality → Sort → Range.',
      'Prefix rule applies; sort directions must match or be fully inverted.',
      'TTL: expireAfterSeconds on a Date field; ~60 s granularity.',
      'One text index per collection; $text + textScore.',
      'Multikey index on arrays is automatic.',
      'Goal: nReturned ≈ keysExamined ≈ docsExamined.',
      'Covered query: totalDocsExamined 0.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Query: { category: "books", price: { $lt: 20 } } sorted by rating: -1. Which index follows the ESR rule?',
        options: ['{ price: 1, category: 1, rating: -1 }', '{ category: 1, rating: -1, price: 1 }', '{ rating: -1, price: 1, category: 1 }', '{ category: 1, price: 1, rating: -1 }'],
        answer: 1,
        explanation: 'Equality (category), then Sort (rating), then Range (price). Placing price before rating forces an in-memory sort.',
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'Password-reset tokens must disappear automatically one hour after creation. What is the simplest approach?',
        options: ['A cron job that deletes old tokens every minute', 'A TTL index on createdAt with expireAfterSeconds: 3600', 'A unique index on token', 'Store tokens in memory'],
        answer: 1,
        explanation: 'TTL indexes let MongoDB delete expired documents itself. Still check expiry in code, since deletion can lag by up to about a minute.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The TTL index exists but documents never expire. Why?',
        code: "await sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 });\nawait sessions.insertOne({ sid, createdAt: new Date().toISOString() });",
        options: ['expireAfterSeconds must be at least 3600', 'createdAt is stored as a string, and TTL only works on BSON Date values', 'TTL indexes need unique: true', 'Sessions collection name is reserved'],
        answer: 1,
        explanation: 'toISOString() produces a string. TTL ignores non-Date values; store new Date().',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'MongoDB indexes',
        question: 'What is the ESR rule for MongoDB compound indexes, and why does it work?',
        shortAnswer: 'Order fields as Equality, then Sort, then Range: equality fields narrow the index to one contiguous section, the sort field keeps that section in the requested order, and the range filter is applied while scanning without breaking the order.',
        detailedAnswer: [
          'If a range field comes before the sort field, matching keys span multiple ranges with independent orderings → in-memory SORT.',
          'Sort before range may examine a few extra keys but avoids a blocking sort — usually the better trade.',
          'Verify with explain: no SORT stage, keysExamined close to nReturned.',
          'Multiple equality fields can come in any order among themselves.',
        ],
        followUp: 'When would you break the ESR rule?',
        trap: 'Saying "most selective field first" as the only rule.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'MongoDB indexes',
        question: 'How do TTL indexes work in MongoDB and what are their limitations?',
        shortAnswer: 'A TTL index on a Date field makes a background task delete documents once the date plus expireAfterSeconds has passed; deletion is approximate (the task runs about every 60 seconds) and works only on single-field Date indexes.',
        detailedAnswer: [
          'Use expireAfterSeconds: 0 with an explicit expiresAt field for per-document expiry.',
          'Non-Date values are never expired; arrays use the earliest date.',
          'Cannot be compound (single-field only).',
          'Application logic should still check expiry since deletion may lag.',
          'Ideal for sessions, OTPs, caches, logs with retention.',
        ],
        followUp: 'How would you implement sliding session expiry with a TTL index?',
        trap: 'Assuming documents disappear exactly at the expiry second.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'orm-vs-odm': {
    summary: 'An ORM maps relational tables to objects (Prisma, Sequelize, TypeORM); an ODM maps documents to objects (Mongoose); both trade some control and performance for productivity and safety.',
    topics: ['ORM', 'ODM', 'query builder', 'raw driver', 'object-relational impedance mismatch', 'Prisma', 'Sequelize', 'TypeORM', 'Drizzle', 'Knex', 'Kysely', 'Mongoose', 'active record', 'data mapper'],
    sections: [
      section('introduction', undefined,
        text('Writing SQL strings and mapping rows to objects by hand is repetitive. **ORMs** (Object-Relational Mappers) and **ODMs** (Object-Document Mappers) automate that mapping — at a cost you should understand.'),
      ),
      section('definition', 'Definitions',
        table('Abstraction levels', ['Level', 'Examples (Node)', 'You write', 'Control'],
          [
            ['Raw driver', 'pg, mysql2, mongodb', 'SQL / driver calls', 'Full'],
            ['Query builder', 'Knex, Kysely, Drizzle (also an ORM-lite)', 'Chainable query API → SQL', 'High, type-safe'],
            ['ORM', 'Prisma, Sequelize, TypeORM, MikroORM', 'Models + method calls', 'Medium'],
            ['ODM', 'Mongoose (MongoDB)', 'Schemas + model methods', 'Medium'],
          ]),
        table('ORM vs ODM', ['', 'ORM', 'ODM'],
          [
            ['Database', 'Relational (Postgres, MySQL, SQLite…)', 'Document (MongoDB)'],
            ['Maps', 'Tables/rows ↔ classes/objects', 'Collections/documents ↔ classes/objects'],
            ['Relations', 'Foreign keys, JOINs, eager/lazy loading', 'Embedding, refs + populate'],
            ['Migrations', 'Central concern (schema DDL)', 'Usually only data/index migrations'],
            ['Impedance mismatch', 'High (graphs of objects vs flat tables)', 'Low (documents ≈ objects)'],
          ]),
        note('All of these are third-party npm packages, not part of Node.js.'),
      ),
      section('why', 'Pros and cons',
        table('Trade-offs', ['Benefit', 'Cost'],
          [
            ['Less boilerplate; mapping, relations, validation built in', 'Generated SQL can be inefficient (N+1, SELECT *)'],
            ['Type safety (Prisma, Drizzle, Kysely)', 'Abstraction leaks for complex queries — you end up writing raw SQL anyway'],
            ['Migrations tooling', 'Learning curve of the tool on top of SQL'],
            ['Parameterisation by default (injection-safe)', 'Raw escape hatches can reintroduce injection'],
            ['Portability across databases (in theory)', 'Lowest-common-denominator features; DB-specific power hidden'],
          ]),
      ),
      section('internals', 'Two ORM styles',
        table('Active Record vs Data Mapper', ['', 'Active Record', 'Data Mapper'],
          [
            ['Idea', 'Model instance knows how to save itself (`user.save()`)', 'Separate mapper/repository persists plain entities'],
            ['Examples', 'Sequelize, Mongoose, TypeORM (AR mode)', 'TypeORM (DataMapper mode), MikroORM; Prisma is client-based and close in spirit'],
            ['Good for', 'Simple CRUD apps', 'Complex domains, testability'],
          ]),
      ),
      section('visual', 'Where the mapper sits',
        flow(['Service: userRepo.findWithPosts(id)', 'ORM/ODM: builds query + params', 'Driver: pg / mongodb', 'Database'], { title: 'Abstraction stack', direction: 'horizontal' }),
      ),
      section('example', 'Same query, four ways',
        code({
          title: '"Latest 10 published posts with author name"',
          code: dedent(`
            // 1) Raw pg
            await pool.query(
              'SELECT p.id, p.title, u.name AS author FROM posts p JOIN users u ON u.id = p.author_id WHERE p.published ORDER BY p.created_at DESC LIMIT 10',
            );

            // 2) Knex (query builder)
            await knex('posts as p').join('users as u', 'u.id', 'p.author_id')
              .where('p.published', true).orderBy('p.created_at', 'desc').limit(10)
              .select('p.id', 'p.title', 'u.name as author');

            // 3) Prisma (ORM)
            await prisma.post.findMany({
              where: { published: true }, orderBy: { createdAt: 'desc' }, take: 10,
              select: { id: true, title: true, author: { select: { name: true } } },
            });

            // 4) Mongoose (ODM)
            await Post.find({ published: true }).sort({ createdAt: -1 }).limit(10)
              .select('title author').populate('author', 'name').lean();
          `),
          expectedOutput: "(each returns 10 posts; shapes differ: flat rows for SQL/Knex, nested author objects for Prisma/Mongoose)",
          explanation: [
            'Raw SQL: one query, full control, no types unless you add them.',
            'Knex: composable, still close to SQL.',
            'Prisma: typed nested result; may run one or two queries depending on version/relation strategy.',
            'Mongoose: two queries (posts + populate).',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Common mix: ORM for 90% CRUD, raw SQL (via the ORM\'s safe raw API) for reports and hot paths.',
          'Hide the ORM behind a repository so you can swap tools or optimise queries without touching services.',
          'Log generated queries in development (Prisma `log: [\'query\']`, Sequelize `logging`, Mongoose `set(\'debug\', true)`) to catch N+1 early.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Treating the ORM as a reason not to learn SQL or indexes.',
          'Lazy-loading relations in loops (N+1).',
          'Fetching whole entities when you need two fields.',
          'Assuming "database-agnostic" means you can switch databases painlessly.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Give a balanced answer: productivity and safety vs control and performance; mention you read the generated SQL.'),
        interviewTip('Name concrete tools per level (pg / Knex / Prisma / Mongoose) to show breadth.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write one non-trivial report query (GROUP BY + HAVING) in raw SQL and in your ORM; compare the generated SQL.',
          'Enable query logging and count queries for one list endpoint.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'ORM → relational; ODM → documents.',
          'Levels: driver → query builder → ORM/ODM.',
          'Benefits: productivity, types, safe parameters, migrations.',
          'Costs: hidden queries, N+1, abstraction leaks.',
          'Active Record vs Data Mapper styles.',
        ),
      ),
    ],
    revisionNotes: [
      'ORM: Prisma, Sequelize, TypeORM, MikroORM, Drizzle. ODM: Mongoose.',
      'Query builders: Knex, Kysely.',
      'Impedance mismatch: object graphs vs relational tables.',
      'Active Record (model saves itself) vs Data Mapper (repository saves entity).',
      'Always be able to drop to raw SQL safely.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which pairing is correct?',
        options: ['Mongoose — ORM for PostgreSQL', 'Prisma — ODM for MongoDB only', 'Mongoose — ODM for MongoDB; Sequelize — ORM for SQL databases', 'Knex — ODM'],
        answer: 2,
        explanation: 'Mongoose maps MongoDB documents (ODM); Sequelize maps relational tables (ORM). Knex is a SQL query builder. (Prisma supports SQL databases and also MongoDB.)',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An ORM-generated report query takes 8 seconds. What should you do first?',
        options: ['Replace the database', 'Log/inspect the generated SQL and run EXPLAIN ANALYZE on it', 'Add more app servers', 'Switch to a different ORM immediately'],
        answer: 1,
        explanation: 'Diagnose first: the SQL and plan reveal missing indexes, N+1 or bad joins. You can then fix the ORM call or use a parameterised raw query.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'ORM vs ODM',
        question: 'What are the advantages and disadvantages of using an ORM instead of raw SQL?',
        shortAnswer: 'ORMs speed up development with models, relations, migrations, type safety and injection-safe parameters, but can hide inefficient queries, encourage N+1 patterns and make complex or database-specific queries awkward.',
        detailedAnswer: [
          'Pros: less boilerplate, consistent mapping, migrations, typed results (Prisma).',
          'Cons: generated SQL may not use indexes well; abstraction leaks.',
          'Mitigation: log queries, use select/include deliberately, raw SQL for reports.',
          'Query builders are a middle ground.',
        ],
        followUp: 'Where would you draw the line and use raw SQL?',
        trap: 'Claiming an ORM removes the need to understand SQL.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'ORM vs ODM',
        question: 'Explain the Active Record and Data Mapper patterns and their impact on testing.',
        shortAnswer: 'Active Record puts persistence on the model itself (user.save()), coupling domain objects to the database; Data Mapper keeps entities as plain objects and moves persistence into a mapper/repository, which makes the domain easier to unit test and to change storage.',
        detailedAnswer: [
          'Active Record: Sequelize models, Mongoose documents — quick for CRUD.',
          'Data Mapper: TypeORM repositories, MikroORM — clear separation.',
          'Testing Active Record often needs a real DB or heavy mocking of model statics.',
          'Data Mapper lets you inject an in-memory repository in tests.',
          'You can approximate Data Mapper over any tool with a repository layer.',
        ],
        followUp: 'How would you introduce a repository layer over Mongoose models?',
        trap: 'Thinking the pattern choice is about performance rather than coupling.',
      },
    ],
  },
};

export default content;

import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'rest-architecture': {
    summary: 'REST is an architectural style built on resources identified by URLs, manipulated through a uniform interface (HTTP methods + representations), with stateless, cacheable, layered client–server interactions.',
    topics: ['REST', 'Roy Fielding', 'constraints', 'resources', 'representations', 'stateless', 'cacheable', 'uniform interface', 'HATEOAS', 'Richardson maturity model'],
    sections: [
      section('introduction', undefined,
        text('"REST API" is used loosely for any JSON-over-HTTP API. Strictly, REST is a set of **constraints** described by Roy Fielding (2000). Knowing them helps you design APIs that scale and that clients understand intuitively.'),
      ),
      section('definition', 'The six constraints',
        table('REST constraints', ['Constraint', 'Meaning', 'Practical effect'], [
          ['Client–server', 'UI and data storage are separated', 'Frontend and API evolve independently'],
          ['Stateless', 'Each request contains all context', 'Any instance can serve any request → horizontal scaling'],
          ['Cacheable', 'Responses label themselves cacheable or not', '`Cache-Control`, `ETag`, CDNs'],
          ['Uniform interface', 'Resources + URLs, standard methods, self-descriptive messages, hypermedia', 'Predictable APIs'],
          ['Layered system', 'Client cannot tell if it talks to the server or an intermediary', 'Load balancers, gateways, caches'],
          ['Code on demand (optional)', 'Server may send executable code', 'JavaScript in browsers'],
        ]),
      ),
      section('why', 'Why REST',
        bullets(
          'Uses HTTP as designed: caching, status codes and methods "just work" with proxies and browsers.',
          'Statelessness makes scaling and failover simple.',
          'Resources are a natural mapping to data models.',
        ),
        table('REST vs RPC-style', ['', 'REST', 'RPC over HTTP'], [
          ['URL names', 'Nouns: `/orders/42`', 'Verbs: `/getOrder?id=42`'],
          ['Action', 'HTTP method', 'In the URL or body'],
          ['Caching', 'GET responses cacheable', 'Usually all POST — not cacheable'],
          ['Examples', 'Most public APIs', 'gRPC, JSON-RPC'],
        ]),
      ),
      section('internals', 'Resources and representations',
        bullets(
          'A **resource** is a concept (todo #42). A **representation** is a serialisation of it (JSON, XML, CSV).',
          'Clients manipulate resources by sending representations (`PUT` a JSON todo).',
          '**HATEOAS**: responses include links to possible next actions — the client follows links instead of hard-coding URLs.',
        ),
        flow(['Level 0: one URL, POST everything', 'Level 1: resources (/todos/42)', 'Level 2: HTTP methods + status codes', 'Level 3: hypermedia links (HATEOAS)'], { title: 'Richardson maturity model', direction: 'vertical' }),
      ),
      section('example', 'A RESTful Todo resource',
        code({
          title: 'Representation with hypermedia links',
          language: 'json',
          code: dedent(`
            {
              "id": 42,
              "title": "Write docs",
              "done": false,
              "_links": {
                "self":     { "href": "/todos/42" },
                "complete": { "href": "/todos/42", "method": "PATCH" },
                "owner":    { "href": "/users/7" }
              }
            }
          `),
          explanation: ['Most production APIs stop at Level 2; links (Level 3) are common in some hypermedia formats (HAL, JSON:API).'],
        }),
        code({
          title: 'Stateless request: everything needed is in the request',
          language: 'http',
          code: dedent(`
            GET /todos?done=false HTTP/1.1
            Host: api.example.com
            Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
            Accept: application/json
          `),
          explanation: ['Who (token), what (URL), how (Accept) — the server needs no memory of earlier requests.'],
        }),
        code({
          title: 'Mapping resources to handlers (our node:http router)',
          code: dedent(`
            route('GET',    '/todos',     listTodos);   // collection
            route('POST',   '/todos',     createTodo);
            route('GET',    '/todos/:id', getTodo);     // item
            route('PATCH',  '/todos/:id', updateTodo);
            route('DELETE', '/todos/:id', deleteTodo);
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Most "REST" APIs are Level 2 — resources + methods + status codes — and that is fine.',
          'When operations do not map to CRUD (e.g. "send invoice"), model them as sub-resources (`POST /invoices/9/sendings`) or accept a pragmatic action endpoint (`POST /invoices/9/send`).',
          'GraphQL and gRPC are alternatives with different trade-offs.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Server-side session state that pins clients to one instance (breaks statelessness).',
          'Verbs in URLs for basic CRUD (`/createTodo`).',
          'Ignoring caching headers on GET.',
          'Calling any JSON API "RESTful".',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('List the constraints, then be honest: "most APIs are Level 2 on Richardson\'s model; HATEOAS is rare in practice".'),
      ),
      section('practice', 'Practice',
        text('Take an RPC-style API (`/getUser`, `/updateUserEmail`, `/deleteUser`) and redesign it as resources with methods and status codes.'),
      ),
      section('summary', 'Summary',
        bullets('REST = constraints, not a protocol.', 'Resources + representations + uniform interface.', 'Stateless and cacheable.', 'HATEOAS is the rarely implemented Level 3.'),
      ),
    ],
    revisionNotes: [
      'Constraints: client–server, stateless, cacheable, uniform interface, layered, code on demand (optional).',
      'Resource ≠ representation.',
      'Richardson levels 0–3; most APIs are level 2.',
      'HATEOAS = hypermedia links drive client state.',
      'Statelessness enables horizontal scaling.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which is NOT one of the REST constraints?',
        options: ['Stateless', 'Cacheable', 'Uses JSON', 'Layered system'],
        answer: 2,
        explanation: 'REST is format-agnostic: representations can be JSON, XML, HTML, etc.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your API stores the "current page" of each user\'s list in server memory, so GET /todos/next returns the next page. Scaling to 3 instances breaks pagination. Which constraint was violated?',
        options: ['Cacheable', 'Stateless', 'Layered system', 'Code on demand'],
        answer: 1,
        explanation: 'The server kept client context between requests. Put the cursor/page in the request (query parameter) instead.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does Level 3 of the Richardson maturity model add?',
        options: ['HTTP methods', 'Resources with URLs', 'Hypermedia controls (links) in responses', 'JSON bodies'],
        answer: 2,
        explanation: 'Level 1 = resources, Level 2 = methods/status codes, Level 3 = hypermedia (HATEOAS).',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'REST',
        question: 'What are the REST architectural constraints?',
        shortAnswer: 'Client–server separation, statelessness, cacheability, a uniform interface (resources, standard methods, self-descriptive messages, hypermedia), a layered system, and optional code on demand.',
        detailedAnswer: [
          'Stateless: no session context on the server between requests.',
          'Cacheable: responses declare cacheability (Cache-Control/ETag).',
          'Uniform interface: URLs identify resources; methods define operations.',
          'Layered: proxies, gateways and CDNs can sit in between transparently.',
          'Code on demand is the only optional constraint.',
        ],
        followUp: 'Which constraint do most "REST" APIs ignore?',
        trap: 'Defining REST as "JSON over HTTP with CRUD endpoints".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'REST',
        question: 'What is HATEOAS and why do so few APIs implement it?',
        shortAnswer: 'Hypermedia As The Engine Of Application State means responses contain links describing the actions available next, so clients navigate by following links rather than hard-coding URLs; it is rare because most clients are written against documented URLs and the tooling/benefit is limited for first-party apps.',
        detailedAnswer: [
          'Example: an order representation includes `cancel` only while cancellable.',
          'Benefits: server can change URLs; clients discover capabilities.',
          'Costs: bigger payloads, more complex clients, little framework support.',
          'Formats: HAL, JSON:API, Siren.',
          'OpenAPI docs + versioning solved the same problem pragmatically for most teams.',
        ],
        followUp: 'Where could hypermedia links still add value in your API?',
        trap: 'Claiming an API is not REST at all without HATEOAS, and therefore useless — be pragmatic.',
      },
    ],
  },

  'rest-api-design': {
    summary: 'Good REST design uses plural noun resources, nesting for ownership, the right method per operation (PUT replace vs PATCH partial vs POST create), consistent JSON shapes and errors.',
    topics: ['resource naming', 'plural nouns', 'nesting', 'PUT vs PATCH vs POST', 'error format', 'Problem Details', 'kebab-case', 'consistency'],
    sections: [
      section('introduction', undefined,
        text('A well-designed API is guessable: once you know `/users` you can guess `/users/7/orders`. Consistency matters more than any single rule.'),
      ),
      section('definition', 'Naming rules',
        table('Resource naming', ['Rule', 'Good', 'Bad'], [
          ['Plural nouns for collections', '`/todos`, `/todos/42`', '`/todo`, `/getTodos`'],
          ['Nest for ownership (max ~2 levels)', '`/users/7/orders`', '`/users/7/orders/3/items/9/reviews`'],
          ['Lowercase, kebab-case paths', '`/order-items`', '`/OrderItems`, `/order_items`'],
          ['No verbs for CRUD', '`DELETE /todos/42`', '`POST /todos/42/delete`'],
          ['Query for filters', '`/todos?done=true`', '`/todos/done`'],
          ['Consistent JSON casing', '`createdAt` everywhere (or `created_at` everywhere)', 'Mixed'],
        ]),
        table('POST vs PUT vs PATCH', ['', 'POST', 'PUT', 'PATCH'], [
          ['Purpose', 'Create (server picks id) / action', 'Replace entire resource at known URL', 'Partial update'],
          ['Target', 'Collection: `/todos`', 'Item: `/todos/42`', 'Item: `/todos/42`'],
          ['Body', 'New resource data', '**Complete** representation', 'Only changed fields'],
          ['Missing fields', '—', 'Reset to defaults / removed', 'Left unchanged'],
          ['Idempotent', 'No', 'Yes', 'Not guaranteed'],
          ['Success', '201 + Location', '200 (or 201 if created / 204)', '200 / 204'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Predictability reduces documentation lookups and integration bugs.',
          'Correct PUT/PATCH semantics avoid accidental data loss.',
          'A single error format lets clients write one error handler.',
        ),
      ),
      section('internals', 'Designing endpoints for a feature',
        steps(
          'List the nouns (resources): users, projects, tasks.',
          'Decide ownership/nesting: tasks belong to projects.',
          'Map operations to methods.',
          'Define representations (fields, types, which are read-only).',
          'Define errors and status codes.',
          'Add pagination/filtering to every collection.',
        ),
        flow(['/projects', '/projects/:projectId', '/projects/:projectId/tasks', '/tasks/:taskId (shortcut for direct access)'], { title: 'Resource tree', direction: 'vertical' }),
      ),
      section('example', 'Design in practice',
        code({
          title: 'Endpoint table for the Todo API',
          language: 'text',
          code: dedent(`
            GET    /todos              list (filters, pagination)       200
            POST   /todos              create                            201 + Location
            GET    /todos/:id          read                              200 | 404
            PUT    /todos/:id          replace (title + done required)   200 | 404 | 422
            PATCH  /todos/:id          partial update                    200 | 404 | 422
            DELETE /todos/:id          delete                            204 | 404
            GET    /users/:id/todos    todos of one user                 200
          `),
        }),
        code({
          title: 'PUT vs PATCH implementations (runnable)',
          runnable: true,
          code: dedent(`
            const stored = { id: 1, title: 'Old', done: true, notes: 'keep?' };

            function put(current, body) {
              // full replacement: unspecified optional fields reset
              return { id: current.id, title: body.title, done: body.done ?? false, notes: body.notes ?? null };
            }
            function patch(current, body) {
              const allowed = ['title', 'done', 'notes'];
              const next = { ...current };
              for (const k of allowed) if (k in body) next[k] = body[k];
              return next;
            }

            console.log(JSON.stringify(put(stored, { title: 'New' })));
            console.log(JSON.stringify(patch(stored, { title: 'New', id: 99 })));
          `),
          expectedOutput: '{"id":1,"title":"New","done":false,"notes":null}\n{"id":1,"title":"New","done":true,"notes":"keep?"}',
          explanation: [
            'PUT replaced everything: `done` and `notes` were reset.',
            'PATCH changed only `title`; the `id` in the body was ignored by the whitelist.',
          ],
        }),
        code({
          title: 'Consistent error format (RFC 9457 Problem Details)',
          language: 'http',
          code: dedent(`
            HTTP/1.1 422 Unprocessable Content
            Content-Type: application/problem+json

            {
              "type": "https://api.example.com/problems/validation",
              "title": "Validation failed",
              "status": 422,
              "detail": "title must not be empty",
              "instance": "/todos/42",
              "errors": [{ "field": "title", "message": "must not be empty" }]
            }
          `),
          explanation: ['RFC 9457 (which replaced RFC 7807) standardises error bodies; extra members like `errors` are allowed.'],
        }),
      ),
      section('real-world', 'Real-world conventions',
        bullets(
          'Return the created/updated resource in the body so clients do not need another GET.',
          'Expose `id`, `createdAt`, `updatedAt` as read-only fields.',
          'Use ISO 8601 UTC timestamps (`2026-11-08T10:00:00Z`).',
          'Non-CRUD actions: `POST /orders/9/cancel` is acceptable when modelling it as a resource is awkward.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using PUT for partial updates (wipes unspecified fields).',
          'Deep nesting that duplicates authorization logic everywhere.',
          'Returning different error shapes from different endpoints.',
          'Exposing DB internals (`_id`, `__v`, table names) in representations.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('The PUT vs PATCH vs POST table is a near-certain question. Mention idempotency and what happens to missing fields.'),
      ),
      section('practice', 'Practice',
        text('Design endpoints for a blog: posts, comments, tags, and "publish a post". Write the method, path, body and status codes for each.'),
      ),
      section('summary', 'Summary',
        bullets('Plural nouns, shallow nesting, kebab-case.', 'POST creates, PUT replaces, PATCH modifies.', 'One error format (Problem Details).', 'Be consistent above all.'),
      ),
    ],
    revisionNotes: [
      'Collections plural: /todos; item: /todos/:id.',
      'POST → 201 + Location; not idempotent.',
      'PUT = full replacement, idempotent; PATCH = partial, not guaranteed idempotent.',
      'Nest at most ~2 levels.',
      'Problem Details: application/problem+json (RFC 9457).',
      'Whitelist writable fields.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A client sends PUT /users/7 with only {"email":"new@x.com"}. The user\'s name disappears. What went wrong?',
        options: ['The server has a bug — PUT should merge', 'PUT means full replacement; the client should use PATCH for a partial update', 'Email must be sent as a query parameter', 'The server should return 204'],
        answer: 1,
        explanation: 'By definition PUT replaces the whole representation, so omitted fields are cleared. Partial changes are PATCH.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which URL best follows REST naming conventions to list a user\'s orders?',
        options: ['/getUserOrders?userId=7', '/users/7/orders', '/user/7/order/list', '/Orders/ByUser/7'],
        answer: 1,
        explanation: 'Plural nouns, nesting for ownership, no verbs.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which method is idempotent for updates?',
        options: ['POST', 'PATCH (always)', 'PUT', 'None'],
        answer: 2,
        explanation: 'PUT with the same body always yields the same state. PATCH may or may not be (e.g. increment operations).',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'REST design',
        question: 'Explain the differences between POST, PUT and PATCH.',
        shortAnswer: 'POST creates a subordinate resource (or triggers an action) and is not idempotent; PUT replaces the entire resource at a known URL and is idempotent; PATCH applies a partial modification and is not guaranteed to be idempotent.',
        detailedAnswer: [
          'POST /todos → 201 + Location with server-assigned id.',
          'PUT /todos/42 with a full body; omitted fields are reset.',
          'PATCH /todos/42 with only changed fields (JSON Merge Patch or JSON Patch formats).',
          'PUT can create when the client chooses the id (201).',
        ],
        followUp: 'What is the difference between JSON Merge Patch and JSON Patch?',
        trap: 'Saying PUT is for updates and PATCH for "small updates" without mentioning replacement semantics.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'REST design',
        question: 'What are good practices for naming REST resources?',
        shortAnswer: 'Use plural nouns for collections (/users), identifiers for items (/users/7), shallow nesting for ownership (/users/7/orders), lowercase kebab-case paths, and leave actions to HTTP methods rather than verbs in URLs.',
        detailedAnswer: [
          'Filters, sorting and pagination go in the query string.',
          'Keep JSON field casing consistent.',
          'Avoid file extensions; use content negotiation.',
          'Stable identifiers — do not expose internal DB details.',
        ],
        followUp: 'How do you model an action like "approve" that is not CRUD?',
        trap: 'Mixing singular and plural nouns across endpoints.',
      },
    ],
  },

  'api-versioning': {
    summary: 'Version an API so you can make breaking changes without breaking existing clients: URL versioning (/v1), header versioning, or media-type versioning — plus deprecation and sunset policies.',
    topics: ['API versioning', 'URL versioning', 'header versioning', 'media type versioning', 'breaking changes', 'Deprecation', 'Sunset header', 'backward compatibility'],
    sections: [
      section('introduction', undefined,
        text('Mobile apps in the field cannot be force-updated. When you rename a field or change a response shape, old clients break — unless you version.'),
      ),
      section('definition', 'Strategies',
        table('Versioning strategies', ['Strategy', 'Example', 'Pros', 'Cons'], [
          ['URL path', '`GET /v1/todos`', 'Obvious, easy to route, cache and test in a browser', 'URL changes; "resource" identity includes version'],
          ['Custom header', '`Api-Version: 2`', 'Clean URLs', 'Invisible, harder to test/cache (need `Vary`)'],
          ['Media type', '`Accept: application/vnd.example.v2+json`', 'Most "RESTful", per-representation', 'Complex, unfamiliar to many devs'],
          ['Query param', '`/todos?version=2`', 'Easy', 'Mixes with filters; caching quirks'],
          ['Date-based (header)', '`Api-Version: 2026-11-01`', 'Fine-grained evolution', 'Needs good tooling'],
        ]),
      ),
      section('why', 'Breaking vs non-breaking changes',
        table('Change types', ['Non-breaking (no new version)', 'Breaking (new version)'], [
          ['Add an optional field to a response', 'Remove or rename a field'],
          ['Add a new endpoint', 'Change a field type (number → string)'],
          ['Add an optional request parameter', 'Make an optional parameter required'],
          ['Add a new enum value (if clients tolerate unknowns)', 'Change status codes or error format'],
        ]),
      ),
      section('internals', 'Deprecation lifecycle',
        flow(['Release v2', 'Mark v1 deprecated: Deprecation + Sunset headers', 'Notify clients, track v1 usage', 'Sunset date: v1 → 410 Gone'], { title: 'Retiring a version', direction: 'horizontal' }),
        note('The `Sunset` header (RFC 8594) gives the retirement date; the `Deprecation` header (RFC 9745) marks deprecation.'),
      ),
      section('example', 'Versioning in node:http',
        code({
          title: 'URL versioning with a prefix',
          code: dedent(`
            const v1 = createRouter();
            const v2 = createRouter();

            v1.route('GET', '/todos', (req, res) => send(res, 200, [...todos.values()]));
            v2.route('GET', '/todos', (req, res) =>
              send(res, 200, { data: [...todos.values()], meta: { count: todos.size } }));

            http.createServer((req, res) => {
              const { pathname } = new URL(req.url, 'http://localhost');
              const [, version, ...rest] = pathname.split('/');
              const path = '/' + rest.join('/');
              if (version === 'v1') {
                res.setHeader('Deprecation', '@1790812800'); // deprecated since 2026-10-01
                res.setHeader('Sunset', 'Thu, 31 Dec 2026 23:59:59 GMT');
                return v1.handle(req, res, path);
              }
              if (version === 'v2') return v2.handle(req, res, path);
              send(res, 404, { error: 'Unknown API version' });
            }).listen(3000);
          `),
          explanation: [
            'v2 wraps lists in an envelope — a breaking change, hence a new version.',
            'v1 responses advertise deprecation and a sunset date.',
            '`createRouter` wraps the route matcher from the route-parameters lesson.',
          ],
        }),
        code({
          title: 'Header / media-type version selection (runnable)',
          runnable: true,
          code: dedent(`
            function pickVersion(headers) {
              const accept = headers.accept || '';
              const m = accept.match(/application\\/vnd\\.todos\\.v(\\d+)\\+json/);
              if (m) return Number(m[1]);
              if (headers['api-version']) return Number(headers['api-version']);
              return 1; // default for clients that send nothing
            }
            console.log(pickVersion({ accept: 'application/vnd.todos.v2+json' }));
            console.log(pickVersion({ 'api-version': '3' }));
            console.log(pickVersion({}));
          `),
          expectedOutput: '2\n3\n1',
          explanation: ['When the response depends on headers, send `Vary: Accept, Api-Version` so caches keep versions apart.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Many large public APIs use URL versions (`/v1/`) for simplicity.',
          'Some use date-based versions pinned per account, with request-level overrides via header.',
          'Internally, share code: v1 handlers often call v2 services and adapt the output.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Bumping the version for additive, non-breaking changes.',
          'No default version → clients that omit headers get unpredictable behaviour.',
          'Maintaining many versions forever — define a sunset policy.',
          'Header versioning without `Vary` → caches mix versions.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Compare URL vs header vs media type in a table, say which you would pick and why (URL for public simplicity), and mention deprecation/sunset.'),
      ),
      section('practice', 'Practice',
        text('Introduce v2 of `GET /todos/:id` that renames `done` to `completed`. Keep v1 working by adapting the v2 representation.'),
      ),
      section('summary', 'Summary',
        bullets('Version only for breaking changes.', 'URL, header, media type (and query) strategies.', 'Deprecation + Sunset headers, then 410.', 'Vary when versioning by header.'),
      ),
    ],
    revisionNotes: [
      'URL (/v1), header (Api-Version), media type (application/vnd.x.v2+json), query.',
      'Additive changes are non-breaking.',
      'Sunset header (RFC 8594), Deprecation header.',
      'Retired version → 410 Gone.',
      'Header-based → Vary header for caches.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which change requires a new API version?',
        options: ['Adding an optional response field', 'Adding a new endpoint', 'Renaming an existing response field', 'Adding an optional query parameter'],
        answer: 2,
        explanation: 'Renaming breaks clients that read the old field. The others are additive and backward compatible.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'An API versions via the Api-Version header and sits behind a CDN. Clients sometimes get the wrong version. What is missing?',
        options: ['Cache-Control: no-store on everything', 'Vary: Api-Version', 'ETag', 'Content-Length'],
        answer: 1,
        explanation: 'Vary tells caches the response depends on that request header, so versions are cached separately.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Versioning',
        question: 'What API versioning strategies exist and which would you choose?',
        shortAnswer: 'URL path (/v1), custom request header, media-type versioning via Accept, and query parameters; URL versioning is the most common choice for public APIs because it is explicit and easy to route, cache and debug.',
        detailedAnswer: [
          'Header/media type keeps URLs stable but is invisible and needs Vary.',
          'Date-based versions allow fine-grained evolution with tooling.',
          'Version only for breaking changes; prefer additive evolution.',
          'Publish deprecation (Deprecation/Sunset headers), monitor usage, then return 410.',
        ],
        followUp: 'How would you share code between v1 and v2 handlers?',
        trap: 'Creating a new version for every release.',
      },
    ],
  },

  pagination: {
    summary: 'Never return unbounded lists. Offset pagination (?page/limit) is simple but slow and unstable on large or changing data; cursor (keyset) pagination is fast and stable but only goes forward/backward.',
    topics: ['pagination', 'offset', 'limit', 'cursor', 'keyset pagination', 'next cursor', 'Link header', 'total count'],
    sections: [
      section('introduction', undefined,
        text('`GET /orders` on a table with 10 million rows must not return 10 million rows. Pagination returns a page plus a way to get the next one.'),
      ),
      section('definition', 'Offset vs cursor',
        table('Offset vs cursor pagination', ['', 'Offset (`?page=3&limit=20`)', 'Cursor (`?after=eyJpZCI6NDB9&limit=20`)'], [
          ['SQL', '`LIMIT 20 OFFSET 40`', '`WHERE id > 40 ORDER BY id LIMIT 20`'],
          ['Jump to page N', 'Yes', 'No (next/prev only)'],
          ['Performance on deep pages', 'Degrades — DB scans and discards OFFSET rows', 'Constant with an index'],
          ['Stable under inserts/deletes', 'No — items shift, duplicates/skips', 'Yes'],
          ['Total count', 'Often included (extra COUNT query)', 'Usually omitted'],
          ['Good for', 'Admin tables, small datasets', 'Feeds, infinite scroll, large/changing data, exports'],
        ]),
      ),
      section('why', 'Why paginate',
        bullets(
          'Bounded response size and latency.',
          'Protects the DB from full scans per request.',
          'Clients render progressively.',
        ),
      ),
      section('internals', 'Why offset drifts',
        flow(['Page 1 returns items 1–20', 'Someone inserts a new item at the top', 'Page 2 (OFFSET 20) starts at old item 20', 'Item 20 is shown twice'], { title: 'Offset drift', direction: 'vertical' }),
        bullets(
          'A cursor encodes the position (last sort key + id as tiebreaker), often base64url-encoded JSON so clients treat it as opaque.',
          'Keyset query for sort by `createdAt DESC, id DESC`: `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT $3`.',
        ),
      ),
      section('example', 'Both styles',
        code({
          title: 'Offset and cursor over an array (runnable)',
          runnable: true,
          code: dedent(`
            const items = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));

            function offsetPage(page, limit) {
              const start = (page - 1) * limit;
              return { data: items.slice(start, start + limit).map((x) => x.id), total: items.length, page };
            }

            function cursorPage(after, limit) {
              const rows = items.filter((x) => after === null || x.id > after).slice(0, limit + 1);
              const hasMore = rows.length > limit;
              const data = rows.slice(0, limit).map((x) => x.id);
              return { data, nextCursor: hasMore ? data[data.length - 1] : null };
            }

            console.log(JSON.stringify(offsetPage(2, 3)));
            let c = cursorPage(null, 3);
            console.log(JSON.stringify(c));
            c = cursorPage(c.nextCursor, 3);
            console.log(JSON.stringify(c));
            console.log(JSON.stringify(cursorPage(c.nextCursor, 3)));
          `),
          expectedOutput: '{"data":[4,5,6],"total":7,"page":2}\n{"data":[1,2,3],"nextCursor":3}\n{"data":[4,5,6],"nextCursor":6}\n{"data":[7],"nextCursor":null}',
          explanation: [
            'Fetching `limit + 1` rows tells you whether there is a next page without a COUNT query.',
            'The cursor is the last id seen; the next query starts strictly after it.',
            '`nextCursor: null` means the end.',
          ],
        }),
        code({
          title: 'Opaque cursors in the Todo API',
          code: dedent(`
            const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
            const decode = (s) => {
              try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); }
              catch { throw new HttpError(400, 'Invalid cursor'); }
            };

            route('GET', '/todos', (req, res) => {
              const q = new URL(req.url, 'http://localhost').searchParams;
              const limit = Math.min(Math.max(Number(q.get('limit') ?? 20), 1), 100);
              const after = q.get('cursor') ? decode(q.get('cursor')).id : 0;
              const sorted = [...todos.values()].sort((a, b) => a.id - b.id);
              const rows = sorted.filter((t) => t.id > after).slice(0, limit + 1);
              const page = rows.slice(0, limit);
              const next = rows.length > limit ? encode({ id: page[page.length - 1].id }) : null;
              send(res, 200, { data: page, nextCursor: next });
            });
          `),
          explanation: ['`limit` is clamped to 1–100.', 'Base64url makes the cursor opaque and URL-safe; clients must not parse it.'],
        }),
        code({
          title: 'Response shape and Link header',
          language: 'http',
          code: dedent(`
            GET /todos?limit=2 HTTP/1.1

            HTTP/1.1 200 OK
            Content-Type: application/json
            Link: </todos?limit=2&cursor=eyJpZCI6Mn0>; rel="next"

            {"data":[{"id":1,"title":"a","done":false},{"id":2,"title":"b","done":true}],"nextCursor":"eyJpZCI6Mn0"}
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Social feeds and activity logs: cursor pagination (stable while new posts arrive).',
          'Admin dashboards with "page 7 of 50": offset with a cap on max page.',
          'Exports: iterate with cursors in a background job, not deep offsets.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'No max `limit` (clients request 1,000,000).',
          'Cursor on a non-unique sort key (e.g. `createdAt` only) → skipped/duplicated rows; add `id` as tiebreaker.',
          'Running `COUNT(*)` on huge tables for every page.',
          'Exposing raw DB offsets/ids in cursors that clients start depending on.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name the two failure modes of offset (deep-page cost, drift) and how keyset pagination fixes both with an index and a unique tiebreaker.'),
      ),
      section('practice', 'Practice',
        text('Add `sort=-createdAt` support to cursor pagination, encoding both `createdAt` and `id` in the cursor.'),
      ),
      section('summary', 'Summary',
        bullets('Always paginate collections with a max limit.', 'Offset: simple, jumpable, slow/unstable deep.', 'Cursor: fast, stable, next/prev only.', 'Opaque base64url cursors with a unique tiebreaker.'),
      ),
    ],
    revisionNotes: [
      'Offset: LIMIT/OFFSET — cost grows with offset, drifts on inserts.',
      'Cursor/keyset: WHERE key > last ORDER BY key LIMIT n — index-friendly, stable.',
      'Fetch limit+1 to detect hasMore.',
      'Tiebreaker: (sortKey, id).',
      'Clamp limit (e.g. 1–100).',
      'Link: <...>; rel="next" header option.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why does OFFSET pagination get slower on deep pages?',
        options: ['JSON gets larger', 'The database still has to walk and discard all OFFSET rows before returning the page', 'Indexes are disabled', 'HTTP caches miss'],
        answer: 1,
        explanation: 'OFFSET 1,000,000 means reading a million rows to skip them. Keyset pagination seeks directly with the index.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Users scrolling a fast-moving feed see duplicate posts on page 2. Which change fixes it?',
        options: ['Increase page size', 'Switch to cursor pagination based on (createdAt, id)', 'Add a total count', 'Cache page 1'],
        answer: 1,
        explanation: 'New posts shift offsets. A cursor anchors the next page to the last item seen.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Rows are occasionally skipped with this cursor query. Why?',
        code: 'SELECT * FROM posts\nWHERE created_at < $cursorCreatedAt\nORDER BY created_at DESC\nLIMIT 20;',
        options: ['DESC is not supported with cursors', 'created_at is not unique; rows sharing the boundary timestamp are skipped — add id as a tiebreaker', 'LIMIT must come before ORDER BY', 'Cursors only work with UUIDs'],
        answer: 1,
        explanation: 'Use WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC so the position is unique.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Pagination',
        question: 'Compare offset-based and cursor-based pagination.',
        shortAnswer: 'Offset pagination (LIMIT/OFFSET) is simple and supports jumping to any page but gets slower on deep pages and drifts when data changes; cursor (keyset) pagination continues after the last seen key, so it is fast with an index and stable, but only supports next/previous.',
        detailedAnswer: [
          'Offset cost is O(offset + limit).',
          'Inserts/deletes during browsing shift offsets → duplicates or skips.',
          'Cursor = encoded (sortKey, id) of the last row; query with `WHERE (k, id) > (...)`.',
          'Fetch limit+1 to know if there is a next page.',
          'Use offset for small admin tables, cursor for feeds and large data.',
        ],
        followUp: 'How do you support arbitrary sort orders with cursors?',
        trap: 'Saying cursor pagination cannot have any filters — filters work fine if the index supports them.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Pagination',
        question: 'Design the pagination for GET /transactions on a 500-million-row table sorted by newest first, with filters by account and status.',
        shortAnswer: 'Keyset pagination with an opaque cursor encoding (created_at, id), a composite index such as (account_id, status, created_at DESC, id DESC), a clamped limit, limit+1 fetching for hasMore, and no total count by default.',
        detailedAnswer: [
          'Query: `WHERE account_id = $1 AND status = $2 AND (created_at, id) < ($3, $4) ORDER BY created_at DESC, id DESC LIMIT $5`.',
          'Index matches equality filters first, then the sort keys.',
          'Cursor is base64url JSON, optionally HMAC-signed to prevent tampering.',
          'If counts are needed, serve approximate or cached counts.',
          'Changing filters/sort invalidates the cursor → 400 if mismatched (store filters in the cursor).',
        ],
        followUp: 'How would you implement "previous page"?',
        trap: 'Proposing OFFSET with a bigger server.',
      },
    ],
  },

  'filtering-and-sorting': {
    summary: 'Expose filters and sorting through query parameters (?status=open&sort=-createdAt), validate every field against an allowlist, and translate them into safe, index-friendly queries.',
    topics: ['filtering', 'sorting', 'allowlist', 'query parameters', 'sort=-field', 'range filters', 'search', 'injection', 'field selection'],
    sections: [
      section('introduction', undefined,
        text('Clients rarely want every item: they want "open tasks assigned to me, newest first". Filtering and sorting give them that — and if done carelessly, give attackers a way into your database.'),
      ),
      section('definition', 'Common conventions',
        table('Query conventions', ['Need', 'Convention', 'Example'], [
          ['Equality filter', '`field=value`', '`?status=open`'],
          ['Multiple values', 'Comma list or repeated key', '`?status=open,blocked` / `?tag=a&tag=b`'],
          ['Range', 'Suffix or bracket operators', '`?price_gte=10&price_lte=50` / `?price[gte]=10`'],
          ['Search', '`q`', '`?q=invoice`'],
          ['Sort', '`sort`, `-` for descending, comma for multiple', '`?sort=-createdAt,title`'],
          ['Field selection', '`fields`', '`?fields=id,title`'],
        ]),
      ),
      section('why', 'Why allowlists',
        bullets(
          'Arbitrary field names in SQL `ORDER BY` cannot be parameterised → SQL injection if concatenated.',
          'Filtering on unindexed columns can cause full table scans (DoS by query).',
          'Allowlisting documents your API and keeps it stable.',
        ),
      ),
      section('internals', 'From query string to query',
        flow(['?status=open&sort=-createdAt', 'Parse with searchParams', 'Validate against allowlist', 'Build parameterised WHERE + mapped ORDER BY', 'Execute with index'], { title: 'Filter pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Implementing filters and sorting',
        code({
          title: 'Parse, validate and apply (runnable)',
          runnable: true,
          code: dedent(`
            const SORTABLE = { title: 'title', createdAt: 'createdAt' };
            const STATUSES = ['open', 'done'];

            function parseQuery(searchParams) {
              const status = searchParams.get('status');
              if (status && !STATUSES.includes(status)) throw new Error('invalid status: ' + status);
              const sort = (searchParams.get('sort') || 'createdAt').split(',').map((s) => {
                const dir = s.startsWith('-') ? -1 : 1;
                const key = SORTABLE[s.replace(/^-/, '')];
                if (!key) throw new Error('cannot sort by ' + s);
                return { key, dir };
              });
              return { status, sort };
            }

            function apply(items, { status, sort }) {
              const out = status ? items.filter((t) => t.status === status) : items.slice();
              return out.sort((a, b) => {
                for (const { key, dir } of sort) {
                  if (a[key] < b[key]) return -1 * dir;
                  if (a[key] > b[key]) return 1 * dir;
                }
                return 0;
              });
            }

            const todos = [
              { title: 'b', status: 'open', createdAt: 2 },
              { title: 'a', status: 'done', createdAt: 3 },
              { title: 'c', status: 'open', createdAt: 1 },
            ];
            const q = parseQuery(new URL('http://x/todos?status=open&sort=-createdAt').searchParams);
            console.log(apply(todos, q).map((t) => t.title).join(','));
            try { parseQuery(new URL('http://x/todos?sort=password').searchParams); }
            catch (e) { console.log(e.message); }
          `),
          expectedOutput: 'b,c\ncannot sort by password',
          explanation: [
            'Only allowlisted fields can be sorted; unknown fields → 400.',
            '`-createdAt` sorts descending.',
            'Validation errors become 400 responses in the API.',
          ],
        }),
        code({
          title: 'Translating to safe SQL',
          code: dedent(`
            function toSql({ status, sort }) {
              const where = [];
              const params = [];
              if (status) { params.push(status); where.push('status = $' + params.length); }
              const columns = { title: 'title', createdAt: 'created_at' }; // allowlist → column
              const orderBy = sort.map(({ key, dir }) => columns[key] + (dir < 0 ? ' DESC' : ' ASC')).join(', ');
              return {
                text: 'SELECT * FROM todos' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + orderBy + ', id',
                params,
              };
            }
            console.log(toSql({ status: 'open', sort: [{ key: 'createdAt', dir: -1 }] }));
          `),
          expectedOutput: "{\n  text: 'SELECT * FROM todos WHERE status = $1 ORDER BY created_at DESC, id',\n  params: [ 'open' ]\n}",
          explanation: ['Values go in `params` (placeholders); identifiers come only from the allowlist map.', '`id` is appended as a deterministic tiebreaker (needed for pagination).'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'E-commerce: `?category=shoes&price_lte=100&sort=-rating`.',
          'Back-office search with `q` backed by a full-text index or a search engine.',
          'Combine with cursor pagination — the cursor must encode the sort keys.',
          'Express users often reach for libraries, but the allowlist principle is the same.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Concatenating `sort` into `ORDER BY` → SQL injection.',
          'Passing the query object straight into MongoDB (`find(req.query)`) → operator injection (`?password[$ne]=x`).',
          'Allowing filters on unindexed columns of huge tables.',
          'Non-deterministic sort (no tiebreaker) → inconsistent pages.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "allowlist + parameterised values + tiebreaker". Mention the NoSQL operator-injection trap with `find(req.query)`.'),
      ),
      section('practice', 'Practice',
        text('Add `?q=` (case-insensitive title contains) and `?createdAfter=` (ISO date) filters to the Todo API with validation.'),
      ),
      section('summary', 'Summary',
        bullets('Filters and sort in the query string.', '`-field` for descending.', 'Allowlist fields; parameterise values.', 'Deterministic order with a tiebreaker.'),
      ),
    ],
    revisionNotes: [
      '?status=open&sort=-createdAt,title.',
      'ORDER BY identifiers cannot be parameterised → map from an allowlist.',
      'Values via placeholders ($1).',
      'find(req.query) → NoSQL operator injection.',
      'Add id tiebreaker for stable ordering.',
      'Only index-backed filters on big tables.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the vulnerability?',
        code: "const sort = url.searchParams.get('sort');\ndb.query('SELECT * FROM users ORDER BY ' + sort);",
        options: ['None — ORDER BY cannot be injected', 'SQL injection: sort is concatenated into the query; map it through an allowlist', 'Sorting is slow', 'searchParams.get returns an array'],
        answer: 1,
        explanation: 'Identifiers cannot be bound as parameters, so they must come from a fixed allowlist.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'By convention, what does ?sort=-price,name mean?',
        options: ['Price ascending, then name descending', 'Price descending, then name ascending', 'Exclude price, sort by name', 'Invalid'],
        answer: 1,
        explanation: 'A leading "-" means descending; fields are applied in order.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: "A MongoDB login handler does users.findOne({ email: q.email, password: q.password }) with values from a parsed query object. An attacker sends password[$ne]=x. What happens and how do you prevent it?",
        options: ['Nothing — Mongo ignores $ne', 'The filter becomes { $ne: "x" }, matching any password; validate that values are strings (and never compare plain passwords)', 'Mongo throws a syntax error', 'Only the email is checked'],
        answer: 1,
        explanation: 'Some query parsers (e.g. qs in Express) turn brackets into nested objects, injecting operators. Validate types/schemas, and store hashed passwords.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Filtering and sorting',
        question: 'How would you implement safe filtering and sorting on a list endpoint backed by SQL?',
        shortAnswer: 'Parse query parameters, validate each filter and sort field against an allowlist, map sort fields to known column names, bind filter values as parameters, add a unique tiebreaker to ORDER BY, and return 400 for anything unknown.',
        detailedAnswer: [
          'Values: placeholders (`$1`) — never string concatenation.',
          'Identifiers (columns, direction): from a fixed map.',
          'Restrict filters to indexed columns; cap list lengths for `IN` filters.',
          'Combine with pagination; the cursor must encode the sort keys.',
          'Document supported filters in OpenAPI.',
        ],
        followUp: 'How would you support full-text search efficiently?',
        trap: 'Believing prepared statements alone protect ORDER BY clauses.',
      },
    ],
  },
};

export default content;

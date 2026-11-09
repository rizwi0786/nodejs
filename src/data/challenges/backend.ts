import type { CodingChallenge } from '../../types';
import { js, md, t } from './helpers';

/** Backend utilities: HTTP parsing, routing, middleware, validation, rate limiting. */
export const backendChallenges: CodingChallenge[] = [
  {
    id: 'ch-038',
    title: 'Parse a query string',
    difficulty: 'beginner',
    topic: 'HTTP query parameters',
    category: 'express-backend',
    prompt: md(
      'Write `parseQuery(qs)` that turns a URL query string into an object.',
      '',
      '- A leading `?` is optional. Empty pairs (`&&`) are skipped.',
      '- `+` means space; values and keys are percent-decoded. If decoding fails (malformed `%`), keep the raw text.',
      "- A key without `=` gets `''`.",
      '- Repeated keys become an array in order of appearance.',
      '- Return a null-prototype object so keys like `__proto__` are harmless.',
      '',
      "- `parseQuery('?q=node+js&page=2')` → `{ q: 'node js', page: '2' }`",
      "- `parseQuery('tag=a&tag=b')` → `{ tag: ['a', 'b'] }`",
    ),
    starterCode: js`
      function parseQuery(qs) {
        // TODO (do not use URLSearchParams)
      }
    `,
    solution: js`
      function decode(text) {
        const spaced = text.replace(/\+/g, ' ');
        try {
          return decodeURIComponent(spaced);
        } catch {
          return spaced;
        }
      }

      function parseQuery(qs) {
        const out = Object.create(null);
        for (const pair of qs.replace(/^\?/, '').split('&')) {
          if (!pair) continue;
          const eq = pair.indexOf('=');
          const key = decode(eq === -1 ? pair : pair.slice(0, eq));
          const value = eq === -1 ? '' : decode(pair.slice(eq + 1));
          if (key in out) out[key] = [].concat(out[key], value);
          else out[key] = value;
        }
        return out;
      }
    `,
    tests: [
      t("parseQuery('?q=node+js&page=2')", { q: 'node js', page: '2' }),
      t("parseQuery('tag=a&tag=b&tag=c')", { tag: ['a', 'b', 'c'] }),
      t("parseQuery('')", {}),
      t("parseQuery('flag&name=')", { flag: '', name: '' }),
      t("parseQuery('city=S%C3%A3o%20Paulo&x=%26')", { city: 'São Paulo', x: '&' }),
      t("parseQuery('a=1&&b=2')", { a: '1', b: '2' }),
      t("parseQuery('bad=%E0%A4%A')", { bad: '%E0%A4%A' }),
    ],
    hints: [
      'Split on `&`, then split each pair on the **first** `=` only (values may contain `=`).',
      'Replace `+` with a space **before** calling `decodeURIComponent`.',
    ],
    explanation: md(
      'Strip the `?`, split into pairs, split each pair at its first `=`, decode both sides, and accumulate — upgrading a key to an array when it repeats. `decodeURIComponent` throws `URIError` on malformed input, so wrap it; one bad parameter should not crash the request handler.',
      '',
      'In real code use `URLSearchParams` / `new URL(req.url, base).searchParams`. Express\'s default parser (`qs`) also understands nested `a[b]=c` syntax — which is exactly where prototype-pollution bugs have historically appeared.',
      '',
      'Complexity: O(n) in the length of the string.',
    ),
    relatedLessonIds: ['m07-query-parameters', 'm08-query-parameters', 'm03-url-module'],
  },
  {
    id: 'ch-039',
    title: 'Offset pagination helper',
    difficulty: 'beginner',
    topic: 'Pagination',
    category: 'express-backend',
    prompt: md(
      'Write `paginate(items, { page = 1, pageSize = 10 } = {})` returning:',
      '',
      '`{ data, page, pageSize, total, totalPages, hasNext, hasPrev }`',
      '',
      '- `page` and `pageSize` may arrive as strings from `req.query` — convert them. Non-numeric values fall back to the defaults.',
      '- Clamp `pageSize` to `1..100` and `page` to at least `1`.',
      '- A page past the end returns empty `data` (keep the requested page number).',
      '- `totalPages` is `0` for an empty list.',
    ),
    starterCode: js`
      function paginate(items, { page = 1, pageSize = 10 } = {}) {
        // TODO
      }
    `,
    solution: js`
      function toInt(value, fallback) {
        const n = Math.floor(Number(value));
        return Number.isFinite(n) ? n : fallback;
      }

      function paginate(items, { page = 1, pageSize = 10 } = {}) {
        const size = Math.min(100, Math.max(1, toInt(pageSize, 10)));
        const current = Math.max(1, toInt(page, 1));
        const total = items.length;
        const totalPages = Math.ceil(total / size);
        const start = (current - 1) * size;
        return {
          data: items.slice(start, start + size),
          page: current,
          pageSize: size,
          total,
          totalPages,
          hasNext: current < totalPages,
          hasPrev: current > 1,
        };
      }
    `,
    tests: [
      t('paginate([1, 2, 3, 4, 5], { page: 2, pageSize: 2 })', { data: [3, 4], page: 2, pageSize: 2, total: 5, totalPages: 3, hasNext: true, hasPrev: true }),
      t('paginate([1, 2, 3])', { data: [1, 2, 3], page: 1, pageSize: 10, total: 3, totalPages: 1, hasNext: false, hasPrev: false }),
      t('paginate([1, 2, 3], { page: 5, pageSize: 2 })', { data: [], page: 5, pageSize: 2, total: 3, totalPages: 2, hasNext: false, hasPrev: true }),
      t('paginate([1, 2, 3], { page: -3, pageSize: 0 })', { data: [1], page: 1, pageSize: 1, total: 3, totalPages: 3, hasNext: true, hasPrev: false }),
      t('(() => { const r = paginate(Array.from({ length: 250 }, (_, i) => i), { page: 3, pageSize: 500 }); return [r.pageSize, r.data.length, r.data[0], r.totalPages, r.hasNext]; })()', [100, 50, 200, 3, false]),
      t("paginate(['a', 'b', 'c'], { page: '2', pageSize: '2' }).data", ['c']),
      t("paginate([], { page: 'abc' })", { data: [], page: 1, pageSize: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false }),
    ],
    hints: ['`Number("abc")` is `NaN` — check with `Number.isFinite`.', 'Offset = `(page - 1) * pageSize`.'],
    explanation: md(
      'Normalise inputs first (parse, fall back, clamp), then compute `offset = (page - 1) * pageSize` and slice. `hasNext`/`hasPrev` let a client render navigation without extra maths.',
      '',
      'Clamping `pageSize` is a protection, not a nicety: without it `?pageSize=1000000` asks your database for a million rows. In SQL this maps to `LIMIT size OFFSET start` — which gets slow for deep pages, the reason cursor pagination exists (see the cursor challenge).',
      '',
      'Complexity: O(pageSize) for the slice.',
    ),
    relatedLessonIds: ['m07-pagination', 'm07-query-parameters'],
  },
  {
    id: 'ch-040',
    title: 'Parse a Cookie header',
    difficulty: 'beginner',
    topic: 'Cookies',
    category: 'express-backend',
    prompt: md(
      'Write `parseCookies(header)` for the HTTP `Cookie` request header (`a=1; b=2`).',
      '',
      '- Pairs are separated by `;`. Trim whitespace around names and values.',
      '- Values may be wrapped in double quotes — strip them. Percent-decode values (keep raw text if decoding fails).',
      '- Values may contain `=` (split on the first one only).',
      '- Skip pairs with no `=` or an empty name. If a name repeats, the **first** one wins.',
      '- `undefined` or empty header → `{}`.',
    ),
    starterCode: js`
      function parseCookies(header) {
        // TODO
      }
    `,
    solution: js`
      function parseCookies(header) {
        const out = Object.create(null);
        if (!header) return out;
        for (const part of header.split(';')) {
          const eq = part.indexOf('=');
          if (eq === -1) continue;
          const name = part.slice(0, eq).trim();
          if (!name || name in out) continue;
          let value = part.slice(eq + 1).trim();
          if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          try {
            value = decodeURIComponent(value);
          } catch {
            // keep the raw value
          }
          out[name] = value;
        }
        return out;
      }
    `,
    tests: [
      t("parseCookies('sid=abc123; theme=dark')", { sid: 'abc123', theme: 'dark' }),
      t("parseCookies('name=John%20Doe; quoted=\"hello\"')", { name: 'John Doe', quoted: 'hello' }),
      t("[parseCookies(''), parseCookies(undefined)]", [{}, {}]),
      t("parseCookies('a=1; a=2')", { a: '1' }),
      t("parseCookies('token=abc==; x=1')", { token: 'abc==', x: '1' }),
      t("parseCookies('novalue; =nokey; ok=1')", { ok: '1' }),
      t("parseCookies('  a = 1 ;b=2')", { a: '1', b: '2' }),
    ],
    hints: ['Use `indexOf("=")` rather than `split("=")` so values containing `=` survive.', '`name in out` tells you whether the name was already seen.'],
    explanation: md(
      'Split on `;`, cut each part at the first `=`, trim, unquote, decode, and keep only the first occurrence of each name (the `cookie` package used by Express behaves the same way). Base64 tokens often end in `==`, which is why splitting on every `=` is a bug.',
      '',
      'Parsing is the easy half — the security lives in how cookies are *set*: `HttpOnly`, `Secure`, `SameSite`, and signing/encrypting session cookies.',
      '',
      'Complexity: O(n) in header length.',
    ),
    relatedLessonIds: ['m10-cookies', 'm12-secure-cookies', 'm07-headers'],
  },
  {
    id: 'ch-041',
    title: 'Build a query string',
    difficulty: 'intermediate',
    topic: 'HTTP query parameters',
    category: 'express-backend',
    prompt: md(
      'Write `buildQuery(params)` that serialises an object to a query string (no leading `?`).',
      '',
      '- Skip `undefined` and `null` values.',
      '- Arrays become repeated keys: `{ tag: ["a", "b"] }` → `tag=a&tag=b` (an empty array adds nothing).',
      '- `Date` values use `toISOString()`. Numbers and booleans are stringified.',
      '- Nested plain objects use bracket keys: `{ filter: { status: "active" } }` → key `filter[status]`.',
      '- Encode keys and values with `encodeURIComponent` (so brackets become `%5B` / `%5D`).',
    ),
    starterCode: js`
      function buildQuery(params) {
        // TODO
      }
    `,
    solution: js`
      function buildQuery(params) {
        const parts = [];
        const add = (key, value) => {
          if (value === undefined || value === null) return;
          if (Array.isArray(value)) {
            value.forEach((v) => add(key, v));
            return;
          }
          if (value instanceof Date) {
            add(key, value.toISOString());
            return;
          }
          if (typeof value === 'object') {
            Object.keys(value).forEach((k) => add(key + '[' + k + ']', value[k]));
            return;
          }
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
        };
        Object.keys(params).forEach((key) => add(key, params[key]));
        return parts.join('&');
      }
    `,
    tests: [
      t("buildQuery({ q: 'node js', page: 2 })", 'q=node%20js&page=2'),
      t("buildQuery({ tag: ['a', 'b'], empty: null, missing: undefined })", 'tag=a&tag=b'),
      t('buildQuery({})', ''),
      t("buildQuery({ 'a&b': 'c=d' })", 'a%26b=c%3Dd'),
      t('buildQuery({ active: true, since: new Date(0) })', 'active=true&since=1970-01-01T00%3A00%3A00.000Z'),
      t("buildQuery({ filter: { status: 'active', role: 'admin' } })", 'filter%5Bstatus%5D=active&filter%5Brole%5D=admin'),
      t('buildQuery({ ids: [], n: 0, f: false })', 'n=0&f=false'),
    ],
    hints: ['A recursive `add(key, value)` helper handles arrays and nested objects uniformly.', 'Check `Date` before the generic object branch.', '`0` and `false` are real values — only skip `null`/`undefined`.'],
    explanation: md(
      'A recursive helper dispatches on the value type: skip nullish, expand arrays into repeated keys, convert dates, prefix nested keys with brackets, and encode leaves. Encoding both sides prevents a value like `c=d&admin=1` from injecting extra parameters.',
      '',
      '`URLSearchParams` covers the flat case (`new URLSearchParams({ q: "x" }).toString()`) but encodes spaces as `+` and has no nested-object convention.',
      '',
      'Complexity: O(total keys and values).',
    ),
    relatedLessonIds: ['m07-query-parameters', 'm03-url-module'],
  },
  {
    id: 'ch-042',
    title: 'Route path matcher',
    difficulty: 'intermediate',
    topic: 'Routing',
    category: 'express-backend',
    prompt: md(
      'Write `matchRoute(pattern, path)` — the core of an Express-style router. Return a params object on match, or `null`.',
      '',
      '- `:name` segments capture a **non-empty** segment, percent-decoded.',
      "- A final `*` captures the rest of the path as `params['*']`.",
      '- Ignore the query string and a trailing slash in `path`. Matching is case-sensitive.',
      '',
      "- `matchRoute('/users/:id', '/users/42')` → `{ id: '42' }`",
      "- `matchRoute('/users/:id', '/users/42/posts')` → `null`",
      "- `matchRoute('/files/*', '/files/a/b.txt')` → `{ '*': 'a/b.txt' }`",
    ),
    starterCode: js`
      function matchRoute(pattern, path) {
        // TODO: compare segment by segment
      }
    `,
    solution: js`
      function matchRoute(pattern, path) {
        const segments = (s) => s.split('/').filter(Boolean);
        const patternSegs = segments(pattern);
        const pathSegs = segments(path.split('?')[0]);
        const params = {};

        for (let i = 0; i < patternSegs.length; i++) {
          const seg = patternSegs[i];
          if (seg === '*') {
            params['*'] = pathSegs.slice(i).map(decodeURIComponent).join('/');
            return params;
          }
          const value = pathSegs[i];
          if (value === undefined) return null;
          if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(value);
          else if (seg !== value) return null;
        }
        return patternSegs.length === pathSegs.length ? params : null;
      }
    `,
    tests: [
      t("matchRoute('/users/:id', '/users/42')", { id: '42' }),
      t("matchRoute('/users/:id', '/users/42/posts')", null),
      t("matchRoute('/users/:userId/posts/:postId', '/users/7/posts/99/')", { userId: '7', postId: '99' }),
      t("matchRoute('/health', '/health?verbose=1')", {}),
      t("matchRoute('/files/*', '/files/a/b/c.txt')", { '*': 'a/b/c.txt' }),
      t("matchRoute('/search/:term', '/search/hello%20world')", { term: 'hello world' }),
      t("matchRoute('/users/:id', '/users/')", null),
      t("[matchRoute('/', '/'), matchRoute('/Users', '/users')]", [{}, null]),
    ],
    hints: ['Split both strings into non-empty segments.', 'After the loop, the segment counts must match (unless a `*` returned early).'],
    explanation: md(
      'Segment-wise comparison: literals must match exactly, `:param` segments capture, `*` swallows the rest. Splitting with `filter(Boolean)` makes the trailing slash irrelevant, and the final length check rejects paths with extra segments.',
      '',
      'Express 4 compiles patterns to regexes with `path-to-regexp`; Express 5 changed wildcard syntax (`/*splat`). High-performance routers (find-my-way in Fastify) use a radix tree so lookup cost does not grow with the number of routes.',
      '',
      'Complexity: O(segments) per match; a router tries routes in order, O(routes × segments).',
    ),
    relatedLessonIds: ['m08-routing', 'm08-route-parameters', 'm07-route-parameters'],
  },
  {
    id: 'ch-043',
    title: 'Schema-lite request validator',
    difficulty: 'intermediate',
    topic: 'Request validation',
    category: 'express-backend',
    prompt: md(
      'Write `validate(schema, data)` returning `{ valid, errors }`. The schema maps field names to rules:',
      '',
      "`{ type: 'string' | 'number' | 'boolean' | 'array' | 'object', required?, min?, max?, pattern?, enum? }`",
      '',
      'Rules, checked in this order — report only the **first** error per field, in schema key order:',
      '1. Missing (`undefined` or `null`): `"<f>: is required"` if `required`, otherwise skip the field.',
      '2. Type: `"<f>: must be of type <type>"`. Numbers must be finite; `array` uses `Array.isArray`; `object` means non-null, non-array.',
      '3. `min` / `max`: for numbers compare the value (`"<f>: must be >= <min>"`, `"<f>: must be <= <max>"`); for strings and arrays compare the length (`"<f>: length must be >= <min>"` / `<=`).',
      '4. `pattern` (RegExp, strings only): `"<f>: has invalid format"`.',
      '5. `enum`: `"<f>: must be one of a, b"`.',
      '',
      'Fields not in the schema are ignored.',
    ),
    starterCode: js`
      function validate(schema, data) {
        // TODO
      }
    `,
    solution: js`
      function checkType(type, value) {
        switch (type) {
          case 'number': return typeof value === 'number' && Number.isFinite(value);
          case 'array': return Array.isArray(value);
          case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
          default: return typeof value === type;
        }
      }

      function checkField(field, rule, value) {
        if (value === undefined || value === null) {
          return rule.required ? field + ': is required' : null;
        }
        if (!checkType(rule.type, value)) return field + ': must be of type ' + rule.type;
        const measured = typeof value === 'number' ? value : value.length;
        const prefix = typeof value === 'number' ? field + ': must be ' : field + ': length must be ';
        if (measured !== undefined) {
          if (rule.min !== undefined && measured < rule.min) return prefix + '>= ' + rule.min;
          if (rule.max !== undefined && measured > rule.max) return prefix + '<= ' + rule.max;
        }
        if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) return field + ': has invalid format';
        if (rule.enum && !rule.enum.includes(value)) return field + ': must be one of ' + rule.enum.join(', ');
        return null;
      }

      function validate(schema, data) {
        const errors = [];
        for (const [field, rule] of Object.entries(schema)) {
          const error = checkField(field, rule, data == null ? undefined : data[field]);
          if (error) errors.push(error);
        }
        return { valid: errors.length === 0, errors };
      }
    `,
    tests: [
      t("(() => { const schema = { name: { type: 'string', required: true, min: 2 }, age: { type: 'number', min: 0, max: 150 }, email: { type: 'string', required: true, pattern: /^[^@ ]+@[^@ ]+$/ }, role: { type: 'string', enum: ['user', 'admin'] } }; return validate(schema, { name: 'Ann', email: 'a@b.co', age: 30 }); })()", { valid: true, errors: [] }),
      t("(() => { const schema = { name: { type: 'string', required: true, min: 2 }, age: { type: 'number', min: 0, max: 150 }, email: { type: 'string', required: true, pattern: /^[^@ ]+@[^@ ]+$/ }, role: { type: 'string', enum: ['user', 'admin'] } }; return validate(schema, { name: 'A', age: -1, email: 'nope', role: 'root' }); })()",
        { valid: false, errors: ['name: length must be >= 2', 'age: must be >= 0', 'email: has invalid format', 'role: must be one of user, admin'] }),
      t("validate({ name: { type: 'string', required: true }, email: { type: 'string', required: true }, nick: { type: 'string' } }, {})", { valid: false, errors: ['name: is required', 'email: is required'] }),
      t("validate({ tags: { type: 'array', max: 2 } }, { tags: 'x' }).errors", ['tags: must be of type array']),
      t("validate({ tags: { type: 'array', max: 2 } }, { tags: ['a', 'b', 'c'] }).errors", ['tags: length must be <= 2']),
      t("[validate({ n: { type: 'number' } }, { n: NaN }).errors, validate({ meta: { type: 'object' } }, { meta: [] }).errors, validate({ ok: { type: 'boolean', required: true } }, { ok: false }).valid]", [['n: must be of type number'], ['meta: must be of type object'], true]),
      t("validate({ code: { type: 'string', min: 5, pattern: /^[0-9]+$/ } }, { code: 'ab' }).errors", ['code: length must be >= 5']),
    ],
    hints: [
      'Write a `checkField` that returns the first error string or `null` — early returns make "first error only" trivial.',
      '`false` and `0` are present values; only `undefined`/`null` count as missing.',
    ],
    explanation: md(
      'Iterate the schema (not the data) so output order is deterministic and unknown fields are ignored. Each field runs through an ordered list of checks and returns at the first failure. Min/max apply to the number itself or to `.length`, sharing one code path.',
      '',
      'In production use a library — Zod, Joi, Ajv (JSON Schema) or `express-validator` — and also **strip** unknown fields (mass-assignment protection) and coerce query-string types.',
      '',
      'Complexity: O(fields) plus regex cost.',
    ),
    relatedLessonIds: ['m08-request-validation', 'm12-input-validation', 'm09-validation'],
  },
  {
    id: 'ch-044',
    title: 'Opaque cursor pagination',
    difficulty: 'intermediate',
    topic: 'Pagination',
    category: 'express-backend',
    prompt: md(
      'Implement keyset ("cursor") pagination over `items` sorted ascending by `(createdAt, id)`.',
      '',
      'Write `encodeCursor(obj)`, `decodeCursor(str)` and `paginateByCursor(items, { limit = 2, after })`:',
      '- Returns `{ data, nextCursor }`. `nextCursor` is an **opaque string** (must not contain raw JSON) encoding the last returned item\'s `createdAt` and `id`, or `null` when there are no more items.',
      '- With `after`, return items strictly **after** that key — so the next page stays correct even if new rows are inserted before it.',
      "- An undecodable cursor throws `Error('Invalid cursor')`.",
      '',
      'Any reversible encoding is fine (hex of UTF-8 bytes, base64url…).',
    ),
    starterCode: js`
      function encodeCursor(value) {
        // TODO
      }

      function decodeCursor(cursor) {
        // TODO
      }

      function paginateByCursor(items, { limit = 2, after } = {}) {
        // TODO
      }
    `,
    solution: js`
      function encodeCursor(value) {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }

      function decodeCursor(cursor) {
        try {
          if (typeof cursor !== 'string' || !/^([0-9a-f]{2})+$/.test(cursor)) throw new Error('bad hex');
          const bytes = new Uint8Array(cursor.match(/../g).map((h) => parseInt(h, 16)));
          const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          if (!value || typeof value.createdAt !== 'number' || value.id === undefined) throw new Error('bad shape');
          return value;
        } catch {
          throw new Error('Invalid cursor');
        }
      }

      function paginateByCursor(items, { limit = 2, after } = {}) {
        let start = 0;
        if (after != null) {
          const key = decodeCursor(after);
          start = items.findIndex(
            (it) => it.createdAt > key.createdAt || (it.createdAt === key.createdAt && it.id > key.id),
          );
          if (start === -1) start = items.length;
        }
        const data = items.slice(start, start + limit);
        const hasMore = start + limit < items.length;
        const last = data[data.length - 1];
        return {
          data,
          nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
        };
      }
    `,
    tests: [
      t('(() => { const items = [{ id: 1, createdAt: 100 }, { id: 2, createdAt: 100 }, { id: 3, createdAt: 105 }, { id: 4, createdAt: 110 }, { id: 5, createdAt: 120 }]; const pages = []; let after; do { const p = paginateByCursor(items, { limit: 2, after }); pages.push(p.data.map((i) => i.id)); after = p.nextCursor; } while (after && pages.length < 10); return pages; })()', [[1, 2], [3, 4], [5]]),
      t('(() => { const items = [{ id: 1, createdAt: 1 }, { id: 2, createdAt: 2 }, { id: 3, createdAt: 3 }]; const p1 = paginateByCursor(items, { limit: 2 }); const p2 = paginateByCursor(items, { limit: 2, after: p1.nextCursor }); return [typeof p1.nextCursor, p2.nextCursor]; })()', ['string', null]),
      t('(() => { const items = [{ id: 1, createdAt: 100 }, { id: 2, createdAt: 101 }, { id: 3, createdAt: 102 }, { id: 4, createdAt: 103 }]; const p1 = paginateByCursor(items, { limit: 2 }); items.unshift({ id: 0, createdAt: 50 }); return paginateByCursor(items, { limit: 2, after: p1.nextCursor }).data.map((i) => i.id); })()', [3, 4]),
      t("['zz', 'abc', '7b7d', ''].map((c) => { try { paginateByCursor([], { after: c }); return 'accepted'; } catch (e) { return e.message; } })", ['Invalid cursor', 'Invalid cursor', 'Invalid cursor', 'Invalid cursor']),
      t("(() => { const p = paginateByCursor([{ id: 1, createdAt: 1 }, { id: 2, createdAt: 2 }], { limit: 1 }); return [p.nextCursor.includes('{'), p.nextCursor.includes('createdAt')]; })()", [false, false]),
      t('(() => { const items = [1, 2, 3, 4, 5].map((n) => ({ id: n, createdAt: n })); const p = paginateByCursor(items, { limit: 5 }); return [p.data.length, p.nextCursor]; })()', [5, null]),
      t("(() => { const c = encodeCursor({ createdAt: 7, id: 'é' }); return decodeCursor(c); })()", { createdAt: 7, id: 'é' }),
    ],
    hints: [
      'The cursor should hold the **sort key** of the last row, not an offset.',
      'Decide `hasMore` by checking whether anything exists beyond the current page.',
      'Wrap all decoding in one `try/catch` and rethrow a single clear error.',
    ],
    explanation: md(
      'Keyset pagination remembers *where you stopped* (`createdAt`, `id`) rather than *how many rows to skip*. The next query is `WHERE (created_at, id) > ($1, $2) ORDER BY created_at, id LIMIT n` — index-friendly at any depth and stable when rows are inserted earlier. The `id` tie-breaker matters because many rows can share a timestamp.',
      '',
      'Encoding the key makes it opaque, so clients cannot depend on its format and you can change it later. Opaque is not secret: sign it (HMAC) if tampering matters. Any malformed cursor maps to one `400 Invalid cursor`.',
      '',
      'Complexity: O(n) here (linear scan); O(log n + limit) with a database index.',
    ),
    relatedLessonIds: ['m07-pagination', 'm09-indexes'],
  },
  {
    id: 'ch-045',
    title: 'Mask PII in log objects',
    difficulty: 'intermediate',
    topic: 'Logging and privacy',
    category: 'express-backend',
    prompt: md(
      'Before logging a request, write `maskPII(value)` that returns a **deep copy** with sensitive data masked (the input must not change):',
      '',
      "- Any key matching `password`, `token`, `secret`, `authorization` or `apiKey`/`api_key` (case-insensitive, substring — so `accessToken` counts) → `'[REDACTED]'`.",
      "- Emails inside string values → first character of the local part + `***@` + domain: `john.doe@example.com` → `j***@example.com`.",
      "- Card-like numbers inside strings (13–16 digits, optionally separated by single spaces or dashes) → `[CARD ****1234]` (last 4 digits).",
      '- Recurse into arrays and objects; leave other values unchanged.',
    ),
    starterCode: js`
      function maskPII(value) {
        // TODO
      }
    `,
    solution: js`
      const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|api[-_]?key/i;
      const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
      const CARD = /\b(?:\d[ -]?){12,15}\d\b/g;

      function maskString(text) {
        return text
          .replace(CARD, (match) => '[CARD ****' + match.replace(/\D/g, '').slice(-4) + ']')
          .replace(EMAIL, '$1***@$2');
      }

      function maskPII(value) {
        if (Array.isArray(value)) return value.map(maskPII);
        if (typeof value === 'string') return maskString(value);
        if (value === null || typeof value !== 'object') return value;
        const out = {};
        for (const [key, child] of Object.entries(value)) {
          out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : maskPII(child);
        }
        return out;
      }
    `,
    tests: [
      t("maskPII({ user: 'john.doe@example.com' })", { user: 'j***@example.com' }),
      t("maskPII({ password: 'hunter2', nested: { accessToken: 'abc', Authorization: 'Bearer x', api_key: 'k' } })", { password: '[REDACTED]', nested: { accessToken: '[REDACTED]', Authorization: '[REDACTED]', api_key: '[REDACTED]' } }),
      t("maskPII({ msg: 'paid with 4111 1111 1111 1111 ok' })", { msg: 'paid with [CARD ****1111] ok' }),
      t("maskPII([{ email: 'a@b.io', n: 5 }, 'x', null])", [{ email: 'a***@b.io', n: 5 }, 'x', null]),
      t("(() => { const input = { password: 'p', profile: { email: 'z@q.com' } }; maskPII(input); return input; })()", { password: 'p', profile: { email: 'z@q.com' } }),
      t("maskPII({ orderId: '12345', card: '4111-1111-1111-1234', note: 'call 555-1234' })", { orderId: '12345', card: '[CARD ****1234]', note: 'call 555-1234' }),
    ],
    hints: [
      'Decide by **key** first (redact the whole value), then by **content** for strings.',
      'Normalise card matches with `replace(/\\D/g, "")` before taking the last 4 digits.',
    ],
    explanation: md(
      'A recursive copy that checks each key against a sensitive-name regex and, for strings, runs content regexes for emails and card numbers. Returning a new structure keeps the real request object intact for the handler.',
      '',
      'Production loggers do this declaratively: pino `redact: ["req.headers.authorization", "*.password"]`, winston formats. Masking by pattern is a safety net — the primary control is not logging bodies and headers you do not need.',
      '',
      'Complexity: O(total size of the value).',
    ),
    relatedLessonIds: ['m13-logging', 'm13-winston-or-pino', 'm12-secrets-management'],
  },
  {
    id: 'ch-046',
    title: 'CSV line parser with quotes',
    difficulty: 'intermediate',
    topic: 'Parsing',
    category: 'express-backend',
    prompt: md(
      'Write `parseCSVLine(line, delimiter = ",")` that splits one CSV record into fields (RFC 4180 style):',
      '',
      '- Fields wrapped in double quotes may contain the delimiter.',
      '- Inside a quoted field, `""` is an escaped quote.',
      '- Empty fields are kept: `a,,c,` → 4 fields. An empty line → `[""]`.',
      "- An unclosed quote throws `Error('Unterminated quote')`.",
      '',
      "- `parseCSVLine('1,\"Doe, John\",x')` → `['1', 'Doe, John', 'x']`",
    ),
    starterCode: js`
      function parseCSVLine(line, delimiter = ',') {
        // TODO: character-by-character state machine
      }
    `,
    solution: js`
      function parseCSVLine(line, delimiter = ',') {
        const fields = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"') {
              if (line[i + 1] === '"') {
                field += '"';
                i++;
              } else {
                inQuotes = false;
              }
            } else {
              field += ch;
            }
          } else if (ch === '"') {
            inQuotes = true;
          } else if (ch === delimiter) {
            fields.push(field);
            field = '';
          } else {
            field += ch;
          }
        }
        if (inQuotes) throw new Error('Unterminated quote');
        fields.push(field);
        return fields;
      }
    `,
    tests: [
      t("parseCSVLine('a,b,c')", ['a', 'b', 'c']),
      t("parseCSVLine('1,\"Doe, John\",x')", ['1', 'Doe, John', 'x']),
      t("parseCSVLine('\"say \"\"hi\"\"\",2')", ['say "hi"', '2']),
      t("parseCSVLine('a,,c,')", ['a', '', 'c', '']),
      t("parseCSVLine('')", ['']),
      t("parseCSVLine('x;\"y;z\"', ';')", ['x', 'y;z']),
      t("(() => { try { parseCSVLine('a,\"oops'); return 'no error'; } catch (e) { return e.message; } })()", 'Unterminated quote'),
    ],
    hints: ['Track a single `inQuotes` boolean.', 'When you see `"` inside quotes, peek at the next character to tell `""` from the closing quote.'],
    explanation: md(
      'A two-state machine. Outside quotes: a quote opens a quoted section, the delimiter ends a field, anything else is appended. Inside quotes: `""` appends one quote, a lone quote closes, everything else (including delimiters) is literal. Push the final field after the loop; if still inside quotes the input is malformed.',
      '',
      '`line.split(",")` breaks on the first quoted comma — the bug this question is designed to catch. For whole files (quoted newlines!) use a streaming parser such as `csv-parse`.',
      '',
      'Complexity: O(n) time, O(n) space.',
    ),
    relatedLessonIds: ['m06-transform-streams', 'm08-file-uploads'],
  },
  {
    id: 'ch-047',
    title: 'Base62 IDs for a URL shortener',
    difficulty: 'intermediate',
    topic: 'Encoding',
    category: 'express-backend',
    prompt: md(
      'A URL shortener turns an auto-increment database id into a short code. Write `encodeBase62(n)` and `decodeBase62(str)` using the alphabet `0-9`, then `a-z`, then `A-Z` (so `10 → "a"`, `36 → "A"`, `61 → "Z"`, `62 → "10"`).',
      '',
      "- `encodeBase62(0)` → `'0'`.",
      "- `encodeBase62` accepts only non-negative safe integers; otherwise throw `RangeError('Expected a non-negative safe integer')`.",
      "- `decodeBase62` throws `Error('Invalid base62 character: <ch>')` for any other character.",
      '- Must round-trip up to `Number.MAX_SAFE_INTEGER`.',
    ),
    starterCode: js`
      const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

      function encodeBase62(n) {
        // TODO
      }

      function decodeBase62(str) {
        // TODO
      }
    `,
    solution: js`
      const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

      function encodeBase62(n) {
        if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Expected a non-negative safe integer');
        if (n === 0) return ALPHABET[0];
        let out = '';
        while (n > 0) {
          out = ALPHABET[n % 62] + out;
          n = Math.floor(n / 62);
        }
        return out;
      }

      function decodeBase62(str) {
        let n = 0;
        for (const ch of str) {
          const digit = ALPHABET.indexOf(ch);
          if (digit === -1) throw new Error('Invalid base62 character: ' + ch);
          n = n * 62 + digit;
        }
        return n;
      }
    `,
    tests: [
      t('[encodeBase62(0), encodeBase62(10), encodeBase62(36), encodeBase62(61), encodeBase62(62), encodeBase62(125)]', ['0', 'a', 'A', 'Z', '10', '21']),
      t("decodeBase62('10')", 62),
      t("decodeBase62('zZ')", 35 * 62 + 61),
      t('decodeBase62(encodeBase62(Number.MAX_SAFE_INTEGER)) === Number.MAX_SAFE_INTEGER', true),
      t('Array.from({ length: 1000 }, (_, i) => i * 7919).every((n) => decodeBase62(encodeBase62(n)) === n)', true),
      t("[() => encodeBase62(-1), () => encodeBase62(1.5), () => decodeBase62('ab!')].map((f) => { try { f(); return 'ok'; } catch (e) { return e.message; } })",
        ['Expected a non-negative safe integer', 'Expected a non-negative safe integer', 'Invalid base62 character: !']),
    ],
    hints: ['Repeatedly take `n % 62` for the next digit (least significant first) and divide.', 'Decoding is Horner\'s method: `n = n * 62 + digit`.'],
    explanation: md(
      'Standard base conversion: emit `n % 62` and divide until zero, building the string from the right. Decoding accumulates `n * 62 + digit` left to right. Every intermediate value stays below the final result, so safe integers round-trip exactly (use `BigInt` beyond 2^53).',
      '',
      'Design notes: sequential ids leak volume and are guessable — shorteners often add a random component, shuffle the alphabet, or use a Feistel/Hashids-style permutation. A 7-character base62 code covers 62^7 ≈ 3.5 trillion ids.',
      '',
      'Complexity: O(log₆₂ n) both ways.',
    ),
    relatedLessonIds: ['m07-rest-api-design', 'm09-indexes'],
  },
  {
    id: 'ch-048',
    title: 'Safe JSON stringify with cycles',
    difficulty: 'intermediate',
    topic: 'Serialisation',
    category: 'express-backend',
    prompt: md(
      'Logging an object with a circular reference (e.g. `req` → `socket` → `req`) makes `JSON.stringify` throw. Write `safeStringify(value, space)`:',
      '',
      "- A reference back to an **ancestor** on the current path becomes the string `'[Circular]'`.",
      '- The same object appearing twice **side by side** (shared, not circular) is serialised normally both times.',
      '- `BigInt` values are written as strings (`10n` → `"10"`).',
      '- Otherwise behave like `JSON.stringify` (including `toJSON`, e.g. Dates).',
    ),
    starterCode: js`
      function safeStringify(value, space) {
        // TODO: JSON.stringify with a replacer
      }
    `,
    solution: js`
      function safeStringify(value, space) {
        const ancestors = [];
        return JSON.stringify(
          value,
          function (key, val) {
            if (typeof val === 'bigint') return val.toString();
            if (typeof val !== 'object' || val === null) return val;
            // "this" is the object holding "key"; drop ancestors we have left
            while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
            if (ancestors.includes(val)) return '[Circular]';
            ancestors.push(val);
            return val;
          },
          space,
        );
      }
    `,
    tests: [
      t("(() => { const o = { name: 'a' }; o.self = o; return safeStringify(o); })()", '{"name":"a","self":"[Circular]"}'),
      t('(() => { const s = { v: 1 }; return safeStringify({ a: s, b: s }); })()', '{"a":{"v":1},"b":{"v":1}}'),
      t('safeStringify({ id: 10n })', '{"id":"10"}'),
      t('(() => { const a = [1]; a.push(a); return safeStringify(a); })()', '[1,"[Circular]"]'),
      t('safeStringify({ x: [1, { y: null }] })', '{"x":[1,{"y":null}]}'),
      t('safeStringify({ d: new Date(0) })', '{"d":"1970-01-01T00:00:00.000Z"}'),
      t('(() => { const o = {}; o.a = { b: { c: o } }; return safeStringify(o); })()', '{"a":{"b":{"c":"[Circular]"}}}'),
    ],
    hints: [
      'Inside a `function` replacer, `this` is the object that contains the current key.',
      'A `WeakSet` of "seen" objects is simpler but wrongly marks shared (non-circular) references — track the ancestor path instead.',
    ],
    explanation: md(
      'The replacer is called depth-first, and `this` is the parent of the current key. Keeping a stack of ancestors and popping until the top is `this` reconstructs the current path; a value already on that path is a true cycle.',
      '',
      'The simpler "seen set" version is a common answer but over-reports: `{ a: s, b: s }` would print `b: "[Circular]"`. Libraries: `safe-stable-stringify` (used by pino), `fast-safe-stringify`. Node\'s `util.inspect` prints `<ref *1>` / `[Circular *1]`.',
      '',
      'Complexity: O(n · d) where d is the depth (the `includes` scan).',
    ),
    relatedLessonIds: ['m13-logging', 'm01-objects-and-prototypes'],
  },
  {
    id: 'ch-049',
    title: 'Koa-style middleware compose',
    difficulty: 'advanced',
    topic: 'Middleware',
    category: 'express-backend',
    prompt: md(
      'Write `composeMiddleware(middleware)` that turns an array of `async (ctx, next) => {}` functions into one function `run(ctx, finalNext?)` returning a promise — the "onion" model used by Koa.',
      '',
      '- `next()` invokes the next middleware and returns a promise that resolves when **it and everything after it** finish.',
      '- Code after `await next()` runs on the way back out.',
      '- A middleware that does not call `next` short-circuits the rest.',
      '- Errors (sync throws or rejections) propagate to upstream `try/catch` around `await next()`.',
      "- Calling `next()` twice in one middleware rejects with `Error('next() called multiple times')`.",
      '- After the last middleware, `next()` calls `finalNext` if given.',
    ),
    starterCode: js`
      function composeMiddleware(middleware) {
        return function run(ctx, finalNext) {
          // TODO: dispatch(i) calls middleware[i](ctx, () => dispatch(i + 1))
        };
      }
    `,
    solution: js`
      function composeMiddleware(middleware) {
        return function run(ctx, finalNext) {
          let lastIndex = -1;
          function dispatch(i) {
            if (i <= lastIndex) return Promise.reject(new Error('next() called multiple times'));
            lastIndex = i;
            const fn = i === middleware.length ? finalNext : middleware[i];
            if (!fn) return Promise.resolve();
            try {
              return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
            } catch (err) {
              return Promise.reject(err);
            }
          }
          return dispatch(0);
        };
      }
    `,
    tests: [
      t("(async () => { const log = []; const run = composeMiddleware([async (ctx, next) => { log.push('a1'); await next(); log.push('a2'); }, async (ctx, next) => { log.push('b1'); await next(); log.push('b2'); }, async (ctx) => { log.push('c'); ctx.body = 'done'; }]); const ctx = {}; await run(ctx); return [log, ctx.body]; })()", [['a1', 'b1', 'c', 'b2', 'a2'], 'done']),
      t("composeMiddleware([])({}).then(() => 'ok')", 'ok'),
      t("(async () => { const run = composeMiddleware([async (ctx, next) => { try { await next(); } catch (e) { ctx.status = 500; ctx.error = e.message; } }, (ctx) => { throw new Error('boom'); }]); const ctx = {}; await run(ctx); return [ctx.status, ctx.error]; })()", [500, 'boom']),
      t('(async () => { const run = composeMiddleware([async (ctx, next) => { await next(); await next(); }]); return run({}).catch((e) => e.message); })()', 'next() called multiple times'),
      t("(async () => { const log = []; const run = composeMiddleware([async (ctx, next) => { log.push('auth'); ctx.status = 401; }, async (ctx, next) => { log.push('handler'); await next(); }]); const ctx = {}; await run(ctx); return [log, ctx.status]; })()", [['auth'], 401]),
      t('(async () => { const run = composeMiddleware([(ctx, next) => { ctx.n = 1; return next(); }, (ctx) => { ctx.n++; }]); const ctx = {}; await run(ctx); return ctx.n; })()', 2),
      t("(async () => { const ctx = { log: [] }; await composeMiddleware([async (c, n) => { c.log.push('mw'); await n(); }])(ctx, async () => { ctx.log.push('final'); }); return ctx.log; })()", ['mw', 'final']),
    ],
    hints: [
      'Write a recursive `dispatch(i)` that calls `middleware[i](ctx, () => dispatch(i + 1))`.',
      'Wrap the call in `try/catch` and `Promise.resolve` so sync middleware and sync throws behave like async ones.',
      'Track the highest index dispatched so far to detect double `next()`.',
    ],
    explanation: md(
      '`dispatch(i)` runs middleware *i* and hands it a `next` that dispatches *i + 1*. Because each `next()` returns the promise of the rest of the chain, `await next()` naturally creates the onion: code after it runs once everything downstream completes, and downstream errors surface at that `await`. `lastIndex` guards against calling `next` twice, which would run downstream middleware twice.',
      '',
      'This is essentially `koa-compose`. Express differs: `next()` returns nothing, error handlers are 4-argument middleware, and Express 4 does not catch rejected promises (Express 5 does).',
      '',
      'Complexity: O(n) calls; stack depth grows with the number of middleware.',
    ),
    relatedLessonIds: ['m08-middleware', 'm08-custom-middleware', 'm08-express-architecture'],
  },
  {
    id: 'ch-050',
    title: 'Express-style middleware runner with error handlers',
    difficulty: 'advanced',
    topic: 'Middleware and error handling',
    category: 'express-backend',
    prompt: md(
      'Write `createApp()` returning `{ use(path?, fn), handle(req) }` that mimics Express middleware semantics. `req` is `{ path }`. `handle` returns a promise resolving with `res` once a response is sent.',
      '',
      "- `res` starts as `{ statusCode: 200, body: undefined }` with `status(code)` (chainable) and `send(body)`.",
      "- `use(fn)` mounts on `'/'`. `use('/api', fn)` matches `/api` and `/api/...` but **not** `/apix`.",
      '- Regular middleware: `(req, res, next)`. **Error middleware has exactly 4 parameters** `(err, req, res, next)`.',
      '- `next()` → next matching regular middleware. `next(err)`, a sync throw, or a rejected promise from an async middleware → skip to the next matching error middleware.',
      "- If the chain ends without a response: `404` / `'Not Found'`, or `500` / `'Internal Server Error'` if an error is pending.",
    ),
    starterCode: js`
      function createApp() {
        const stack = [];
        return {
          use(path, fn) {
            // TODO
          },
          handle(req) {
            // TODO: return a Promise that resolves with res
          },
        };
      }
    `,
    solution: js`
      function createApp() {
        const stack = [];
        return {
          use(path, fn) {
            if (typeof path === 'function') {
              fn = path;
              path = '/';
            }
            stack.push({ path, fn });
            return this;
          },

          handle(req) {
            return new Promise((resolve) => {
              const res = {
                statusCode: 200,
                body: undefined,
                finished: false,
                status(code) {
                  this.statusCode = code;
                  return this;
                },
                send(body) {
                  if (this.finished) return this;
                  this.body = body;
                  this.finished = true;
                  resolve(this);
                  return this;
                },
              };

              const matches = (prefix) =>
                prefix === '/' || req.path === prefix || req.path.startsWith(prefix + '/');

              let index = 0;
              function next(err) {
                if (res.finished) return;
                const layer = stack[index++];
                if (!layer) {
                  if (err) res.status(500).send('Internal Server Error');
                  else res.status(404).send('Not Found');
                  return;
                }
                const isErrorHandler = layer.fn.length === 4;
                if (!matches(layer.path) || (err ? !isErrorHandler : isErrorHandler)) {
                  next(err);
                  return;
                }
                try {
                  const result = err ? layer.fn(err, req, res, next) : layer.fn(req, res, next);
                  if (result && typeof result.then === 'function') {
                    result.then(undefined, (e) => next(e || new Error('Rejected')));
                  }
                } catch (e) {
                  next(e);
                }
              }

              next();
            });
          },
        };
      }
    `,
    tests: [
      t("(async () => { const app = createApp(); const log = []; app.use((req, res, next) => { log.push('logger'); next(); }); app.use('/api', (req, res, next) => { log.push('api'); res.status(201).send({ ok: true }); }); const res = await app.handle({ path: '/api/users' }); return [log, res.statusCode, res.body]; })()", [['logger', 'api'], 201, { ok: true }]),
      t("(async () => { const app = createApp(); app.use('/api', (req, res) => res.send('api')); const a = await app.handle({ path: '/other' }); const b = await app.handle({ path: '/apix' }); return [a.statusCode, a.body, b.statusCode]; })()", [404, 'Not Found', 404]),
      t("(async () => { const app = createApp(); const log = []; app.use((req, res, next) => { throw new Error('boom'); }); app.use((req, res, next) => { log.push('skipped'); next(); }); app.use((err, req, res, next) => { log.push('handler:' + err.message); res.status(400).send(err.message); }); const res = await app.handle({ path: '/' }); return [log, res.statusCode, res.body]; })()", [['handler:boom'], 400, 'boom']),
      t("(async () => { const app = createApp(); app.use((req, res, next) => next(new Error('db down'))); const res = await app.handle({ path: '/x' }); return [res.statusCode, res.body]; })()", [500, 'Internal Server Error']),
      t("(async () => { const app = createApp(); app.use(async (req, res, next) => { await null; throw new Error('async fail'); }); app.use((err, req, res, next) => res.status(502).send(err.message)); const res = await app.handle({ path: '/' }); return [res.statusCode, res.body]; })()", [502, 'async fail']),
      t("(async () => { const app = createApp(); const log = []; app.use((err, req, res, next) => { log.push('should not run'); next(); }); app.use((req, res) => res.send('ok')); const res = await app.handle({ path: '/' }); return [log, res.body]; })()", [[], 'ok']),
      t("(async () => { const app = createApp(); app.use((req, res, next) => next(new Error('first'))); app.use((err, req, res, next) => next(new Error('wrapped: ' + err.message))); app.use((err, req, res, next) => res.status(500).send(err.message)); const res = await app.handle({ path: '/' }); return res.body; })()", 'wrapped: first'),
    ],
    hints: [
      'Use `fn.length === 4` to recognise error handlers — exactly what Express does.',
      'A single `next(err)` function can walk the stack, skipping layers that do not match the path or the current mode (normal vs error).',
      'If a middleware returns a promise, attach `.then(undefined, next)` to forward rejections.',
    ],
    explanation: md(
      'The app is a flat stack of `{ path, fn }` layers and one cursor. `next(err)` advances the cursor and skips layers whose path does not match or whose kind (2/3-arg vs 4-arg) does not match the current state — normal flow skips error handlers, error flow skips regular middleware. Sync throws are caught around the call; returned promises get a rejection handler (Express 5 behaviour; in Express 4 you need `express-async-errors` or a wrapper).',
      '',
      'Takeaways interviewers look for: why error middleware must declare four parameters, why the error handler goes last, and why unhandled async errors in Express 4 hang requests.',
      '',
      'Complexity: O(layers) per request.',
    ),
    relatedLessonIds: ['m08-middleware', 'm08-error-handling-middleware', 'm08-centralized-error-handling'],
  },
  {
    id: 'ch-051',
    title: 'Token bucket rate limiter',
    difficulty: 'advanced',
    topic: 'Rate limiting',
    category: 'express-backend',
    prompt: md(
      'Implement `class TokenBucket` with `new TokenBucket({ capacity, refillPerSecond, now = () => Date.now() })` and a per-client wrapper `createRateLimiter(options)`.',
      '',
      '- The bucket starts **full**. Tokens refill continuously at `refillPerSecond` (fractions allowed), never above `capacity`.',
      '- `tryRemove(cost = 1)` → `true` and consumes tokens if enough are available; otherwise `false` and consumes **nothing**.',
      '- `tokens` getter returns the current (refilled) token count.',
      '- `now` is injectable so tests can control time.',
      '- `createRateLimiter(options)` returns `(key) => boolean` with an independent bucket per key (e.g. per IP or API key).',
    ),
    starterCode: js`
      class TokenBucket {
        constructor({ capacity, refillPerSecond, now = () => Date.now() }) {
          // TODO
        }
        get tokens() {
          // TODO
        }
        tryRemove(cost = 1) {
          // TODO
        }
      }

      function createRateLimiter(options) {
        // TODO: one bucket per key
      }
    `,
    solution: js`
      class TokenBucket {
        constructor({ capacity, refillPerSecond, now = () => Date.now() }) {
          this.capacity = capacity;
          this.refillPerSecond = refillPerSecond;
          this.now = now;
          this.available = capacity;
          this.lastRefill = now();
        }

        refill() {
          const current = this.now();
          const elapsedMs = Math.max(0, current - this.lastRefill);
          this.available = Math.min(this.capacity, this.available + (elapsedMs / 1000) * this.refillPerSecond);
          this.lastRefill = current;
        }

        get tokens() {
          this.refill();
          return this.available;
        }

        tryRemove(cost = 1) {
          this.refill();
          if (this.available < cost) return false;
          this.available -= cost;
          return true;
        }
      }

      function createRateLimiter(options) {
        const buckets = new Map();
        return (key) => {
          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = new TokenBucket(options);
            buckets.set(key, bucket);
          }
          return bucket.tryRemove();
        };
      }
    `,
    tests: [
      t('(() => { let t = 0; const b = new TokenBucket({ capacity: 3, refillPerSecond: 1, now: () => t }); return [b.tryRemove(), b.tryRemove(), b.tryRemove(), b.tryRemove()]; })()', [true, true, true, false]),
      t('(() => { let t = 0; const b = new TokenBucket({ capacity: 2, refillPerSecond: 1, now: () => t }); b.tryRemove(); b.tryRemove(); t = 500; const half = b.tryRemove(); t = 1000; const one = b.tryRemove(); const again = b.tryRemove(); return [half, one, again]; })()', [false, true, false]),
      t('(() => { let t = 0; const b = new TokenBucket({ capacity: 3, refillPerSecond: 10, now: () => t }); b.tryRemove(3); t = 100000; return [b.tokens, b.tryRemove(), b.tryRemove(), b.tryRemove(), b.tryRemove()]; })()', [3, true, true, true, false]),
      t('(() => { let t = 0; const b = new TokenBucket({ capacity: 3, refillPerSecond: 1, now: () => t }); return [b.tryRemove(2), b.tryRemove(2), b.tokens]; })()', [true, false, 1]),
      t('(() => { let t = 0; const b = new TokenBucket({ capacity: 1, refillPerSecond: 2, now: () => t }); b.tryRemove(); t = 250; const early = b.tryRemove(); t = 500; return [early, b.tryRemove()]; })()', [false, true]),
      t("(() => { let t = 0; const limit = createRateLimiter({ capacity: 1, refillPerSecond: 1, now: () => t }); return [limit('ip1'), limit('ip1'), limit('ip2'), limit('ip2')]; })()", [true, false, true, false]),
    ],
    hints: [
      'Do not use a timer to add tokens — compute the refill lazily from elapsed time on each call.',
      'Refill first, then check, then subtract.',
    ],
    explanation: md(
      'Lazy refill: store the token count and the time of the last refill; on every call add `elapsed * rate` (capped at capacity). No background timers, O(1) memory per client, and it allows short bursts up to `capacity` while enforcing the long-run average rate.',
      '',
      'Injecting `now` makes the class deterministic to test. In a cluster or behind a load balancer the per-process `Map` is not enough — store bucket state in Redis (often a Lua script for atomic refill+take) and respond with `429 Too Many Requests` plus `Retry-After`.',
      '',
      'Complexity: O(1) per request; O(clients) memory (evict idle buckets in production).',
    ),
    relatedLessonIds: ['m07-rate-limiting', 'm12-rate-limiting', 'm11-redis'],
  },
  {
    id: 'ch-052',
    title: 'Retry-able fetch wrapper',
    difficulty: 'advanced',
    topic: 'HTTP clients and resilience',
    category: 'express-backend',
    prompt: md(
      'Write `fetchWithRetry(fetchFn, url, init = {}, { retries = 2, baseDelay = 50 } = {})`. `fetchFn(url, init)` is injected (same shape as `fetch`) and resolves to `{ status, headers }`.',
      '',
      '- Retry on **network errors** (rejections), `429`, and `5xx`. Never retry other statuses (e.g. `404`, `400`) — return them immediately.',
      '- Delay before retry *n* (1-based): `baseDelay * 2^(n-1)`. If the response has a numeric `headers["retry-after"]` (seconds), wait that long instead.',
      '- After the last attempt: return the last **response** if there was one, otherwise rethrow the last **error**.',
      '- Pass `url` and `init` through unchanged on every attempt.',
    ),
    starterCode: js`
      async function fetchWithRetry(fetchFn, url, init = {}, { retries = 2, baseDelay = 50 } = {}) {
        // TODO
      }
    `,
    solution: js`
      async function fetchWithRetry(fetchFn, url, init = {}, { retries = 2, baseDelay = 50 } = {}) {
        const isRetryableStatus = (status) => status === 429 || status >= 500;

        for (let attempt = 0; ; attempt++) {
          let response;
          let error;
          let failed = false;
          try {
            response = await fetchFn(url, init);
          } catch (err) {
            failed = true;
            error = err;
          }

          if (!failed && !isRetryableStatus(response.status)) return response;
          if (attempt >= retries) {
            if (failed) throw error;
            return response;
          }

          let delay = baseDelay * 2 ** attempt;
          const retryAfter = response && response.headers ? response.headers['retry-after'] : undefined;
          if (retryAfter !== undefined && retryAfter !== '' && !Number.isNaN(Number(retryAfter))) {
            delay = Number(retryAfter) * 1000;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    `,
    tests: [
      t("(async () => { const statuses = [503, 502, 200]; const calls = []; const fetchFn = async (url) => { calls.push(url); return { status: statuses.shift(), headers: {} }; }; const res = await fetchWithRetry(fetchFn, '/api', {}, { retries: 3, baseDelay: 5 }); return [res.status, calls.length]; })()", [200, 3]),
      t("(async () => { let n = 0; const res = await fetchWithRetry(async () => { n++; return { status: 404, headers: {} }; }, '/missing', {}, { retries: 3, baseDelay: 1 }); return [res.status, n]; })()", [404, 1]),
      t("(async () => { let n = 0; try { await fetchWithRetry(async () => { n++; throw new Error('ECONNRESET ' + n); }, '/x', {}, { retries: 2, baseDelay: 1 }); return 'resolved'; } catch (e) { return [e.message, n]; } })()", ['ECONNRESET 3', 3]),
      t("(async () => { let n = 0; const res = await fetchWithRetry(async () => { n++; return { status: 500, headers: {} }; }, '/x', {}, { retries: 2, baseDelay: 1 }); return [res.status, n]; })()", [500, 3]),
      t("(async () => { const queue = [{ status: 429, headers: { 'retry-after': '0.03' } }, { status: 200, headers: {} }]; const start = Date.now(); const res = await fetchWithRetry(async () => queue.shift(), '/x', {}, { retries: 1, baseDelay: 1 }); return [res.status, Date.now() - start >= 25]; })()", [200, true]),
      t("(async () => { const seen = []; let n = 0; const res = await fetchWithRetry(async (url, init) => { seen.push([url, init.method]); if (n++ === 0) throw new Error('reset'); return { status: 201, headers: {} }; }, '/orders', { method: 'POST' }, { baseDelay: 1 }); return [res.status, seen]; })()", [201, [['/orders', 'POST'], ['/orders', 'POST']]]),
    ],
    hints: [
      'Treat "threw" and "retryable status" the same way, but remember which one happened.',
      'Check whether attempts are exhausted **before** sleeping.',
    ],
    explanation: md(
      'Each loop iteration records either a response or an error. Non-retryable responses return at once. When retries run out the function surfaces the most useful thing it has: the last response (so callers can read a 503 body) or the last error. Delays grow exponentially, overridden by the server\'s `Retry-After`.',
      '',
      'Injecting `fetchFn` keeps the logic testable without a network. Real-world additions: jitter, a per-attempt timeout via `AbortSignal.timeout`, and only retrying idempotent methods (or POSTs with an idempotency key) — the last test retries a POST, which in production needs that key.',
      '',
      'Complexity: at most `retries + 1` requests.',
    ),
    relatedLessonIds: ['m07-http-status-codes', 'm07-rate-limiting', 'm05-error-handling-in-asynchronous-code'],
  },
];

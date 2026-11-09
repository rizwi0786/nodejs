import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'authentication-middleware': {
    summary: 'Authentication middleware extracts the credential (Bearer header or cookie), verifies it, attaches the identity to `req.user`, and responds 401 on failure — so routes can simply require it.',
    topics: ['requireAuth', 'optionalAuth', 'Bearer extraction', 'req.user', 'res.locals', 'TokenExpiredError', 'TypeScript Request augmentation', 'passport'],
    sections: [
      section('introduction', undefined,
        text('Every protected route needs the same three steps: find the token, verify it, know the user. Middleware does it once, consistently.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`requireAuth` — 401 if no valid credential; otherwise sets `req.user` and calls `next()`.',
          '`optionalAuth` — sets `req.user` when a valid credential exists, otherwise continues anonymously.',
          'Identity is plain data: `{ id, role, scopes }` — downstream code never re-parses tokens.',
          'Libraries: `passport` (strategies), `express-jwt`, `express-oauth2-jwt-bearer` (all third-party). A hand-written version is ~20 lines.',
        ),
      ),
      section('why', 'Why middleware',
        bullets(
          'One implementation → one place to fix bugs (e.g. adding `aud` checks).',
          'Declarative routes: `router.get("/me", requireAuth, ctrl.me)`.',
          'Consistent 401 responses that clients can rely on for refresh logic.',
        ),
      ),
      section('internals', 'Steps inside requireAuth',
        steps(
          'Read `Authorization` header; must match `Bearer <token>` (case-insensitive scheme). Fallback: cookie.',
          'Verify with pinned algorithms, issuer, audience.',
          'Map claims to a minimal user object; optionally check a "tokens valid after" timestamp or denylist.',
          'Set `req.user`; call `next()`.',
          'On any failure respond 401 with `WWW-Authenticate: Bearer` (and a specific error code for expiry).',
        ),
      ),
      section('example', 'requireAuth with jsonwebtoken',
        code({
          title: 'middleware/auth.js',
          code: dedent(`
            const jwt = require('jsonwebtoken');

            const VERIFY_OPTS = { algorithms: ['HS256'], issuer: 'auth.example.com', audience: 'api', clockTolerance: 5 };

            function extractToken(req) {
              const header = req.get('authorization') ?? '';
              const [scheme, token] = header.split(' ');
              if (scheme?.toLowerCase() === 'bearer' && token) return token;
              return req.cookies?.access_token ?? null;
            }

            function unauthorized(res, code, description) {
              res.set('WWW-Authenticate', 'Bearer error="invalid_token", error_description="' + description + '"');
              return res.status(401).json({ error: { code, message: description } });
            }

            function requireAuth(req, res, next) {
              const token = extractToken(req);
              if (!token) {
                res.set('WWW-Authenticate', 'Bearer');
                return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing token' } });
              }
              try {
                const claims = jwt.verify(token, process.env.JWT_SECRET, VERIFY_OPTS);
                req.user = { id: claims.sub, role: claims.role, scopes: (claims.scope ?? '').split(' ').filter(Boolean) };
                next();
              } catch (err) {
                if (err.name === 'TokenExpiredError') return unauthorized(res, 'TOKEN_EXPIRED', 'The access token expired');
                return unauthorized(res, 'INVALID_TOKEN', 'The access token is invalid');
              }
            }

            function optionalAuth(req, res, next) {
              const token = extractToken(req);
              if (!token) return next();
              try {
                const c = jwt.verify(token, process.env.JWT_SECRET, VERIFY_OPTS);
                req.user = { id: c.sub, role: c.role, scopes: (c.scope ?? '').split(' ').filter(Boolean) };
              } catch { /* treat as anonymous */ }
              next();
            }

            module.exports = { requireAuth, optionalAuth };
          `),
          explanation: [
            '`next()` is called inside `try` only after success; errors produce a response and stop.',
            'Expired vs invalid are distinguished so clients know when to refresh.',
            'The user object is minimal and plain.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /api/me HTTP/1.1\n\nGET /api/me HTTP/1.1\nAuthorization: Bearer not.a.jwt\n\nGET /api/me HTTP/1.1\nAuthorization: Bearer <valid token for sub 42>',
          expectedOutput: 'HTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer\n{"error":{"code":"UNAUTHENTICATED","message":"Missing token"}}\n\nHTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer error="invalid_token", error_description="The access token is invalid"\n{"error":{"code":"INVALID_TOKEN","message":"The access token is invalid"}}\n\nHTTP/1.1 200 OK\n{"id":"42","role":"user","scopes":["orders:read"]}',
        }),
        code({
          title: 'TypeScript: typing req.user',
          language: 'typescript',
          code: dedent(`
            // src/types/express.d.ts
            import 'express';
            declare global {
              namespace Express {
                interface Request {
                  user?: { id: string; role: 'user' | 'admin'; scopes: string[] };
                }
              }
            }
          `),
          explanation: ['Declaration merging adds `req.user` to Express\'s `Request` type across the project.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Identity provider tokens: verify RS256 with a cached JWKS (e.g. `jose`\'s `createRemoteJWKSet`).',
          'API gateways may verify upstream, but services should still validate (zero trust).',
          'Log the user id (not the token) with each request for auditing.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: calling next on failure',
          code: dedent(`
            // ✗ logs the error and continues → route runs without req.user
            try { req.user = jwt.verify(token, key); } catch (e) { console.error(e); }
            next();

            // ✓ stop on failure
            try { req.user = jwt.verify(token, key, VERIFY_OPTS); } catch { return res.sendStatus(401); }
            next();
          `),
        }),
        bullets(
          'Using `jwt.decode` instead of `verify`.',
          'Attaching the entire decoded token (including `iat`, `aud`) and relying on random claims later.',
          'Doing a DB lookup for the user on every request without caching when the token already carries what you need — or the opposite: never checking if the user was disabled.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Write `requireAuth` from memory: extract, verify with options, attach `req.user`, 401 with `WWW-Authenticate`, distinguish expired. Mention `optionalAuth` and TypeScript augmentation if time allows.'),
      ),
      section('practice', 'Practice',
        text('Extend `requireAuth` to reject tokens issued before `user.tokensValidAfter` (stored in Redis, cached for 30 s). This gives you "log out everywhere" for JWTs.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Extract → verify → attach `req.user` → next; else 401.',
          'Pin algorithms and check iss/aud/exp.',
          'Separate expired from invalid.',
          '`optionalAuth` for public routes that personalise.',
        ),
      ),
    ],
    revisionNotes: [
      '`Authorization: Bearer <token>`; scheme is case-insensitive.',
      'On failure: 401 + `WWW-Authenticate: Bearer error="invalid_token"`.',
      'Never call `next()` after a failed verification.',
      '`req.user` minimal: id, role, scopes. Type it via `declare global { namespace Express { interface Request {...} } }`.',
      'passport / express-jwt / express-oauth2-jwt-bearer are third-party options.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Protected routes are reachable with a garbage token. Why?',
        code: "function requireAuth(req, res, next) {\n  try {\n    req.user = jwt.verify(req.get('authorization')?.slice(7), SECRET, { algorithms: ['HS256'] });\n  } catch (err) {\n    console.warn('bad token', err.message);\n  }\n  next();\n}",
        options: [
          'slice(7) removes too many characters',
          '`next()` runs even when verification throws, so the route executes without a valid user',
          'HS256 is not allowed',
          'console.warn throws',
        ],
        answer: 1,
        explanation: 'Failure must end the request with 401. Here the catch only logs and execution falls through to `next()`.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What should requireAuth do after successfully verifying a token?',
        options: ['Send 200', 'Attach the identity to `req.user` and call `next()`', 'Redirect to /login', 'Store the token in a global variable'],
        answer: 1,
        explanation: 'It enriches the request and hands control to the route. Global variables are shared between concurrent requests.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Auth middleware',
        question: 'How do clients typically send a JWT to an Express API, and how does the server read it?',
        shortAnswer: 'In the `Authorization: Bearer <token>` header; middleware reads it with `req.get("authorization")`, checks the scheme, and verifies the token before setting `req.user`.',
        detailedAnswer: [
          'Header format comes from RFC 6750.',
          'Browser apps sometimes use an HttpOnly cookie instead (then CSRF must be considered).',
          'Never accept tokens from query strings for normal API calls.',
          'Return 401 with `WWW-Authenticate` when missing or invalid.',
        ],
        followUp: 'What changes if the token is in a cookie instead?',
        trap: 'Reading `req.headers.Authorization` with a capital A — Node lowercases header names.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Auth middleware',
        question: 'Write (or describe) an Express middleware that protects routes using JWTs. What details matter?',
        shortAnswer: 'Extract the Bearer token, `jwt.verify` it with pinned algorithms plus issuer/audience, map claims to `req.user`, call `next()`; on failure stop with 401 and distinguish expired from invalid tokens.',
        detailedAnswer: [
          'Use `verify`, never `decode`.',
          'Options: `algorithms`, `issuer`, `audience`, small `clockTolerance`.',
          'Do not call `next()` after failure.',
          'Optionally check revocation (denylist/tokensValidAfter) and user status.',
          'Keep it synchronous for HS256; for remote JWKS, cache keys.',
        ],
        followUp: 'How would you support both cookie and header tokens safely?',
        trap: 'Passing errors to `next(err)` without mapping them, resulting in 500s for bad tokens.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'role-based-access-control': {
    summary: 'RBAC grants permissions to roles (admin, editor, viewer) and roles to users; in Express it is typically a `requireRole(...)` middleware after authentication, plus ownership checks for per-resource rules.',
    topics: ['RBAC', 'roles', 'requireRole', 'role hierarchy', 'least privilege', 'ownership', 'admin routes'],
    sections: [
      section('introduction', undefined,
        text('Most apps have a few kinds of users with different powers. RBAC captures that with named roles instead of per-user rules.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**User → roles → permissions**. A user may have one or many roles.',
          'Checks are coarse: "is this user an admin?".',
          'Hierarchies are common: admin ⊇ editor ⊇ viewer.',
          'RBAC alone cannot express "only the author can edit this post" — that needs ownership (or ABAC).',
        ),
        table('Example role matrix', ['Action', 'viewer', 'editor', 'admin'], [
          ['Read posts', '✓', '✓', '✓'],
          ['Create/edit posts', '', '✓', '✓'],
          ['Delete any post', '', '', '✓'],
          ['Manage users', '', '', '✓'],
        ]),
      ),
      section('why', 'Why RBAC',
        bullets(
          'Simple to explain to product and auditors.',
          'Easy to assign: onboarding = give a role.',
          'Enforces least privilege when roles are narrow.',
        ),
      ),
      section('internals', 'Placement',
        flow(['requireAuth → req.user', 'requireRole("editor")', 'controller', 'service: ownership/tenant checks'], { direction: 'horizontal' }),
        note('Always run authentication first: role middleware only reads `req.user`.'),
      ),
      section('example', 'RBAC in pure JS and Express',
        code({
          title: 'Role hierarchy check (pure JS)',
          runnable: true,
          code: dedent(`
            const HIERARCHY = { viewer: 1, editor: 2, admin: 3 };

            function hasRole(user, minimum) {
              return (HIERARCHY[user.role] ?? 0) >= HIERARCHY[minimum];
            }

            const users = [{ name: 'Vi', role: 'viewer' }, { name: 'Ed', role: 'editor' }, { name: 'Al', role: 'admin' }, { name: 'X', role: 'hacker' }];
            for (const u of users) {
              console.log(u.name, 'edit:', hasRole(u, 'editor'), 'manage:', hasRole(u, 'admin'));
            }
          `),
          expectedOutput: 'Vi edit: false manage: false\nEd edit: true manage: false\nAl edit: true manage: true\nX edit: false manage: false',
          explanation: ['Unknown roles map to 0 — deny by default.'],
        }),
        code({
          title: 'middleware/requireRole.js',
          code: dedent(`
            const HIERARCHY = { viewer: 1, editor: 2, admin: 3 };

            function requireRole(minimum) {
              if (!(minimum in HIERARCHY)) throw new Error('Unknown role ' + minimum); // fail at startup
              return (req, res, next) => {
                if (!req.user) return res.sendStatus(401);
                if ((HIERARCHY[req.user.role] ?? 0) < HIERARCHY[minimum]) {
                  return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Requires role ' + minimum } });
                }
                next();
              };
            }

            // routes
            router.get('/posts', requireAuth, postsCtrl.list);
            router.post('/posts', requireAuth, requireRole('editor'), postsCtrl.create);
            router.delete('/posts/:id', requireAuth, requireRole('editor'), postsCtrl.remove); // service checks owner unless admin
            router.use('/admin', requireAuth, requireRole('admin'), adminRouter);
          `),
        }),
        code({
          title: 'Ownership in the service',
          code: dedent(`
            async function removePost(postId, actor) {
              const post = await postsRepo.findById(postId);
              if (!post) throw new NotFoundError('Post not found');
              const isOwner = post.authorId === actor.id;
              if (!isOwner && actor.role !== 'admin') throw new ForbiddenError('Only the author or an admin can delete');
              await postsRepo.remove(postId);
            }
          `),
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /posts HTTP/1.1\nAuthorization: Bearer <viewer>\n\nDELETE /posts/9 HTTP/1.1\nAuthorization: Bearer <editor, not author>\n\nDELETE /posts/9 HTTP/1.1\nAuthorization: Bearer <admin>',
          expectedOutput: 'HTTP/1.1 403 Forbidden\n{"error":{"code":"FORBIDDEN","message":"Requires role editor"}}\n\nHTTP/1.1 403 Forbidden\n{"error":{"code":"FORBIDDEN","message":"Only the author or an admin can delete"}}\n\nHTTP/1.1 204 No Content',
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Roles in the JWT are a snapshot — role removal takes effect at the next token. Keep tokens short or check roles from the DB for sensitive actions.',
          'Multi-tenant apps: roles are **per tenant** (`memberships: [{ orgId, role }]`), not global.',
          'Audit log every admin action.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: trusting the client\'s role',
          code: dedent(`
            // ✗ role comes from the request body/header
            if (req.body.role === 'admin') return deleteUser();

            // ✓ role comes from the verified identity
            if (req.user.role === 'admin') return deleteUser();
          `),
        }),
        bullets(
          'Role checks only in the UI.',
          'Role explosion: `editor-eu-readonly-v2` — a sign you need permissions (next lesson).',
          'Forgetting ownership — editors deleting each other\'s posts.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show a `requireRole` factory, explain deny-by-default, and immediately add that RBAC does not cover ownership — then show where that check lives.'),
      ),
      section('practice', 'Practice',
        text('Change the model to per-organization roles: `req.user.memberships` and `requireOrgRole("admin")` which reads `req.params.orgId` (use `mergeParams`).'),
      ),
      section('summary', 'Summary',
        bullets(
          'Users → roles → permissions.',
          '`requireRole` after `requireAuth`; deny unknown roles.',
          'Ownership/tenant rules live in services.',
          'Roles in tokens are snapshots.',
        ),
      ),
    ],
    revisionNotes: [
      'RBAC: permissions attached to roles; users get roles.',
      'Middleware order: requireAuth → requireRole → handler.',
      'Deny by default for unknown roles; validate role names at startup.',
      'RBAC ≠ ownership; check resource owner/tenant in the service.',
      'JWT role claims are stale until refresh.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'With `HIERARCHY = { viewer: 1, editor: 2, admin: 3 }` and `hasRole = (u, min) => (HIERARCHY[u.role] ?? 0) >= HIERARCHY[min]`, what is `hasRole({ role: "superuser" }, "viewer")`?',
        options: ['true', 'false', 'undefined', 'Throws TypeError'],
        answer: 1,
        explanation: 'Unknown role → 0, and 0 >= 1 is false. Deny by default.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Editors can delete posts. An editor deletes another editor\'s post. The requirement says only authors (or admins) may delete. Where is the fix?',
        options: [
          'Add a new role "author"',
          'Add an ownership check in the delete service: actor must be the author or an admin',
          'Remove delete permission from editors',
          'Hide the delete button in the UI',
        ],
        answer: 1,
        explanation: 'This is a per-resource rule; it needs the loaded post. Roles alone cannot express it.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'RBAC',
        question: 'How would you implement role-based access control in an Express API?',
        shortAnswer: 'Authenticate first to get `req.user.role(s)`, then use a `requireRole(...)` middleware factory on routes or routers that returns 403 when the role is insufficient — with deny-by-default and per-resource ownership checks in services.',
        detailedAnswer: [
          'Store roles in the DB; include them in tokens/sessions as a snapshot.',
          'Middleware factory validates role names at startup.',
          'Apply at router level for whole areas (`/admin`).',
          'Ownership and tenant scoping happen where the resource is loaded.',
          'Test each role against each endpoint (a matrix test).',
        ],
        followUp: 'How do you handle roles that differ per organization?',
        trap: 'Reading the role from the request body or an unverified header.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'permission-based-access': {
    summary: 'Permission-based access checks fine-grained actions (`posts:delete`, `invoices:read`) that roles map to, and extends to attribute/ownership rules — keeping authorization explicit, testable and free of role explosion.',
    topics: ['permissions', 'scopes', 'requirePermission', 'ABAC', 'policy functions', 'IDOR', 'BOLA', 'deny by default', 'CASL'],
    sections: [
      section('introduction', undefined,
        text('As products grow, "admin vs editor" stops being enough. Checking **what action** is allowed — not **who** someone is — keeps code stable when roles change.'),
      ),
      section('definition', 'Definitions',
        table('RBAC vs permissions vs ABAC', ['', 'RBAC', 'Permission-based', 'ABAC / policies'], [
          ['Check', '`role === "admin"`', '`can("posts:delete")`', '`can(user, "delete", post)` using attributes'],
          ['Granularity', 'Coarse', 'Per action', 'Per action + resource + context'],
          ['Change roles without code changes', 'No', 'Yes (edit role→permission map)', 'Yes'],
          ['Ownership/tenant rules', 'No', 'No', 'Yes'],
          ['Example libs', '—', '—', 'CASL, Casbin, OPA/Cedar (third-party)'],
        ]),
        bullets(
          'Permissions are strings `resource:action`. Roles are just named bundles of permissions.',
          'OAuth **scopes** (`orders:read`) are permissions granted to a client/token.',
        ),
      ),
      section('why', 'Why permissions',
        bullets(
          'Code checks `invoices:refund`, not "is finance or admin or support-lead" — adding a role needs no code change.',
          'Explicit, greppable list of what the system can do.',
          'Combined with ownership policies, prevents BOLA/IDOR (OWASP API Security #1).',
        ),
      ),
      section('internals', 'Evaluation order',
        steps(
          'Resolve the user\'s permission set (from roles, cached; or from token scopes).',
          'Route middleware: does the set contain the required permission? (403 if not)',
          'Policy check with the resource: owner? same tenant? state allows it (e.g. invoice not already paid)?',
          'Deny by default if any step is uncertain.',
        ),
      ),
      section('example', 'Permissions + policy',
        code({
          title: 'Permission resolution and policy (pure JS)',
          runnable: true,
          code: dedent(`
            const ROLE_PERMISSIONS = {
              viewer: ['posts:read'],
              author: ['posts:read', 'posts:create', 'posts:update:own', 'posts:delete:own'],
              moderator: ['posts:read', 'posts:update:any', 'posts:delete:any'],
            };

            const permissionsOf = (user) => new Set(user.roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []));

            function canModifyPost(user, action, post) {
              const perms = permissionsOf(user);
              if (perms.has('posts:' + action + ':any')) return true;
              return perms.has('posts:' + action + ':own') && post.authorId === user.id && post.tenantId === user.tenantId;
            }

            const post = { id: 9, authorId: 1, tenantId: 'acme' };
            const alice = { id: 1, tenantId: 'acme', roles: ['author'] };
            const bob = { id: 2, tenantId: 'acme', roles: ['author'] };
            const mod = { id: 3, tenantId: 'acme', roles: ['viewer', 'moderator'] };

            console.log('alice delete own:', canModifyPost(alice, 'delete', post));
            console.log('bob delete alice\\'s:', canModifyPost(bob, 'delete', post));
            console.log('moderator delete:', canModifyPost(mod, 'delete', post));
            console.log('perms of mod:', [...permissionsOf(mod)].join(','));
          `),
          expectedOutput: "alice delete own: true\nbob delete alice's: false\nmoderator delete: true\nperms of mod: posts:read,posts:update:any,posts:delete:any",
          explanation: [
            '`:own` vs `:any` permissions express ownership without new roles.',
            'Multiple roles union their permissions; the Set removes duplicates (`posts:read`).',
            'The tenant check prevents cross-tenant access even for owners of the same id space.',
          ],
        }),
        code({
          title: 'Express middleware',
          code: dedent(`
            const requirePermission = (...needed) => (req, res, next) => {
              const perms = req.user?.permissions ?? new Set();
              const ok = needed.every((p) => perms.has(p));
              if (!ok) return res.status(403).json({ error: { code: 'FORBIDDEN', missing: needed.filter((p) => !perms.has(p)) } });
              next();
            };

            router.get('/invoices', requireAuth, requirePermission('invoices:read'), ctrl.list);
            router.post('/invoices/:id/refund', requireAuth, requirePermission('invoices:refund'), ctrl.refund);
          `),
          explanation: ['Route-level permission gate; resource-level policy (owner/tenant/state) still runs in the service.'],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /invoices/77/refund HTTP/1.1\nAuthorization: Bearer <support agent without refund permission>',
          expectedOutput: 'HTTP/1.1 403 Forbidden\n{"error":{"code":"FORBIDDEN","missing":["invoices:refund"]}}',
          explanation: ['Revealing the missing permission is fine for internal tools; for public APIs you may prefer a generic message.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Load permissions once per request (cache role→permission maps in memory/Redis).',
          'Always scope queries by tenant: `WHERE tenant_id = $1 AND id = $2` — defence in depth against IDOR.',
          'Policy engines (OPA, Cedar, Casbin) centralise rules for many services.',
          'Write authorization tests for every endpoint × role, including "other tenant" cases.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: IDOR',
          code: dedent(`
            // ✗ permission check passes, but any invoice id works
            router.get('/invoices/:id', requireAuth, requirePermission('invoices:read'), async (req, res) => {
              res.json(await invoicesRepo.findById(req.params.id));
            });

            // ✓ scope to tenant (and owner if needed)
            router.get('/invoices/:id', requireAuth, requirePermission('invoices:read'), async (req, res) => {
              const inv = await invoicesRepo.findOne({ id: req.params.id, tenantId: req.user.tenantId });
              if (!inv) return res.sendStatus(404);
              res.json(inv);
            });
          `),
        }),
        bullets(
          'Allow-by-default when a permission name is mistyped (`invoice:read` vs `invoices:read`) — validate names at startup.',
          'Checking permissions in list endpoints but not in export/bulk endpoints.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Contrast RBAC, permissions and ABAC with one example each. Then name BOLA/IDOR and show the tenant-scoped query — that is what interviewers want to hear.'),
      ),
      section('practice', 'Practice',
        text('Add an `invoices:approve` permission that only works when `invoice.status === "pending"` and `invoice.amount <= user.approvalLimit`. Write tests for each denial reason.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Check actions (`resource:action`), not role names.',
          'Roles = bundles of permissions; scopes = permissions on tokens.',
          'Resource policies handle ownership, tenant and state.',
          'Deny by default; scope every query.',
        ),
      ),
    ],
    revisionNotes: [
      'Permission strings `resource:action[:own|:any]`; roles map to permission sets.',
      'Route middleware checks permission; service checks resource policy (owner/tenant/state).',
      'BOLA/IDOR = missing object-level checks — OWASP API Security Top 10 #1.',
      'Scope queries by tenant/owner; return 404 for foreign resources.',
      'ABAC/policy engines: CASL, Casbin, OPA, Cedar (third-party).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the main advantage of checking `can("invoices:refund")` instead of `role === "finance"` in code?',
        options: [
          'It is faster',
          'Which roles may refund can change by editing the role→permission mapping, without code changes',
          'It removes the need for authentication',
          'It encrypts the invoice',
        ],
        answer: 1,
        explanation: 'Code depends on the stable action, not on organisational role names that change.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A user with `invoices:read` from tenant A fetches `/invoices/123` belonging to tenant B and gets it. Which fix is most robust?',
        options: [
          'Add a new permission `invoices:read:tenant`',
          'Scope the repository query by `tenantId` from the verified identity and return 404 when not found',
          'Use UUIDs so ids are hard to guess',
          'Rate limit the endpoint',
        ],
        answer: 1,
        explanation: 'Unguessable ids reduce discovery but are not authorization. Tenant-scoped queries enforce the rule at data access.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Authorization models',
        question: 'Compare RBAC, permission-based access and ABAC. How do you prevent broken object-level authorization (IDOR) in an Express API?',
        shortAnswer: 'RBAC checks roles, permission-based checks named actions that roles grant, and ABAC evaluates policies over user, resource and context attributes; IDOR is prevented by object-level checks — loading resources scoped to the caller\'s tenant/ownership and denying by default.',
        detailedAnswer: [
          'RBAC: simple, coarse; risk of role explosion.',
          'Permissions: `resource:action` decouples code from role names.',
          'ABAC/policies: "owner can edit while status is draft" — needs the resource.',
          'IDOR fix: `WHERE id = $1 AND tenant_id = $2`, ownership checks in services, 404 for foreign ids.',
          'Automated tests across roles and tenants; never rely on unguessable ids.',
        ],
        followUp: 'Where would a policy engine like OPA fit in a microservices setup?',
        trap: 'Believing UUIDs make object-level authorization unnecessary.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Scopes',
        question: 'How do OAuth scopes relate to user permissions?',
        shortAnswer: 'Scopes limit what a specific token (client) may do on the user\'s behalf; the effective permission is the intersection of the token\'s scopes and the user\'s own permissions.',
        detailedAnswer: [
          'A user with admin rights can grant a third-party app only `orders:read`.',
          'The API checks both: scope present in the token and user allowed.',
          'Scopes are coarse strings in the `scope` claim (space-separated).',
          'Machine-to-machine tokens (client credentials) have scopes but no user.',
        ],
        followUp: 'How would your middleware check both scope and permission?',
        trap: 'Treating scopes as the user\'s roles.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'oauth-2-0-fundamentals': {
    summary: 'OAuth 2.0 is a delegated authorization framework: a client gets an access token from an authorization server to call a resource server on the resource owner\'s behalf — today via the authorization code flow with PKCE for user apps and client credentials for machine-to-machine.',
    topics: ['OAuth 2.0', 'resource owner', 'client', 'authorization server', 'resource server', 'authorization code', 'PKCE', 'state', 'scopes', 'client credentials', 'implicit flow deprecated', 'RFC 9700', 'OAuth 2.1'],
    sections: [
      section('introduction', undefined,
        text('"Let this app read my Google Calendar" without giving it your Google password — that is the problem OAuth solves.'),
      ),
      section('definition', 'Roles and terms',
        table('The four roles', ['Role', 'Who', 'Example'], [
          ['Resource owner', 'The user', 'Ada'],
          ['Client', 'The app requesting access', 'Your Node web app'],
          ['Authorization server', 'Issues tokens after consent', 'Google / Auth0 / Keycloak'],
          ['Resource server', 'API that accepts the tokens', 'Calendar API, or your own API'],
        ]),
        bullets(
          '**Scopes** — what is requested (`calendar.readonly`).',
          '**Confidential client** — can keep a secret (server-side app). **Public client** — cannot (SPA, mobile).',
          'OAuth is about **authorization**; for login/identity use OpenID Connect on top (next lesson).',
        ),
        table('Grant types today', ['Grant', 'Use', 'Status'], [
          ['Authorization code + PKCE', 'Any app with a user (web, SPA, mobile)', '**Recommended**'],
          ['Client credentials', 'Service-to-service, no user', 'Recommended'],
          ['Refresh token', 'Renew access tokens', 'Recommended (rotate for public clients)'],
          ['Device code', 'TVs/CLIs without a browser', 'Recommended for that case'],
          ['Implicit', 'Tokens in URL fragment', '**Deprecated** (RFC 9700 / OAuth 2.1)'],
          ['Resource owner password', 'App collects user password', '**Deprecated**'],
        ]),
      ),
      section('why', 'Why code + PKCE',
        bullets(
          'Tokens never travel in the browser URL; only a one-time code does.',
          'The code is exchanged on a back channel (POST to the token endpoint).',
          '**PKCE** binds the code to the client that started the flow: a stolen code is useless without the `code_verifier`.',
          'The `state` parameter (random, checked on return) prevents CSRF on the callback.',
          'Implicit flow leaked tokens via URLs, history and Referer — that is why it was deprecated.',
        ),
      ),
      section('internals', 'Authorization code + PKCE flow',
        diagram('oauth-flow', 'Front channel carries only the code; tokens come from the back channel.'),
        steps(
          'Client creates `code_verifier` (43–128 random chars) and `code_challenge = BASE64URL(SHA256(verifier))`, plus random `state`.',
          'Redirect user to `/authorize?response_type=code&client_id&redirect_uri&scope&state&code_challenge&code_challenge_method=S256`.',
          'User logs in at the authorization server and consents.',
          'Authorization server redirects to `redirect_uri?code=...&state=...`.',
          'Client checks `state`, then POSTs `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier` (+ client secret if confidential) to `/token`.',
          'Server verifies `SHA256(verifier) == challenge` and returns access (and refresh) tokens.',
          'Client calls the resource server with `Authorization: Bearer <access_token>`.',
        ),
      ),
      section('example', 'Implementing the client side in Express',
        code({
          title: 'Generating PKCE values (Node core crypto)',
          code: dedent(`
            const crypto = require('node:crypto');
            const verifier = crypto.randomBytes(32).toString('base64url');            // 43 chars
            const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
            console.log(verifier.length, challenge.length);
          `),
          expectedOutput: '43 43',
          explanation: ['32 random bytes → 43 base64url chars; a SHA-256 digest is also 43 chars in base64url.'],
        }),
        code({
          title: 'Login + callback routes',
          code: dedent(`
            const AS = 'https://auth.example.com';
            const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
            const REDIRECT_URI = 'https://app.example.com/oauth/callback';

            app.get('/oauth/login', (req, res) => {
              const state = crypto.randomBytes(16).toString('base64url');
              const verifier = crypto.randomBytes(32).toString('base64url');
              req.session.oauth = { state, verifier };                     // express-session
              const url = new URL(AS + '/authorize');
              url.search = new URLSearchParams({
                response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
                scope: 'openid profile orders:read', state,
                code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
                code_challenge_method: 'S256',
              }).toString();
              res.redirect(url.toString());
            });

            app.get('/oauth/callback', async (req, res) => {
              const saved = req.session.oauth;
              delete req.session.oauth;
              if (!saved || req.query.state !== saved.state) return res.status(400).send('Invalid state');

              const tokenRes = await fetch(AS + '/token', {                // global fetch, Node 18+
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: REDIRECT_URI,
                  client_id: CLIENT_ID, client_secret: process.env.OAUTH_CLIENT_SECRET, code_verifier: saved.verifier,
                }),
              });
              if (!tokenRes.ok) return res.status(502).send('Token exchange failed');
              const tokens = await tokenRes.json();
              req.session.regenerate(() => { req.session.tokens = tokens; res.redirect('/'); });
            });
          `),
          explanation: [
            'Confidential server-side clients use PKCE **and** a client secret.',
            'Tokens stay on the server (session) — the browser only gets a session cookie (BFF pattern).',
            'In real code, prefer a certified library like `openid-client` (third-party) over hand-rolling.',
          ],
        }),
        code({
          title: 'The exchanges',
          language: 'http',
          code: 'GET /oauth/login HTTP/1.1\nHost: app.example.com\n\nGET /oauth/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=af0ifjsldkj HTTP/1.1\nHost: app.example.com\n\nPOST /token HTTP/1.1\nHost: auth.example.com\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code&code=SplxlOBeZQQYbYS6WxSbIA&redirect_uri=...&code_verifier=...',
          expectedOutput: 'HTTP/1.1 302 Found\nLocation: https://auth.example.com/authorize?response_type=code&client_id=app123&redirect_uri=https%3A%2F%2Fapp.example.com%2Foauth%2Fcallback&scope=openid+profile+orders%3Aread&state=af0ifjsldkj&code_challenge=...&code_challenge_method=S256\n\nHTTP/1.1 302 Found\nLocation: /\n\nHTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\n\n{"access_token":"eyJ...","token_type":"Bearer","expires_in":600,"refresh_token":"8xLOxBtZp8","scope":"openid profile orders:read","id_token":"eyJ..."}',
        }),
        code({
          title: 'Client credentials (machine-to-machine)',
          code: dedent(`
            const res = await fetch('https://auth.example.com/token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
              },
              body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'reports:write' }),
            });
            const { access_token, expires_in } = await res.json(); // cache until shortly before expiry
          `),
          explanation: ['No user and no refresh token; the service simply requests a new token when the old one nears expiry.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Register exact redirect URIs; authorization servers must match them exactly (no wildcards).',
          'SPAs: either code + PKCE in the browser with tokens in memory, or (better) a BFF holding tokens server-side.',
          'Your own API as a resource server: validate the access token\'s `iss`, `aud`, `exp`, scopes via JWKS or introspection.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: missing state check',
          code: dedent(`
            // ✗ accepts any code → login CSRF / account mixing
            app.get('/oauth/callback', async (req, res) => exchange(req.query.code));

            // ✓ verify state from the session first (PKCE adds a second layer)
            if (req.query.state !== req.session.oauth?.state) return res.status(400).send('Invalid state');
          `),
        }),
        bullets(
          'Using OAuth access tokens as proof of login for your own app — use the OIDC ID token.',
          'Putting a client secret in a SPA or mobile app.',
          'Using the implicit or password grants in new apps.',
          'Requesting broad scopes "just in case".',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name the four roles, then narrate code + PKCE step by step including `state` and the back-channel token exchange. Say clearly that implicit is deprecated and why.'),
      ),
      section('practice', 'Practice',
        text('Run a local Keycloak (Docker), register a confidential client, and implement the login/callback routes above. Inspect the authorization request in DevTools and confirm the token never appears in a browser URL.'),
      ),
      section('summary', 'Summary',
        bullets(
          'OAuth = delegated authorization, four roles.',
          'Use authorization code + PKCE (+ state) for user apps; client credentials for services.',
          'Implicit and password grants are deprecated.',
          'OAuth is not authentication — that is OIDC.',
        ),
      ),
    ],
    revisionNotes: [
      'Roles: resource owner, client, authorization server, resource server.',
      'Code + PKCE: verifier → S256 challenge → code via redirect → exchange with verifier at /token.',
      '`state` protects the callback from CSRF; PKCE protects against code interception.',
      'Implicit & ROPC grants deprecated (RFC 9700 Security BCP, OAuth 2.1).',
      'Client credentials = machine-to-machine, no user, no refresh token.',
      'Exact redirect URI matching; no secrets in public clients.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does PKCE protect against?',
        options: [
          'XSS in the client',
          'An intercepted authorization code being exchanged by someone else',
          'Weak user passwords',
          'Expired refresh tokens',
        ],
        answer: 1,
        explanation: 'Only the party holding the original `code_verifier` can redeem the code. XSS and password strength are unrelated.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A nightly reporting service needs to call your internal API. No user is involved. Which grant?',
        options: ['Authorization code + PKCE', 'Implicit', 'Client credentials', 'Resource owner password'],
        answer: 2,
        explanation: 'Client credentials authenticates the service itself. The other user-based flows need a person; implicit/password are deprecated anyway.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'In OAuth, which role issues access tokens?',
        options: ['Resource server', 'Client', 'Authorization server', 'Resource owner'],
        answer: 2,
        explanation: 'The authorization server authenticates the user, gets consent and issues tokens; the resource server only accepts them.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'OAuth 2.0',
        question: 'Describe the OAuth 2.0 roles and the authorization code flow.',
        shortAnswer: 'The resource owner (user) authorizes a client app via the authorization server, which redirects back with a short-lived code; the client exchanges that code on a back channel for tokens and calls the resource server with the access token.',
        detailedAnswer: [
          'Client redirects to `/authorize` with client_id, redirect_uri, scope, state (and PKCE challenge).',
          'User authenticates and consents at the authorization server.',
          'Redirect back with `code` and `state`; client validates `state`.',
          'POST `/token` with the code (and verifier/secret) → access/refresh/ID tokens.',
          'Resource server validates the access token per request.',
        ],
        followUp: 'Why is the code exchanged on a back channel instead of returning tokens directly?',
        trap: 'Calling OAuth an authentication protocol.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'PKCE',
        question: 'How does PKCE work and why is the implicit flow deprecated?',
        shortAnswer: 'The client sends a hash of a random secret (`code_challenge`) when starting the flow and the secret itself (`code_verifier`) when redeeming the code, so only the originator can redeem it; implicit returned tokens in the URL fragment where they leak, and PKCE makes the safer code flow usable by public clients.',
        detailedAnswer: [
          'Challenge = BASE64URL(SHA-256(verifier)), method `S256` (plain is discouraged).',
          'Authorization server stores the challenge with the code and verifies at `/token`.',
          'Defeats code interception by malicious apps (custom URL schemes) and leaked logs.',
          'Implicit: tokens in fragment → history, Referer, browser extensions; no refresh tokens; no sender binding.',
          'RFC 9700 (OAuth 2.0 Security BCP) recommends PKCE for all clients, even confidential ones.',
        ],
        followUp: 'Do confidential clients with a client secret still need PKCE?',
        trap: 'Thinking PKCE replaces the `state` parameter entirely in all cases.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'SPA token handling',
        question: 'You are building a React SPA with an Express backend that uses an external OAuth/OIDC provider. Where should tokens live?',
        shortAnswer: 'Preferably in a backend-for-frontend: Express performs the code + PKCE flow as a confidential client, keeps tokens server-side in a session, and gives the browser only an HttpOnly SameSite session cookie; if tokens must be in the browser, keep them in memory, short-lived, with rotating refresh tokens.',
        detailedAnswer: [
          'Tokens in localStorage are readable by any XSS.',
          'BFF: browser → Express (cookie) → Express attaches access token to upstream API calls.',
          'Express handles refresh, revocation and logout centrally.',
          'Cookie needs SameSite=Lax/Strict + CSRF protection for state-changing routes.',
          'Pure-SPA alternative: code + PKCE in browser, in-memory access token, refresh token rotation with reuse detection.',
        ],
        followUp: 'How does the BFF handle CSRF?',
        trap: 'Storing access and refresh tokens in localStorage as the default choice.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'openid-connect-fundamentals': {
    summary: 'OpenID Connect (OIDC) adds authentication to OAuth 2.0: requesting the `openid` scope returns an ID token (a JWT about the user) plus a userinfo endpoint, discovery metadata and a `nonce` to bind tokens to the login request.',
    topics: ['OIDC', 'ID token', 'openid scope', 'userinfo', 'nonce', 'discovery', '.well-known/openid-configuration', 'JWKS', 'sub', 'aud', 'azp', 'openid-client'],
    sections: [
      section('introduction', undefined,
        text('OAuth tells an API "this token may read calendars". It does not tell your app **who logged in**. OIDC standardises exactly that.'),
      ),
      section('definition', 'What OIDC adds',
        table('OAuth 2.0 vs OIDC', ['', 'OAuth 2.0', 'OpenID Connect'], [
          ['Purpose', 'Delegated authorization', 'Authentication (login) on top of OAuth'],
          ['Token for the app', 'Access token (for APIs)', '**ID token** (for the client)'],
          ['Audience', 'Resource server', 'The client (`aud = client_id`)'],
          ['Scope', 'Any', 'Must include `openid` (+ `profile`, `email`)'],
          ['User info', 'Not standardised', '`/userinfo` endpoint, standard claims'],
          ['Discovery', 'Optional (RFC 8414)', '`/.well-known/openid-configuration`'],
        ]),
        table('ID token claims', ['Claim', 'Meaning', 'Validate'], [
          ['`iss`', 'Issuer URL', 'Equals discovery `issuer`'],
          ['`sub`', 'Stable user id at this issuer', 'Use `iss`+`sub` as the user key (not email)'],
          ['`aud`', 'Your client_id', 'Must contain your client_id'],
          ['`exp`, `iat`', 'Expiry / issued at', 'Not expired'],
          ['`nonce`', 'Value you sent in the auth request', 'Must equal the stored nonce'],
          ['`auth_time`, `acr`, `amr`', 'When/how the user authenticated (MFA)', 'If you require recent or MFA login'],
          ['`email`, `email_verified`, `name`', 'Profile claims', 'Trust email only if `email_verified`'],
        ]),
      ),
      section('why', 'Why use OIDC instead of rolling your own login',
        bullets(
          'Social login / enterprise SSO (Google, Microsoft Entra ID, Okta) all speak OIDC.',
          'Passwords, MFA, account recovery handled by the provider.',
          'Standard validation rules — libraries can do it correctly.',
        ),
      ),
      section('internals', 'Login flow',
        diagram('oauth-flow', 'Same authorization code + PKCE flow; scope includes openid and the response includes an id_token.'),
        steps(
          'Fetch discovery: `GET {issuer}/.well-known/openid-configuration` → authorization, token, userinfo, `jwks_uri` endpoints.',
          'Start code + PKCE flow with `scope=openid profile email`, random `state` **and** `nonce`.',
          'Exchange code → `id_token` (+ access token).',
          'Validate ID token: signature via JWKS (`kid`), `iss`, `aud`, `exp`, `nonce` (and `azp` if multiple audiences).',
          'Look up or create the local user by (`iss`, `sub`); start your own session.',
          'Optionally call `/userinfo` with the access token for more claims.',
        ),
      ),
      section('example', 'Validating an ID token',
        code({
          title: 'Using jose (third-party) with remote JWKS',
          code: dedent(`
            const { createRemoteJWKSet, jwtVerify } = require('jose');

            const ISSUER = 'https://accounts.example.com';
            const discovery = await (await fetch(ISSUER + '/.well-known/openid-configuration')).json();
            const JWKS = createRemoteJWKSet(new URL(discovery.jwks_uri)); // caches keys, refetches on unknown kid

            async function validateIdToken(idToken, expectedNonce) {
              const { payload } = await jwtVerify(idToken, JWKS, {
                issuer: discovery.issuer,
                audience: process.env.OIDC_CLIENT_ID,
                algorithms: ['RS256', 'ES256'],
              });
              if (payload.nonce !== expectedNonce) throw new Error('nonce mismatch');
              return { key: payload.iss + '|' + payload.sub, email: payload.email_verified ? payload.email : null, name: payload.name };
            }
          `),
          explanation: [
            '`jose` handles key rotation via `kid` and checks `iss`, `aud`, `exp`.',
            'The nonce check binds the ID token to this browser\'s login attempt (anti-replay).',
            'Users are keyed by `iss|sub`; emails can change or be reassigned.',
          ],
          versionNote: 'Top-level `await` requires an ES module or an async bootstrap function. `openid-client` (third-party, certified) wraps discovery, PKCE and validation end to end.',
        }),
        code({
          title: 'Discovery document (excerpt)',
          language: 'http',
          code: 'GET /.well-known/openid-configuration HTTP/1.1\nHost: accounts.example.com',
          expectedOutput: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{\n  "issuer": "https://accounts.example.com",\n  "authorization_endpoint": "https://accounts.example.com/authorize",\n  "token_endpoint": "https://accounts.example.com/oauth/token",\n  "userinfo_endpoint": "https://accounts.example.com/userinfo",\n  "jwks_uri": "https://accounts.example.com/.well-known/jwks.json",\n  "scopes_supported": ["openid", "profile", "email"],\n  "response_types_supported": ["code"],\n  "id_token_signing_alg_values_supported": ["RS256"],\n  "code_challenge_methods_supported": ["S256"]\n}',
        }),
        code({
          title: 'Decoded ID token payload',
          language: 'json',
          code: dedent(`
            {
              "iss": "https://accounts.example.com",
              "sub": "248289761001",
              "aud": "app123",
              "exp": 1767226500,
              "iat": 1767225600,
              "nonce": "n-0S6_WzA2Mj",
              "auth_time": 1767225590,
              "email": "ada@example.com",
              "email_verified": true,
              "name": "Ada Lovelace"
            }
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'After validating the ID token, issue **your own** session or tokens; do not send the ID token to your APIs as an access token.',
          'Account linking: only auto-link to an existing local account by email when `email_verified` is true and the provider is trusted.',
          'Logout: clear your session and optionally use the provider\'s RP-initiated logout (`end_session_endpoint`).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: identifying users',
          code: dedent(`
            // ✗ email is mutable and may be unverified
            let user = await users.findByEmail(idToken.email);

            // ✓ issuer + subject is the stable identity
            let user = await users.findByIdentity({ iss: idToken.iss, sub: idToken.sub });
          `),
        }),
        bullets(
          'Skipping `aud` validation — an ID token for another app would log users into yours.',
          'Not sending or checking `nonce`.',
          'Using the access token to "prove" login to your app.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Lead with "OAuth is authorization, OIDC is authentication on top". Then list the ID token validation checklist: signature (JWKS/kid), iss, aud, exp, nonce.'),
      ),
      section('practice', 'Practice',
        text('Add "Sign in with Google" using `openid-client`: discovery, PKCE, nonce, and creating a local user keyed by `iss|sub`. Log the validated claims.'),
      ),
      section('summary', 'Summary',
        bullets(
          'OIDC = OAuth + `openid` scope + ID token + userinfo + discovery.',
          'ID token audience is your client; access token audience is the API.',
          'Validate signature, iss, aud, exp, nonce.',
          'Key users by `iss`+`sub`, not email.',
        ),
      ),
    ],
    revisionNotes: [
      'OIDC adds authentication: `scope=openid` → `id_token` (JWT for the client).',
      'Discovery at `/.well-known/openid-configuration`; keys at `jwks_uri` (rotate by `kid`).',
      'Validate ID token: signature, `iss`, `aud`=client_id, `exp`, `nonce`.',
      '`nonce` binds token to login request (replay protection); `state` protects callback (CSRF).',
      'Identity key = `iss` + `sub`; trust email only if `email_verified`.',
      'Do not use ID tokens as API access tokens.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the intended audience (`aud`) of an OIDC ID token?',
        options: ['The resource server API', 'The client application (its client_id)', 'The user\'s browser', 'Any service in the organisation'],
        answer: 1,
        explanation: 'ID tokens are for the client that requested login. APIs should receive access tokens with their own audience.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Your app links OIDC logins to local accounts by email. An attacker registers at a lenient provider with the victim\'s email (unverified) and logs in as the victim. Best fix?',
        options: [
          'Lowercase emails before comparing',
          'Key identities by `iss`+`sub`, and only link by email when `email_verified` is true from a trusted issuer (ideally with user confirmation)',
          'Require the `profile` scope',
          'Shorten ID token expiry',
        ],
        answer: 1,
        explanation: 'Email claims can be unverified or reassigned. The stable identifier is issuer + subject.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'OIDC',
        question: 'What is the difference between OAuth 2.0 and OpenID Connect?',
        shortAnswer: 'OAuth 2.0 is a delegated authorization framework that issues access tokens for APIs; OpenID Connect is an identity layer on top that adds the `openid` scope, a signed ID token describing the authenticated user, a userinfo endpoint and discovery.',
        detailedAnswer: [
          'OAuth answers "may this client access this API?"; OIDC answers "who is the user?".',
          'ID token is a JWT with `iss`, `sub`, `aud`, `exp`, `nonce`, auth context claims.',
          'Discovery and JWKS standardise configuration and key rotation.',
          'Both commonly use authorization code + PKCE.',
        ],
        followUp: 'Why should you not use an access token to log a user into your app?',
        trap: 'Saying OIDC replaces OAuth — it extends it.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'ID token validation',
        question: 'How do you validate an OIDC ID token, and what is the nonce for?',
        shortAnswer: 'Verify the signature with the issuer\'s JWKS key matching `kid` and an allowed algorithm, then check `iss`, `aud` (your client_id), `exp`/`iat`, and that `nonce` equals the value you generated for this login — the nonce prevents replaying an ID token from another session.',
        detailedAnswer: [
          'Fetch keys from `jwks_uri` (discovery), cache, refetch on unknown `kid`.',
          'Pin algorithms (`RS256`/`ES256`); reject `none`.',
          'If `aud` has multiple values, check `azp` equals your client_id.',
          'Store nonce (and state, PKCE verifier) in the session before redirecting; compare after.',
          'Check `auth_time`/`acr` when you require recent or MFA authentication.',
        ],
        followUp: 'What is the difference between state and nonce?',
        trap: 'Validating only the signature and trusting all claims.',
      },
    ],
  },
};

export default content;

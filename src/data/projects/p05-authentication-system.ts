import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p05: Project = {
  id: 'p05',
  number: 5,
  level: 'intermediate',
  title: 'Authentication System',
  status: 'ready',
  summary: 'A complete auth API: register, email verification, login with short-lived JWT access tokens, rotating refresh tokens in httpOnly cookies with reuse detection, password reset and logout.',
  skills: ['bcrypt', 'JWT access tokens', 'Refresh token rotation', 'httpOnly cookies', 'One-time tokens', 'Rate limiting', 'Transactions'],
  estHours: 14,
  prerequisites: [
    'm10-password-hashing',
    'm10-jwt',
    'm10-access-tokens',
    'm10-refresh-tokens',
    'm10-cookies',
    'm10-email-verification',
    'm10-password-reset',
    'm10-secure-logout',
  ],
  requirements: {
    functional: [
      'Register with email + password → account created unverified, verification email sent.',
      'Verify email via a one-time token (24 h, single use).',
      'Login → access token (JWT, 15 min) in the body + refresh token (opaque, 30 days) in an httpOnly cookie.',
      'Refresh → old refresh token revoked, a new one issued (rotation). Re-using a revoked token revokes the whole token family.',
      'Forgot password → reset email (30 min, single use); same response whether or not the email exists.',
      'Reset password → new hash, all sessions revoked.',
      'Logout (current device) and logout-all (every device); `GET /me` for the current user.',
      'Resend verification email.',
    ],
    nonFunctional: [
      'Passwords hashed with bcrypt cost 12; refresh/one-time tokens stored only as SHA-256 hashes.',
      'Login, forgot-password and resend endpoints rate-limited per IP (5–10 / 15 min).',
      'No user enumeration: identical messages and similar timing for unknown emails.',
      'Refresh cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`.',
      'Rotation is race-safe (`SELECT ... FOR UPDATE` inside a transaction).',
      'Stateless access-token checks (no DB hit per request); revocation latency ≤ access-token TTL.',
    ],
  },
  architecture: {
    diagramId: 'jwt-flow',
    flow: [
      { label: 'POST /login', detail: 'bcrypt.compare' },
      { label: 'Issue tokens', detail: 'JWT 15m + opaque refresh (hashed in DB)' },
      { label: 'API calls', detail: 'Authorization: Bearer <access>' },
      { label: '401 expired', detail: 'client calls /refresh with cookie' },
      { label: 'Rotate', detail: 'revoke old, insert new (same family)' },
      { label: 'Reuse?', detail: 'revoked token seen → revoke family' },
    ],
    notes: [
      'Access token = stateless JWT (fast, short-lived). Refresh token = random opaque string, looked up in the DB (revocable).',
      'Each login starts a **family** (`family_id`). Rotation keeps the family; theft is detected when an already-rotated token comes back.',
      'Verification and reset tokens share one `one_time_tokens` table with a `purpose` column; they are consumed with a single atomic `UPDATE ... RETURNING`.',
      'Email sending sits behind a `mailer` interface — console in dev, SMTP/provider in prod, captured array in tests.',
    ],
  },
  folderStructure: dedent(`
    auth-api/
    ├── migrations/001_auth.sql
    ├── src/
    │   ├── app.js
    │   ├── server.js
    │   ├── config.js                 # zod-validated env (secrets, TTLs, APP_URL)
    │   ├── db/{pool.js,transaction.js}
    │   ├── lib/
    │   │   ├── tokens.js             # random tokens, sha256, JWT sign/verify
    │   │   ├── cookies.js            # refresh cookie options
    │   │   └── mailer.js
    │   ├── middleware/
    │   │   ├── require-auth.js
    │   │   ├── rate-limit.js
    │   │   ├── validate.js
    │   │   └── error-handler.js
    │   └── modules/auth/
    │       ├── auth.routes.js
    │       ├── auth.controller.js
    │       ├── auth.service.js       # register, login, refresh, reset...
    │       ├── refresh-tokens.repository.js
    │       ├── one-time-tokens.repository.js
    │       ├── users.repository.js
    │       └── auth.schema.js
    └── test/auth.flow.test.js
  `),
  databaseDesign: [
    entity('users', [
      ['id', 'UUID', 'PK DEFAULT gen_random_uuid()', 'Non-guessable ids'],
      ['email', 'TEXT', 'NOT NULL UNIQUE', 'Lower-cased by zod before insert'],
      ['password_hash', 'TEXT', 'NOT NULL', 'bcrypt, cost 12'],
      ['role', 'TEXT', "NOT NULL DEFAULT 'user'", ''],
      ['email_verified_at', 'TIMESTAMPTZ', 'NULL', 'NULL = unverified; login blocked'],
      ['password_changed_at', 'TIMESTAMPTZ', 'NULL', 'Audit + optional "iat < changed" check'],
      ['created_at', 'TIMESTAMPTZ', 'NOT NULL DEFAULT now()', ''],
    ]),
    entity('refresh_tokens', [
      ['id', 'UUID', 'PK DEFAULT gen_random_uuid()', ''],
      ['user_id', 'UUID', 'NOT NULL FK users ON DELETE CASCADE', 'Index'],
      ['family_id', 'UUID', 'NOT NULL', 'One family per login; Index'],
      ['token_hash', 'TEXT', 'NOT NULL UNIQUE', 'sha256(token) hex — raw token never stored'],
      ['expires_at', 'TIMESTAMPTZ', 'NOT NULL', 'now() + 30 days'],
      ['revoked_at', 'TIMESTAMPTZ', 'NULL', 'Set on rotation / logout'],
      ['replaced_by', 'UUID', 'NULL FK refresh_tokens(id)', 'Rotation chain for auditing'],
      ['user_agent / ip', 'TEXT', 'NULL', '"Active sessions" screen'],
      ['created_at', 'TIMESTAMPTZ', 'NOT NULL DEFAULT now()', ''],
    ]),
    entity('one_time_tokens', [
      ['id', 'UUID', 'PK', ''],
      ['user_id', 'UUID', 'NOT NULL FK users ON DELETE CASCADE', ''],
      ['purpose', 'TEXT', "CHECK IN ('verify_email','reset_password')", ''],
      ['token_hash', 'TEXT', 'NOT NULL UNIQUE', 'sha256'],
      ['expires_at', 'TIMESTAMPTZ', 'NOT NULL', 'verify 24 h, reset 30 min'],
      ['used_at', 'TIMESTAMPTZ', 'NULL', 'Single use'],
      ['created_at', 'TIMESTAMPTZ', 'NOT NULL DEFAULT now()', ''],
    ]),
  ],
  endpoints: [
    { method: 'POST', path: '/api/v1/auth/register', description: '{ email, password } → 201, sends verification email.', auth: 'public' },
    { method: 'POST', path: '/api/v1/auth/verify-email', description: '{ token } → marks email verified.', auth: 'public' },
    { method: 'POST', path: '/api/v1/auth/resend-verification', description: '{ email } → 202 always.', auth: 'public (rate-limited)' },
    { method: 'POST', path: '/api/v1/auth/login', description: '{ email, password } → { accessToken } + refresh cookie.', auth: 'public (rate-limited)' },
    { method: 'POST', path: '/api/v1/auth/refresh', description: 'Rotate refresh cookie → new access token.', auth: 'refresh cookie' },
    { method: 'POST', path: '/api/v1/auth/logout', description: 'Revoke current refresh token family, clear cookie → 204.', auth: 'refresh cookie' },
    { method: 'POST', path: '/api/v1/auth/logout-all', description: 'Revoke every refresh token of the user → 204.', auth: 'user' },
    { method: 'POST', path: '/api/v1/auth/forgot-password', description: '{ email } → 202 always.', auth: 'public (rate-limited)' },
    { method: 'POST', path: '/api/v1/auth/reset-password', description: '{ token, password } → 204, all sessions revoked.', auth: 'public' },
    { method: 'GET', path: '/api/v1/auth/me', description: 'Current user profile.', auth: 'user' },
  ],
  steps: [
    {
      title: 'Schema',
      bullets: [
        '`gen_random_uuid()` is built into Postgres 13+.',
        'Index `refresh_tokens(user_id)` and `(family_id)` — logout-all and reuse revocation update by them.',
      ],
      code: {
        id: 'p05-s1',
        title: 'migrations/001_auth.sql',
        language: 'sql',
        code: dedent(`
          CREATE TABLE users (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email               TEXT NOT NULL UNIQUE,
            password_hash       TEXT NOT NULL,
            role                TEXT NOT NULL DEFAULT 'user',
            email_verified_at   TIMESTAMPTZ,
            password_changed_at TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
          );

          CREATE TABLE refresh_tokens (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            family_id   UUID NOT NULL,
            token_hash  TEXT NOT NULL UNIQUE,
            expires_at  TIMESTAMPTZ NOT NULL,
            revoked_at  TIMESTAMPTZ,
            replaced_by UUID REFERENCES refresh_tokens(id),
            user_agent  TEXT,
            ip          TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
          CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

          CREATE TABLE one_time_tokens (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            purpose    TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at    TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX one_time_tokens_user_idx ON one_time_tokens (user_id, purpose);
        `),
      },
    },
    {
      title: 'Token helpers',
      bullets: [
        'Opaque tokens: 32 random bytes, `base64url` (URL-safe for email links).',
        'Store `sha256(token)`: if the DB leaks, attackers cannot use the hashes. SHA-256 (not bcrypt) is fine because tokens have 256 bits of entropy.',
        'JWT: pin algorithm, set `issuer`/`audience`, keep the payload tiny (`sub`, `role`).',
      ],
      code: {
        id: 'p05-s2',
        title: 'src/lib/tokens.js',
        language: 'javascript',
        code: dedent(`
          import { randomBytes, createHash } from 'node:crypto';
          import jwt from 'jsonwebtoken';
          import { config } from '../config.js';

          export const generateToken = () => randomBytes(32).toString('base64url');
          export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

          const JWT_OPTIONS = { issuer: 'auth-api', audience: 'api' };

          export function signAccessToken(user) {
            return jwt.sign({ sub: user.id, role: user.role }, config.JWT_ACCESS_SECRET, {
              ...JWT_OPTIONS,
              algorithm: 'HS256',
              expiresIn: '15m',
            });
          }

          export function verifyAccessToken(token) {
            return jwt.verify(token, config.JWT_ACCESS_SECRET, { ...JWT_OPTIONS, algorithms: ['HS256'] });
          }
        `),
      },
    },
    {
      title: 'One-time tokens (verification & reset)',
      bullets: [
        'Creating a new token invalidates older unused tokens of the same purpose.',
        'Consumption is **one** `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING` — two concurrent clicks cannot both succeed.',
      ],
      code: {
        id: 'p05-s3',
        title: 'modules/auth/one-time-tokens.repository.js',
        language: 'javascript',
        code: dedent(`
          import { generateToken, hashToken } from '../../lib/tokens.js';

          export async function create(db, userId, purpose, ttlMinutes) {
            const raw = generateToken();
            await db.query(
              'UPDATE one_time_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL',
              [userId, purpose],
            );
            await db.query(
              \`INSERT INTO one_time_tokens (user_id, purpose, token_hash, expires_at)
               VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))\`,
              [userId, purpose, hashToken(raw), ttlMinutes],
            );
            return raw; // only the email ever sees the raw token
          }

          /** Returns the user id, or null if the token is unknown, used or expired. */
          export async function consume(db, raw, purpose) {
            const { rows } = await db.query(
              \`UPDATE one_time_tokens SET used_at = now()
               WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
               RETURNING user_id\`,
              [hashToken(raw), purpose],
            );
            return rows[0]?.user_id ?? null;
          }
        `),
      },
    },
    {
      title: 'Register, verify, login',
      bullets: [
        'zod: email trimmed + lower-cased; password 8–64 chars (bcrypt only uses the first 72 **bytes**).',
        'Login compares against a dummy hash when the user does not exist, so response time does not reveal which emails are registered.',
        'Unverified users get `403 EMAIL_NOT_VERIFIED` only **after** the password is proven correct.',
      ],
      code: {
        id: 'p05-s4',
        title: 'modules/auth/auth.service.js (part 1)',
        language: 'javascript',
        code: dedent(`
          import bcrypt from 'bcrypt';
          import { pool } from '../../db/pool.js';
          import { withTransaction } from '../../db/transaction.js';
          import { mailer } from '../../lib/mailer.js';
          import { signAccessToken } from '../../lib/tokens.js';
          import { config } from '../../config.js';
          import * as users from './users.repository.js';
          import * as oneTime from './one-time-tokens.repository.js';
          import * as refreshTokens from './refresh-tokens.repository.js';
          import { BadRequestError, ForbiddenError, UnauthorizedError } from '../../errors.js';

          const COST = 12;
          const DUMMY_HASH = await bcrypt.hash('not-a-real-password', COST);

          async function sendVerification(db, user) {
            const token = await oneTime.create(db, user.id, 'verify_email', 24 * 60);
            await mailer.send({
              to: user.email,
              subject: 'Verify your email',
              text: \`Confirm your account: \${config.APP_URL}/verify-email?token=\${token}\`,
            });
          }

          export async function register({ email, password }) {
            const passwordHash = await bcrypt.hash(password, COST);
            const user = await users.insert(pool, { email, passwordHash }); // 23505 -> 409 in error handler
            await sendVerification(pool, user);
            return { id: user.id, email: user.email };
          }

          export async function verifyEmail(token) {
            await withTransaction(async (client) => {
              const userId = await oneTime.consume(client, token, 'verify_email');
              if (!userId) throw new BadRequestError('Invalid or expired verification link');
              await client.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [userId]);
            });
          }

          export async function resendVerification(email) {
            const user = await users.findByEmail(pool, email);
            if (user && !user.email_verified_at) await sendVerification(pool, user);
            // same 202 response either way
          }

          export async function login({ email, password }, meta) {
            const user = await users.findByEmail(pool, email);
            const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
            if (!user || !ok) throw new UnauthorizedError('Invalid email or password');
            if (!user.email_verified_at) throw new ForbiddenError('Verify your email first', 'EMAIL_NOT_VERIFIED');

            const refreshToken = await refreshTokens.createFamily(pool, user.id, meta);
            return { accessToken: signAccessToken(user), refreshToken, user: { id: user.id, email: user.email } };
          }
        `),
      },
    },
    {
      title: 'Refresh token rotation with reuse detection',
      bullets: [
        'Lock the row with `FOR UPDATE` so two parallel refreshes with the same token serialise — the second sees `revoked_at`.',
        'A revoked token coming back means it was stolen (or replayed): revoke the **entire family**, forcing a fresh login everywhere.',
        'Gotcha: the family revocation must be **committed** — return a flag from the transaction and throw *after* it, otherwise `ROLLBACK` undoes it.',
      ],
      code: {
        id: 'p05-s5',
        title: 'modules/auth/refresh-tokens.repository.js',
        language: 'javascript',
        code: dedent(`
          import { randomUUID } from 'node:crypto';
          import { withTransaction } from '../../db/transaction.js';
          import { generateToken, hashToken } from '../../lib/tokens.js';
          import { UnauthorizedError } from '../../errors.js';

          const TTL = "interval '30 days'";

          async function insertToken(db, { userId, familyId, meta }) {
            const raw = generateToken();
            const { rows } = await db.query(
              \`INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent, ip)
               VALUES ($1, $2, $3, now() + \${TTL}, $4, $5)
               RETURNING id\`,
              [userId, familyId, hashToken(raw), meta?.userAgent ?? null, meta?.ip ?? null],
            );
            return { raw, id: rows[0].id };
          }

          export async function createFamily(db, userId, meta) {
            const { raw } = await insertToken(db, { userId, familyId: randomUUID(), meta });
            return raw;
          }

          export async function rotate(rawToken, meta) {
            const outcome = await withTransaction(async (client) => {
              const { rows } = await client.query(
                \`SELECT rt.*, u.role FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
                 WHERE rt.token_hash = $1 FOR UPDATE OF rt\`,
                [hashToken(rawToken)],
              );
              const current = rows[0];
              if (!current) return { error: 'Invalid refresh token' };

              if (current.revoked_at) {
                await client.query(
                  'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
                  [current.family_id],
                );
                return { error: 'Refresh token reuse detected' }; // COMMIT keeps the revocation
              }
              if (current.expires_at <= new Date()) return { error: 'Refresh token expired' };

              const next = await insertToken(client, { userId: current.user_id, familyId: current.family_id, meta });
              await client.query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [
                current.id,
                next.id,
              ]);
              return { user: { id: current.user_id, role: current.role }, refreshToken: next.raw };
            });

            if (outcome.error) throw new UnauthorizedError(outcome.error);
            return outcome;
          }

          export async function revokeFamilyOf(db, rawToken) {
            await db.query(
              \`UPDATE refresh_tokens SET revoked_at = now()
               WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1) AND revoked_at IS NULL\`,
              [hashToken(rawToken)],
            );
          }

          export async function revokeAllForUser(db, userId) {
            await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
          }
        `),
      },
    },
    {
      title: 'Forgot / reset password',
      bullets: [
        '`forgot-password` always answers `202` with the same body. Send the email through a queue (p09) so timing is identical too.',
        'Reset = consume token + set new hash + revoke every refresh token, all in one transaction.',
      ],
      code: {
        id: 'p05-s6',
        title: 'modules/auth/auth.service.js (part 2)',
        language: 'javascript',
        code: dedent(`
          import bcrypt from 'bcrypt';
          import { pool } from '../../db/pool.js';
          import { withTransaction } from '../../db/transaction.js';
          import { mailer } from '../../lib/mailer.js';
          import { signAccessToken } from '../../lib/tokens.js';
          import { config } from '../../config.js';
          import * as users from './users.repository.js';
          import * as oneTime from './one-time-tokens.repository.js';
          import * as refreshTokens from './refresh-tokens.repository.js';
          import { BadRequestError } from '../../errors.js';

          export async function forgotPassword(email) {
            const user = await users.findByEmail(pool, email);
            if (!user) return;
            const token = await oneTime.create(pool, user.id, 'reset_password', 30);
            await mailer.send({
              to: user.email,
              subject: 'Reset your password',
              text: \`Reset link (valid 30 minutes): \${config.APP_URL}/reset-password?token=\${token}\`,
            });
          }

          export async function resetPassword({ token, password }) {
            const passwordHash = await bcrypt.hash(password, 12);
            await withTransaction(async (client) => {
              const userId = await oneTime.consume(client, token, 'reset_password');
              if (!userId) throw new BadRequestError('Invalid or expired reset link');
              await client.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [
                userId,
                passwordHash,
              ]);
              await refreshTokens.revokeAllForUser(client, userId);
            });
          }

          export async function refresh(rawToken, meta) {
            const { user, refreshToken } = await refreshTokens.rotate(rawToken, meta);
            return { accessToken: signAccessToken(user), refreshToken };
          }

          export const logout = (rawToken) => refreshTokens.revokeFamilyOf(pool, rawToken);
          export const logoutAll = (userId) => refreshTokens.revokeAllForUser(pool, userId);
        `),
      },
    },
    {
      title: 'Cookies, controller and routes',
      bullets: [
        '`cookie-parser` (third-party) populates `req.cookies`.',
        'Cookie `Path=/api/v1/auth` → the refresh token is not sent with every API call, only to auth endpoints.',
        '`SameSite=Strict` + JSON-only bodies blocks CSRF on `/refresh` and `/logout`.',
        'Rate-limit with `express-rate-limit` (third-party); use a Redis store when you run several instances.',
      ],
      code: {
        id: 'p05-s7',
        title: 'auth.controller.js + auth.routes.js',
        language: 'javascript',
        code: dedent(`
          // auth.controller.js
          import * as auth from './auth.service.js';
          import { config } from '../../config.js';
          import { UnauthorizedError } from '../../errors.js';

          const COOKIE = 'rt';
          const cookieOptions = {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/v1/auth',
          };
          const meta = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });

          function setRefreshCookie(res, token) {
            res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
          }

          export async function register(req, res) {
            const user = await auth.register(req.valid.body);
            res.status(201).json({ data: user, message: 'Check your inbox to verify your email' });
          }

          export async function verifyEmail(req, res) {
            await auth.verifyEmail(req.valid.body.token);
            res.json({ message: 'Email verified' });
          }

          export async function login(req, res) {
            const { accessToken, refreshToken, user } = await auth.login(req.valid.body, meta(req));
            setRefreshCookie(res, refreshToken);
            res.json({ accessToken, user });
          }

          export async function refresh(req, res) {
            const raw = req.cookies?.[COOKIE];
            if (!raw) throw new UnauthorizedError('No refresh token');
            try {
              const { accessToken, refreshToken } = await auth.refresh(raw, meta(req));
              setRefreshCookie(res, refreshToken);
              res.json({ accessToken });
            } catch (err) {
              res.clearCookie(COOKIE, cookieOptions);
              throw err;
            }
          }

          export async function logout(req, res) {
            const raw = req.cookies?.[COOKIE];
            if (raw) await auth.logout(raw);
            res.clearCookie(COOKIE, cookieOptions).status(204).end();
          }

          export async function logoutAll(req, res) {
            await auth.logoutAll(req.user.id);
            res.clearCookie(COOKIE, cookieOptions).status(204).end();
          }

          export async function forgotPassword(req, res) {
            await auth.forgotPassword(req.valid.body.email);
            res.status(202).json({ message: 'If that account exists, a reset email is on its way' });
          }

          export async function resetPassword(req, res) {
            await auth.resetPassword(req.valid.body);
            res.clearCookie(COOKIE, cookieOptions).status(204).end();
          }

          // auth.routes.js
          import { Router } from 'express';
          import { rateLimit } from 'express-rate-limit';
          import { z } from 'zod';
          import { validate } from '../../middleware/validate.js';
          import { requireAuth } from '../../middleware/require-auth.js';

          const email = z.string().trim().toLowerCase().email().max(254);
          const password = z.string().min(8).max(64);
          const token = z.string().min(20).max(200);

          // one limiter per route so attempts on /login do not eat the /register budget
          const strictLimit = () =>
            rateLimit({
              windowMs: 15 * 60 * 1000,
              limit: 10,
              standardHeaders: 'draft-7',
              legacyHeaders: false,
              skip: () => config.NODE_ENV === 'test',
            });

          export const authRouter = Router();
          authRouter.post('/register', strictLimit(), validate({ body: z.object({ email, password }) }), register);
          authRouter.post('/verify-email', validate({ body: z.object({ token }) }), verifyEmail);
          authRouter.post('/resend-verification', strictLimit(), validate({ body: z.object({ email }) }), async (req, res) => {
            await auth.resendVerification(req.valid.body.email);
            res.status(202).json({ message: 'If needed, a new link was sent' });
          });
          authRouter.post('/login', strictLimit(), validate({ body: z.object({ email, password: z.string().max(64) }) }), login);
          authRouter.post('/refresh', refresh);
          authRouter.post('/logout', logout);
          authRouter.post('/logout-all', requireAuth, logoutAll);
          authRouter.post('/forgot-password', strictLimit(), validate({ body: z.object({ email }) }), forgotPassword);
          authRouter.post('/reset-password', validate({ body: z.object({ token, password }) }), resetPassword);
          authRouter.get('/me', requireAuth, (req, res) => res.json({ data: req.user }));
        `),
        versionNote: 'express-rate-limit v7+ (`limit`, named export `rateLimit`). Express 5 rethrown errors in async handlers reach the error middleware.',
      },
    },
    {
      title: 'Auth middleware and the mailer',
      bullets: [
        'The middleware only verifies the JWT — no DB call. Revocation therefore takes effect within 15 minutes; keep access TTL short.',
        'Distinguish `TokenExpiredError` (client should refresh) from other failures with an error code.',
        'Mailer in production: `nodemailer` or a provider SDK (third-party). In tests it records messages.',
      ],
      code: {
        id: 'p05-s8',
        title: 'middleware/require-auth.js + lib/mailer.js',
        language: 'javascript',
        code: dedent(`
          // middleware/require-auth.js
          import { verifyAccessToken } from '../lib/tokens.js';
          import { UnauthorizedError } from '../errors.js';

          export function requireAuth(req, res, next) {
            const header = req.get('authorization') ?? '';
            const token = header.startsWith('Bearer ') ? header.slice(7) : null;
            if (!token) return next(new UnauthorizedError('Missing access token'));
            try {
              const payload = verifyAccessToken(token);
              req.user = { id: payload.sub, role: payload.role };
              next();
            } catch (err) {
              const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
              next(new UnauthorizedError('Invalid access token', code));
            }
          }

          // lib/mailer.js
          import { config } from '../config.js';

          export const mailer = {
            sent: [],
            async send(message) {
              if (config.NODE_ENV === 'production') {
                // e.g. await transporter.sendMail({ from: config.MAIL_FROM, ...message }) with nodemailer
                throw new Error('Configure a real mail transport');
              }
              this.sent.push(message);
              if (config.NODE_ENV === 'development') console.log('[mail]', message.to, message.text);
            },
          };
        `),
      },
    },
  ],
  testing: {
    bullets: [
      'One end-to-end flow test with Supertest: register → read token from `mailer.sent` → verify → login → refresh → reuse old token.',
      'Assert cookie flags (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`).',
      'Edge cases: login before verification (403), wrong password (401, same message as unknown email), expired reset token, second use of a reset token.',
      'Fake time with `vi.useFakeTimers()` for JWT expiry, or sign test tokens with `expiresIn: -1`.',
    ],
    code: {
      id: 'p05-test',
      title: 'test/auth.flow.test.js (Vitest + Supertest)',
      language: 'javascript',
      code: dedent(`
        import { describe, it, expect, beforeEach, afterAll } from 'vitest';
        import request from 'supertest';
        import { app } from '../src/app.js';
        import { pool } from '../src/db/pool.js';
        import { mailer } from '../src/lib/mailer.js';

        const creds = { email: 'ada@test.dev', password: 'correct-horse-battery' };
        const tokenFromMail = () => new URL(mailer.sent.at(-1).text.match(/https?:\\/\\/\\S+/)[0]).searchParams.get('token');
        const refreshCookie = (res) => res.headers['set-cookie'].find((c) => c.startsWith('rt=')).split(';')[0];

        beforeEach(async () => {
          await pool.query('TRUNCATE users CASCADE');
          mailer.sent.length = 0;
        });
        afterAll(() => pool.end());

        async function registerAndVerify() {
          await request(app).post('/api/v1/auth/register').send(creds).expect(201);
          await request(app).post('/api/v1/auth/verify-email').send({ token: tokenFromMail() }).expect(200);
        }

        describe('auth flow', () => {
          it('blocks login until the email is verified', async () => {
            await request(app).post('/api/v1/auth/register').send(creds).expect(201);
            const res = await request(app).post('/api/v1/auth/login').send(creds);
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
          });

          it('logs in with a secure refresh cookie', async () => {
            await registerAndVerify();
            const res = await request(app).post('/api/v1/auth/login').send(creds).expect(200);
            expect(res.body.accessToken).toBeTypeOf('string');
            const cookie = res.headers['set-cookie'][0];
            expect(cookie).toMatch(/HttpOnly/);
            expect(cookie).toMatch(/SameSite=Strict/);
            expect(cookie).toMatch(/Path=\\/api\\/v1\\/auth/);

            const me = await request(app).get('/api/v1/auth/me').set('Authorization', \`Bearer \${res.body.accessToken}\`);
            expect(me.status).toBe(200);
          });

          it('rotates refresh tokens and revokes the family on reuse', async () => {
            await registerAndVerify();
            const login = await request(app).post('/api/v1/auth/login').send(creds);
            const first = refreshCookie(login);

            const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
            const second = refreshCookie(r1);
            expect(second).not.toBe(first);

            // attacker replays the old token
            await request(app).post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
            // the legitimate (newer) token is now revoked too
            await request(app).post('/api/v1/auth/refresh').set('Cookie', second).expect(401);
          });

          it('resets the password once and revokes sessions', async () => {
            await registerAndVerify();
            const login = await request(app).post('/api/v1/auth/login').send(creds);
            await request(app).post('/api/v1/auth/forgot-password').send({ email: creds.email }).expect(202);
            const token = tokenFromMail();

            await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'new-password-123' }).expect(204);
            await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'again-123456' }).expect(400);
            await request(app).post('/api/v1/auth/refresh').set('Cookie', refreshCookie(login)).expect(401);
            await request(app).post('/api/v1/auth/login').send({ ...creds, password: 'new-password-123' }).expect(200);
          });

          it('does not reveal whether an email exists', async () => {
            const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.dev' });
            expect(res.status).toBe(202);
            expect(mailer.sent).toHaveLength(0);
          });
        });
      `),
    },
  },
  security: [
    'bcrypt cost 12 (≈250 ms) — re-evaluate yearly; consider Argon2id (`argon2` package) for new systems.',
    'Never store raw refresh/verification/reset tokens — only SHA-256 hashes; never log them.',
    'Refresh token in `HttpOnly` cookie (not localStorage) → not readable by XSS. Access token kept in memory on the client.',
    'Reuse detection on rotation turns a stolen refresh token into a forced logout for the attacker and victim.',
    'No user enumeration: same message for wrong password/unknown email; forgot/resend always `202`.',
    'Rate limit login/register/forgot; add account-level throttling (failed attempts per email) for distributed brute force.',
    'Separate secrets for access tokens and anything else; rotate with a `kid` header if you need zero-downtime key rotation.',
    'Password reset revokes all sessions; consider notifying the user by email when the password changes.',
    'Behind a proxy set `app.set(\'trust proxy\', 1)` so `req.ip` (rate limiting, audit) is the real client IP.',
  ],
  deployment: {
    bullets: [
      'Secrets (`JWT_ACCESS_SECRET`, DB password, SMTP key) come from the platform secret store, never the image.',
      'HTTPS only in production — the `Secure` cookie flag is enforced when `NODE_ENV=production`.',
      'Nightly cleanup job: `DELETE FROM refresh_tokens WHERE expires_at < now() - interval \'7 days\'` and the same for `one_time_tokens`.',
    ],
    code: {
      id: 'p05-deploy',
      title: 'Dockerfile',
      language: 'dockerfile',
      code: dedent(`
        FROM node:22-alpine AS deps
        WORKDIR /app
        COPY package.json package-lock.json ./
        # bcrypt ships prebuilt binaries; build tools are only needed if none match
        RUN npm ci --omit=dev

        FROM node:22-alpine
        WORKDIR /app
        ENV NODE_ENV=production
        COPY --from=deps /app/node_modules ./node_modules
        COPY package.json ./
        COPY src ./src
        USER node
        EXPOSE 3000
        CMD ["node", "src/server.js"]
      `),
    },
  },
  extensions: [
    'Absolute session lifetime (e.g. 90 days) independent of rotation.',
    '"Active sessions" page listing refresh families with user agent/IP and per-session revoke.',
    'TOTP two-factor auth (`otpauth` URI + QR code) with recovery codes.',
    'OAuth login with Google/GitHub (authorization code + PKCE) linked to existing accounts.',
    'Asymmetric JWT (RS256/EdDSA) + JWKS endpoint so other services verify tokens without the secret.',
    'Breached-password check against the HaveIBeenPwned k-anonymity API.',
  ],
};

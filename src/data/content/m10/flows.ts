import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'password-reset': {
    summary: 'A secure password reset emails a single-use, short-lived, high-entropy token; the server stores only its hash, never reveals whether the account exists, and revokes existing sessions after the change.',
    topics: ['password reset', 'reset token', 'crypto.randomBytes', 'hashed token', 'single use', 'expiry', 'user enumeration', 'session revocation', 'rate limiting'],
    sections: [
      section('introduction', undefined,
        text('"Forgot password" is an alternative login path. If it is weaker than your login, attackers will use it instead.'),
      ),
      section('definition', 'Requirements',
        table('Secure reset checklist', ['Requirement', 'Why'], [
          ['Token from `crypto.randomBytes(32)`', 'Unguessable (256 bits); never `Math.random()` or sequential ids'],
          ['Store `SHA-256(token)` only', 'A DB leak cannot be used to reset accounts'],
          ['Short expiry (15–60 min)', 'Limits the window if an email is intercepted'],
          ['Single use', 'Mark used / delete on success; invalidate older tokens'],
          ['Same response whether or not the email exists', 'Prevents user enumeration'],
          ['Rate limit per IP and per email', 'Stops email bombing and token brute force'],
          ['Revoke sessions/refresh tokens after reset', 'Kicks out an attacker who had access'],
          ['Notify the user of the change', 'Detects unauthorized resets'],
        ]),
      ),
      section('why', 'Why each step matters',
        bullets(
          'Reset links are effectively passwords sent by email — treat them like credentials.',
          'Telling the user "no account with that email" lets attackers build lists of valid emails for credential stuffing.',
          'Building the reset link from the request `Host` header enables host-header poisoning: the email points to the attacker\'s domain. Use a configured base URL.',
        ),
      ),
      section('internals', 'The flow',
        flow([
          'POST /auth/forgot { email }',
          'Always respond 202 with the same message',
          'If user exists: create token, store hash + expiry, email link',
          'User opens https://app/reset?token=...',
          'POST /auth/reset { token, newPassword }',
          'Hash token → lookup unused, unexpired → set password, mark used, revoke sessions',
        ], { direction: 'vertical' }),
      ),
      section('example', 'Reset endpoints',
        code({
          title: 'auth/passwordReset.js',
          code: dedent(`
            const crypto = require('node:crypto');
            const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
            const APP_URL = process.env.APP_URL; // e.g. https://app.example.com — never req.get('host')

            router.post('/auth/forgot', forgotLimiter, async (req, res) => {
              const email = String(req.body.email ?? '').trim().toLowerCase();
              const user = await users.findByEmail(email);
              if (user) {
                const token = crypto.randomBytes(32).toString('base64url');
                await resetTokens.invalidateAllFor(user.id);
                await resetTokens.insert({ userId: user.id, hash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
                queue.add('email', { to: user.email, template: 'reset', link: APP_URL + '/reset?token=' + token }); // async: same latency
              }
              res.status(202).json({ message: 'If an account exists for that email, a reset link has been sent.' });
            });

            router.post('/auth/reset', resetLimiter, validate({ body: resetSchema }), async (req, res) => {
              const row = await resetTokens.consume(sha256(req.body.token)); // UPDATE ... SET used_at=now() WHERE hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING *
              if (!row) return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_TOKEN' } });
              await users.setPasswordHash(row.userId, await argon2.hash(req.body.newPassword));
              await sessions.revokeAllFor(row.userId);
              await refreshTokens.revokeAllFor(row.userId);
              queue.add('email', { userId: row.userId, template: 'password-changed' });
              res.sendStatus(204);
            });
          `),
          explanation: [
            'The email is enqueued, so response time does not reveal whether the user exists.',
            '`consume` atomically checks unused + unexpired and marks it used — no double use.',
            'All sessions and refresh tokens are revoked after the change.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /auth/forgot HTTP/1.1\nContent-Type: application/json\n\n{"email":"ada@example.com"}\n\nPOST /auth/forgot HTTP/1.1\nContent-Type: application/json\n\n{"email":"nobody@example.com"}\n\nPOST /auth/reset HTTP/1.1\nContent-Type: application/json\n\n{"token":"<from email>","newPassword":"a new long passphrase"}\n\nPOST /auth/reset HTTP/1.1\nContent-Type: application/json\n\n{"token":"<same token again>","newPassword":"another one"}',
          expectedOutput: 'HTTP/1.1 202 Accepted\n{"message":"If an account exists for that email, a reset link has been sent."}\n\nHTTP/1.1 202 Accepted\n{"message":"If an account exists for that email, a reset link has been sent."}\n\nHTTP/1.1 204 No Content\n\nHTTP/1.1 400 Bad Request\n{"error":{"code":"INVALID_OR_EXPIRED_TOKEN"}}',
          explanation: ['Identical responses for existing and unknown emails; the second reset fails because the token is single-use.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'The reset page should not leak the token via `Referer` to third-party scripts: set `Referrer-Policy: no-referrer` and avoid analytics on it.',
          'Consider requiring MFA (if enrolled) before allowing the reset.',
          'Log reset events for security monitoring.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ reveals existence, guessable token, stored in plaintext, no expiry
            if (!user) return res.status(404).json({ error: 'No account with that email' });
            const token = String(Math.floor(Math.random() * 1e6));
            await db.update('users', { resetToken: token });

            // ✓
            const token = crypto.randomBytes(32).toString('base64url');
            await resetTokens.insert({ userId: user.id, hash: sha256(token), expiresAt: inThirtyMinutes() });
            res.status(202).json({ message: GENERIC_MESSAGE });
          `),
        }),
        bullets(
          'Logging users in automatically after reset without revoking old sessions.',
          'Reset link built from the `Host` header.',
          'JWT reset tokens that cannot be invalidated after use.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Walk through the checklist: random token, hashed at rest, short expiry, single use, generic response, rate limits, revoke sessions, notify. Mention host-header poisoning for extra credit.'),
      ),
      section('practice', 'Practice',
        text('Write a test that measures response times for `/auth/forgot` with existing and non-existing emails over 50 requests and asserts the medians are within a few milliseconds.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Random 256-bit token; store only its hash.',
          '15–60 minute expiry; single use; invalidate older tokens.',
          'Generic response; queue emails.',
          'Revoke sessions and notify after reset.',
        ),
      ),
    ],
    revisionNotes: [
      'Token: `crypto.randomBytes(32)`; store SHA-256 hash; 15–60 min; single use.',
      'Same response (and timing) for unknown emails → no enumeration.',
      'Atomic consume: `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`.',
      'After reset: revoke sessions + refresh tokens, email "password changed".',
      'Build links from configured APP_URL, not `Host` header.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: '`/auth/forgot` returns 404 "No account with that email" for unknown addresses. What is the problem?',
        options: [
          'Nothing — it is helpful UX',
          'User enumeration: attackers learn which emails are registered',
          'It should return 500',
          'It breaks password hashing',
        ],
        answer: 1,
        explanation: 'Return the same message and status for both cases (and keep timing similar).',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why store only a hash of the reset token?',
        options: [
          'Hashes are shorter',
          'If the database leaks, attackers cannot use the stored values to reset passwords',
          'Email providers require it',
          'To allow multiple uses',
        ],
        answer: 1,
        explanation: 'Same principle as refresh tokens: the plaintext exists only in the user\'s email.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Password reset',
        question: 'Design a secure "forgot password" flow for an Express API.',
        shortAnswer: 'Accept an email, always respond with the same generic message, and if the user exists email a link with a 256-bit random single-use token whose hash and short expiry are stored; on reset, atomically consume the token, set the new password hash, revoke all sessions and notify the user.',
        detailedAnswer: [
          'Token from `crypto.randomBytes(32)`; store SHA-256 + expiry (15–60 min).',
          'Queue email sending to keep timing constant.',
          'Rate limit by IP and email.',
          'Consume atomically; invalidate older tokens.',
          'Revoke refresh tokens/sessions; send "password changed" email.',
          'Use a configured base URL for links (host header poisoning).',
        ],
        followUp: 'How would you add MFA to the reset flow?',
        trap: 'Using a JWT as the reset token without a way to make it single-use.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Host header poisoning',
        question: 'How can a password reset email be hijacked through the Host header, and how do you prevent it?',
        shortAnswer: 'If the server builds the reset link from the incoming `Host` (or `X-Forwarded-Host`) header, an attacker can request a reset for the victim with a forged host so the emailed link points to the attacker\'s domain and leaks the token when clicked; build links from a configured base URL instead.',
        detailedAnswer: [
          'Express `req.hostname` honours `X-Forwarded-Host` when `trust proxy` is on — attacker-controllable if misconfigured.',
          'The victim clicks a genuine-looking email; the token goes to the attacker\'s server.',
          'Fix: `APP_URL` from config; validate allowed hosts at the proxy.',
          'Also set `Referrer-Policy` on reset pages to avoid leaking tokens to third parties.',
        ],
        followUp: 'Which other features build absolute URLs from requests?',
        trap: 'Assuming the Host header is always trustworthy because the browser sets it.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'email-verification': {
    summary: 'Email verification proves a user controls an address by sending a single-use, expiring token (or short code) and marking `emailVerified` only after it is redeemed — and gating sensitive actions on that flag.',
    topics: ['email verification', 'verification token', 'emailVerified', 'resend limits', 'email change', 'signed tokens', 'magic links'],
    sections: [
      section('introduction', undefined,
        text('Anyone can type any email at signup. Verification stops impersonation, typos and fake accounts from receiving trusted status.'),
      ),
      section('definition', 'Definition',
        bullets(
          'At signup or email change, generate a random token and email a link: `/verify-email?token=...`.',
          'Store its hash, purpose (`verify:email`), target email and expiry (e.g. 24 h).',
          'On redemption: check, mark user `emailVerified = true` (for that specific email), delete the token.',
          'Alternative: 6-digit code with strict attempt limits (better on mobile).',
        ),
        table('Token vs code', ['', 'Link token', '6-digit code'], [
          ['Entropy', '256 bits', '~20 bits'],
          ['Brute-force protection', 'Not needed', 'Must limit attempts (e.g. 5) and expire fast (10 min)'],
          ['UX', 'Click', 'Type'],
        ]),
      ),
      section('why', 'Why verify',
        bullets(
          'Password resets go to the address — it must belong to the user.',
          'Prevents an attacker pre-registering a victim\'s email ("pre-account takeover") and later sharing the account.',
          'OIDC account linking should rely only on verified emails.',
          'Reduces spam/abuse and bounce rates.',
        ),
      ),
      section('internals', 'Email change flow',
        steps(
          'User requests change to `new@example.com` (require recent password/MFA).',
          'Keep the old email active; store `pendingEmail` and send a token to the **new** address.',
          'Optionally notify the **old** address with a "this wasn\'t me" link.',
          'On redemption, swap emails atomically and mark verified.',
        ),
      ),
      section('example', 'Verification endpoints',
        code({
          title: 'auth/emailVerification.js',
          code: dedent(`
            const crypto = require('node:crypto');
            const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

            async function sendVerification(user) {
              const token = crypto.randomBytes(32).toString('base64url');
              await tokens.insert({ hash: sha256(token), userId: user.id, purpose: 'verify:email', email: user.email,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
              await mailer.send(user.email, 'Verify your email', process.env.APP_URL + '/verify-email?token=' + token);
            }

            router.post('/auth/verify-email', async (req, res) => {
              const row = await tokens.consume(sha256(String(req.body.token ?? '')), 'verify:email');
              if (!row) return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_TOKEN' } });
              const updated = await users.markEmailVerified(row.userId, row.email); // only if email unchanged
              if (!updated) return res.status(409).json({ error: { code: 'EMAIL_CHANGED' } });
              res.json({ emailVerified: true });
            });

            router.post('/auth/verify-email/resend', requireAuth, resendLimiter, async (req, res) => {
              const user = await users.findById(req.user.id);
              if (!user.emailVerified) await sendVerification(user);
              res.sendStatus(202);
            });

            const requireVerifiedEmail = (req, res, next) =>
              req.user.emailVerified ? next() : res.status(403).json({ error: { code: 'EMAIL_NOT_VERIFIED' } });
          `),
          explanation: [
            'The verification page in the browser POSTs the token — a GET that changes state can be triggered by link scanners/prefetchers in email clients.',
            'Binding the token to the email prevents verifying an address the user has since changed.',
            '`requireVerifiedEmail` gates actions like inviting teammates or payouts.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /auth/verify-email HTTP/1.1\nContent-Type: application/json\n\n{"token":"pVq0...from-email"}\n\nPOST /auth/verify-email HTTP/1.1\nContent-Type: application/json\n\n{"token":"pVq0...from-email"}\n\nPOST /teams/invite HTTP/1.1\nAuthorization: Bearer <unverified user>',
          expectedOutput: 'HTTP/1.1 200 OK\n{"emailVerified":true}\n\nHTTP/1.1 400 Bad Request\n{"error":{"code":"INVALID_OR_EXPIRED_TOKEN"}}\n\nHTTP/1.1 403 Forbidden\n{"error":{"code":"EMAIL_NOT_VERIFIED"}}',
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Email security scanners click links — make GET links show a page that POSTs (or require a button click).',
          'Rate-limit resends (e.g. 3/hour) to avoid email bombing and provider reputation damage.',
          'Clean up unverified accounts after N days, and do not let an unverified signup block the real owner from registering.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: verification by GET with side effects',
          code: dedent(`
            // ✗ link scanners and prefetchers verify the account automatically
            app.get('/verify-email', async (req, res) => { await verify(req.query.token); res.redirect('/'); });

            // ✓ GET renders a page; the page POSTs the token
            app.get('/verify-email', (req, res) => res.sendFile(verifyPage));
            app.post('/auth/verify-email', verifyHandler);
          `),
        }),
        bullets(
          'Never-expiring verification tokens.',
          'Switching the account email before the new address is verified.',
          'Letting unverified emails be used for login linking or password resets of existing accounts.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Cover token properties (random, hashed, expiring, single-use), the email-change flow, and the prefetch/scanner gotcha with GET links.'),
      ),
      section('practice', 'Practice',
        text('Implement the 6-digit code variant: store a hash of the code, expire in 10 minutes, allow 5 attempts, then require a resend. Use `crypto.randomInt(0, 1_000_000)` and pad to 6 digits.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Random token, hashed, 24 h, single-use, bound to the specific email.',
          'Gate sensitive actions on `emailVerified`.',
          'Email change: verify new address before switching; notify old.',
          'Rate-limit resends; avoid side-effecting GETs.',
        ),
      ),
    ],
    revisionNotes: [
      'Verification token: randomBytes(32), store hash + purpose + email + expiry.',
      'Codes (6 digits) need attempt limits; `crypto.randomInt` for generation.',
      'Do state changes via POST — email scanners prefetch GET links.',
      'Email change: pending email verified before swap; alert old address.',
      'Only verified emails for account linking and resets.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Users report their accounts become "verified" even though they never clicked the link. The link is `GET /verify?token=...` which verifies immediately. Likely cause?',
        options: [
          'Token collisions',
          'Email security scanners or link prefetchers fetched the GET URL',
          'The token was too long',
          'The SMTP server verified it',
        ],
        answer: 1,
        explanation: 'GET requests must be safe. Render a page and verify via POST (button or auto-submit after user interaction).',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'What extra protection does a 6-digit verification code need that a 256-bit link token does not?',
        options: ['HTTPS', 'Attempt limiting and short expiry, because only 1,000,000 values exist', 'Hashing', 'A database index'],
        answer: 1,
        explanation: 'A 6-digit code is brute-forceable without attempt limits. HTTPS and hashing apply to both.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Email verification',
        question: 'Why do applications verify email addresses, and what should the verification token look like?',
        shortAnswer: 'To prove the user controls the address before trusting it for resets, notifications or account linking; the token should be random (e.g. 32 bytes), stored hashed, expiring and single-use.',
        detailedAnswer: [
          'Prevents typos and impersonation.',
          'Blocks pre-account takeover via someone else\'s email.',
          'Token bound to user id, purpose and the specific email.',
          'Gate sensitive features until verified.',
        ],
        followUp: 'How do you handle a user changing their email?',
        trap: 'Using the user id or a predictable value as the token.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Pre-account takeover',
        question: 'What is a pre-account takeover attack and how do email verification and identity linking rules prevent it?',
        shortAnswer: 'An attacker registers an account with the victim\'s email before the victim does (e.g. with a password), then when the victim later signs in via SSO or resets, the accounts merge and the attacker retains access; prevent it by not granting trust or auto-linking until the email is verified, and by revoking attacker-set credentials when the real owner verifies.',
        detailedAnswer: [
          'Classic variant: attacker signs up with password, victim later uses "Sign in with Google" and the app links by email.',
          'Fix: unverified accounts cannot be linked to SSO identities; on verification by the real owner, reset the password and sessions.',
          'Link OIDC identities by `iss`+`sub`; email linking only if both sides are verified.',
          'Expire unverified accounts.',
        ],
        followUp: 'How would you design account linking between password and social logins?',
        trap: 'Assuming SSO providers guarantee the local account belongs to the same person.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'secure-logout': {
    summary: 'Secure logout invalidates credentials on the server — destroy the session or revoke the refresh token family, optionally denylist the access token\'s `jti` until it expires — and clears cookies with matching attributes.',
    topics: ['logout', 'session destroy', 'refresh token revocation', 'JWT denylist', 'jti', 'Redis TTL', 'tokensValidAfter', 'clearCookie', 'Clear-Site-Data', 'logout everywhere'],
    sections: [
      section('introduction', undefined,
        text('Deleting a token in the browser is not logout. If the server still accepts it, anyone who copied it is still logged in.'),
      ),
      section('definition', 'What logout must do',
        table('Logout by auth type', ['Auth type', 'Server action', 'Client action'], [
          ['Session cookie', '`req.session.destroy()` (delete from store)', 'Clear cookie'],
          ['Access JWT + refresh token', 'Revoke refresh token family; optionally denylist access `jti` until `exp`', 'Drop tokens from memory, clear refresh cookie'],
          ['"Log out everywhere"', 'Revoke all sessions/refresh tokens; set `tokensValidAfter = now`', '—'],
          ['OIDC SSO', 'Local logout + optional RP-initiated logout at the provider', 'Redirect to `end_session_endpoint`'],
        ]),
      ),
      section('why', 'Why server-side invalidation',
        bullets(
          'Stolen tokens (malware, shared computers, logs) must stop working.',
          'Users expect "log out" on a public computer to be final.',
          'Compliance often requires session termination on password change or account disable.',
        ),
      ),
      section('internals', 'JWT denylist with Redis',
        steps(
          'Each access token carries a unique `jti`.',
          'On logout, store `deny:<jti>` in Redis with TTL = `exp - now` seconds (it disappears when the token would anyway).',
          'Auth middleware checks `EXISTS deny:<jti>` after verification.',
          'Cheaper alternative for "everywhere": per-user `tokensValidAfter`; reject tokens with `iat` < that timestamp.',
        ),
        diagram('jwt-flow', 'Logout cuts the refresh path; the denylist covers the remaining access-token lifetime.'),
      ),
      section('example', 'Logout endpoints',
        code({
          title: 'auth/logout.js',
          code: dedent(`
            const REFRESH_COOKIE = { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' };

            router.post('/auth/logout', requireAuth, async (req, res) => {
              const rt = req.cookies.rt;
              if (rt) await refreshTokens.revokeFamilyByToken(sha256(rt));

              const ttl = req.auth.exp - Math.floor(Date.now() / 1000);       // seconds left
              if (ttl > 0) await redis.set('deny:' + req.auth.jti, '1', { EX: ttl });

              res.clearCookie('rt', REFRESH_COOKIE);                           // same path/flags as when set
              res.set('Clear-Site-Data', '"cookies", "storage"');
              res.sendStatus(204);
            });

            router.post('/auth/logout-all', requireAuth, async (req, res) => {
              await users.setTokensValidAfter(req.user.id, Math.floor(Date.now() / 1000));
              await refreshTokens.revokeAllFor(req.user.id);
              res.clearCookie('rt', REFRESH_COOKIE);
              res.sendStatus(204);
            });

            // inside requireAuth, after jwt.verify(...)
            async function checkRevocation(claims) {
              if (await redis.exists('deny:' + claims.jti)) throw new UnauthorizedError('Token revoked');
              const validAfter = await users.getTokensValidAfterCached(claims.sub);
              if (claims.iat < validAfter) throw new UnauthorizedError('Token revoked');
            }
          `),
          explanation: [
            '`req.auth` holds the verified claims (set by requireAuth).',
            'Redis TTL keeps the denylist small — entries expire with the tokens.',
            '`Clear-Site-Data` asks the browser to wipe cookies/storage for the origin (HTTPS only).',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /auth/logout HTTP/1.1\nAuthorization: Bearer <access jti=a1>\nCookie: rt=RT7\n\nGET /api/me HTTP/1.1\nAuthorization: Bearer <access jti=a1>\n\nPOST /auth/refresh HTTP/1.1\nCookie: rt=RT7',
          expectedOutput: 'HTTP/1.1 204 No Content\nSet-Cookie: rt=; Path=/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict\nClear-Site-Data: "cookies", "storage"\n\nHTTP/1.1 401 Unauthorized\n{"error":{"code":"UNAUTHORIZED","message":"Token revoked"}}\n\nHTTP/1.1 401 Unauthorized\n{"error":{"code":"UNAUTHORIZED","message":"Invalid refresh token"}}',
          explanation: ['Both the old access token and the refresh token stop working immediately — even if an attacker copied them.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Trigger "log out everywhere" automatically on password change, MFA reset and account disable.',
          'Idle and absolute timeouts are automatic logouts — implement them too.',
          'If you skip the access-token denylist, document that logout takes up to the access-token lifetime (keep it ≤ 5–15 min).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ client-only logout: token still valid on the server
            localStorage.removeItem('token');

            // ✗ clearCookie with a different path → cookie stays
            res.clearCookie('rt');                           // was set with path: '/auth'

            // ✓
            await refreshTokens.revokeFamilyByToken(sha256(req.cookies.rt));
            res.clearCookie('rt', { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' });
          `),
        }),
        bullets(
          'Logout via GET — can be triggered cross-site (logout CSRF) and by prefetchers. Use POST.',
          'Denylist entries without TTL — Redis grows forever.',
          'Forgetting to destroy the session in the store (only clearing the cookie).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('The key question: "how do you log out with JWTs?" Answer: revoke the refresh token, keep access tokens short, and if you need immediacy, a jti denylist with TTL or a per-user tokensValidAfter.'),
      ),
      section('practice', 'Practice',
        text('Implement `tokensValidAfter` with a 30-second in-memory cache per user and measure the added latency to `requireAuth`. Write a test: logout-all → old token returns 401.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Logout is a server-side action.',
          'Sessions: destroy. JWT: revoke refresh + optional jti denylist (TTL) or tokensValidAfter.',
          'Clear cookies with identical attributes; use POST.',
          'Log out everywhere on password change.',
        ),
      ),
    ],
    revisionNotes: [
      'Client-side deletion ≠ logout; revoke on the server.',
      'JWT logout: revoke refresh family; denylist `jti` in Redis with TTL = exp − now.',
      '"Logout everywhere": per-user `tokensValidAfter`, reject `iat` older.',
      '`res.clearCookie` must match path/domain/flags used to set.',
      'Logout via POST; `Clear-Site-Data` header wipes browser state.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What TTL should a Redis denylist entry for a revoked access token have?',
        options: ['Forever', 'The remaining lifetime of the token (exp − now)', 'One second', 'The refresh token lifetime'],
        answer: 1,
        explanation: 'After `exp`, verification rejects the token anyway, so keeping the entry longer only wastes memory.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'After logout, the refresh cookie still appears in the browser. Why?',
        code: "res.cookie('rt', token, { httpOnly: true, secure: true, path: '/auth' });\n// later, on logout:\nres.clearCookie('rt');",
        options: [
          'clearCookie only works on signed cookies',
          'The cookie was set with Path=/auth but cleared with the default Path=/, so the browser treats it as a different cookie',
          'HttpOnly cookies cannot be cleared',
          'clearCookie needs maxAge',
        ],
        answer: 1,
        explanation: 'A cookie is identified by name + domain + path. Pass the same options to `clearCookie`.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Logout',
        question: 'How do you implement logout when using JWT access tokens?',
        shortAnswer: 'Revoke the refresh token server-side and clear its cookie so no new access tokens can be minted; keep access tokens short-lived, and for immediate effect add a denylist of the token\'s `jti` (with TTL until `exp`) or a per-user `tokensValidAfter` check.',
        detailedAnswer: [
          'Stateless JWTs stay valid until `exp` unless the server checks something.',
          'Refresh revocation stops the session within one access-token lifetime.',
          'Denylist: Redis `SET deny:<jti> 1 EX <ttl>`, checked in auth middleware.',
          '`tokensValidAfter`: one timestamp per user, great for "log out everywhere".',
          'Client also drops tokens from memory.',
        ],
        followUp: 'Does adding a denylist make JWTs stateful? Is that a problem?',
        trap: 'Saying deleting the token from localStorage is sufficient.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Revocation at scale',
        question: 'Compare a per-token jti denylist with a per-user tokensValidAfter timestamp for JWT revocation.',
        shortAnswer: 'A jti denylist revokes individual tokens (single-device logout) and stays small thanks to TTLs; a tokensValidAfter timestamp revokes all of a user\'s tokens at once (logout everywhere, password change) with one value per user — many systems use both, cached close to the API.',
        detailedAnswer: [
          'jti denylist: needs `jti` in every token; one Redis lookup per request.',
          'tokensValidAfter: compare `iat` with a cached per-user timestamp; coarse but cheap.',
          'Caching (e.g. 30 s) trades revocation latency for fewer lookups.',
          'Both reintroduce some state — acceptable; the main JWT benefit (no DB join per request) mostly remains.',
          'For strict needs, opaque tokens + introspection may be simpler.',
        ],
        followUp: 'How would this work across multiple regions?',
        trap: 'Rotating the global signing key to revoke one user — that logs out everyone.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'token-expiration': {
    summary: 'Token expiration strategy balances security and UX: short access tokens, longer refresh tokens with sliding (idle) and absolute limits, small clock-skew tolerance, and clients that refresh proactively or on 401.',
    topics: ['exp', 'iat', 'nbf', 'expiresIn', 'clock skew', 'clockTolerance', 'sliding expiration', 'absolute expiration', 'idle timeout', 'proactive refresh', 'maxAge'],
    sections: [
      section('introduction', undefined,
        text('Every credential should die. The question is when, and what happens to the user when it does.'),
      ),
      section('definition', 'Expiration strategies',
        table('Typical lifetimes', ['Credential', 'Lifetime', 'Notes'], [
          ['Access token', '5–15 min', 'Short: limits stolen-token window'],
          ['Refresh token (idle/sliding)', '7–30 days since last use', 'Renewed on each rotation'],
          ['Refresh / session (absolute)', '30–90 days since login', 'Forces re-authentication eventually'],
          ['Session idle timeout', '15–60 min (higher-risk apps shorter)', '`rolling` sessions'],
          ['Password reset token', '15–60 min', 'Single use'],
          ['Email verification token', '24–72 h', 'Single use'],
        ]),
        table('Sliding vs absolute', ['', 'Sliding (idle)', 'Absolute'], [
          ['Measured from', 'Last activity', 'Original login'],
          ['Effect', 'Active users stay logged in', 'Everyone re-logs eventually'],
          ['Risk alone', 'A stolen, regularly used token lives forever', 'Users logged out mid-work'],
          ['Use', 'Together: `min(lastUse + idle, loginAt + absolute)`', ''],
        ]),
      ),
      section('why', 'Why both limits',
        bullets(
          'Sliding expiry alone means an attacker who keeps using a stolen refresh token never loses it.',
          'Absolute expiry alone annoys active users.',
          'Combining them bounds every session.',
        ),
      ),
      section('internals', 'Time claims and clock skew',
        steps(
          'JWT `exp`, `iat`, `nbf` are **seconds** since the Unix epoch (not milliseconds).',
          'Verification compares with the server clock; servers can disagree by a few seconds.',
          'Allow a small `clockTolerance` (e.g. 5–30 s) — not minutes.',
          'Run NTP on servers; never trust the client clock for expiry decisions.',
        ),
      ),
      section('example', 'Computing expiry correctly',
        code({
          title: 'Sliding + absolute refresh expiry (pure JS)',
          runnable: true,
          code: dedent(`
            const DAY = 24 * 60 * 60 * 1000;
            const IDLE = 14 * DAY;
            const ABSOLUTE = 30 * DAY;

            function refreshExpiry(loginAt, now) {
              return new Date(Math.min(now + IDLE, loginAt + ABSOLUTE));
            }

            const loginAt = Date.UTC(2026, 0, 1);              // 2026-01-01
            console.log(refreshExpiry(loginAt, loginAt).toISOString());
            console.log(refreshExpiry(loginAt, loginAt + 10 * DAY).toISOString());
            console.log(refreshExpiry(loginAt, loginAt + 25 * DAY).toISOString());

            // JWT exp is in SECONDS
            const iat = Math.floor(loginAt / 1000);
            const exp = iat + 15 * 60;
            console.log(exp - iat, new Date(exp * 1000).toISOString());
          `),
          expectedOutput: '2026-01-15T00:00:00.000Z\n2026-01-25T00:00:00.000Z\n2026-01-31T00:00:00.000Z\n900 2026-01-01T00:15:00.000Z',
          explanation: [
            'Each refresh pushes the idle expiry forward 14 days…',
            '…but never beyond 30 days after login (third line is capped at Jan 31).',
            'A 15-minute JWT has `exp - iat = 900` seconds — multiply by 1000 only when converting to a JS Date.',
          ],
        }),
        code({
          title: 'Client: proactive refresh + retry on 401',
          code: dedent(`
            let accessToken = null;
            let expiresAt = 0;
            let refreshing = null;

            async function getToken() {
              if (Date.now() < expiresAt - 30_000) return accessToken;          // refresh 30 s early
              refreshing ??= fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
                .then((r) => (r.ok ? r.json() : Promise.reject(new Error('login required'))))
                .then((t) => { accessToken = t.accessToken; expiresAt = Date.now() + t.expiresIn * 1000; return accessToken; })
                .finally(() => { refreshing = null; });
              return refreshing;
            }

            async function api(path, init = {}) {
              let res = await fetch(path, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + (await getToken()) } });
              if (res.status === 401) {                                          // e.g. clock drift or revoked
                expiresAt = 0;
                res = await fetch(path, { ...init, headers: { ...init.headers, Authorization: 'Bearer ' + (await getToken()) } });
              }
              return res;
            }
          `),
          explanation: [
            'One shared `refreshing` promise prevents parallel refreshes (which would trigger reuse detection with rotation).',
            'Expiry tracking uses the server-provided `expiresIn`, not the client clock against `exp`.',
            'Retry once only, to avoid loops.',
          ],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'High-risk actions (payments, changing email) can require a fresh login (`auth_time` within 5 min) — "step-up" authentication.',
          'Mobile apps tolerate longer refresh lifetimes with device binding; banking apps use shorter idle timeouts.',
          'Monitor 401 TOKEN_EXPIRED rates: spikes may indicate clock drift.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: units',
          code: dedent(`
            // ✗ exp in milliseconds → token valid for ~50,000 years
            jwt.sign({ sub: '1', exp: Date.now() + 15 * 60 * 1000 }, secret);

            // ✓ seconds — or let the library do it
            jwt.sign({ sub: '1' }, secret, { expiresIn: '15m' });
          `),
        }),
        bullets(
          'Huge `clockTolerance` (e.g. 1 hour) that silently extends every token.',
          'No absolute session limit.',
          'Express cookie `maxAge` in seconds instead of ms (cookie dies too early).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Give concrete numbers (15 min access, 14 d idle, 30–90 d absolute), explain sliding vs absolute, and mention clock skew and the seconds-vs-milliseconds trap.'),
      ),
      section('practice', 'Practice',
        text('Add `auth_time` to your tokens and write a `requireRecentAuth(maxAgeSeconds)` middleware that returns 401 `REAUTH_REQUIRED` for sensitive routes when the login is older than the limit.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Short access tokens, rotating refresh tokens.',
          'Combine sliding (idle) and absolute limits.',
          'JWT times are seconds; small clock tolerance.',
          'Clients refresh proactively with a single in-flight refresh.',
        ),
      ),
    ],
    revisionNotes: [
      'Access 5–15 min; refresh idle 7–30 d; absolute 30–90 d.',
      'Effective expiry = min(lastUse + idle, loginAt + absolute).',
      'JWT `exp/iat/nbf` are seconds; JS `Date.now()` is ms.',
      '`clockTolerance` a few seconds; NTP on servers.',
      'Single in-flight refresh on the client avoids rotation reuse false positives.',
      'Step-up auth via `auth_time` for sensitive actions.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Tokens never seem to expire. Why?',
        code: "const token = jwt.sign({ sub: user.id, exp: Date.now() + 15 * 60 * 1000 }, SECRET);",
        options: [
          'exp must be a string',
          '`exp` is interpreted as seconds; Date.now() is milliseconds, so expiry is ~50,000 years away',
          'jwt.sign ignores exp',
          'SECRET is too short',
        ],
        answer: 1,
        explanation: 'Use `Math.floor(Date.now() / 1000) + 900` or the `expiresIn: "15m"` option.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Refresh tokens use a 14-day sliding window only. A stolen refresh token used daily by an attacker…',
        options: [
          'expires after 14 days anyway',
          'never expires unless revoked, because each use extends it — add an absolute limit',
          'expires after the access token',
          'is detected automatically by HTTPS',
        ],
        answer: 1,
        explanation: 'Sliding expiry rewards activity, including an attacker\'s. An absolute cap from login bounds it. Rotation + reuse detection also helps.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'A JWT has `iat: 1767225600` and `exp: 1767226500`. How long is it valid?',
        options: ['900 ms', '15 minutes', '900 hours', '15 seconds'],
        answer: 1,
        explanation: '1767226500 − 1767225600 = 900 seconds = 15 minutes. JWT times are in seconds.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Token lifetimes',
        question: 'How would you choose expiration times for access tokens, refresh tokens and sessions?',
        shortAnswer: 'Access tokens short (5–15 min) to bound theft; refresh tokens or sessions with a sliding idle timeout (days) plus an absolute maximum (weeks), tuned to the app\'s risk, with step-up re-authentication for sensitive actions.',
        detailedAnswer: [
          'Shorter for banking/admin, longer for low-risk consumer apps.',
          'Sliding keeps active users in; absolute bounds stolen-token use.',
          'Rotation + reuse detection on refresh.',
          'Revoke all on password change or suspicious activity.',
          'Measure UX impact (forced logouts) and security signals.',
        ],
        followUp: 'What is step-up authentication?',
        trap: 'One long-lived token "for convenience".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Clock skew',
        question: 'How does clock skew affect JWT validation and how do you handle it?',
        shortAnswer: 'Issuer and verifier clocks can differ, so a fresh token may look "not yet valid" (`nbf`/`iat`) or an almost-expired one may be rejected early; allow a small `clockTolerance` (seconds), keep servers on NTP, and have clients rely on `expires_in` rather than their own clock.',
        detailedAnswer: [
          'jsonwebtoken: `verify(token, key, { clockTolerance: 5 })`.',
          'Large tolerances silently extend token lifetimes — keep them small.',
          'Client device clocks can be hours off; compute expiry from the server\'s `expires_in` relative to receipt time.',
          'Retry-once-on-401 covers remaining edge cases.',
          'Monitor `NotBeforeError` and early `TokenExpiredError` as drift signals.',
        ],
        followUp: 'Why should a client not decode the JWT and compare exp with Date.now()?',
        trap: 'Setting clockTolerance to minutes or hours "to be safe".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'common-authentication-vulnerabilities': {
    summary: 'The usual auth failures — credential stuffing, brute force, user enumeration, timing attacks, weak JWT secrets, tokens in localStorage exposed by XSS, session fixation and missing revocation — each have specific, testable defences.',
    topics: ['credential stuffing', 'brute force', 'rate limiting', 'account lockout', 'user enumeration', 'timing attacks', 'crypto.timingSafeEqual', 'XSS token theft', 'localStorage', 'weak secrets', 'MFA', 'breached passwords'],
    sections: [
      section('introduction', undefined,
        text('Most account takeovers are not clever crypto attacks — they are reused passwords, unlimited login attempts and tokens stolen by XSS. This lesson maps each common attack to its defence.'),
      ),
      section('definition', 'Attack → defence map',
        table('Common authentication vulnerabilities', ['Vulnerability', 'What happens', 'Defence'], [
          ['Credential stuffing', 'Attackers replay username/password pairs leaked from other sites', 'MFA, breached-password checks, bot detection, rate limits by IP/ASN/device'],
          ['Brute force / password spraying', 'Many guesses on one account / one common password on many accounts', 'Per-account + per-IP rate limits, progressive delays, temporary lockout, CAPTCHA'],
          ['User enumeration', 'Different responses/timing for "no user" vs "wrong password"', 'Identical messages, status codes and timing (dummy hash)'],
          ['Timing attacks', '`===` on secrets stops at the first differing byte', '`crypto.timingSafeEqual` on equal-length buffers / hashes'],
          ['Token theft via XSS', 'Script reads tokens from `localStorage`', 'HttpOnly cookies or in-memory tokens, CSP, output encoding'],
          ['Weak JWT secret', '`secret`/`changeme` cracked offline from one token', '≥ 256-bit random secret from a secrets manager, or asymmetric keys'],
          ['Session fixation', 'Pre-login session id stays valid after login', '`regenerate()` on login'],
          ['Missing revocation', 'Stolen tokens valid after logout/password change', 'Server-side revocation, short expiry'],
          ['Insecure reset/verification', 'Guessable or reusable tokens', 'Random, hashed, single-use, expiring tokens'],
        ]),
      ),
      section('why', 'Why lockout needs care',
        bullets(
          'Hard lockout after N failures lets attackers lock out any user (DoS) by guessing wrong on purpose.',
          'Prefer **progressive delays / temporary lockouts** and step-up challenges (CAPTCHA, MFA) per account.',
          'Rate-limit by account **and** by IP — sprayers rotate accounts, stuffers rotate IPs.',
        ),
      ),
      section('internals', 'Why `===` leaks timing',
        steps(
          'A naive comparison returns as soon as one character differs.',
          'An attacker measuring response times can learn how many leading bytes are correct.',
          'Repeating per position recovers the secret byte by byte (feasible on local networks, harder but possible remotely with statistics).',
          '`crypto.timingSafeEqual(a, b)` (Node core) always compares every byte; it **throws** if lengths differ, so compare fixed-length digests.',
        ),
      ),
      section('example', 'Defences in code',
        code({
          title: 'Early-exit comparison leaks how much matched (pure JS)',
          runnable: true,
          code: dedent(`
            function naiveEqual(a, b) {
              let steps = 0;
              if (a.length !== b.length) return { equal: false, steps };
              for (let i = 0; i < a.length; i++) {
                steps++;
                if (a[i] !== b[i]) return { equal: false, steps };
              }
              return { equal: true, steps };
            }

            const secret = 'k9Xq7Lm2';
            for (const guess of ['a0000000', 'k9000000', 'k9Xq7000', 'k9Xq7Lm2']) {
              console.log(guess, naiveEqual(secret, guess));
            }
          `),
          expectedOutput: "a0000000 { equal: false, steps: 1 }\nk9000000 { equal: false, steps: 3 }\nk9Xq7000 { equal: false, steps: 6 }\nk9Xq7Lm2 { equal: true, steps: 8 }",
          explanation: [
            'Work done (and therefore time) grows with the number of correct leading characters.',
            'That signal lets an attacker confirm one character at a time.',
          ],
        }),
        code({
          title: 'Constant-time API key check (Node core)',
          code: dedent(`
            const crypto = require('node:crypto');
            const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();   // 32 bytes always
            const EXPECTED = digest(process.env.API_KEY);

            function requireApiKey(req, res, next) {
              const given = digest(req.get('x-api-key') ?? '');
              if (!crypto.timingSafeEqual(given, EXPECTED)) return res.sendStatus(401);
              next();
            }

            // timingSafeEqual throws on length mismatch:
            try { crypto.timingSafeEqual(Buffer.from('abc'), Buffer.from('abcd')); }
            catch (e) { console.log(e.code); }
          `),
          expectedOutput: 'ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH',
          explanation: [
            'Hashing both sides first gives equal-length buffers and hides the real key length.',
            'Raw length mismatch would throw `RangeError` with that code.',
          ],
        }),
        code({
          title: 'Login with enumeration-safe responses and rate limiting',
          code: dedent(`
            const rateLimit = require('express-rate-limit');   // third-party
            const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12); // once at startup — sync is fine here

            const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

            router.post('/auth/login', loginLimiter, async (req, res) => {
              const { email, password } = req.body;
              if (await attempts.isLocked(email)) return res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS' } });

              const user = await users.findByEmail(email);
              const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH); // same cost either way
              if (!user || !ok) {
                await attempts.recordFailure(email, req.ip);       // progressive delay / temp lock per account
                return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
              }
              await attempts.reset(email);
              // ...regenerate session / issue tokens
              res.json({ ok: true });
            });
          `),
          explanation: [
            'Unknown email and wrong password produce the same status, message and (roughly) the same timing.',
            'IP limit (`express-rate-limit`) plus per-account counters (e.g. in Redis) cover spraying and stuffing.',
            'Return 429 for locked accounts — but only after a threshold, and unlock automatically.',
          ],
          versionNote: 'express-rate-limit v7+ uses `limit` (formerly `max`). Use a shared store (Redis) when running multiple instances.',
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /auth/login HTTP/1.1\nContent-Type: application/json\n\n{"email":"nobody@example.com","password":"x"}\n\nPOST /auth/login HTTP/1.1\nContent-Type: application/json\n\n{"email":"ada@example.com","password":"wrong"}\n\nPOST /auth/login HTTP/1.1  (21st attempt in 15 min from this IP)',
          expectedOutput: 'HTTP/1.1 401 Unauthorized\n{"error":{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}}\n\nHTTP/1.1 401 Unauthorized\n{"error":{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}}\n\nHTTP/1.1 429 Too Many Requests\nRateLimit-Policy: 20;w=900\nRateLimit: limit=20, remaining=0, reset=840\nRetry-After: 840\n\nToo many requests, please try again later.',
        }),
      ),
      section('real-world', 'Real-world hardening',
        bullets(
          'Offer and encourage MFA / passkeys (WebAuthn) — the strongest defence against stuffing and phishing.',
          'Check new passwords against breached lists (Have I Been Pwned k-anonymity API).',
          'Alert users on new-device logins; show active sessions.',
          'Store JWT secrets in a secrets manager; rotate keys with `kid`.',
          'CSP and output encoding reduce XSS, which defeats most token storage choices.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: token storage in an SPA',
          code: dedent(`
            // ✗ any injected script can exfiltrate it
            localStorage.setItem('accessToken', token);

            // ✓ HttpOnly cookie set by the server (or keep tokens in memory / BFF)
            res.cookie('__Host-session', sessionId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
          `),
          explanation: ['HttpOnly does not stop XSS from acting as the user, but it stops the token from being stolen and reused elsewhere.'],
        }),
        bullets(
          '"Wrong password" vs "user not found" messages.',
          'Only per-IP limits (bypassed by botnets) or only per-account (allows spraying).',
          'Permanent lockouts that become a DoS tool.',
          'Comparing API keys, HMACs or reset tokens with `===`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect a scenario: "your login endpoint is under attack". Distinguish stuffing vs brute force vs spraying, then layer defences: rate limits on two axes, MFA, breached-password checks, enumeration-safe responses, monitoring.'),
      ),
      section('practice', 'Practice',
        text('Write a Redis-based per-account limiter: 5 failures → 30 s delay, 10 → 5 min lock, reset on success. Test that unknown emails are tracked the same way as real ones.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Stuffing → MFA + breached passwords + bot defences.',
          'Brute force/spraying → rate limits per IP and per account, progressive lockout.',
          'Enumeration → identical responses and timing.',
          'Secrets → `timingSafeEqual` on fixed-length digests; strong JWT keys.',
          'Tokens → HttpOnly cookies or memory, not localStorage.',
        ),
      ),
    ],
    revisionNotes: [
      'Credential stuffing = reused leaked credentials; brute force = many guesses; spraying = one password, many accounts.',
      'Rate limit by IP and account; progressive delays beat hard lockout (DoS risk).',
      'Enumeration: same message/status/timing; compare against a dummy hash.',
      '`crypto.timingSafeEqual` needs equal lengths — hash both sides first.',
      'localStorage tokens are readable by XSS; prefer HttpOnly cookies/BFF.',
      'JWT HS256 secrets ≥ 256 random bits; weak secrets are cracked offline.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Attackers try the single password "Summer2026!" against 50,000 different accounts from many IPs. Which defence targets this best?',
        options: [
          'Per-account lockout after 3 failures',
          'Detection across accounts (global failure rates, per-IP/ASN limits), breached/common password blocking and MFA',
          'Longer JWT expiry',
          'HTTPS',
        ],
        answer: 1,
        explanation: 'This is password spraying: each account sees only one attempt, so per-account limits do not trigger. Block common passwords and detect the pattern globally.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What happens here?',
        code: "crypto.timingSafeEqual(Buffer.from('secret'), Buffer.from('secret!'));",
        options: ['Returns false', 'Returns true', 'Throws because the buffers have different lengths', 'Returns undefined'],
        answer: 2,
        explanation: 'timingSafeEqual requires equal byte lengths and throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` otherwise. Compare fixed-length digests.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What does this login handler leak?',
        code: "const user = await users.findByEmail(email);\nif (!user) return res.status(401).json({ error: 'Invalid credentials' });\nif (!(await bcrypt.compare(password, user.passwordHash))) {\n  return res.status(401).json({ error: 'Invalid credentials' });\n}",
        options: [
          'Nothing — the messages are identical',
          'Timing: unknown emails return immediately while known ones spend ~100+ ms in bcrypt, enabling user enumeration',
          'The password in logs',
          'The bcrypt cost',
        ],
        answer: 1,
        explanation: 'Identical messages are not enough; response time differs greatly. Always run a bcrypt compare (against a dummy hash for unknown users).',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Login attacks',
        question: 'Your login endpoint sees millions of failed attempts from thousands of IPs. How do you respond?',
        shortAnswer: 'Identify the pattern (credential stuffing vs spraying), then layer defences: rate limits per IP and per account with progressive delays, bot detection/CAPTCHA on suspicious traffic, breached-password checks, MFA, and monitoring — without hard lockouts that attackers can weaponise.',
        detailedAnswer: [
          'Stuffing: many accounts, leaked pairs, distributed IPs → device/bot signals, MFA, breached-password resets.',
          'Spraying: common passwords across accounts → block common passwords, global anomaly detection.',
          'Brute force: one account → per-account progressive delay/temporary lock.',
          'Shared rate-limit store (Redis) across instances; edge/WAF rules for volume.',
          'Notify affected users; force resets for accounts with confirmed compromise.',
        ],
        followUp: 'Why can a hard account lockout policy be harmful?',
        trap: 'Relying only on per-IP rate limits against a botnet.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Timing attacks',
        question: 'What is a timing attack on secret comparison and how do you prevent it in Node.js?',
        shortAnswer: 'A normal string comparison exits at the first mismatch, so response time reveals how many leading bytes are correct; use `crypto.timingSafeEqual` on equal-length buffers (e.g. SHA-256 digests of both values) so comparison time is independent of content.',
        detailedAnswer: [
          'Affects API keys, HMAC signatures (webhooks), reset tokens, CSRF tokens.',
          '`timingSafeEqual` throws on length mismatch — hash first or check length in a way that does not leak the secret.',
          'Password verification via bcrypt/argon2 libraries is already constant-time internally.',
          'Also equalise higher-level timing (user exists vs not) with dummy work.',
          'Network jitter makes remote attacks harder, not impossible — statistics over many requests help attackers.',
        ],
        followUp: 'How would you verify a webhook HMAC signature safely?',
        trap: 'Thinking `===` is safe because "network noise hides it".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'User enumeration',
        question: 'What is user enumeration and where does it typically occur?',
        shortAnswer: 'User enumeration is when an application reveals whether an account exists — through different messages, status codes or response times — typically on login, registration, password reset and email-change endpoints.',
        detailedAnswer: [
          'Login: "user not found" vs "wrong password".',
          'Reset: "no account with that email".',
          'Signup: "email already registered" (mitigate by emailing the owner instead of telling the requester).',
          'Timing differences when skipping password hashing for unknown users.',
          'Valid-account lists fuel credential stuffing and phishing.',
        ],
        followUp: 'How do you handle "email already taken" at signup without enumeration?',
        trap: 'Fixing the messages but not the timing.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Token storage and XSS',
        question: 'Why is storing JWTs in localStorage considered risky, and what are the alternatives?',
        shortAnswer: 'Any JavaScript running on the page — including an XSS payload or a compromised third-party script — can read localStorage and exfiltrate the token for use elsewhere; alternatives are HttpOnly Secure SameSite cookies (with CSRF protection), in-memory tokens with refresh via HttpOnly cookie, or a BFF that keeps tokens server-side.',
        detailedAnswer: [
          'localStorage persists across tabs and restarts — long exposure.',
          'HttpOnly cookies cannot be read by JS; XSS can still act within the page but cannot steal the credential.',
          'Cookies bring CSRF considerations → SameSite + CSRF tokens/Origin checks.',
          'In-memory tokens vanish on reload; refresh silently using an HttpOnly refresh cookie.',
          'Defence in depth: CSP, Trusted Types, dependency hygiene.',
        ],
        followUp: 'Does using HttpOnly cookies make XSS harmless?',
        trap: 'Claiming cookies are always safer without mentioning CSRF.',
      },
    ],
  },
};

export default content;

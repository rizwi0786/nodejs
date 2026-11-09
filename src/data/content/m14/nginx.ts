import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'nginx-fundamentals': {
    summary: 'Nginx is an event-driven web server and proxy configured with nested contexts (`http` → `server` → `location`) — commonly placed in front of Node to serve static files, compress responses, terminate TLS and proxy requests.',
    topics: ['nginx.conf', 'server block', 'server_name', 'location', 'root', 'try_files', 'gzip', 'worker_processes', 'nginx -t'],
    sections: [
      section('introduction', undefined,
        text('Node can serve everything itself, but a dedicated front server handles static assets, compression, TLS and slow clients very efficiently, letting Node focus on application logic.'),
      ),
      section('definition', 'What Nginx is',
        bullets(
          'An open-source HTTP server, reverse proxy and load balancer.',
          'Architecture: one **master** process (reads config, manages workers) and several **worker** processes, each running an event loop (epoll/kqueue) — conceptually similar to Node.',
          'Configured with **directives** inside **contexts**: `main` → `events`, `http` → `server` → `location`.',
        ),
      ),
      section('why', 'Why put Nginx in front of Node',
        table('Who does what', ['Task', 'Node alone', 'With Nginx'], [
          ['Static files', '`express.static` — works, uses the JS event loop', '`sendfile`, kernel-level, very fast'],
          ['gzip/brotli', '`compression` middleware costs CPU in Node', 'Done in Nginx (or pre-compressed files)'],
          ['TLS', 'Possible with `https` module', 'Terminated at Nginx; certificates in one place'],
          ['Slow clients', 'Hold Node sockets open', 'Nginx buffers responses'],
          ['Multiple apps on :443', 'Hard', '`server_name` virtual hosts'],
        ]),
        note('In many cloud setups a managed load balancer / CDN does these jobs instead of Nginx. The concepts are the same.'),
      ),
      section('internals', 'How a request is matched',
        steps(
          'Nginx picks a **server block** by `listen` address/port, then by `server_name` matching the `Host` header (or `default_server`).',
          'Inside it, it picks a **location**: exact `=` match first, then the longest prefix; `^~` prefix stops regex search; regex `~`/`~*` locations are checked in order; otherwise the longest prefix wins.',
          'The location\'s directives (`root`, `try_files`, `proxy_pass`, …) produce the response.',
          'Config changes: `nginx -t` validates, `nginx -s reload` gracefully swaps workers without dropping connections.',
        ),
      ),
      section('visual', 'Contexts',
        flow(['http: global settings, gzip', 'server: listen 80, server_name api.example.com', 'location /static/: root + cache headers', 'location /: proxy_pass to Node'],
          { title: 'Nested configuration contexts' }),
      ),
      section('example', 'Static site + gzip',
        code({
          title: '/etc/nginx/conf.d/app.conf',
          language: 'text',
          code: dedent(`
            server {
                listen 80;
                server_name app.example.com;

                root /var/www/app/dist;     # built SPA files
                index index.html;

                gzip on;
                gzip_types text/css application/javascript application/json image/svg+xml;
                gzip_min_length 1024;

                location /assets/ {
                    expires 1y;
                    add_header Cache-Control "public, immutable";
                }

                location / {
                    try_files $uri $uri/ /index.html;   # SPA fallback
                }
            }
          `),
          expectedOutput: dedent(`
            $ sudo nginx -t
            nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
            nginx: configuration file /etc/nginx/nginx.conf test is successful
            $ sudo nginx -s reload
          `),
          explanation: [
            '`server_name` selects this block for requests with `Host: app.example.com`.',
            '`gzip_types` — `text/html` is always compressed; add others explicitly.',
            'Fingerprinted assets get a 1-year immutable cache.',
            '`try_files` serves the file if it exists, else falls back to `index.html` for client-side routing.',
            'Always `nginx -t` before reload.',
          ],
        }),
        code({
          title: 'Verify compression',
          language: 'bash',
          code: 'curl -s -I -H "Accept-Encoding: gzip" http://app.example.com/assets/app.3f9a.js',
          expectedOutput: 'HTTP/1.1 200 OK\nServer: nginx\nContent-Type: application/javascript\nCache-Control: max-age=31536000\nCache-Control: public, immutable\nContent-Encoding: gzip',
          explanation: ['`Content-Encoding: gzip` confirms compression; `expires 1y` adds the max-age header.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'One Nginx serves the React build at `/` and proxies `/api/` to Node instances.',
          'Access logs in JSON format feed the log pipeline.',
          '`client_max_body_size 10m;` caps upload size before it reaches Node.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'root vs alias',
          language: 'text',
          code: dedent(`
            # ❌ looks for /var/www/static/static/logo.png
            location /static/ { root /var/www/static/; }
            # ✅ alias replaces the matched prefix
            location /static/ { alias /var/www/static/; }
          `),
          explanation: ['`root` appends the full URI to the path; `alias` substitutes the location prefix.'],
        }),
        bullets(
          'Reloading without `nginx -t` and taking the site down.',
          'Forgetting `gzip_types` for JSON, so API responses are not compressed.',
          'Serving static files through Node when Nginx is already there.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain the master/worker event-driven model, server vs location blocks, and what you offload from Node to Nginx (static, TLS, compression, buffering).'),
      ),
      section('practice', 'Practice',
        text('Configure Nginx to serve `/var/www/docs` at `/docs/` using `alias`, with gzip for CSS and JS, and check it with `curl -I`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Master + event-driven workers.',
          'http → server (by port + Host) → location (by URI).',
          'Great at static files, gzip, TLS, buffering.',
          '`nginx -t` then `nginx -s reload`.',
        ),
      ),
    ],
    revisionNotes: [
      'server chosen by listen + server_name (Host header); location by URI.',
      'Location priority: = exact, ^~ prefix, regex in order, longest prefix.',
      'root appends URI, alias replaces prefix.',
      'gzip_types needed for non-HTML types.',
      'nginx -s reload is graceful.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which directive chooses a server block for a request with `Host: api.example.com`?',
        options: ['location', 'server_name', 'proxy_pass', 'upstream'],
        answer: 1,
        explanation: 'Nginx matches the Host header against server_name (after listen). location matches the URI inside a server.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Requests to `/images/a.png` return 404 although the file is at `/srv/images/a.png`.',
        code: 'location /images/ {\n    root /srv/images/;\n}',
        options: [
          'Missing semicolon after the location',
          'root appends the URI, so Nginx looks for /srv/images/images/a.png — use alias /srv/images/ or root /srv;',
          'PNG files need gzip_types',
          'location must use a regex',
        ],
        answer: 1,
        explanation: 'With root, the full URI (/images/a.png) is appended to the path. alias replaces the matched prefix.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Nginx',
        question: 'Why would you put Nginx in front of a Node.js application?',
        shortAnswer: 'To offload static files, compression, TLS termination, request buffering and load balancing to a highly efficient server so Node only handles application logic.',
        detailedAnswer: [
          'Static assets via sendfile without touching the JS event loop.',
          'Central TLS certificates and HTTP/2.',
          'Buffers slow clients, protecting Node sockets.',
          'Routes and balances across several Node processes.',
          'Can rate-limit and cap body size early.',
        ],
        followUp: 'When would you skip Nginx entirely?',
        trap: 'Saying Node cannot handle HTTP in production — it can; Nginx is an optimisation and operational convenience.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Nginx',
        question: 'How does Nginx decide which location block handles a request?',
        shortAnswer: 'Exact (=) matches win; otherwise it finds the longest matching prefix, uses it immediately if marked ^~, else checks regex locations in order and uses the first match, falling back to the longest prefix.',
        detailedAnswer: [
          '`location = /healthz` — exact.',
          '`location ^~ /static/` — prefix that skips regex checks.',
          '`location ~* \\.(png|jpg)$` — case-insensitive regex, evaluated in file order.',
          '`location /` — catch-all prefix.',
        ],
        followUp: 'Why might a regex location unexpectedly override a prefix location?',
        trap: 'Assuming locations are evaluated top-to-bottom like Express routes.',
      },
    ],
  },

  'reverse-proxy': {
    summary: 'A reverse proxy accepts client connections and forwards them to backend servers; with Nginx in front of Node you must forward client IP/protocol headers, enable `trust proxy` in Express, and pass WebSocket upgrade headers.',
    topics: ['proxy_pass', 'X-Forwarded-For', 'X-Forwarded-Proto', 'trust proxy', 'TLS termination', 'WebSocket upgrade', 'proxy timeouts'],
    sections: [
      section('introduction', undefined,
        text('Clients talk to the proxy; the proxy talks to Node. That hides internal topology, centralises TLS, and lets you run many Node instances behind one public address.'),
      ),
      section('definition', 'Forward vs reverse proxy',
        table('Forward vs reverse', ['', 'Forward proxy', 'Reverse proxy'], [
          ['Acts on behalf of', 'Clients (e.g. corporate proxy)', 'Servers'],
          ['Client knows about it', 'Yes, configured', 'No, looks like the server'],
          ['Typical uses', 'Egress filtering, caching', 'TLS, load balancing, routing, caching, WAF'],
        ]),
      ),
      section('why', 'What changes for the Node app',
        bullets(
          'Node now sees the **proxy\'s** IP as `req.socket.remoteAddress`, and plain HTTP even if the client used HTTPS.',
          'The proxy adds `X-Forwarded-For` (client IP chain), `X-Forwarded-Proto` (http/https) and `X-Forwarded-Host`.',
          'Express (third-party) only trusts these headers when you configure `app.set(\'trust proxy\', …)` — otherwise `req.ip`, `req.protocol`, `req.secure` are wrong.',
          'Rate limiting by IP, secure cookies and redirects all depend on this being right.',
        ),
      ),
      section('internals', 'Request path through the proxy',
        steps(
          'Client opens TLS to Nginx on :443; Nginx **terminates TLS** (decrypts).',
          'Nginx matches `location /` → `proxy_pass http://node_upstream;`.',
          'It opens (or reuses) an HTTP connection to Node and adds forwarding headers.',
          'Node responds; Nginx buffers and relays to the client.',
          'For WebSockets, the client sends `Upgrade: websocket`; hop-by-hop headers are not forwarded unless Nginx sets `Upgrade` and `Connection` explicitly with `proxy_http_version 1.1`.',
        ),
        warn('Trusting `X-Forwarded-For` from anyone lets clients spoof their IP. Trust exactly the number of proxy hops you control (e.g. `trust proxy: 1`) or specific proxy IPs/subnets.'),
      ),
      section('visual', 'Reverse proxy',
        diagram('reverse-proxy', 'Client → Nginx (TLS, routing, headers) → Node instances.'),
      ),
      section('example', 'Nginx + Express configuration',
        code({
          title: 'nginx: TLS termination, headers, WebSockets',
          language: 'text',
          code: dedent(`
            map $http_upgrade $connection_upgrade {
                default upgrade;
                ''      close;
            }

            upstream node_upstream {
                server 127.0.0.1:3000;
                keepalive 32;
            }

            server {
                listen 443 ssl;
                http2 on;
                server_name api.example.com;
                ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
                ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

                location / {
                    proxy_pass http://node_upstream;
                    proxy_http_version 1.1;
                    proxy_set_header Host              $host;
                    proxy_set_header X-Real-IP         $remote_addr;
                    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
                    proxy_set_header X-Forwarded-Proto $scheme;
                    proxy_set_header Upgrade           $http_upgrade;
                    proxy_set_header Connection        $connection_upgrade;
                    proxy_read_timeout 60s;
                }
            }

            server {
                listen 80;
                server_name api.example.com;
                return 301 https://$host$request_uri;
            }
          `),
          expectedOutput: '$ curl -sI http://api.example.com/users\nHTTP/1.1 301 Moved Permanently\nLocation: https://api.example.com/users',
          explanation: [
            'TLS ends at Nginx; Node listens on plain HTTP on localhost.',
            '`$proxy_add_x_forwarded_for` appends the client IP to any existing chain.',
            '`X-Forwarded-Proto $scheme` tells Node the original protocol was https.',
            'The `map` sets `Connection: upgrade` only when the client requested an upgrade, and keeps keepalive working otherwise.',
            '`keepalive 32` + HTTP/1.1 reuse upstream connections. Because `close` would disable that reuse for normal requests, many configs map `\'\'` to `""` instead of `close`.',
            '`http2 on;` is the Nginx 1.25.1+ syntax; older versions use `listen 443 ssl http2;`.',
            'The second server block redirects HTTP to HTTPS.',
          ],
        }),
        code({
          title: 'Express: trust exactly one proxy hop',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.set('trust proxy', 1); // Nginx is the single proxy in front

            app.get('/whoami', (req, res) => {
              res.json({ ip: req.ip, protocol: req.protocol, secure: req.secure });
            });

            app.listen(3000, '127.0.0.1');
          `),
          expectedOutput: '{"ip":"203.0.113.7","protocol":"https","secure":true}',
          explanation: [
            'With `trust proxy` set, Express reads `X-Forwarded-For` / `X-Forwarded-Proto`.',
            'Without it the response would be `{"ip":"127.0.0.1","protocol":"http","secure":false}`.',
            '`secure: true` matters for `cookie.secure` and HTTPS redirects.',
            'Binding to `127.0.0.1` stops clients bypassing the proxy.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Behind a cloud load balancer *and* Nginx there are two hops — set `trust proxy` to 2 or to the LB\'s subnet.',
          'express-rate-limit keyed by `req.ip` only works correctly with the right `trust proxy` value.',
          'Long-polling or SSE endpoints need larger `proxy_read_timeout` and `proxy_buffering off`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Trust proxy too broadly',
          code: dedent(`
            // ❌ trusts any X-Forwarded-For → IP spoofing defeats rate limits
            app.set('trust proxy', true);
            // ✅ trust only the hops you control
            app.set('trust proxy', 1);            // or 'loopback', or '10.0.0.0/8'
          `),
          explanation: ['`true` uses the left-most address, which the client fully controls.'],
        }),
        bullets(
          'Missing `Upgrade`/`Connection` headers → WebSocket handshake fails with 400 or falls back to polling.',
          'Default `proxy_read_timeout` (60s) killing idle WebSockets — send pings or raise it.',
          'Node listening on `0.0.0.0` publicly, bypassing the proxy.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect "why is req.ip always 127.0.0.1?" and "why do my WebSockets fail behind Nginx?". Answer with forwarding headers + trust proxy, and proxy_http_version 1.1 + Upgrade/Connection headers.'),
      ),
      section('practice', 'Practice',
        steps(
          'Put Nginx in front of an Express app; log `req.ip` with and without `trust proxy`.',
          'Proxy a Socket.IO server and verify the transport upgrades to websocket in the browser devtools.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Reverse proxy = server-side front door.',
          'Forward client info with `X-Forwarded-*`; configure Express `trust proxy` precisely.',
          'TLS terminates at the proxy.',
          'WebSockets need HTTP/1.1 plus Upgrade/Connection headers.',
        ),
      ),
    ],
    revisionNotes: [
      'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; X-Forwarded-Proto $scheme.',
      'Express: app.set("trust proxy", 1) → correct req.ip/req.protocol/req.secure.',
      'trust proxy true = spoofable.',
      'WebSocket: proxy_http_version 1.1; Upgrade $http_upgrade; Connection "upgrade".',
      'Bind Node to 127.0.0.1 / private network behind the proxy.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Behind Nginx, every request in your rate limiter appears to come from 127.0.0.1, so all users share one limit. What fixes it?',
        options: [
          'Disable rate limiting',
          'Have Nginx send X-Forwarded-For and set `app.set("trust proxy", 1)` in Express',
          'Use req.headers.host as the key',
          'Set `trust proxy` to true and accept any header',
        ],
        answer: 1,
        explanation: 'Express ignores forwarding headers until trust proxy is configured. true trusts spoofed values from clients; 1 trusts only the Nginx hop.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'WebSocket connections through this config fail. Why?',
        code: 'location /ws/ {\n    proxy_pass http://node_upstream;\n    proxy_set_header Host $host;\n}',
        options: [
          'proxy_pass cannot point to an upstream',
          'Missing proxy_http_version 1.1 and the Upgrade/Connection headers, which are hop-by-hop and not forwarded automatically',
          'Host must be $remote_addr',
          'WebSockets require port 8080',
        ],
        answer: 1,
        explanation: 'The upgrade handshake needs HTTP/1.1 and explicit Upgrade/Connection headers to the upstream.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'intermediate', topic: 'Reverse proxy',
        question: 'Behind a reverse proxy, req.protocol is "http" and secure cookies are not being set. Why, and how do you fix it?',
        shortAnswer: 'TLS terminates at the proxy, so Node sees plain HTTP; the proxy must send X-Forwarded-Proto and Express must be told to trust the proxy so req.secure becomes true.',
        detailedAnswer: [
          'Express only sets `Secure` cookies when `req.secure` is true.',
          '`req.secure` derives from `req.protocol`, which uses X-Forwarded-Proto only with trust proxy.',
          'Nginx: `proxy_set_header X-Forwarded-Proto $scheme;`.',
          'Express: `app.set("trust proxy", 1)` (or the proxy subnet).',
          'express-session also needs `proxy: true` or trust proxy for secure cookies.',
        ],
        followUp: 'How many hops do you trust if a cloud load balancer sits in front of Nginx?',
        trap: 'Setting cookie.secure to false in production to "fix" it.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Reverse proxy',
        question: 'What are the security implications of the X-Forwarded-For header and how should a Node service consume it?',
        shortAnswer: 'Clients can send arbitrary X-Forwarded-For values, so only addresses appended by trusted proxies are reliable; configure trust by hop count or proxy subnet and read the right-most untrusted address.',
        detailedAnswer: [
          'Header is a comma-separated chain; each proxy appends the address it saw.',
          'Left-most entry is client-supplied and spoofable.',
          'Express trust proxy walks the chain from the right, skipping trusted hops.',
          'Wrong config breaks IP-based rate limiting, audit logs, geo-blocking.',
          'Alternatives: PROXY protocol at L4, or the standardised `Forwarded` header.',
        ],
        followUp: 'How does the PROXY protocol differ from X-Forwarded-For?',
        trap: 'Using the first value of X-Forwarded-For as the trustworthy client IP.',
      },
    ],
  },

  'load-balancing': {
    summary: 'A load balancer spreads requests across multiple backend instances using algorithms such as round-robin, least connections or IP hash, and removes unhealthy instances; it can operate at L4 (TCP) or L7 (HTTP).',
    topics: ['upstream', 'round-robin', 'least_conn', 'ip_hash', 'weights', 'passive health checks', 'L4 vs L7', 'sticky sessions'],
    sections: [
      section('introduction', undefined,
        text('One Node process uses one CPU core for JavaScript and is a single point of failure. Running several instances and spreading traffic across them adds capacity and resilience — that is load balancing.'),
      ),
      section('definition', 'Algorithms',
        table('Common algorithms', ['Algorithm', 'How it picks', 'Good for'], [
          ['Round-robin (default)', 'Each server in turn (optionally weighted)', 'Similar servers, similar request cost'],
          ['Least connections (`least_conn`)', 'Server with fewest active connections', 'Mixed/long requests, WebSockets'],
          ['IP hash (`ip_hash`)', 'Hash of client IP → same server', 'Crude stickiness when state is local'],
          ['Generic hash (`hash $key consistent`)', 'Hash of any key, consistent hashing', 'Cache affinity'],
          ['Random / power of two choices', 'Pick two at random, choose less loaded', 'Large fleets, many balancers'],
        ]),
      ),
      section('why', 'L4 vs L7',
        table('Layer 4 vs Layer 7', ['', 'L4 (transport)', 'L7 (application)'], [
          ['Sees', 'IP + port, TCP/UDP', 'HTTP method, path, headers, cookies'],
          ['Can route by path/host', 'No', 'Yes'],
          ['TLS', 'Usually passthrough', 'Usually terminates'],
          ['Overhead', 'Lower', 'Higher (parses HTTP)'],
          ['Examples', 'AWS NLB, Nginx `stream`, HAProxy TCP mode', 'AWS ALB, Nginx `http`, Envoy, HAProxy HTTP mode'],
        ]),
      ),
      section('internals', 'Health checks and failure handling',
        steps(
          '**Passive** (open-source Nginx): after `max_fails` failed attempts within `fail_timeout`, the server is marked unavailable for `fail_timeout`.',
          '**Active**: the balancer probes `/healthz` periodically (cloud LBs, HAProxy, Envoy, NGINX Plus) and only routes to healthy targets.',
          '`proxy_next_upstream error timeout` retries an idempotent request on another server when one fails.',
          'Connection draining / deregistration delay lets in-flight requests finish when a target is removed.',
        ),
        warn('Retrying non-idempotent requests (POST) on another upstream can duplicate side effects. Nginx by default does not retry non-idempotent methods after the request was sent (`non_idempotent` must be explicitly enabled).'),
      ),
      section('visual', 'Balancing across instances',
        diagram('reverse-proxy', 'The proxy distributes requests to several Node instances and skips unhealthy ones.'),
      ),
      section('example', 'Nginx upstream',
        code({
          title: 'upstream with least_conn and passive checks',
          language: 'text',
          code: dedent(`
            upstream api {
                least_conn;
                server 10.0.1.11:3000 max_fails=3 fail_timeout=10s;
                server 10.0.1.12:3000 max_fails=3 fail_timeout=10s;
                server 10.0.1.13:3000 weight=2;    # bigger machine
                server 10.0.1.14:3000 backup;      # used only if others are down
                keepalive 64;
            }

            server {
                listen 80;
                location / {
                    proxy_pass http://api;
                    proxy_http_version 1.1;
                    proxy_set_header Connection "";
                    proxy_next_upstream error timeout http_502 http_503;
                    proxy_connect_timeout 2s;
                }
            }
          `),
          expectedOutput: dedent(`
            $ for i in 1 2 3 4; do curl -s localhost/whoami; echo; done
            {"instance":"api-11"}
            {"instance":"api-13"}
            {"instance":"api-12"}
            {"instance":"api-13"}
          `),
          explanation: [
            '`least_conn` favours the instance with the fewest active connections (weights still apply).',
            'After 3 failures within 10 s an instance is skipped for 10 s.',
            '`backup` only gets traffic when all primaries are unavailable.',
            '`keepalive` + `Connection ""` reuse upstream TCP connections.',
            'Exact distribution depends on concurrent load — output is illustrative.',
          ],
        }),
        code({
          title: 'Simulating round-robin and least-connections',
          code: dedent(`
            const servers = ['a', 'b', 'c'];
            let i = 0;
            const roundRobin = () => servers[i++ % servers.length];

            const active = { a: 5, b: 1, c: 3 };
            const leastConn = () =>
              Object.entries(active).sort((x, y) => x[1] - y[1])[0][0];

            console.log([1, 2, 3, 4].map(roundRobin).join(','));
            console.log(leastConn());
          `),
          expectedOutput: 'a,b,c,a\nb',
          explanation: [
            'Round-robin cycles regardless of load.',
            'Least-connections picks `b` because it has only 1 active connection.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Cloud: an L7 load balancer (ALB, Cloud Load Balancing) with target groups and active health checks on `/readyz`.',
          'Kubernetes: a Service load-balances at L4 across pod IPs; an Ingress controller (Nginx, Envoy) does L7.',
          'On a single VM: Node `cluster`/pm2 balances across cores (see Module 11), Nginx across VMs.',
          'WebSockets: prefer `least_conn` because connections are long-lived.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Keeping sessions in process memory, then "fixing" it with `ip_hash` — breaks when users change IP or many share one NAT.',
          'Health check hitting `/` which renders a heavy page or always returns 200.',
          'No connection draining → deploys cut off in-flight requests.',
          'Retrying POSTs on another upstream.',
        ),
        code({
          title: 'Wrong vs right: session affinity',
          language: 'text',
          code: dedent(`
            # ❌ hiding stateful servers behind ip_hash
            upstream api { ip_hash; server a:3000; server b:3000; }
            # ✅ stateless servers + shared session store (Redis), any algorithm
            upstream api { least_conn; server a:3000; server b:3000; }
          `),
          explanation: ['Externalise state so any instance can serve any request.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Compare algorithms with a use case each, contrast L4 and L7, and mention health checks and draining. Bonus: explain why sticky sessions are a smell.'),
      ),
      section('practice', 'Practice',
        text('Run three Express instances on ports 3001–3003 that return their port, put Nginx in front with round-robin, then switch to `least_conn` and add a slow endpoint to observe the difference.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Round-robin default; least_conn for uneven/long requests; hashing for affinity.',
          'L4 = TCP, fast, no HTTP awareness; L7 = HTTP routing, TLS, headers.',
          'Health checks + draining make instance failure invisible to users.',
          'Stateless instances beat sticky sessions.',
        ),
      ),
    ],
    revisionNotes: [
      'Nginx default = weighted round-robin; least_conn, ip_hash, hash … consistent.',
      'Open-source Nginx: passive checks (max_fails/fail_timeout); active checks in cloud LBs/HAProxy/Envoy.',
      'L4 sees IP:port; L7 sees HTTP.',
      'Don\'t retry non-idempotent requests on another upstream.',
      'Sticky sessions are a workaround for stateful servers.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which algorithm suits a WebSocket chat service where connections last for hours?',
        options: ['Round-robin', 'Least connections', 'Random with no health checks', 'DNS round-robin only'],
        answer: 1,
        explanation: 'Round-robin ignores how many long-lived connections each server already holds; least connections balances actual load.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'You need to route `/api/*` to Node and `/images/*` to a storage service. Which load balancer type do you need?',
        options: ['Layer 4', 'Layer 7', 'Either; both see the URL path', 'Neither — DNS must do it'],
        answer: 1,
        explanation: 'Only an L7 balancer parses HTTP and can route by path. L4 sees only IPs and ports.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this round-robin simulation print?',
        code: "const s = ['x', 'y'];\nlet i = 0;\nconst next = () => s[i++ % s.length];\nconsole.log(next(), next(), next());",
        options: ['x x x', 'x y x', 'y x y', 'x y y'],
        answer: 1,
        explanation: 'i goes 0, 1, 2 → indexes 0, 1, 0 → x y x.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Load balancing',
        question: 'Compare round-robin, least connections and IP hash load balancing.',
        shortAnswer: 'Round-robin rotates evenly, least connections sends to the least busy server, and IP hash pins a client IP to one server for affinity.',
        detailedAnswer: [
          'Round-robin: simple, best when requests cost about the same; weights for uneven servers.',
          'Least connections: adapts to long or uneven requests.',
          'IP hash: stickiness without cookies, but NAT/mobile IP changes break it and load can skew.',
          'Consistent hashing minimises remapping when servers are added/removed.',
        ],
        followUp: 'What happens to IP-hash affinity when you add a server?',
        trap: 'Recommending IP hash as the standard way to handle sessions.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Load balancing',
        question: 'What is the difference between Layer 4 and Layer 7 load balancing, and when would you choose each?',
        shortAnswer: 'L4 forwards TCP/UDP connections by IP and port without understanding HTTP — fast and protocol-agnostic; L7 parses HTTP to route by host/path/headers, terminate TLS and add headers, at more overhead.',
        detailedAnswer: [
          'L4: balances connections, not requests; HTTP/2 multiplexed streams all hit one backend.',
          'L4 often uses TLS passthrough; client IP via PROXY protocol.',
          'L7: per-request balancing, path routing, header injection, retries, WAF.',
          'Choose L4 for raw TCP (databases, MQTT, gRPC passthrough) or extreme throughput.',
          'Choose L7 for HTTP APIs needing routing and observability.',
        ],
        followUp: 'Why can long-lived HTTP/2 or gRPC connections cause imbalance behind an L4 balancer?',
        trap: 'Saying L4 balancers can route by URL.',
      },
    ],
  },
};

export default content;

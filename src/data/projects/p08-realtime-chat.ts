import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p08: Project = {
  id: 'p08',
  number: 8,
  level: 'advanced',
  title: 'Real-time Chat Application',
  status: 'ready',
  summary: 'Rooms, presence, typing indicators and persistent message history over Socket.IO, authenticated with JWTs and scaled across several Node instances with the Redis adapter.',
  skills: ['Socket.IO', 'Redis adapter', 'Auth over WebSocket', 'Acknowledgements', 'Presence across nodes', 'Idempotent messages', 'Sticky sessions'],
  estHours: 16,
  prerequisites: [
    'm11-websockets',
    'm11-socket-io',
    'm11-redis',
    'm10-jwt',
    'm06-eventemitter',
    'm09-node-js-postgresql-integration',
    'm14-horizontal-scaling',
    'm14-load-balancing',
  ],
  requirements: {
    functional: [
      'Users connect with their p05 access token; unauthenticated sockets are rejected.',
      'Join/leave rooms they are members of (public, private, direct); receive the last 50 messages on join.',
      'Send messages with an acknowledgement (`{ ok, message }`); clients retry safely with a `clientMsgId`.',
      'Presence: online/offline + last seen, correct even when a user has several tabs on different servers.',
      'Typing indicators (best-effort, never stored).',
      'REST endpoint for older history with keyset pagination; read receipts via `last_read_message_id`.',
    ],
    nonFunctional: [
      'Horizontal scale: N instances behind a load balancer; a message sent on node A reaches sockets on node B (Redis pub/sub adapter).',
      'Per-socket rate limit (token bucket, ~2 msg/s sustained, burst 10) and 100 KB max payload.',
      'At-least-once client sends + `UNIQUE (sender_id, client_msg_id)` → effectively exactly-once storage.',
      'Reconnection with fresh tokens; expired tokens force a disconnect.',
      'p95 fan-out latency < 100 ms within a region.',
    ],
  },
  architecture: {
    diagramId: 'reverse-proxy',
    flow: [
      { label: 'Client', detail: 'socket.io-client, auth: { token }' },
      { label: 'Nginx', detail: 'WebSocket upgrade, sticky (ip_hash)' },
      { label: 'Node instance', detail: 'io.use(auth) → handlers' },
      { label: 'Postgres', detail: 'INSERT message (idempotent)' },
      { label: 'Redis adapter', detail: 'PUBLISH to other nodes' },
      { label: 'Room members', detail: "'message:new' on every node" },
    ],
    notes: [
      'Socket.IO rooms are per-process; `@socket.io/redis-adapter` (third-party) relays broadcasts through Redis pub/sub so `io.to(room).emit()` works cluster-wide.',
      'Sticky sessions are required when the HTTP long-polling transport is enabled (the handshake and later polls must hit the same node). Using `transports: [\'websocket\']` only removes that need.',
      'Messages are persisted **before** broadcasting — a client that reconnects can always fetch what it missed.',
      'Each socket also joins `user:<id>`, which makes "send to all of a user\'s devices" and presence checks one call.',
    ],
  },
  folderStructure: dedent(`
    chat/
    ├── docker-compose.yml        # 2 × app, redis, postgres, nginx
    ├── nginx.conf
    ├── migrations/001_chat.sql
    ├── src/
    │   ├── server.js             # http + express + redis clients + createRealtime()
    │   ├── config.js
    │   ├── lib/tokens.js         # verifyAccessToken (shared with p05)
    │   ├── data/
    │   │   ├── db.js
    │   │   ├── rooms.repository.js
    │   │   └── messages.repository.js
    │   ├── http/history.routes.js
    │   └── realtime/
    │       ├── index.js          # createRealtime(httpServer, { adapter, redis })
    │       ├── auth.js           # io.use middleware
    │       ├── chat.handlers.js  # room:join, message:send, typing, message:read
    │       ├── presence.js
    │       └── rate-limit.js     # token bucket
    ├── client/demo.js
    └── test/chat.test.js
  `),
  databaseDesign: [
    entity('rooms', [
      ['id', 'BIGINT', 'PK identity', ''],
      ['name', 'TEXT', 'NULL for direct rooms', ''],
      ['type', 'TEXT', "CHECK IN ('public','private','direct')", ''],
      ['created_by', 'UUID', 'FK users', ''],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
    ]),
    entity('room_members', [
      ['room_id', 'BIGINT', 'FK rooms ON DELETE CASCADE', 'PK (room_id, user_id)'],
      ['user_id', 'UUID', 'FK users ON DELETE CASCADE', 'Index (user_id) — "my rooms"'],
      ['role', 'TEXT', "DEFAULT 'member'", 'owner | admin | member'],
      ['last_read_message_id', 'BIGINT', 'NULL', 'Unread count = messages with id > this'],
      ['joined_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
    ]),
    entity('messages', [
      ['id', 'BIGINT', 'PK identity', 'Monotonic → ordering + pagination cursor'],
      ['room_id', 'BIGINT', 'FK rooms ON DELETE CASCADE', 'Index (room_id, id DESC)'],
      ['sender_id', 'UUID', 'FK users', ''],
      ['body', 'TEXT', 'NOT NULL, ≤ 2000 chars', 'Stored as plain text, escaped on render'],
      ['client_msg_id', 'UUID', 'NOT NULL, UNIQUE (sender_id, client_msg_id)', 'Idempotency for retries'],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
      ['edited_at / deleted_at', 'TIMESTAMPTZ', 'NULL', 'Soft delete'],
    ]),
    entity('Redis keys', [
      ['presence:online', 'SET of user ids', '', 'SADD on first socket, SREM when none remain'],
      ['presence:last_seen', 'HASH userId → ISO time', '', 'Updated on going offline'],
      ['socket.io#/#…', 'pub/sub channels', 'managed by adapter', 'Do not touch'],
    ]),
  ],
  endpoints: [
    { method: 'WS', path: 'connect (auth: { token })', description: 'Handshake; rejected with connect_error "UNAUTHORIZED".', auth: 'access token' },
    { method: 'WS', path: "emit 'room:join' (roomId, ack)", description: 'Join if member → ack { ok, recent[] }.', auth: 'member' },
    { method: 'WS', path: "emit 'room:leave' (roomId)", description: 'Leave the Socket.IO room (membership unchanged).', auth: 'user' },
    { method: 'WS', path: "emit 'message:send' ({ roomId, text, clientMsgId }, ack)", description: 'Persist + broadcast → ack { ok, message }.', auth: 'member, joined' },
    { method: 'WS', path: "emit 'typing' (roomId)", description: 'Volatile broadcast to others in the room.', auth: 'member, joined' },
    { method: 'WS', path: "emit 'message:read' ({ roomId, messageId })", description: 'Update last_read_message_id.', auth: 'member' },
    { method: 'WS', path: "on 'message:new' / 'typing' / 'presence:update'", description: 'Server → client events.', auth: '—' },
    { method: 'GET', path: '/api/v1/rooms', description: 'My rooms with unread counts.', auth: 'user' },
    { method: 'GET', path: '/api/v1/rooms/:id/messages?before=<id>&limit=50', description: 'Older history (keyset).', auth: 'member' },
    { method: 'POST', path: '/api/v1/rooms', description: 'Create room / direct conversation.', auth: 'user' },
  ],
  steps: [
    {
      title: 'Server bootstrap with the Redis adapter',
      bullets: [
        'Install: `socket.io`, `@socket.io/redis-adapter`, `redis` (node-redis v4+), `express`, `pg`, `zod`, `jsonwebtoken` — all third-party.',
        'The adapter needs **two** Redis connections: one publishes, one is in subscriber mode.',
        'Keep `createRealtime()` free of Redis wiring so tests can use the default in-memory adapter.',
      ],
      code: {
        id: 'p08-s1',
        title: 'src/server.js + src/realtime/index.js',
        language: 'javascript',
        code: dedent(`
          // realtime/index.js
          import { Server } from 'socket.io';
          import { socketAuth } from './auth.js';
          import { registerChatHandlers } from './chat.handlers.js';
          import { registerPresence } from './presence.js';

          export function createRealtime(httpServer, { adapter, redis, corsOrigin }) {
            const io = new Server(httpServer, {
              adapter, // undefined -> in-memory adapter (single node / tests)
              cors: { origin: corsOrigin, credentials: true },
              maxHttpBufferSize: 100_000,
              pingInterval: 25_000,
              pingTimeout: 20_000,
            });
            io.use(socketAuth);
            io.on('connection', (socket) => {
              registerPresence(io, socket, redis);
              registerChatHandlers(io, socket);
            });
            return io;
          }

          // server.js
          import http from 'node:http';
          import express from 'express';
          import { createClient } from 'redis';
          import { createAdapter } from '@socket.io/redis-adapter';
          import { config } from './config.js';
          import { historyRouter } from './http/history.routes.js';

          const app = express();
          app.use(express.json());
          app.get('/health', (req, res) => res.json({ ok: true }));
          app.use('/api/v1', historyRouter);

          const httpServer = http.createServer(app);

          const pubClient = createClient({ url: config.REDIS_URL });
          const subClient = pubClient.duplicate();
          for (const c of [pubClient, subClient]) c.on('error', (err) => console.error('redis', err));
          await Promise.all([pubClient.connect(), subClient.connect()]);

          const io = createRealtime(httpServer, {
            adapter: createAdapter(pubClient, subClient),
            redis: pubClient,
            corsOrigin: config.CLIENT_ORIGIN,
          });

          httpServer.listen(config.PORT, () => console.log(\`chat node \${process.pid} on :\${config.PORT}\`));

          process.once('SIGTERM', () => {
            io.close(async () => {
              await Promise.all([pubClient.quit(), subClient.quit()]);
              process.exit(0);
            });
          });
        `),
        versionNote: 'Socket.IO 4.x; `emitWithAck` / `fetchSockets` need 4.6+ / 4.0+.',
      },
    },
    {
      title: 'Authenticate the handshake',
      bullets: [
        'Read the token from `socket.handshake.auth.token` — not from the query string (query strings end up in logs).',
        'Errors passed to `next(err)` reach the client as `connect_error` with `err.message`.',
        'Access tokens expire: schedule a disconnect at `exp`; the client reconnects with a refreshed token.',
      ],
      code: {
        id: 'p08-s2',
        title: 'src/realtime/auth.js',
        language: 'javascript',
        code: dedent(`
          import { verifyAccessToken } from '../lib/tokens.js';

          export function socketAuth(socket, next) {
            const token = socket.handshake.auth?.token;
            if (typeof token !== 'string') return next(new Error('UNAUTHORIZED'));
            try {
              const payload = verifyAccessToken(token);
              socket.data.user = { id: payload.sub, name: payload.name ?? 'user' };
              socket.data.tokenExp = payload.exp * 1000;
              next();
            } catch {
              next(new Error('UNAUTHORIZED'));
            }
          }

          /** Call from the connection handler. */
          export function disconnectOnExpiry(socket) {
            const ms = Math.max(0, socket.data.tokenExp - Date.now());
            const timer = setTimeout(() => {
              socket.emit('auth:expired');
              socket.disconnect(true);
            }, ms);
            socket.on('disconnect', () => clearTimeout(timer));
          }
        `),
      },
    },
    {
      title: 'Persist messages idempotently',
      bullets: [
        '`ON CONFLICT (sender_id, client_msg_id) DO NOTHING` — a retried send returns the original row instead of a duplicate.',
        'Return a `duplicate` flag so the handler does not broadcast twice.',
        'Keyset history: `WHERE room_id = $1 AND id < $before ORDER BY id DESC LIMIT $n`.',
      ],
      code: {
        id: 'p08-s3',
        title: 'src/data/messages.repository.js',
        language: 'javascript',
        code: dedent(`
          import { pool } from './db.js';

          const COLUMNS = 'id, room_id AS "roomId", sender_id AS "senderId", body, client_msg_id AS "clientMsgId", created_at AS "createdAt"';

          export async function insert({ roomId, senderId, body, clientMsgId }) {
            const inserted = await pool.query(
              \`INSERT INTO messages (room_id, sender_id, body, client_msg_id)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (sender_id, client_msg_id) DO NOTHING
               RETURNING \${COLUMNS}\`,
              [roomId, senderId, body, clientMsgId],
            );
            if (inserted.rows[0]) return { message: inserted.rows[0], duplicate: false };

            const existing = await pool.query(
              \`SELECT \${COLUMNS} FROM messages WHERE sender_id = $1 AND client_msg_id = $2\`,
              [senderId, clientMsgId],
            );
            return { message: existing.rows[0], duplicate: true };
          }

          export async function listBefore(roomId, before, limit) {
            const { rows } = await pool.query(
              \`SELECT \${COLUMNS} FROM messages
               WHERE room_id = $1 AND deleted_at IS NULL AND ($2::bigint IS NULL OR id < $2)
               ORDER BY id DESC
               LIMIT $3\`,
              [roomId, before ?? null, limit],
            );
            return rows;
          }

          export async function markRead(roomId, userId, messageId) {
            await pool.query(
              \`UPDATE room_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), $3)
               WHERE room_id = $1 AND user_id = $2\`,
              [roomId, userId, messageId],
            );
          }
        `),
      },
    },
    {
      title: 'Chat event handlers with acks and validation',
      bullets: [
        'Every client payload is untrusted: validate with zod; ignore events without an ack function.',
        'Membership is checked against the DB on join; sending requires being in the Socket.IO room (`socket.rooms.has`).',
        '`io.to(room).emit` goes through the adapter to every node; `socket.to(room)` excludes the sender.',
        'Typing uses `.volatile` — dropped if the client is not ready, which is fine for ephemeral signals.',
      ],
      code: {
        id: 'p08-s4',
        title: 'src/realtime/chat.handlers.js',
        language: 'javascript',
        code: dedent(`
          import { z } from 'zod';
          import * as rooms from '../data/rooms.repository.js';
          import * as messages from '../data/messages.repository.js';
          import { createRateLimiter } from './rate-limit.js';
          import { disconnectOnExpiry } from './auth.js';

          const RoomId = z.coerce.number().int().positive();
          const SendMessage = z.object({
            roomId: RoomId,
            text: z.string().trim().min(1).max(2000),
            clientMsgId: z.string().uuid(),
          });
          const ReadReceipt = z.object({ roomId: RoomId, messageId: z.coerce.number().int().positive() });
          const roomKey = (id) => \`room:\${id}\`;

          export function registerChatHandlers(io, socket) {
            const user = socket.data.user;
            const allowMessage = createRateLimiter({ capacity: 10, refillPerSec: 2 });
            disconnectOnExpiry(socket);

            socket.on('room:join', async (rawRoomId, ack) => {
              if (typeof ack !== 'function') return;
              const parsed = RoomId.safeParse(rawRoomId);
              if (!parsed.success) return ack({ ok: false, error: 'BAD_REQUEST' });
              const roomId = parsed.data;
              try {
                if (!(await rooms.isMember(roomId, user.id))) return ack({ ok: false, error: 'FORBIDDEN' });
                await socket.join(roomKey(roomId));
                ack({ ok: true, recent: (await messages.listBefore(roomId, null, 50)).reverse() });
              } catch (err) {
                console.error(err);
                ack({ ok: false, error: 'INTERNAL' });
              }
            });

            socket.on('room:leave', (rawRoomId) => {
              const parsed = RoomId.safeParse(rawRoomId);
              if (parsed.success) socket.leave(roomKey(parsed.data));
            });

            socket.on('message:send', async (payload, ack) => {
              if (typeof ack !== 'function') return;
              if (!allowMessage()) return ack({ ok: false, error: 'RATE_LIMITED' });
              const parsed = SendMessage.safeParse(payload);
              if (!parsed.success) return ack({ ok: false, error: 'BAD_REQUEST' });
              const { roomId, text, clientMsgId } = parsed.data;
              if (!socket.rooms.has(roomKey(roomId))) return ack({ ok: false, error: 'NOT_IN_ROOM' });

              try {
                const { message, duplicate } = await messages.insert({ roomId, senderId: user.id, body: text, clientMsgId });
                if (!duplicate) io.to(roomKey(roomId)).emit('message:new', message);
                ack({ ok: true, message });
              } catch (err) {
                console.error(err);
                ack({ ok: false, error: 'INTERNAL' });
              }
            });

            socket.on('typing', (rawRoomId) => {
              const parsed = RoomId.safeParse(rawRoomId);
              if (!parsed.success || !socket.rooms.has(roomKey(parsed.data))) return;
              socket.to(roomKey(parsed.data)).volatile.emit('typing', { roomId: parsed.data, userId: user.id });
            });

            socket.on('message:read', async (payload) => {
              const parsed = ReadReceipt.safeParse(payload);
              if (!parsed.success || !socket.rooms.has(roomKey(parsed.data.roomId))) return;
              await messages.markRead(parsed.data.roomId, user.id, parsed.data.messageId).catch(console.error);
              io.to(\`user:\${user.id}\`).emit('message:read', parsed.data); // sync the user's other tabs
            });
          }
        `),
      },
    },
    {
      title: 'Per-socket rate limiting (token bucket)',
      bullets: [
        'Burst of `capacity` messages, then `refillPerSec` sustained. State lives on the socket — no Redis needed because a socket is pinned to one node.',
        'For per-**user** limits across tabs and nodes, move the bucket to Redis (see p11).',
      ],
      code: {
        id: 'p08-s5',
        title: 'src/realtime/rate-limit.js',
        language: 'javascript',
        code: dedent(`
          export function createRateLimiter({ capacity, refillPerSec }) {
            let tokens = capacity;
            let last = Date.now();
            return function allow() {
              const now = Date.now();
              tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
              last = now;
              if (tokens < 1) return false;
              tokens -= 1;
              return true;
            };
          }
        `),
      },
    },
    {
      title: 'Presence that works across nodes',
      bullets: [
        'Each socket joins `user:<id>`. On disconnect, `io.in(\'user:<id>\').fetchSockets()` asks **every** node (via the adapter) whether the user still has sockets.',
        'Only the last socket going away flips the user offline — multiple tabs/devices are handled.',
        'If a node crashes, its users stay in `presence:online`; on startup, or periodically, reconcile against `fetchSockets()`.',
      ],
      code: {
        id: 'p08-s6',
        title: 'src/realtime/presence.js',
        language: 'javascript',
        code: dedent(`
          const ONLINE = 'presence:online';
          const LAST_SEEN = 'presence:last_seen';

          export function registerPresence(io, socket, redis) {
            const userId = String(socket.data.user.id);
            const userRoom = \`user:\${userId}\`;
            socket.join(userRoom);

            redis
              .sAdd(ONLINE, userId)
              .then((added) => {
                if (added) io.emit('presence:update', { userId, online: true });
              })
              .catch(console.error);

            socket.on('disconnect', async () => {
              try {
                const remaining = await io.in(userRoom).fetchSockets();
                if (remaining.length > 0) return; // another tab/device is still connected
                const lastSeen = new Date().toISOString();
                await redis.sRem(ONLINE, userId);
                await redis.hSet(LAST_SEEN, userId, lastSeen);
                io.emit('presence:update', { userId, online: false, lastSeen });
              } catch (err) {
                console.error('presence', err);
              }
            });
          }
        `),
      },
    },
    {
      title: 'Client: auth callback, acks with timeout, retries',
      bullets: [
        'Pass `auth` as a **function** so every reconnect sends the current (refreshed) token.',
        '`socket.timeout(5000).emitWithAck()` rejects if the server does not ack — retry with the **same** `clientMsgId`.',
        'On reconnect, re-join rooms and fetch history `before` nothing / after the last seen id.',
      ],
      code: {
        id: 'p08-s7',
        title: 'client/demo.js (socket.io-client)',
        language: 'javascript',
        code: dedent(`
          import { io } from 'socket.io-client';
          import { getAccessToken, refreshAccessToken } from './auth-client.js';

          const socket = io('https://chat.example.com', {
            transports: ['websocket'],
            auth: (cb) => cb({ token: getAccessToken() }),
          });

          socket.on('connect_error', async (err) => {
            if (err.message === 'UNAUTHORIZED') {
              await refreshAccessToken();
              socket.connect();
            }
          });
          socket.on('auth:expired', () => refreshAccessToken());

          export async function sendMessage(roomId, text, attempts = 3) {
            const clientMsgId = crypto.randomUUID();
            for (let i = 1; i <= attempts; i++) {
              try {
                const res = await socket.timeout(5_000).emitWithAck('message:send', { roomId, text, clientMsgId });
                if (res.ok) return res.message;
                if (res.error !== 'RATE_LIMITED') throw new Error(res.error);
              } catch (err) {
                if (i === attempts) throw err;
              }
              await new Promise((r) => setTimeout(r, 500 * 2 ** i));
            }
          }

          socket.on('connect', async () => {
            const res = await socket.emitWithAck('room:join', 1);
            if (res.ok) res.recent.forEach((m) => console.log(m.senderId, m.body));
          });
          socket.on('message:new', (m) => console.log('new', m.body));
        `),
      },
    },
    {
      title: 'Scale out behind Nginx',
      bullets: [
        'Forward the `Upgrade`/`Connection` headers and raise `proxy_read_timeout` above the ping interval.',
        '`ip_hash` gives sticky sessions (needed if polling is allowed). Cloud LBs: enable session affinity.',
      ],
      code: {
        id: 'p08-s8',
        title: 'nginx.conf (excerpt)',
        language: 'text',
        code: dedent(`
          upstream chat_nodes {
            ip_hash;
            server app1:3000;
            server app2:3000;
          }

          server {
            listen 80;
            location /socket.io/ {
              proxy_pass http://chat_nodes;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "upgrade";
              proxy_set_header Host $host;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_read_timeout 60s;
            }
            location / {
              proxy_pass http://chat_nodes;
            }
          }
        `),
      },
    },
  ],
  testing: {
    bullets: [
      'Start a real `http.Server` on port 0 with `createRealtime()` (in-memory adapter, fake Redis object) and connect with `socket.io-client`.',
      'Test: rejected handshake, member join + broadcast to another client, non-member join `FORBIDDEN`, duplicate `clientMsgId` returns the same id.',
      'Multi-node test (optional, in CI with Redis): two servers with the Redis adapter; a message sent to server A reaches a client on server B.',
      'Always `disconnect()` clients and `io.close()` in `after` hooks, or the test process hangs.',
    ],
    code: {
      id: 'p08-test',
      title: 'test/chat.test.js (node:test + socket.io-client)',
      language: 'javascript',
      code: dedent(`
        import { test, before, after } from 'node:test';
        import assert from 'node:assert/strict';
        import http from 'node:http';
        import { once } from 'node:events';
        import { randomUUID } from 'node:crypto';
        import { io as connect } from 'socket.io-client';
        import { createRealtime } from '../src/realtime/index.js';
        import { seedChat } from './fixtures.js'; // alice + bob in room 1, carol not a member; returns tokens

        let server, io, url, f;
        const fakeRedis = { sAdd: async () => 1, sRem: async () => 1, hSet: async () => 1 };
        const clients = [];

        function client(token) {
          const c = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
          clients.push(c);
          return c;
        }

        before(async () => {
          f = await seedChat();
          server = http.createServer();
          io = createRealtime(server, { redis: fakeRedis, corsOrigin: '*' });
          server.listen(0);
          await once(server, 'listening');
          url = \`http://localhost:\${server.address().port}\`;
        });

        after(() => {
          clients.forEach((c) => c.disconnect());
          io.close();
        });

        test('rejects a connection without a token', async () => {
          const c = client(undefined);
          const [err] = await once(c, 'connect_error');
          assert.equal(err.message, 'UNAUTHORIZED');
        });

        test('members receive messages broadcast to the room', async () => {
          const alice = client(f.aliceToken);
          const bob = client(f.bobToken);
          await Promise.all([once(alice, 'connect'), once(bob, 'connect')]);
          assert.equal((await alice.emitWithAck('room:join', f.roomId)).ok, true);
          assert.equal((await bob.emitWithAck('room:join', f.roomId)).ok, true);

          const received = once(bob, 'message:new');
          const ack = await alice.emitWithAck('message:send', { roomId: f.roomId, text: 'hi bob', clientMsgId: randomUUID() });
          assert.equal(ack.ok, true);
          const [message] = await received;
          assert.equal(message.body, 'hi bob');
        });

        test('non-members cannot join', async () => {
          const carol = client(f.carolToken);
          await once(carol, 'connect');
          assert.deepEqual(await carol.emitWithAck('room:join', f.roomId), { ok: false, error: 'FORBIDDEN' });
        });

        test('retrying with the same clientMsgId does not duplicate', async () => {
          const alice = client(f.aliceToken);
          await once(alice, 'connect');
          await alice.emitWithAck('room:join', f.roomId);
          const payload = { roomId: f.roomId, text: 'once', clientMsgId: randomUUID() };
          const first = await alice.emitWithAck('message:send', payload);
          const second = await alice.emitWithAck('message:send', payload);
          assert.equal(second.message.id, first.message.id);
        });
      `),
    },
  },
  security: [
    'Authenticate in `io.use` — never trust a `userId` sent in an event payload; always use `socket.data.user`.',
    'Authorise every room action against the DB membership, not just "is in the Socket.IO room" (rooms are joined server-side only).',
    'Restrict `cors.origin` to your client origins — WebSockets are not protected by the browser same-origin policy (Cross-Site WebSocket Hijacking).',
    'Store and broadcast message bodies as text; the client must render with text nodes / escaping (XSS).',
    '`maxHttpBufferSize` + per-socket token bucket + zod length limits stop flooding and oversized frames.',
    'Disconnect sockets whose token has expired; on logout-all, emit to `user:<id>` and `disconnectSockets()`.',
    'Run Redis on a private network with a password/ACL; the adapter channel would otherwise let anyone inject broadcasts.',
  ],
  deployment: {
    bullets: [
      'Compose runs two app containers, Redis, Postgres and Nginx — enough to prove cross-node delivery locally.',
      'Graceful shutdown: `io.close()` disconnects clients, which reconnect to another node automatically.',
      'Use one Redis for the adapter; for very large fan-out consider the sharded adapter (`createShardedAdapter`, Redis 7+).',
    ],
    code: {
      id: 'p08-deploy',
      title: 'docker-compose.yml',
      language: 'yaml',
      code: dedent(`
        x-app: &app
          build: .
          environment:
            DATABASE_URL: postgres://chat:chat@db:5432/chat
            REDIS_URL: redis://redis:6379
            JWT_ACCESS_SECRET: \${JWT_ACCESS_SECRET:?required}
            CLIENT_ORIGIN: http://localhost:8080
            PORT: 3000
          depends_on: [db, redis]

        services:
          app1: *app
          app2: *app
          nginx:
            image: nginx:1.27-alpine
            volumes: ["./nginx.conf:/etc/nginx/conf.d/default.conf:ro"]
            ports: ["8080:80"]
            depends_on: [app1, app2]
          redis:
            image: redis:7-alpine
          db:
            image: postgres:17-alpine
            environment:
              POSTGRES_USER: chat
              POSTGRES_PASSWORD: chat
              POSTGRES_DB: chat
            volumes: ["./migrations:/docker-entrypoint-initdb.d:ro"]
      `),
    },
  },
  extensions: [
    'Connection state recovery (`connectionStateRecovery` option) to replay missed events after short disconnects.',
    'File/image messages via pre-signed upload URLs.',
    'Message edit/delete events and reactions.',
    'Push notifications for offline users through p09\'s notification service.',
    'End-to-end encryption for direct rooms (keys stay on clients).',
    'Load test with the Artillery Socket.IO engine and measure fan-out latency.',
  ],
};

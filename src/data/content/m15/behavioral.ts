import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'strategy-pattern': {
    summary: 'The strategy pattern defines a family of interchangeable algorithms behind one interface and lets the caller choose one at runtime — ideal for payment providers, notification channels, pricing rules and auth methods.',
    topics: ['strategy', 'interchangeable algorithms', 'runtime selection', 'payment providers', 'notification channels', 'fallback', 'passport strategies'],
    sections: [
      section('introduction', undefined,
        text('"Send via email, or SMS, or push — depending on user preference, with fallback" quickly turns into nested `if`s. The strategy pattern turns each option into a pluggable object with the same method.'),
      ),
      section('definition', 'Parts of the pattern',
        bullets(
          '**Strategy interface**: the common method, e.g. `send(user, message)` or `charge(amount, source)`.',
          '**Concrete strategies**: `EmailStrategy`, `SmsStrategy`, `StripeStrategy`… each implementing it.',
          '**Context**: the code that uses a strategy without knowing which one (`NotificationService`).',
          'Selection can be by config, user preference, request data, or A/B experiment.',
        ),
        table('Strategy vs factory', ['', 'Strategy', 'Factory'], [
          ['Concern', 'Which *behaviour* to run', 'Which *object* to create'],
          ['Typical use', 'Swap algorithms at runtime', 'Construct the right implementation'],
          ['Often together', 'A factory may create the chosen strategy', ''],
        ]),
      ),
      section('why', 'Why it helps',
        bullets(
          'Open/closed: adding a provider adds a strategy, no edits to the context.',
          'Each strategy is small and testable in isolation.',
          'Runtime choice: per tenant, per country, per user.',
          'Enables fallbacks and gradual migration between vendors.',
        ),
      ),
      section('internals', 'How the context uses strategies',
        steps(
          'Strategies are registered (map, DI container, array).',
          'The context selects one based on input/config.',
          'It calls the shared method; it never branches on the concrete type.',
          'Optionally: loop over an ordered list for fallback; record which strategy succeeded.',
        ),
        note('Passport.js (third-party) is a well-known Node example: `passport.use(new LocalStrategy(...))`, `passport.authenticate(\'google\')`.'),
      ),
      section('visual', 'Selecting a strategy',
        flow(['NotificationService.notify(user, msg)', 'Pick strategies from user.preferences', 'push.send → fails', 'sms.send → ok', 'return result'],
          { title: 'Strategy with fallback', direction: 'horizontal' }),
      ),
      section('example', 'Notification and payment strategies',
        code({
          title: 'Notification channels with fallback (runnable)',
          code: dedent(`
            const strategies = {
              email: { send: async (user) => 'email:' + user.email },
              sms: { send: async (user) => 'sms:' + user.phone },
              push: { send: async () => { throw new Error('no device token'); } },
            };

            class NotificationService {
              constructor(strategies) { this.strategies = strategies; }
              async notify(user, message) {
                for (const channel of user.preferences) {
                  try {
                    return await this.strategies[channel].send(user, message);
                  } catch (e) {
                    console.log(channel + ' failed: ' + e.message);
                  }
                }
                throw new Error('all channels failed');
              }
            }

            const service = new NotificationService(strategies);
            service
              .notify({ email: 'a@x.io', phone: '+1555', preferences: ['push', 'sms'] }, 'Your order shipped')
              .then((r) => console.log(r));
          `),
          expectedOutput: 'push failed: no device token\nsms:+1555',
          explanation: [
            'The service never checks `if (channel === "sms")`.',
            'Fallback order comes from data (user preferences).',
            'Adding `whatsapp` = one new entry in `strategies`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Payment strategy interface (TypeScript)',
          language: 'typescript',
          code: dedent(`
            export interface PaymentStrategy {
              readonly id: 'stripe' | 'paypal' | 'fake';
              charge(input: { amountCents: number; currency: string; source: string; idempotencyKey: string }):
                Promise<{ providerRef: string }>;
            }

            export class CheckoutService {
              constructor(private readonly strategies: Map<string, PaymentStrategy>) {}

              async pay(order: Order, method: string) {
                const strategy = this.strategies.get(method);
                if (!strategy) throw new UnsupportedPaymentMethod(method);
                return strategy.charge({
                  amountCents: order.totalCents,
                  currency: order.currency,
                  source: order.paymentSource,
                  idempotencyKey: 'order-' + order.id,
                });
              }
            }
          `),
          explanation: [
            'Amounts in integer cents avoid floating-point money bugs.',
            'An idempotency key per order lets retries avoid double charges.',
            'Each concrete strategy wraps one provider SDK (adapter inside a strategy).',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Per-country payment providers selected by billing address.',
          'Pricing/discount strategies selected per customer tier.',
          'Storage strategies (S3 vs local) per environment.',
          'Retry/backoff strategies configurable per downstream.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Type checks inside the context',
          code: dedent(`
            // ❌ context still knows every concrete type
            if (strategy instanceof StripeStrategy) { /* special case */ }
            // ✅ push the difference into the strategy itself
            await strategy.charge(input); // Stripe-specific logic lives in StripeStrategy
          `),
          explanation: ['If the context branches on type, the pattern has not removed the coupling.'],
        }),
        bullets(
          'Strategies with different method signatures — the context cannot swap them.',
          'Silent fallback that hides a broken provider (always log and alert).',
          'Classes for strategies that are just one pure function.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Use a payment or notification example, show the interface, the context and how a new provider is added without editing the context. Mention idempotency for payments.'),
      ),
      section('practice', 'Practice',
        text('Implement shipping-cost strategies (`standard`, `express`, `free-over-100`) and a `quote(cart, method)` context; add a new `same-day` strategy without modifying `quote`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'One interface, many interchangeable algorithms.',
          'Context selects at runtime and never branches on type.',
          'Supports open/closed, testing and fallbacks.',
          'In JS, a strategy can be a plain function.',
        ),
      ),
    ],
    revisionNotes: [
      'Strategy = interchangeable behaviour behind one interface.',
      'Context does not know concrete strategies.',
      'Factory chooses/creates; strategy is what runs.',
      'Passport strategies are a real Node example.',
      'Fallback lists + logging for provider failover.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'You must support Stripe in the EU and a local provider in another market, chosen by customer country, with more providers expected. What design fits best?',
        options: [
          'A large if/else in the checkout controller',
          'A PaymentStrategy interface with one implementation per provider and a selector by country',
          'A global singleton that switches providers at startup only',
          'Copy the checkout service per provider',
        ],
        answer: 1,
        explanation: 'Strategies isolate provider logic and allow runtime selection; new providers do not touch checkout.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const s = { a: (x) => x * 2, b: (x) => x + 10 };\nconst run = (name, x) => (s[name] ?? ((v) => v))(x);\nconsole.log(run('a', 5), run('b', 5), run('c', 5));",
        options: ['10 15 5', '10 15 undefined', '10 15 TypeError', '7 15 5'],
        answer: 0,
        explanation: 'Unknown names fall back to the identity function, so c returns 5.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Design patterns',
        question: 'Explain the strategy pattern with a backend example.',
        shortAnswer: 'It encapsulates interchangeable algorithms behind one interface so a context can pick one at runtime — for example payment providers implementing charge() selected by country.',
        detailedAnswer: [
          'Interface: `charge({ amount, currency, source, idempotencyKey })`.',
          'Strategies: Stripe, PayPal, Fake — each wraps its SDK.',
          'Context: CheckoutService selects by config/user and calls charge().',
          'New provider = new class + registration.',
          'Testing: inject a fake strategy.',
        ],
        followUp: 'How would you implement automatic failover between two providers safely?',
        trap: 'Describing a switch statement that calls different functions as "the strategy pattern".',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Design patterns',
        question: 'You use a strategy to fail over from one payment provider to another on errors. What can go wrong and how do you make it safe?',
        shortAnswer: 'A timeout on the first provider may still have charged the customer, so blind failover can double-charge; only fail over on errors known to be pre-charge, use idempotency keys, and reconcile ambiguous outcomes before retrying elsewhere.',
        detailedAnswer: [
          'Timeouts are ambiguous: the request may have succeeded.',
          'Classify errors: declined/invalid (do not fail over), network-before-send (safe), timeout (unknown).',
          'Idempotency keys protect retries to the *same* provider, not across providers.',
          'Record payment attempts; query provider status before failover.',
          'Circuit breaker to skip an unhealthy provider for new payments.',
        ],
        followUp: 'How would you reconcile payments whose status is unknown?',
        trap: 'Retrying on the second provider after any error.',
      },
    ],
  },

  'observer-pattern': {
    summary: 'In the observer pattern a subject keeps a list of observers and notifies them when something happens; Node\'s EventEmitter is the built-in implementation — synchronous, in-process — unlike pub/sub, which decouples publishers and subscribers through a broker.',
    topics: ['observer', 'subject', 'EventEmitter', 'on/emit/off', 'synchronous listeners', 'pub/sub', 'memory leaks', 'error events'],
    sections: [
      section('introduction', undefined,
        text('When an order is created you might email a receipt, update analytics and award loyalty points. Hard-coding those calls in `createOrder` couples it to every feature. Observers let features subscribe instead.'),
      ),
      section('definition', 'Observer vs pub/sub',
        table('Observer vs publish/subscribe', ['', 'Observer (EventEmitter)', 'Pub/sub (Redis, Kafka, SNS, RabbitMQ)'], [
          ['Coupling', 'Observers register directly on the subject object', 'Publishers and subscribers only know topic/channel names'],
          ['Location', 'Same process', 'Across processes/services'],
          ['Delivery', 'Synchronous function calls', 'Asynchronous via a broker'],
          ['Durability', 'None — lost if process dies', 'Depends on broker (Kafka durable; Redis pub/sub fire-and-forget)'],
          ['Back-pressure', 'None', 'Broker-dependent (queues, consumer lag)'],
        ]),
      ),
      section('why', 'Why use it',
        bullets(
          'The subject does not need to know who reacts — new reactions are added without editing it.',
          'Node core is built on it: streams, `http.Server`, `process`, sockets all extend EventEmitter.',
          'Natural fit for lifecycle hooks (`server.on(\'close\')`, `job.on(\'completed\')`).',
        ),
      ),
      section('internals', 'How EventEmitter behaves',
        steps(
          '`on(event, fn)` appends a listener; `once` wraps it to remove itself after the first call.',
          '`emit(event, ...args)` calls listeners **synchronously**, in registration order, and returns `true` if there were any.',
          'If a listener throws, the exception propagates out of `emit` and later listeners do not run.',
          'Emitting `\'error\'` with no listener throws the error (can crash the process).',
          'More than 10 listeners for one event prints a `MaxListenersExceededWarning` — usually a leak.',
          'Async listeners are fire-and-forget: their rejected promises are not handled by `emit` (unless `captureRejections` is enabled).',
        ),
        warn('Because emit is synchronous, a slow listener blocks the subject. Offload heavy work (emails) to a queue rather than doing it inline in a listener.'),
      ),
      section('visual', 'Subject and observers',
        flow(['OrderService.emit("order.created")', 'Listener: send receipt', 'Listener: update analytics', 'Listener: award points'],
          { title: 'One event, many independent reactions', direction: 'horizontal' }),
      ),
      section('example', 'Build one, then use EventEmitter',
        code({
          title: 'Minimal subject (runnable)',
          code: dedent(`
            class Subject {
              #listeners = new Map();
              on(event, fn) {
                if (!this.#listeners.has(event)) this.#listeners.set(event, []);
                this.#listeners.get(event).push(fn);
                return () => this.off(event, fn);          // unsubscribe handle
              }
              off(event, fn) {
                const list = this.#listeners.get(event) ?? [];
                this.#listeners.set(event, list.filter((f) => f !== fn));
              }
              emit(event, payload) {
                for (const fn of this.#listeners.get(event) ?? []) fn(payload);
              }
            }

            const orders = new Subject();
            const unsubscribe = orders.on('created', (o) => console.log('email: receipt for', o.id));
            orders.on('created', (o) => console.log('analytics: +', o.total));

            console.log('before emit');
            orders.emit('created', { id: 1, total: 30 });
            console.log('after emit');
            unsubscribe();
            orders.emit('created', { id: 2, total: 10 });
          `),
          expectedOutput: 'before emit\nemail: receipt for 1\nanalytics: + 30\nafter emit\nanalytics: + 10',
          explanation: [
            'Listeners run synchronously between "before" and "after".',
            'Order of execution = order of registration.',
            'After unsubscribing, only analytics reacts to order 2.',
          ],
          runnable: true,
        }),
        code({
          title: 'EventEmitter in a service',
          code: dedent(`
            const { EventEmitter } = require('node:events');

            class OrderService extends EventEmitter {
              async create(data) {
                const order = { id: 42, ...data };
                this.emit('order.created', order);
                return order;
              }
            }

            const service = new OrderService();
            service.on('order.created', (o) => console.log('queue receipt email for', o.id));
            service.on('order.created', async (o) => { await loyalty.award(o.customerId); }); // fire-and-forget!
            service.on('error', (err) => console.error('order events error', err));

            service.create({ customerId: 7 }).then(() => console.log('created'));
          `),
          expectedOutput: 'queue receipt email for 42\ncreated',
          explanation: [
            'The first listener runs during `emit`, before `create` resolves.',
            'The async listener returns a promise that `emit` ignores — handle errors inside it, or use `new EventEmitter({ captureRejections: true })`.',
            'Always add an `error` listener on emitters that may emit errors.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'In-process domain events inside a modular monolith (`orders` module emits, `loyalty` module listens).',
          'Library hooks: BullMQ `worker.on(\'failed\')`, `server.on(\'connection\')`.',
          'When reactions must survive crashes or run in other services, switch to a message broker (pub/sub, outbox).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Listener leak',
          code: dedent(`
            // ❌ adds a new listener on every request → MaxListenersExceededWarning, memory leak
            app.get('/stream', (req, res) => { bus.on('tick', (t) => res.write(t)); });
            // ✅ remove it when the client disconnects
            app.get('/stream', (req, res) => {
              const onTick = (t) => res.write(t);
              bus.on('tick', onTick);
              req.on('close', () => bus.off('tick', onTick));
            });
          `),
          explanation: ['Every `on` needs a matching `off` when the listener\'s owner goes away.'],
        }),
        bullets(
          'Assuming listeners run asynchronously.',
          'No `error` listener → process crash.',
          'Using in-process events for things that must not be lost (payments, emails) — use a durable queue.',
          'Hidden control flow: too many events make it hard to trace what happens.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Stress that EventEmitter is synchronous and in-process, explain the `error` event rule, and contrast observer with broker-based pub/sub.'),
      ),
      section('practice', 'Practice',
        text('Add `once(event, fn)` to the minimal Subject and make `emit` continue calling other listeners when one throws, collecting errors into an `AggregateError`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Subject notifies registered observers.',
          'EventEmitter: synchronous, ordered, in-process.',
          'Unhandled `error` event throws.',
          'Remove listeners to avoid leaks.',
          'Pub/sub = observer across a broker, async and decoupled.',
        ),
      ),
    ],
    revisionNotes: [
      'emit calls listeners synchronously in registration order.',
      'A throwing listener stops later listeners and propagates from emit.',
      '"error" without a listener throws.',
      'Default max 10 listeners per event → leak warning.',
      'Async listener rejections are not handled by emit (captureRejections option).',
      'Observer = in-process; pub/sub = via broker.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Given Node\'s EventEmitter, what is printed?',
        code: "const { EventEmitter } = require('node:events');\nconst e = new EventEmitter();\ne.on('x', () => console.log('listener'));\nconsole.log('A');\ne.emit('x');\nconsole.log('B');",
        options: ['A B listener', 'A listener B', 'listener A B', 'A B'],
        answer: 1,
        explanation: 'emit runs listeners synchronously, so "listener" prints between A and B.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What happens when an EventEmitter emits "error" and no "error" listener is registered?',
        options: ['Nothing', 'The error is logged as a warning', 'The error is thrown, which can crash the process', 'It is retried later'],
        answer: 2,
        explanation: 'The "error" event is special: with no listener, emit throws the error.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'An order service emits `order.created` in-process and a listener sends the confirmation email. Occasionally emails are never sent after deploys. Why, and what is the fix?',
        options: [
          'EventEmitter randomly drops events',
          'In-process events are lost if the process stops before the listener finishes; use a durable queue (ideally via an outbox) for must-happen side effects',
          'Emails need a larger thread pool',
          'Listeners must be registered after emit',
        ],
        answer: 1,
        explanation: 'EventEmitter has no durability. Restarts during deploys drop in-flight work; a queue with retries guarantees delivery.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Design patterns',
        question: 'How does Node\'s EventEmitter implement the observer pattern, and what are its key behaviours?',
        shortAnswer: 'An emitter keeps per-event listener arrays; emit calls them synchronously in registration order; an unhandled "error" event throws; and more than 10 listeners triggers a leak warning.',
        detailedAnswer: [
          '`on`/`once`/`off`/`emit`; `prependListener` to jump the queue.',
          'Synchronous: a slow listener blocks the emitter.',
          'Throwing listener aborts the rest and propagates from emit.',
          'Async listeners: rejections unhandled unless captureRejections.',
          '`events.once(emitter, name)` returns a promise; `events.on` an async iterator.',
        ],
        followUp: 'How would you make listeners run asynchronously?',
        trap: 'Saying emit schedules listeners on the event loop like setImmediate.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Design patterns',
        question: 'When would you replace in-process EventEmitter events with a message broker?',
        shortAnswer: 'When reactions must survive crashes, run in other processes or services, scale independently, be retried, or when consumers are slow enough to need back-pressure.',
        detailedAnswer: [
          'Durability: broker persists messages; EventEmitter loses them on restart.',
          'Multi-instance: each replica has its own emitter — events do not cross processes.',
          'Retries and dead-letter queues for failing consumers.',
          'Independent scaling of consumers.',
          'Cost: operational complexity, eventual consistency, need for idempotency.',
        ],
        followUp: 'How do you publish to a broker atomically with a database write?',
        trap: 'Using Redis pub/sub as if it were durable — it drops messages for disconnected subscribers.',
      },
    ],
  },
};

export default content;

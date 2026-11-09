import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p07: Project = {
  id: 'p07',
  number: 7,
  level: 'intermediate',
  title: 'E-commerce REST API',
  status: 'ready',
  summary: 'Products, carts and orders on Express 5 + MongoDB (Mongoose) with atomic stock reservation inside multi-document transactions, an order state machine and aggregation-based sales reports.',
  skills: ['MongoDB', 'Mongoose', 'Multi-document transactions', 'Atomic updates', 'State machine', 'Aggregation pipeline', 'Error handling'],
  estHours: 14,
  prerequisites: [
    'm09-mongoose',
    'm09-schemas-and-models',
    'm09-relationships',
    'm09-aggregation',
    'm09-indexes-in-mongodb',
    'm09-transactions',
    'm12-nosql-injection',
    'm08-centralized-error-handling',
  ],
  requirements: {
    functional: [
      'Catalogue: list products with text search, category/price filters, sorting and pagination; admin CRUD.',
      'Cart per user: add, change quantity, remove items; prices re-read from the catalogue at checkout.',
      'Checkout: reserve stock for every line **atomically** (all or nothing), create the order, empty the cart.',
      'Order states: `pending_payment → paid → shipped → delivered`, plus `cancelled` and `refunded`; illegal transitions return `409`.',
      'Cancelling a pending/paid order restocks its items in the same transaction.',
      'Admin reports: revenue per day and top products for a date range (aggregation pipeline).',
      'Optional `Idempotency-Key` header on checkout prevents duplicate orders on client retries.',
    ],
    nonFunctional: [
      'Never oversell: concurrent checkouts for the last unit → exactly one succeeds.',
      'Money stored as integer cents — no floating-point rounding errors.',
      'MongoDB must run as a replica set (transactions require it) — single-node replica set in dev.',
      'Indexes for every list/filter path; text index on name/description.',
      'Order lines snapshot name, SKU and unit price so later catalogue edits do not change past orders.',
    ],
  },
  architecture: {
    diagramId: 'layered-architecture',
    flow: [
      { label: 'POST /orders', detail: 'requireAuth, Idempotency-Key' },
      { label: 'Load cart', detail: 'and current product prices' },
      { label: 'startTransaction', detail: 'mongoose connection.transaction()' },
      { label: 'Reserve stock', detail: 'updateOne({ stock ≥ qty }, $inc -qty) per line' },
      { label: 'Create order', detail: 'snapshot lines, totals, status pending_payment' },
      { label: 'Clear cart → commit', detail: 'any failure aborts everything' },
    ],
    notes: [
      'The conditional update `{ _id, stock: { $gte: qty } }` + `$inc` is atomic on one document; the transaction makes it atomic across *all* lines plus the order insert.',
      '`connection.transaction()` (Mongoose) retries on `TransientTransactionError` automatically.',
      'Order status changes use `findOneAndUpdate({ _id, status: from })` — the filter on the current status makes the transition a compare-and-set.',
      'Payment itself is stubbed (`POST /orders/:id/pay`) — the real provider + webhook flow is in p12.',
    ],
  },
  folderStructure: dedent(`
    shop-api/
    ├── docker-compose.yml          # mongo as single-node replica set
    ├── src/
    │   ├── app.js / server.js
    │   ├── config.js
    │   ├── db.js                   # mongoose.connect, sanitizeFilter
    │   ├── models/
    │   │   ├── product.model.js
    │   │   ├── cart.model.js
    │   │   ├── order.model.js
    │   │   └── user.model.js
    │   ├── modules/
    │   │   ├── products/ (routes, controller, service, schema)
    │   │   ├── cart/
    │   │   ├── orders/   (… + order-state.js)
    │   │   └── reports/
    │   └── middleware/{require-auth.js,authorize.js,validate.js,error-handler.js}
    └── test/
        └── checkout.test.js        # mongodb-memory-server replica set
  `),
  databaseDesign: [
    entity('products (collection)', [
      ['_id', 'ObjectId', 'PK', ''],
      ['name', 'String', 'required, ≤ 200', 'Text index (name, description)'],
      ['slug', 'String', 'required, unique index', ''],
      ['sku', 'String', 'required, unique index', ''],
      ['description', 'String', '', ''],
      ['category', 'String', 'required', 'Compound index (category, price)'],
      ['priceCents', 'Number (int)', 'required, ≥ 0', 'Integer cents'],
      ['stock', 'Number (int)', 'required, ≥ 0', 'Decremented atomically'],
      ['active', 'Boolean', 'default true', 'Inactive products cannot be bought'],
      ['createdAt / updatedAt', 'Date', 'timestamps: true', ''],
    ]),
    entity('carts (collection)', [
      ['_id', 'ObjectId', 'PK', ''],
      ['user', 'ObjectId → users', 'required, unique index', 'One cart per user'],
      ['items[]', '{ product: ObjectId, quantity: Number }', 'quantity 1–99', 'Embedded — always read with the cart'],
      ['updatedAt', 'Date', 'TTL option', 'Optionally expire abandoned carts'],
    ]),
    entity('orders (collection)', [
      ['_id', 'ObjectId', 'PK', ''],
      ['user', 'ObjectId → users', 'required', 'Index (user, createdAt -1)'],
      ['items[]', '{ product, name, sku, unitPriceCents, quantity }', 'required, ≥ 1 item', 'Snapshot at checkout'],
      ['subtotalCents / shippingCents / totalCents', 'Number', 'required', ''],
      ['status', 'String enum', 'pending_payment | paid | shipped | delivered | cancelled | refunded', 'Index (status, createdAt)'],
      ['history[]', '{ status, at, by }', '', 'Audit of transitions'],
      ['shippingAddress', 'embedded doc', 'required', 'Copied, not referenced'],
      ['idempotencyKey', 'String', 'unique per user (partial index)', 'Duplicate checkout protection'],
      ['createdAt / updatedAt', 'Date', 'timestamps', ''],
    ]),
    entity('users (collection)', [
      ['_id', 'ObjectId', 'PK', ''],
      ['email', 'String', 'unique index, lowercase', ''],
      ['passwordHash', 'String', 'select: false', 'Never returned by default'],
      ['role', 'String', "enum ['customer','admin']", ''],
    ]),
  ],
  endpoints: [
    { method: 'GET', path: '/api/v1/products?q=&category=&minPrice=&maxPrice=&sort=price&page=', description: 'Catalogue search.', auth: 'public' },
    { method: 'GET', path: '/api/v1/products/:slug', description: 'Product detail.', auth: 'public' },
    { method: 'POST', path: '/api/v1/products', description: 'Create product.', auth: 'admin' },
    { method: 'PATCH', path: '/api/v1/products/:id', description: 'Update price/stock/active.', auth: 'admin' },
    { method: 'GET', path: '/api/v1/cart', description: 'Cart with live prices and line totals.', auth: 'customer' },
    { method: 'PUT', path: '/api/v1/cart/items/:productId', description: '{ quantity } — add or set quantity (0 removes).', auth: 'customer' },
    { method: 'DELETE', path: '/api/v1/cart/items/:productId', description: 'Remove line.', auth: 'customer' },
    { method: 'POST', path: '/api/v1/orders', description: 'Checkout cart → 201 order (optional Idempotency-Key).', auth: 'customer' },
    { method: 'GET', path: '/api/v1/orders', description: 'My orders, newest first.', auth: 'customer' },
    { method: 'GET', path: '/api/v1/orders/:id', description: 'My order (admin: any).', auth: 'owner / admin' },
    { method: 'POST', path: '/api/v1/orders/:id/pay', description: 'Stub payment → status paid.', auth: 'owner' },
    { method: 'POST', path: '/api/v1/orders/:id/cancel', description: 'Cancel + restock (pending/paid only).', auth: 'owner / admin' },
    { method: 'PATCH', path: '/api/v1/admin/orders/:id/status', description: '{ status: shipped|delivered|refunded }.', auth: 'admin' },
    { method: 'GET', path: '/api/v1/admin/reports/sales?from=&to=', description: 'Revenue per day + top products.', auth: 'admin' },
  ],
  steps: [
    {
      title: 'Connect with safe defaults',
      bullets: [
        'Install `mongoose@8` (third-party).',
        '`sanitizeFilter: true` wraps query objects containing `$` operators from user input in `$eq` — blocks `{ "$ne": null }` style NoSQL injection.',
        'Set `autoIndex: false` in production and build indexes in a migration/deploy step.',
      ],
      code: {
        id: 'p07-s1',
        title: 'src/db.js',
        language: 'javascript',
        code: dedent(`
          import mongoose from 'mongoose';
          import { config } from './config.js';

          mongoose.set('sanitizeFilter', true);
          mongoose.set('strictQuery', true);

          export async function connectDb() {
            await mongoose.connect(config.MONGODB_URI, {
              maxPoolSize: 20,
              serverSelectionTimeoutMS: 5_000,
              autoIndex: config.NODE_ENV !== 'production',
            });
            return mongoose.connection;
          }

          export const disconnectDb = () => mongoose.disconnect();
        `),
      },
    },
    {
      title: 'Models and indexes',
      bullets: [
        'Integer cents with a validator; `min: 0` on stock is a safety net (the atomic update is the real guard).',
        'Order lines are embedded snapshots; `history` records every status change.',
        'Partial unique index on `(user, idempotencyKey)` only where the key exists.',
      ],
      code: {
        id: 'p07-s2',
        title: 'models/product.model.js + models/order.model.js',
        language: 'javascript',
        code: dedent(`
          import mongoose from 'mongoose';
          const { Schema, model } = mongoose;

          const int = { type: Number, validate: { validator: Number.isInteger, message: '{PATH} must be an integer' } };

          const productSchema = new Schema(
            {
              name: { type: String, required: true, trim: true, maxlength: 200 },
              slug: { type: String, required: true, unique: true },
              sku: { type: String, required: true, unique: true },
              description: { type: String, default: '' },
              category: { type: String, required: true, index: true },
              priceCents: { ...int, required: true, min: 0 },
              stock: { ...int, required: true, min: 0 },
              active: { type: Boolean, default: true },
            },
            { timestamps: true },
          );
          productSchema.index({ name: 'text', description: 'text' });
          productSchema.index({ category: 1, priceCents: 1 });
          export const Product = model('Product', productSchema);

          export const ORDER_STATUSES = ['pending_payment', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];

          const orderSchema = new Schema(
            {
              user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
              items: {
                type: [
                  {
                    _id: false,
                    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
                    name: String,
                    sku: String,
                    unitPriceCents: { ...int, required: true },
                    quantity: { ...int, required: true, min: 1 },
                  },
                ],
                validate: [(v) => v.length > 0, 'Order needs at least one item'],
              },
              subtotalCents: { ...int, required: true },
              shippingCents: { ...int, required: true },
              totalCents: { ...int, required: true },
              status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment' },
              history: [{ _id: false, status: String, at: { type: Date, default: Date.now }, by: Schema.Types.ObjectId }],
              shippingAddress: {
                name: { type: String, required: true },
                line1: { type: String, required: true },
                city: { type: String, required: true },
                postalCode: { type: String, required: true },
                country: { type: String, required: true, minlength: 2, maxlength: 2 },
              },
              idempotencyKey: String,
            },
            { timestamps: true },
          );
          orderSchema.index({ user: 1, createdAt: -1 });
          orderSchema.index({ status: 1, createdAt: -1 });
          orderSchema.index(
            { user: 1, idempotencyKey: 1 },
            { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
          );
          export const Order = model('Order', orderSchema);
        `),
        versionNote: 'Mongoose 8.x.',
      },
    },
    {
      title: 'Cart service',
      bullets: [
        'Upsert the cart; set quantity with the positional `$` operator, or `$push` a new line.',
        'Validate that the product exists and is active, and cap quantity at the current stock for nicer UX (the real check is at checkout).',
      ],
      code: {
        id: 'p07-s3',
        title: 'modules/cart/cart.service.js',
        language: 'javascript',
        code: dedent(`
          import { Cart } from '../../models/cart.model.js';
          import { Product } from '../../models/product.model.js';
          import { NotFoundError, ConflictError } from '../../errors.js';

          export async function setQuantity(userId, productId, quantity) {
            if (quantity === 0) {
              await Cart.updateOne({ user: userId }, { $pull: { items: { product: productId } } });
              return getCart(userId);
            }
            const product = await Product.findOne({ _id: productId, active: true }).lean();
            if (!product) throw new NotFoundError('Product not found');
            if (quantity > product.stock) throw new ConflictError(\`Only \${product.stock} left in stock\`);

            const updated = await Cart.updateOne(
              { user: userId, 'items.product': productId },
              { $set: { 'items.$.quantity': quantity } },
            );
            if (updated.matchedCount === 0) {
              await Cart.updateOne(
                { user: userId },
                { $push: { items: { product: productId, quantity } } },
                { upsert: true },
              );
            }
            return getCart(userId);
          }

          export async function getCart(userId) {
            const cart = await Cart.findOne({ user: userId })
              .populate('items.product', 'name slug priceCents stock active')
              .lean();
            const items = (cart?.items ?? [])
              .filter((i) => i.product)
              .map((i) => ({ ...i, lineTotalCents: i.product.priceCents * i.quantity }));
            return { items, subtotalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0) };
          }
        `),
      },
    },
    {
      title: 'Checkout: reserve stock in a transaction',
      bullets: [
        'Sort lines by product id so concurrent checkouts touch documents in the same order (fewer write conflicts).',
        'Each `updateOne` only matches if enough stock remains; `modifiedCount === 0` → throw → whole transaction aborts, no partial reservation.',
        'Pass `{ session }` to **every** operation inside the transaction — forgetting it runs that write outside the transaction.',
        'Duplicate `Idempotency-Key` → return the existing order (`200`) instead of creating a new one.',
      ],
      code: {
        id: 'p07-s4',
        title: 'modules/orders/checkout.service.js',
        language: 'javascript',
        code: dedent(`
          import mongoose from 'mongoose';
          import { Product } from '../../models/product.model.js';
          import { Cart } from '../../models/cart.model.js';
          import { Order } from '../../models/order.model.js';
          import { BadRequestError, ConflictError } from '../../errors.js';

          const shippingFor = (subtotal) => (subtotal >= 5_000 ? 0 : 499); // free shipping over $50

          export async function checkout(userId, { shippingAddress }, idempotencyKey) {
            if (idempotencyKey) {
              const existing = await Order.findOne({ user: userId, idempotencyKey });
              if (existing) return { order: existing, replayed: true };
            }

            const order = await mongoose.connection.transaction(async (session) => {
              const cart = await Cart.findOne({ user: userId }).session(session);
              if (!cart || cart.items.length === 0) throw new BadRequestError('Cart is empty');

              const lines = [...cart.items].sort((a, b) => String(a.product).localeCompare(String(b.product)));
              const items = [];

              for (const { product: productId, quantity } of lines) {
                const product = await Product.findOneAndUpdate(
                  { _id: productId, active: true, stock: { $gte: quantity } },
                  { $inc: { stock: -quantity } },
                  { session, new: true, projection: { name: 1, sku: 1, priceCents: 1 } },
                );
                if (!product) throw new ConflictError(\`Insufficient stock for product \${productId}\`);
                items.push({ product: product._id, name: product.name, sku: product.sku, unitPriceCents: product.priceCents, quantity });
              }

              const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
              const shippingCents = shippingFor(subtotalCents);

              const [created] = await Order.create(
                [
                  {
                    user: userId,
                    items,
                    subtotalCents,
                    shippingCents,
                    totalCents: subtotalCents + shippingCents,
                    shippingAddress,
                    idempotencyKey,
                    history: [{ status: 'pending_payment', by: userId }],
                  },
                ],
                { session },
              );

              cart.items = [];
              await cart.save({ session });
              return created;
            });

            return { order, replayed: false };
          }
        `),
        versionNote: '`Model.create([...], { session })` needs the array form when passing options. Transactions require a replica set or sharded cluster.',
      },
    },
    {
      title: 'Order state machine',
      bullets: [
        'Allowed transitions in one table; anything else → `409 INVALID_TRANSITION`.',
        'Compare-and-set: `findOneAndUpdate({ _id, status: from }, …)`. If another request changed the status first, the filter misses and we report a conflict.',
        'Cancel restocks every line inside a transaction.',
      ],
      code: {
        id: 'p07-s5',
        title: 'modules/orders/order-state.js',
        language: 'javascript',
        code: dedent(`
          import mongoose from 'mongoose';
          import { Order } from '../../models/order.model.js';
          import { Product } from '../../models/product.model.js';
          import { ConflictError, NotFoundError } from '../../errors.js';

          export const TRANSITIONS = {
            pending_payment: ['paid', 'cancelled'],
            paid: ['shipped', 'cancelled', 'refunded'],
            shipped: ['delivered'],
            delivered: ['refunded'],
            cancelled: [],
            refunded: [],
          };

          export async function transition(orderId, to, actorId, { session, filter = {} } = {}) {
            const order = await Order.findOne({ _id: orderId, ...filter }).session(session ?? null);
            if (!order) throw new NotFoundError('Order not found');
            if (!TRANSITIONS[order.status].includes(to)) {
              throw new ConflictError(\`Cannot move order from \${order.status} to \${to}\`, 'INVALID_TRANSITION');
            }
            const updated = await Order.findOneAndUpdate(
              { _id: orderId, status: order.status },
              { $set: { status: to }, $push: { history: { status: to, at: new Date(), by: actorId } } },
              { new: true, session },
            );
            if (!updated) throw new ConflictError('Order was modified concurrently, retry');
            return { before: order.status, order: updated };
          }

          export function cancel(orderId, actor) {
            const filter = actor.role === 'admin' ? {} : { user: actor.id };
            return mongoose.connection.transaction(async (session) => {
              const { order } = await transition(orderId, 'cancelled', actor.id, { session, filter });
              await Product.bulkWrite(
                order.items.map((i) => ({ updateOne: { filter: { _id: i.product }, update: { $inc: { stock: i.quantity } } } })),
                { session },
              );
              return order;
            });
          }
        `),
      },
    },
    {
      title: 'Sales report with the aggregation pipeline',
      bullets: [
        '`$match` first (uses the `status, createdAt` index), then `$unwind` lines and `$group`.',
        '`$facet` returns daily revenue and top products in one round trip.',
      ],
      code: {
        id: 'p07-s6',
        title: 'modules/reports/reports.service.js',
        language: 'javascript',
        code: dedent(`
          import { Order } from '../../models/order.model.js';

          export async function salesReport({ from, to }) {
            const [result] = await Order.aggregate([
              { $match: { status: { $in: ['paid', 'shipped', 'delivered'] }, createdAt: { $gte: from, $lt: to } } },
              {
                $facet: {
                  daily: [
                    {
                      $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        orders: { $sum: 1 },
                        revenueCents: { $sum: '$totalCents' },
                      },
                    },
                    { $sort: { _id: 1 } },
                  ],
                  topProducts: [
                    { $unwind: '$items' },
                    {
                      $group: {
                        _id: '$items.product',
                        name: { $first: '$items.name' },
                        unitsSold: { $sum: '$items.quantity' },
                        revenueCents: { $sum: { $multiply: ['$items.unitPriceCents', '$items.quantity'] } },
                      },
                    },
                    { $sort: { revenueCents: -1 } },
                    { $limit: 10 },
                  ],
                },
              },
            ]);
            return result;
          }
        `),
      },
    },
    {
      title: 'Controller with Idempotency-Key and Mongo-aware errors',
      bullets: [
        '`CastError` (bad ObjectId) → `400`; Mongoose `ValidationError` → `400`; duplicate key `11000` → `409`.',
        'Validate ObjectIds in zod: `z.string().regex(/^[a-f\\d]{24}$/i)`.',
      ],
      code: {
        id: 'p07-s7',
        title: 'orders.controller.js + error-handler.js',
        language: 'javascript',
        code: dedent(`
          // orders.controller.js
          import * as checkoutService from './checkout.service.js';

          export async function create(req, res) {
            const key = req.get('idempotency-key');
            const { order, replayed } = await checkoutService.checkout(req.user.id, req.valid.body, key);
            res.status(replayed ? 200 : 201).location(\`/api/v1/orders/\${order.id}\`).json({ data: order });
          }

          // middleware/error-handler.js
          import mongoose from 'mongoose';
          import { AppError } from '../errors.js';

          export function errorHandler(err, req, res, next) {
            if (err instanceof AppError) {
              return res.status(err.status).json({ error: { code: err.code, message: err.message } });
            }
            if (err instanceof mongoose.Error.CastError) {
              return res.status(400).json({ error: { code: 'BAD_ID', message: \`Invalid \${err.path}\` } });
            }
            if (err instanceof mongoose.Error.ValidationError) {
              const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
              return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details } });
            }
            if (err.code === 11000) {
              return res.status(409).json({ error: { code: 'DUPLICATE', message: \`Duplicate \${Object.keys(err.keyValue ?? {})}\` } });
            }
            console.error(err);
            res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
          }
        `),
      },
    },
  ],
  testing: {
    bullets: [
      '`mongodb-memory-server` (third-party) `MongoMemoryReplSet` gives a real replica set in-process — transactions work in tests.',
      'Oversell test: stock = 1, two users check out in parallel → one `201`, one `409`, final stock `0`.',
      'State machine: unit-test `TRANSITIONS` (e.g. `shipped → cancelled` rejected).',
      'Idempotency: same key twice → same order id, stock decremented once.',
    ],
    code: {
      id: 'p07-test',
      title: 'test/checkout.test.js (Vitest + Supertest)',
      language: 'javascript',
      code: dedent(`
        import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
        import request from 'supertest';
        import mongoose from 'mongoose';
        import { MongoMemoryReplSet } from 'mongodb-memory-server';
        import { app } from '../src/app.js';
        import { Product } from '../src/models/product.model.js';
        import { createUserWithToken } from './helpers.js';

        let replSet;
        const address = { name: 'Ada', line1: '1 Main St', city: 'London', postalCode: 'N1', country: 'GB' };

        beforeAll(async () => {
          replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
          await mongoose.connect(replSet.getUri());
          await mongoose.connection.syncIndexes();
        });
        afterAll(async () => {
          await mongoose.disconnect();
          await replSet.stop();
        });
        beforeEach(() => mongoose.connection.db.dropDatabase().then(() => mongoose.connection.syncIndexes()));

        async function addToCart(token, productId, quantity) {
          await request(app)
            .put(\`/api/v1/cart/items/\${productId}\`)
            .set('Authorization', \`Bearer \${token}\`)
            .send({ quantity })
            .expect(200);
        }

        const checkout = (token, key) => {
          const req = request(app).post('/api/v1/orders').set('Authorization', \`Bearer \${token}\`);
          if (key) req.set('Idempotency-Key', key);
          return req.send({ shippingAddress: address });
        };

        describe('checkout', () => {
          it('never oversells the last unit', async () => {
            const product = await Product.create({ name: 'Lamp', slug: 'lamp', sku: 'L-1', category: 'home', priceCents: 2500, stock: 1 });
            const alice = await createUserWithToken('alice@test.dev');
            const bob = await createUserWithToken('bob@test.dev');
            await addToCart(alice.token, product.id, 1);
            await addToCart(bob.token, product.id, 1);

            const results = await Promise.all([checkout(alice.token), checkout(bob.token)]);
            expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
            expect((await Product.findById(product.id)).stock).toBe(0);
          });

          it('calculates totals in cents with shipping', async () => {
            const product = await Product.create({ name: 'Mug', slug: 'mug', sku: 'M-1', category: 'home', priceCents: 1299, stock: 10 });
            const user = await createUserWithToken('carol@test.dev');
            await addToCart(user.token, product.id, 2);
            const res = await checkout(user.token).expect(201);
            expect(res.body.data).toMatchObject({ subtotalCents: 2598, shippingCents: 499, totalCents: 3097, status: 'pending_payment' });
          });

          it('replays the same order for a repeated Idempotency-Key', async () => {
            const product = await Product.create({ name: 'Pen', slug: 'pen', sku: 'P-1', category: 'office', priceCents: 300, stock: 5 });
            const user = await createUserWithToken('dan@test.dev');
            await addToCart(user.token, product.id, 2);
            const first = await checkout(user.token, 'key-123').expect(201);
            const second = await checkout(user.token, 'key-123').expect(200);
            expect(second.body.data._id).toBe(first.body.data._id);
            expect((await Product.findById(product.id)).stock).toBe(3);
          });
        });
      `),
    },
  },
  security: [
    'NoSQL injection: zod validates types (a string cannot be `{ "$gt": "" }`), and `sanitizeFilter` is a second layer.',
    'Never trust client prices — the order is priced from the database inside the transaction.',
    'Ownership: customers query orders with `{ _id, user: req.user.id }`; admins bypass via role check.',
    '`passwordHash` has `select: false`; responses go through explicit projections/serializers.',
    'Rate-limit checkout and cart writes per user to stop inventory-hoarding bots.',
    'Note: `express-mongo-sanitize` mutates `req.query`, which is read-only in Express 5 — rely on zod + `sanitizeFilter` instead.',
  ],
  deployment: {
    bullets: [
      'MongoDB must run as a replica set even in dev; Atlas clusters are replica sets by default.',
      'Use a single-node replica set in Compose; the health check initiates it on first start.',
      'Build indexes during deploy (`Model.syncIndexes()` script) with `autoIndex: false` at runtime.',
    ],
    code: {
      id: 'p07-deploy',
      title: 'docker-compose.yml',
      language: 'yaml',
      code: dedent(`
        services:
          mongo:
            image: mongo:8
            command: ["--replSet", "rs0", "--bind_ip_all"]
            ports: ["27017:27017"]
            volumes: [mongodata:/data/db]
            healthcheck:
              test: >
                mongosh --quiet --eval
                "try { rs.status().ok } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] }).ok }"
              interval: 5s
              retries: 20
          api:
            build: .
            environment:
              MONGODB_URI: mongodb://mongo:27017/shop?replicaSet=rs0
              JWT_ACCESS_SECRET: \${JWT_ACCESS_SECRET:?required}
            ports: ["3000:3000"]
            depends_on:
              mongo:
                condition: service_healthy
        volumes:
          mongodata:
      `),
    },
  },
  extensions: [
    'Reservation expiry: auto-cancel `pending_payment` orders after 30 min with a scheduled job (p10) and restock.',
    'Product variants (size/colour) with per-variant stock.',
    'Coupons and promotions with usage limits (atomic `$inc` on a usage counter).',
    'Product reviews with an aggregated average rating updated on write.',
    'Change streams to push stock updates to clients in real time.',
    'Port the same domain to PostgreSQL and compare `SELECT ... FOR UPDATE` with Mongo\'s conditional updates.',
  ],
};

import type { ModuleContent } from '../../../types';
import basics from './basics';
import promises from './promises';
import combinators from './combinators';
import asyncAwait from './async';
import loop from './loop';
import scheduling from './scheduling';
import io from './io';

/**
 * Module 05 — Asynchronous Node.js.
 *   basics.ts       sync vs async, blocking, callbacks, callback hell
 *   promises.ts     promises, chaining
 *   combinators.ts  Promise.all / allSettled / race / any
 *   async.ts        async/await, async error handling
 *   loop.ts         event loop, phases, microtasks, macrotasks
 *   scheduling.ts   nextTick, setImmediate, setTimeout, execution order
 *   io.ts           libuv thread pool, asynchronous I/O
 */
const content = {
  ...basics,
  ...promises,
  ...combinators,
  ...asyncAwait,
  ...loop,
  ...scheduling,
  ...io,
} as ModuleContent;

export default content;

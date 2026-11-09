import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'javascript-execution-fundamentals': {
    summary: 'How a JavaScript engine runs your code: parse, compile, then execute one execution context at a time on a single call stack.',
    topics: ['V8', 'execution context', 'call stack', 'memory heap', 'creation phase', 'execution phase', 'single-threaded', 'run-to-completion', 'JIT'],
    sections: [
      section('introduction', undefined,
        text("Before learning any JavaScript feature, you need a mental model of **how the engine runs code**. Hoisting, closures, `this` and the event loop all become simple once you know what an execution context and the call stack are."),
        text('Node.js runs your JavaScript with **V8**, the same engine as Chrome.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**Engine** — the program that parses, compiles and executes JavaScript (V8 in Node.js).',
          '**Execution context** — the environment a piece of code runs in: its variables, its scope chain and its `this` value.',
          '**Call stack** — a stack (last in, first out) of execution contexts. The one on top is the code running right now.',
          '**Memory heap** — where objects, arrays and functions are stored. Variables on the stack hold *references* into the heap.',
          '**Single-threaded** — one call stack, so only one piece of JavaScript runs at any moment.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          'Explains why `var` variables are `undefined` before their line runs (creation phase).',
          'Explains why an infinite recursion crashes with "Maximum call stack size exceeded".',
          'Explains why a long `while` loop freezes a Node.js server: nothing else can run until the stack is empty.',
          'Explains why callbacks from `setTimeout` always run *after* the current script finishes (run-to-completion).',
        ),
      ),
      section('internals', 'How the engine runs a file',
        flow([
          'Source code: your .js file as text',
          'Parser: builds an Abstract Syntax Tree (AST)',
          'Ignition: compiles AST to bytecode and interprets it',
          'TurboFan: re-compiles hot functions to optimized machine code',
        ], { title: 'V8 pipeline', direction: 'horizontal' }),
        text('Running code is organised into **execution contexts**. There are three kinds:'),
        table('Kinds of execution context', ['Kind', 'Created when', 'Contains'], [
          ['Global', 'The script / module starts', 'Global variables and functions, top-level `this`'],
          ['Function', 'Every time a function is **called**', 'Parameters, local variables, `arguments` (regular functions), `this`'],
          ['Eval', '`eval()` runs', 'Rarely used — avoid'],
        ]),
        text('Each execution context is created in **two phases**:'),
        steps(
          '**Creation phase** — the engine scans the code. Function declarations are stored completely. `var` variables are created and set to `undefined`. `let`/`const`/`class` bindings are created but left **uninitialized** (the Temporal Dead Zone). `this` and the outer scope reference are fixed.',
          '**Execution phase** — the code runs line by line. Assignments happen, functions are called.',
        ),
        text('Every function call **pushes** a new context on the call stack; every `return` **pops** it. When the stack is empty, the engine is idle and the event loop can hand it the next callback.'),
        diagram('heap-stack', 'Stack frames hold primitives and references; objects live in the heap.'),
      ),
      section('example', 'Watching the call stack',
        code({
          title: 'Push and pop',
          code: dedent(`
            function a() {
              console.log('a start');
              b();
              console.log('a end');
            }
            function b() {
              console.log('b');
            }
            console.log('global start');
            a();
            console.log('global end');
          `),
          expectedOutput: 'global start\na start\nb\na end\nglobal end',
          explanation: [
            'Stack: [global] → logs `global start`.',
            '`a()` pushes a frame: [global, a] → logs `a start`.',
            '`b()` pushes another: [global, a, b] → logs `b`, then `b` returns and is popped.',
            'Back in `a` → logs `a end`, `a` is popped. Back in global → `global end`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Creation phase vs execution phase',
          code: dedent(`
            console.log(typeof greet);
            console.log(count);
            var count = 5;
            function greet() {
              return 'hi';
            }
            console.log(count);
          `),
          expectedOutput: 'function\nundefined\n5',
          explanation: [
            'During the creation phase `greet` is stored as a full function and `count` is created with the value `undefined`.',
            'Line 1: `greet` already exists → `function`.',
            'Line 2: `count` exists but the assignment has not run yet → `undefined`.',
            'After `count = 5` runs in the execution phase → `5`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Stack overflow',
          code: dedent(`
            function recurse(n) {
              return recurse(n + 1);
            }
            try {
              recurse(0);
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
          `),
          expectedOutput: 'RangeError: Maximum call stack size exceeded',
          explanation: [
            'Each call pushes a new frame and nothing ever returns.',
            'The stack has a fixed size (around 10k frames in V8, depending on frame size), so V8 throws a `RangeError`.',
            'JavaScript engines do not do tail-call optimisation in practice, so even a "tail call" grows the stack.',
          ],
          runnable: true,
        }),
        code({
          title: 'Run-to-completion',
          code: dedent(`
            setTimeout(() => console.log('timer'), 0);
            for (let i = 0; i < 3; i++) {
              console.log('loop ' + i);
            }
          `),
          expectedOutput: 'loop 0\nloop 1\nloop 2\ntimer',
          explanation: [
            '`setTimeout(fn, 0)` does not run `fn` now; it asks the runtime to queue it later.',
            'The current script keeps the call stack busy until it finishes.',
            'Only when the stack is empty does the event loop run the timer callback.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a Node.js server',
        bullets(
          'Each incoming HTTP request is handled by a callback that runs on the **same** call stack.',
          'If one handler does 2 seconds of CPU work (e.g. a huge `JSON.parse` or a synchronous hash), every other request waits 2 seconds.',
          'Stack traces in error logs are literally a snapshot of the call stack at the moment the `Error` was created — read them top-down.',
        ),
        code({
          title: 'A request handler that blocks everyone (do not do this)',
          code: dedent(`
            const http = require('node:http');

            http.createServer((req, res) => {
              if (req.url === '/slow') {
                const end = Date.now() + 5000;
                while (Date.now() < end) {} // occupies the call stack for 5s
              }
              res.end('ok');
            }).listen(3000);
          `),
          explanation: [
            'While `/slow` spins, a request to `/` cannot even start — the single call stack is busy.',
            'CPU-heavy work belongs in worker threads or another service (Module 11).',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Thinking `setTimeout(fn, 0)` runs immediately — it runs after the current stack empties and microtasks drain.',
          'Thinking Node.js is "multi-threaded JavaScript" — your JS runs on one thread; libuv uses extra threads for some I/O only.',
          'Writing deep recursion over user-controlled input (e.g. nested JSON) — it can crash with `RangeError`.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Draw the call stack while you explain. Interviewers love seeing frames pushed and popped for a small nested-function example.'),
        interviewTip('Mention the **two phases** (creation and execution) — it is the root explanation for hoisting and the TDZ.'),
      ),
      section('practice', 'Practice',
        text('Write three functions `first`, `second`, `third` where each calls the next and logs before and after the call. Predict the output on paper, then run it.'),
      ),
      section('summary', 'Summary',
        bullets(
          'V8 parses code to an AST, compiles to bytecode (Ignition) and optimises hot code (TurboFan).',
          'Code runs inside execution contexts: global, function (one per call) and eval.',
          'Each context has a creation phase (bindings set up) and an execution phase (code runs).',
          'One call stack → one thing at a time; a callback never interrupts running code.',
        ),
      ),
    ],
    revisionNotes: [
      'Execution context = variable environment + scope chain (outer reference) + this.',
      'Creation phase: functions stored fully, var = undefined, let/const/class uninitialized (TDZ).',
      'Call stack is LIFO; a function call pushes, return pops.',
      'Stack overflow → RangeError: Maximum call stack size exceeded.',
      'Run-to-completion: async callbacks only run when the stack is empty.',
      'Objects live in the heap; variables hold references to them.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          function x() { console.log('x'); y(); }
          function y() { console.log('y'); }
          console.log('start');
          x();
          console.log('end');
        `),
        options: ['start end x y', 'start x y end', 'x y start end', 'start y x end'],
        answer: 1,
        explanation: 'Calls are synchronous: `x` is pushed, logs `x`, pushes `y` which logs `y`, both pop, then `end`. Nothing is deferred, so `end` cannot come before `x`.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'During the creation phase of a function execution context, what value does a `var` variable get?',
        options: ['Its assigned value', 'null', 'undefined', 'It is left uninitialized (TDZ)'],
        answer: 2,
        explanation: '`var` bindings are created and initialised to `undefined`. Leaving a binding uninitialized (TDZ) is what happens to `let`/`const`, not `var`.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A Node.js API becomes unresponsive for every user whenever one user uploads a large CSV that is parsed with a synchronous loop. What is the root cause?',
        options: [
          'The thread pool is too small',
          'The synchronous parsing occupies the single call stack, so no other callback can run',
          'The garbage collector pauses the process permanently',
          'HTTP keep-alive is disabled',
        ],
        answer: 1,
        explanation: 'JavaScript runs on one call stack. Synchronous CPU work blocks the event loop for all requests. The thread pool only helps for specific async APIs, not your own loop.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Execution model',
        question: 'What is the call stack in JavaScript?',
        shortAnswer: 'A LIFO stack of execution contexts; calling a function pushes a frame, returning pops it, and the top frame is the code currently running.',
        detailedAnswer: [
          'The global execution context sits at the bottom while the script runs.',
          'Each function call creates a new function execution context and pushes it.',
          'There is a single call stack per thread, which is why JavaScript is described as single-threaded.',
          'Unbounded recursion overflows it: `RangeError: Maximum call stack size exceeded`.',
          'Error stack traces are a snapshot of the call stack.',
        ],
        followUp: 'If JavaScript has one call stack, how can Node.js handle many requests at once?',
        trap: 'Saying async callbacks run "in parallel" on the stack — they run later, one at a time, when the stack is empty.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Execution model',
        question: 'What is an execution context and what happens in its creation and execution phases?',
        shortAnswer: 'It is the environment code runs in (variables, scope chain, this). In the creation phase bindings are set up; in the execution phase code runs line by line.',
        detailedAnswer: [
          'Kinds: global, function (one per call) and eval.',
          'Creation phase: function declarations stored fully, `var` initialised to `undefined`, `let`/`const`/`class` created but uninitialized (TDZ).',
          'The outer lexical environment reference is set — this forms the scope chain.',
          'The `this` binding is decided (for regular functions, by how they were called).',
          'Execution phase: assignments and calls run in order.',
        ],
        followUp: 'How does the creation phase explain hoisting?',
        trap: 'Saying the engine "moves declarations to the top of the file" — nothing is moved; bindings are created before execution.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'var-let-and-const': {
    summary: '`var` is function-scoped and initialised to undefined; `let` and `const` are block-scoped and live in the Temporal Dead Zone until their line runs; `const` forbids reassignment, not mutation.',
    topics: ['var', 'let', 'const', 'block scope', 'function scope', 'Temporal Dead Zone', 'redeclaration', 'global object', 'Object.freeze'],
    sections: [
      section('introduction', undefined,
        text('JavaScript has three ways to declare a variable. They differ in **scope**, **hoisting behaviour** and **whether you can reassign** them. Modern Node.js code uses `const` by default and `let` when a value must change.'),
      ),
      section('definition', 'Definition',
        table('var vs let vs const', ['', 'var', 'let', 'const'], [
          ['Scope', 'Function (or global)', 'Block `{ }`', 'Block `{ }`'],
          ['Before its line runs', '`undefined`', 'ReferenceError (TDZ)', 'ReferenceError (TDZ)'],
          ['Redeclare in same scope', 'Allowed', 'SyntaxError', 'SyntaxError'],
          ['Reassign', 'Yes', 'Yes', 'No — TypeError'],
          ['Must initialise', 'No', 'No', 'Yes'],
          ['Top-level in a classic script', 'Becomes a property of `globalThis`', 'Not on `globalThis`', 'Not on `globalThis`'],
          ['New binding per loop iteration', 'No (one shared variable)', 'Yes', 'Yes (for...of / for...in)'],
        ]),
      ),
      section('why', 'Why let and const were added (ES2015)',
        bullets(
          '`var` leaks out of `if` and `for` blocks, causing accidental sharing (the classic loop + `setTimeout` bug).',
          '`var` silently returns `undefined` before assignment, hiding ordering bugs. The TDZ turns those into loud errors.',
          '`const` documents intent: "this binding never changes", which makes code easier to reason about.',
        ),
      ),
      section('internals', 'How the engine handles them',
        bullets(
          'Every scope has an **environment record**. A function call creates one; so does every block containing `let`/`const`/`class`.',
          '`var` bindings live in the nearest **function** environment and are initialised to `undefined` during the creation phase.',
          '`let`/`const` bindings live in the **block** environment and are created *uninitialized*. Accessing them before the declaration line executes throws — this window is the **Temporal Dead Zone (TDZ)**.',
          'In a `for (let i ...)` loop the engine creates a **fresh binding per iteration** and copies the value forward, so closures capture different `i` values.',
          '`const` makes the *binding* immutable. The object it points to is still mutable unless you `Object.freeze` it (and freeze is shallow).',
        ),
        note('In a Node.js CommonJS file, every file is wrapped in a function, so a top-level `var` does **not** become a property of `globalThis` there. In a browser classic script (and in this playground), it does.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Block scope vs function scope',
          code: dedent(`
            function demo() {
              if (true) {
                var a = 'var';
                let b = 'let';
                const c = 'const';
              }
              console.log(a);
              console.log(typeof b);
              console.log(typeof c);
            }
            demo();
          `),
          expectedOutput: 'var\nundefined\nundefined',
          explanation: [
            '`a` is scoped to the whole function, so it is visible after the `if` block.',
            '`b` and `c` only exist inside the block. Outside it they are undeclared, and `typeof` on an undeclared name returns `"undefined"` instead of throwing.',
          ],
          runnable: true,
        }),
        code({
          title: 'The Temporal Dead Zone',
          code: dedent(`
            console.log(x);
            var x = 1;
            try {
              console.log(y);
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            let y = 2;
            console.log(y);
          `),
          expectedOutput: "undefined\nReferenceError: Cannot access 'y' before initialization\n2",
          explanation: [
            '`x` was initialised to `undefined` in the creation phase, so reading it early is allowed (but useless).',
            '`y` exists (the engine knows about it) but is uninitialized until `let y = 2` runs → ReferenceError.',
            'Note the message says "before initialization", not "is not defined" — the binding exists, it is just in the TDZ.',
          ],
          runnable: true,
        }),
        code({
          title: 'const prevents reassignment, not mutation',
          code: dedent(`
            const config = { port: 3000 };
            config.port = 8080;
            console.log(config);
            try {
              config = {};
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            const frozen = Object.freeze({ port: 3000 });
            frozen.port = 9999;
            console.log(frozen.port);
          `),
          expectedOutput: '{ port: 8080 }\nTypeError: Assignment to constant variable.\n3000',
          explanation: [
            'Changing a property mutates the object; the `config` binding still points to the same object, so this is fine.',
            'Assigning a new object to `config` changes the binding → TypeError.',
            '`Object.freeze` makes properties read-only. In sloppy mode the write is silently ignored; in strict mode it would throw a TypeError.',
          ],
          runnable: true,
        }),
        code({
          title: 'Loops: one shared var vs a let per iteration',
          code: dedent(`
            for (var i = 0; i < 3; i++) {
              setTimeout(() => console.log('var i:', i), 0);
            }
            for (let j = 0; j < 3; j++) {
              setTimeout(() => console.log('let j:', j), 0);
            }
          `),
          expectedOutput: 'var i: 3\nvar i: 3\nvar i: 3\nlet j: 0\nlet j: 1\nlet j: 2',
          explanation: [
            'All three `var` callbacks share **one** `i`. By the time timers run, the loop finished and `i` is `3`.',
            'With `let`, each iteration gets its own `j`, so each callback remembers its own value.',
          ],
          runnable: true,
        }),
        code({
          title: 'Global object leakage (classic scripts)',
          code: dedent(`
            var fromVar = 1;
            let fromLet = 2;
            console.log(globalThis.fromVar, globalThis.fromLet);
          `),
          expectedOutput: '1 undefined',
          explanation: [
            'In a classic script, top-level `var` creates a property on the global object.',
            'Top-level `let`/`const` live in a separate declarative record and do not.',
            'In a Node.js CommonJS module both would print `undefined` because the file is wrapped in a function.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In backend code',
        code({
          title: 'Typical Node.js module',
          code: dedent(`
            const express = require('express');   // never reassigned → const
            const PORT = Number(process.env.PORT) || 3000;

            const app = express();
            let requestCount = 0;                  // changes → let

            app.use((req, res, next) => {
              requestCount++;
              next();
            });
          `),
          explanation: [
            'Imports, configuration and app instances are `const`.',
            'Only true counters/accumulators use `let`. `var` has no place in modern code.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Believing `const` objects are immutable — use `Object.freeze` (shallow) or treat data immutably.',
          'Using `var` in loops with async callbacks — every callback sees the final value.',
          'Re-declaring with `let` in the same scope (SyntaxError) after copy-pasting code.',
          'Shadowing an outer variable by accident inside a block, then wondering why the outer one did not change.',
        ),
        code({
          title: 'Redeclaration (SyntaxError — whole script fails to parse)',
          code: dedent(`
            let user = 'ana';
            let user = 'raj'; // SyntaxError: Identifier 'user' has already been declared
          `),
          explanation: ['This is a parse-time error: not even the first line runs.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Say "let and const **are** hoisted, but uninitialized" — it shows you know the TDZ rather than the myth that they are not hoisted.'),
        interviewTip('Distinguish *binding* immutability (`const`) from *value* immutability (`Object.freeze`).'),
      ),
      section('practice', 'Practice',
        text('Rewrite a function that uses `var` in a `for` loop with `setTimeout` so it prints 0, 1, 2 — once using `let`, once using a closure (IIFE) while keeping `var`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Default to `const`; use `let` when reassigning; avoid `var`.',
          '`var` = function scope + `undefined` before assignment.',
          '`let`/`const` = block scope + TDZ.',
          '`const` freezes the binding, not the object.',
        ),
      ),
    ],
    revisionNotes: [
      'var: function-scoped, initialised to undefined, can redeclare.',
      'let/const: block-scoped, hoisted but uninitialized → TDZ ReferenceError.',
      'const: no reassignment (TypeError: Assignment to constant variable.), object still mutable.',
      'Object.freeze is shallow; writes fail silently in sloppy mode, throw in strict mode.',
      'for (let i…) creates a new binding each iteration.',
      'typeof on an undeclared name → "undefined"; typeof on a TDZ name → ReferenceError.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          const settings = { debug: false };
          settings.debug = true;
          console.log(settings.debug);
        `),
        options: ['false', 'TypeError: Assignment to constant variable.', 'true', 'undefined'],
        answer: 2,
        explanation: '`const` only stops you from reassigning `settings`. Changing a property mutates the same object, which is allowed.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What happens here?',
        code: dedent(`
          let total = 10;
          function calc() {
            console.log(total);
            let total = 20;
          }
          calc();
        `),
        options: ['10', 'undefined', '20', "ReferenceError: Cannot access 'total' before initialization"],
        answer: 3,
        explanation: 'The inner `let total` shadows the outer one for the whole function body. Reading it before its declaration hits the TDZ. It does not fall back to the outer `10`.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This should log 0, 1, 2 after one second. What is the bug?',
        code: dedent(`
          for (var i = 0; i < 3; i++) {
            setTimeout(() => console.log(i), 1000);
          }
        `),
        options: [
          'setTimeout needs a string argument',
          'var creates one shared i, so all callbacks print 3; use let',
          'The arrow function cannot read i',
          'The loop condition should be i <= 3',
        ],
        answer: 1,
        explanation: '`var` is function-scoped, so one `i` is shared and equals 3 when the timers fire. `let` creates a binding per iteration.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Variables',
        question: 'What are the differences between var, let and const?',
        shortAnswer: '`var` is function-scoped and initialised to undefined; `let` and `const` are block-scoped and in the TDZ until declared; `const` cannot be reassigned.',
        detailedAnswer: [
          'Scope: `var` → function, `let`/`const` → block.',
          'Hoisting: all are hoisted; `var` gets `undefined`, `let`/`const` stay uninitialized (TDZ).',
          'Redeclaration: allowed for `var`, SyntaxError for `let`/`const`.',
          '`const` must be initialised and cannot be reassigned, but the object it holds can be mutated.',
          'Top-level `var` in a classic script becomes a global object property; `let`/`const` do not.',
        ],
        followUp: 'Does const make an object immutable?',
        trap: 'Saying let/const are "not hoisted".',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Variables',
        question: 'What is the Temporal Dead Zone?',
        shortAnswer: 'The period between entering a scope and executing a `let`/`const`/`class` declaration, during which the binding exists but any access throws a ReferenceError.',
        detailedAnswer: [
          'The binding is created in the creation phase but marked uninitialized.',
          'Accessing it (even with `typeof`) throws `ReferenceError: Cannot access \'x\' before initialization`.',
          'The TDZ is temporal (about time of execution), not positional: a function declared above can read the variable if it is *called* after the declaration runs.',
          'It shadows outer variables of the same name for the whole block, so you cannot fall back to the outer value.',
        ],
        code: {
          id: 'm01-tdz-temporal', language: 'javascript', runnable: true,
          code: dedent(`
            function read() { return value; }
            let value = 'ready';
            console.log(read());
          `),
          expectedOutput: 'ready',
        },
        followUp: 'Why does typeof throw for a TDZ variable but not for an undeclared one?',
        trap: 'Thinking the TDZ depends on where the code is written rather than when it runs.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Variables',
        question: 'Does const make an object immutable? How do you actually prevent changes?',
        shortAnswer: 'No — `const` only prevents reassigning the variable. Use `Object.freeze` (shallow) or immutable update patterns to prevent mutation.',
        detailedAnswer: [
          '`const obj = {}` then `obj.a = 1` is valid.',
          '`Object.freeze(obj)` makes existing properties read-only and prevents adding new ones.',
          'Freeze is shallow: nested objects stay mutable unless frozen recursively.',
          'Writes to a frozen object throw in strict mode and are silently ignored in sloppy mode.',
        ],
        followUp: 'How would you deep-freeze a config object?',
        trap: 'Assuming Object.freeze is deep.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'primitive-and-reference-types': {
    summary: 'Primitives (string, number, bigint, boolean, undefined, null, symbol) are immutable values copied on assignment; objects are stored in the heap and variables hold references to them.',
    topics: ['primitive types', 'reference types', 'typeof', 'immutability', 'pass by value', 'pass by sharing', 'shallow copy', 'deep copy', 'structuredClone', 'floating point'],
    sections: [
      section('introduction', undefined,
        text('Why does changing a copied number leave the original alone, but changing a "copied" object changes both? Because JavaScript values come in two families: **primitives** and **objects (references)**.'),
      ),
      section('definition', 'Definition',
        table('The 7 primitive types + objects', ['Type', 'Example', '`typeof`'], [
          ['string', "`'hello'`", '"string"'],
          ['number', '`42`, `3.14`, `NaN`, `Infinity`', '"number"'],
          ['bigint', '`10n`', '"bigint"'],
          ['boolean', '`true`', '"boolean"'],
          ['undefined', '`undefined`', '"undefined"'],
          ['null', '`null`', '"object" (historic bug)'],
          ['symbol', "`Symbol('id')`", '"symbol"'],
          ['object (reference)', '`{}`, `[]`, `new Map()`, functions, dates', '"object" (or "function")'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Mutating a request body object inside a helper changes it for every other middleware that holds the same reference.',
          'Comparing two objects with `===` compares references, not content — two equal-looking objects are not equal.',
          'Numbers are 64-bit floats: money and large IDs need care (`0.1 + 0.2`, database bigint IDs).',
        ),
      ),
      section('internals', 'How values are stored',
        bullets(
          'A variable holding a primitive holds the value itself (conceptually — V8 may box doubles internally, but semantics are by-value).',
          'An object is allocated on the **heap**; the variable holds a **reference** (pointer) to it.',
          'Assignment copies what the variable holds: the value for primitives, the reference for objects.',
          'Function arguments are passed the same way: **always by value**, where the value of an object variable is a reference. This is often called "pass by sharing".',
          'Primitives are immutable: string methods return new strings. When you call `"abc".toUpperCase()`, the engine temporarily wraps the primitive in a `String` object (autoboxing) to find the method.',
          'Numbers follow IEEE-754 double precision: integers are exact only up to `Number.MAX_SAFE_INTEGER` (2^53 − 1). Use `BigInt` beyond that.',
        ),
        diagram('heap-stack', 'Two variables can hold references to the same heap object.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Copying a primitive vs copying a reference',
          code: dedent(`
            let a = 10;
            let b = a;
            b = 20;
            console.log(a, b);

            const obj1 = { count: 1 };
            const obj2 = obj1;
            obj2.count = 99;
            console.log(obj1.count);
            console.log(obj1 === obj2);
            console.log({ x: 1 } === { x: 1 });
          `),
          expectedOutput: '10 20\n99\ntrue\nfalse',
          explanation: [
            '`b = a` copied the number 10. Changing `b` does not affect `a`.',
            '`obj2 = obj1` copied the **reference**. Both names point to one object, so the change is visible through both.',
            '`===` on objects compares references: same object → `true`; two separate literals → `false` even with identical content.',
          ],
          runnable: true,
        }),
        code({
          title: 'typeof for every type',
          code: dedent(`
            console.log(typeof 42);
            console.log(typeof 'hi');
            console.log(typeof true);
            console.log(typeof undefined);
            console.log(typeof null);
            console.log(typeof Symbol('id'));
            console.log(typeof 10n);
            console.log(typeof {});
            console.log(typeof []);
            console.log(typeof function () {});
            console.log(Array.isArray([]));
          `),
          expectedOutput: 'number\nstring\nboolean\nundefined\nobject\nsymbol\nbigint\nobject\nobject\nfunction\ntrue',
          explanation: [
            '`typeof null === "object"` is a bug from the first JavaScript version, kept for compatibility. Check null with `value === null`.',
            'Arrays are objects → `"object"`. Use `Array.isArray` to detect them.',
            'Functions are objects too, but `typeof` reports `"function"` because they are callable.',
          ],
          runnable: true,
        }),
        code({
          title: 'Pass by sharing',
          code: dedent(`
            function reassign(user) {
              user = { name: 'Bob' };
            }
            function mutate(user) {
              user.name = 'Carol';
            }
            const u = { name: 'Alice' };
            reassign(u);
            console.log(u.name);
            mutate(u);
            console.log(u.name);
          `),
          expectedOutput: 'Alice\nCarol',
          explanation: [
            'The parameter `user` receives a **copy of the reference**.',
            'Reassigning the parameter only changes the local copy → the caller still sees Alice.',
            'Mutating through the reference changes the shared object → Carol.',
          ],
          runnable: true,
        }),
        code({
          title: 'Shallow vs deep copy',
          code: dedent(`
            const original = { name: 'api', limits: { rpm: 100 } };
            const shallow = { ...original };
            const deep = structuredClone(original);
            shallow.limits.rpm = 5;
            console.log(original.limits.rpm);
            console.log(deep.limits.rpm);
          `),
          expectedOutput: '5\n100',
          explanation: [
            'Spread copies only the top level. `shallow.limits` is the same nested object as `original.limits`.',
            '`structuredClone` recursively copies, so `deep.limits` is independent.',
            '`JSON.parse(JSON.stringify(x))` also deep-copies but loses `Date`, `Map`, `undefined`, functions and fails on cycles.',
          ],
          versionNote: '`structuredClone` is global since Node 17.',
          runnable: true,
        }),
        code({
          title: 'Primitives are immutable; numbers are floats',
          code: dedent(`
            let s = 'node';
            s[0] = 'N';
            console.log(s);
            console.log(s.toUpperCase(), s);
            console.log(0.1 + 0.2);
            console.log(0.1 + 0.2 === 0.3);
            console.log(Number.MAX_SAFE_INTEGER);
            console.log(9007199254740992 === 9007199254740993);
            console.log(9007199254740992n === 9007199254740993n);
          `),
          expectedOutput: 'node\nNODE node\n0.30000000000000004\nfalse\n9007199254740991\ntrue\nfalse',
          explanation: [
            'Assigning to a string index is silently ignored (throws in strict mode) — strings cannot change.',
            '`toUpperCase` returns a new string; `s` is unchanged.',
            '0.1 and 0.2 have no exact binary representation, so the sum is slightly off. Store money as integer cents.',
            'Above 2^53 − 1, neighbouring integers collapse to the same double. `BigInt` keeps them distinct.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In backend code',
        bullets(
          'Database drivers often return 64-bit IDs as strings or BigInt precisely because `number` cannot hold them safely.',
          'Never mutate shared config/default objects inside a request handler — copy first (`{ ...defaults, ...overrides }`).',
          'Caching an object and then mutating it later mutates the cached copy too — clone before caching if callers may modify it.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `typeof x === "object"` to detect objects — it is also true for `null` and arrays.',
          'Expecting `{...obj}` or `Object.assign` to deep-copy.',
          'Comparing arrays/objects with `===` to check equality of contents.',
          'Doing money math with floats: `0.1 + 0.2 !== 0.3`.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Answer "JavaScript is always pass-by-value; for objects the value is a reference." Then show the reassign-vs-mutate example.'),
        interviewTip('Know that `typeof null === "object"` is a legacy bug, and that `typeof function` is `"function"`.'),
      ),
      section('practice', 'Practice',
        text('Write `isPlainObject(value)` that returns true only for non-null, non-array objects. Then write a function that returns an updated copy of `{ user: { name, address: { city } } }` with a new city, without mutating the input.'),
      ),
      section('summary', 'Summary',
        bullets(
          '7 primitives (immutable, copied by value) + objects (heap, accessed by reference).',
          'Assignment and argument passing copy the value — for objects that value is a reference.',
          '`===` on objects compares identity.',
          'Spread is shallow; `structuredClone` is deep.',
          'Numbers are IEEE-754 doubles; use BigInt beyond 2^53 − 1.',
        ),
      ),
    ],
    revisionNotes: [
      'Primitives: string, number, bigint, boolean, undefined, null, symbol.',
      'typeof null → "object" (bug); typeof [] → "object"; typeof fn → "function".',
      'JS passes by value; object values are references ("pass by sharing").',
      'Spread / Object.assign = shallow copy; structuredClone = deep copy (Node 17+).',
      '0.1 + 0.2 = 0.30000000000000004; MAX_SAFE_INTEGER = 2^53 − 1.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          const a = [1, 2];
          const b = a;
          b.push(3);
          console.log(a.length);
        `),
        options: ['2', '3', 'undefined', 'TypeError'],
        answer: 1,
        explanation: '`b` holds the same reference as `a`; pushing through `b` mutates the one shared array. `const` does not prevent mutation.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          function update(cfg) {
            cfg.port = 80;
            cfg = { port: 443 };
          }
          const c = { port: 3000 };
          update(c);
          console.log(c.port);
        `),
        options: ['3000', '443', '80', 'undefined'],
        answer: 2,
        explanation: 'The mutation `cfg.port = 80` affects the shared object. The later reassignment only rebinds the local parameter, so the caller never sees 443.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which check correctly detects an array?',
        options: ["typeof value === 'array'", "typeof value === 'object'", 'value instanceof Object', 'Array.isArray(value)'],
        answer: 3,
        explanation: '`typeof` never returns "array" and returns "object" for arrays, plain objects and null alike. `Array.isArray` is the reliable check (it even works across realms).',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Types',
        question: 'What is the difference between primitive and reference types in JavaScript?',
        shortAnswer: 'Primitives are immutable values copied on assignment; objects live in the heap and variables hold references, so copies share the same object.',
        detailedAnswer: [
          'Primitives: string, number, bigint, boolean, undefined, null, symbol.',
          'Everything else (objects, arrays, functions, Map, Date…) is a reference type.',
          'Copying a primitive duplicates the value; copying an object variable duplicates the reference.',
          '`===` compares values for primitives and identity for objects.',
        ],
        followUp: 'Is JavaScript pass-by-value or pass-by-reference?',
        trap: 'Saying strings are reference types because they have methods — methods come from temporary autoboxing.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Types',
        question: 'Is JavaScript pass-by-value or pass-by-reference?',
        shortAnswer: 'Always pass-by-value. For objects the value passed is a reference, so mutations are visible to the caller but reassigning the parameter is not.',
        detailedAnswer: [
          'The parameter is a new local variable holding a copy of the argument value.',
          'For objects, that copy is a copy of the reference ("pass by sharing").',
          '`param.x = 1` mutates the shared object → caller sees it.',
          '`param = {}` rebinds the local only → caller does not see it.',
          'True pass-by-reference (like C++ `&`) would let the callee rebind the caller\'s variable — JavaScript cannot do that.',
        ],
        followUp: 'How would you make a function that cannot accidentally mutate its input?',
        trap: 'Answering "objects are passed by reference" without the reassignment nuance.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Types',
        question: 'How do you deep-copy an object in JavaScript, and what are the trade-offs of each approach?',
        shortAnswer: 'Use `structuredClone` (Node 17+) for most data; `JSON.parse(JSON.stringify())` works only for JSON-safe data; spread/Object.assign are shallow.',
        detailedAnswer: [
          '`structuredClone` handles nested objects, arrays, Date, Map, Set, typed arrays and circular references.',
          'It cannot clone functions, DOM nodes or class prototypes (instances become plain objects).',
          'JSON round-trip drops `undefined` and functions, turns Dates into strings, Maps into `{}`, and throws on cycles or BigInt.',
          'Spread and `Object.assign` copy only the top level.',
          'Libraries like lodash `cloneDeep` exist but are rarely needed now.',
        ],
        followUp: 'What happens to a class instance passed through structuredClone?',
        trap: 'Using the spread operator and calling it a deep copy.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'type-coercion': {
    summary: 'Coercion is JavaScript automatically converting values between types (to string, number or boolean) — implicitly in operators like `+`, `==` and `if`, or explicitly with `String()`, `Number()` and `Boolean()`.',
    topics: ['implicit coercion', 'explicit conversion', 'ToPrimitive', 'ToNumber', 'ToString', 'truthy', 'falsy', '== vs ===', 'Object.is', 'valueOf', 'toString', 'Symbol.toPrimitive', 'NaN'],
    sections: [
      section('introduction', undefined,
        text("`'5' - 2` is `3` but `'5' + 2` is `'52'`. Coercion is the set of rules behind results like these. Knowing the rules removes the \"JavaScript is weird\" feeling and prevents real bugs, especially with query strings and form data that always arrive as **strings**."),
      ),
      section('definition', 'Definition',
        bullets(
          '**Explicit conversion** — you ask for it: `Number(x)`, `String(x)`, `Boolean(x)`, `parseInt(x, 10)`.',
          '**Implicit coercion** — an operator does it for you: `+`, `-`, `*`, `==`, `<`, `if (x)`, `!x`, template literals.',
          'There are only three target conversions: **to string**, **to number**, **to boolean**. Objects are first turned into a primitive (**ToPrimitive**).',
        ),
      ),
      section('why', 'Why you need to know this',
        bullets(
          '`req.query.page` is `"2"` — `page + 1` is `"21"`, not `3`.',
          '`if (count)` treats `0` as false — a valid zero value can be skipped by mistake.',
          '`==` has surprising rules; most style guides require `===`.',
          'Interviewers use coercion puzzles to test whether you understand the rules rather than memorise results.',
        ),
      ),
      section('internals', 'The rules the engine follows',
        table('ToNumber', ['Input', 'Result'], [
          ['`undefined`', '`NaN`'],
          ['`null`', '`0`'],
          ['`true` / `false`', '`1` / `0`'],
          ["`''` or whitespace", '`0`'],
          ["`'42'`, `' 42 '`", '`42` (whitespace trimmed)'],
          ["`'42px'`", '`NaN` (use `parseInt` for prefixes)'],
          ['`[]`', "`0` (→ `''` → 0)"],
          ['`[7]`', "`7` (→ `'7'` → 7)"],
          ['`{}`', "`NaN` (→ `'[object Object]'`)"],
          ['Symbol', 'TypeError'],
        ]),
        table('ToBoolean — the only 8 falsy values', ['Falsy', 'Everything else is truthy, including'], [
          ['`false`, `0`, `-0`, `0n`', "`'0'`, `'false'`, `' '`"],
          ["`''` (empty string)", '`[]`, `{}`'],
          ['`null`, `undefined`, `NaN`', '`function () {}`, `new Boolean(false)`'],
        ]),
        text('**ToPrimitive(object, hint)** — how an object becomes a primitive:'),
        steps(
          'If the object has `[Symbol.toPrimitive]`, call it with the hint (`"number"`, `"string"` or `"default"`).',
          'Otherwise, for hint `"string"`: try `toString()`, then `valueOf()`. For `"number"`/`"default"`: try `valueOf()`, then `toString()`.',
          'Use the first result that is a primitive. Plain objects/arrays have a `valueOf` that returns the object itself, so `toString` wins: `[1,2]` → `"1,2"`, `{}` → `"[object Object]"`.',
        ),
        text('**The `+` operator**: convert both operands to primitives (hint "default"). If **either** is a string → string concatenation. Otherwise → numeric addition. Other arithmetic operators (`-`, `*`, `/`, `%`) always convert to numbers.'),
        text('**Loose equality `x == y`** (simplified algorithm):'),
        steps(
          'Same type → compare like `===`.',
          '`null == undefined` → true; `null`/`undefined` equal nothing else.',
          'Number vs string → convert the string to a number.',
          'Boolean vs anything → convert the boolean to a number first (`true` → 1).',
          'Object vs primitive → ToPrimitive(object) and compare again.',
          '`NaN` is never equal to anything, including itself.',
        ),
        text('Relational operators (`<`, `>=`) are a separate algorithm: if both sides are strings they compare lexicographically, otherwise both become numbers — so `null >= 0` is `true` while `null == 0` is `false`.'),
      ),
      section('example', 'String vs number coercion',
        code({
          title: '+ concatenates if a string is involved; other operators convert to number',
          code: dedent(`
            console.log(1 + '2');
            console.log('5' - 2);
            console.log('5' * '2');
            console.log(true + 1);
            console.log(null + 1);
            console.log(undefined + 1);
            console.log('3' + 4 + 5);
            console.log(3 + 4 + '5');
          `),
          expectedOutput: '12\n3\n10\n2\n1\nNaN\n345\n75',
          explanation: [
            '`1 + "2"`: one side is a string → `"12"` (console.log prints strings without quotes).',
            '`-` and `*` only do math, so strings convert to numbers: 3 and 10.',
            '`true` → 1, `null` → 0, `undefined` → NaN.',
            '`+` is left-to-right: `"3" + 4` → `"34"`, then `"34" + 5` → `"345"`.',
            '`3 + 4` → 7 first (both numbers), then `7 + "5"` → `"75"`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Truthy and falsy',
          code: dedent(`
            const values = [0, -0, '', null, undefined, NaN, false, 0n, '0', 'false', [], {}];
            console.log(values.filter((v) => !v).length);
            console.log(values.filter(Boolean));
          `),
          expectedOutput: "8\n[ '0', 'false', [], {} ]",
          explanation: [
            'Exactly 8 values are falsy: `0`, `-0`, `""`, `null`, `undefined`, `NaN`, `false`, `0n`.',
            'Non-empty strings (even `"0"` and `"false"`), empty arrays and empty objects are truthy.',
            '`filter(Boolean)` passes each value to `Boolean()` and keeps the truthy ones.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Loose equality puzzles',
        code({
          title: '== step by step',
          code: dedent(`
            console.log(null == undefined);
            console.log(null == 0);
            console.log(null >= 0);
            console.log(undefined == 0);
            console.log('' == 0);
            console.log('0' == false);
            console.log([] == false);
            console.log([] == ![]);
            console.log(NaN == NaN);
          `),
          expectedOutput: 'true\nfalse\ntrue\nfalse\ntrue\ntrue\ntrue\ntrue\nfalse',
          explanation: [
            '`null == undefined` is a special rule → true. `null` is not loosely equal to `0`.',
            '`null >= 0` uses the relational algorithm, which converts `null` to 0 → `0 >= 0` → true.',
            '`"" == 0`: string → number → `0 == 0`.',
            '`"0" == false`: false → 0, then `"0"` → 0 → true.',
            '`[] == false`: false → 0, `[]` → `""` → 0 → true.',
            '`[] == ![]`: `![]` is `false` (arrays are truthy), so it becomes the previous case → true.',
            '`NaN` is not equal to anything, itself included.',
          ],
          runnable: true,
        }),
        code({
          title: 'Object.is vs ===',
          code: dedent(`
            console.log(NaN === NaN, Object.is(NaN, NaN));
            console.log(0 === -0, Object.is(0, -0));
            console.log(Number.isNaN('abc'), isNaN('abc'));
          `),
          expectedOutput: 'false true\ntrue false\nfalse true',
          explanation: [
            '`Object.is` is like `===` but treats `NaN` as equal to itself and distinguishes `0` from `-0`.',
            'Global `isNaN` coerces first (`"abc"` → NaN → true). `Number.isNaN` does not coerce — prefer it.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Objects to primitives',
        code({
          title: 'ToPrimitive with valueOf, toString and Symbol.toPrimitive',
          code: dedent(`
            console.log(JSON.stringify([] + []));
            console.log([] + {});
            console.log([1, 2] + [3]);
            const price = {
              valueOf() { return 42; },
              toString() { return 'price-object'; },
            };
            console.log(price + 1);
            console.log(String(price));
            const money = {
              [Symbol.toPrimitive](hint) {
                return hint === 'number' ? 100 : 'USD 100 (' + hint + ')';
              },
            };
            console.log(+money);
            console.log(String(money));
            console.log(money + '');
          `),
          expectedOutput: '""\n[object Object]\n1,23\n43\nprice-object\n100\nUSD 100 (string)\nUSD 100 (default)',
          explanation: [
            '`[] + []`: both become `""` → empty string (shown with JSON.stringify so you can see it).',
            '`[] + {}`: `""` + `"[object Object]"`.',
            '`[1, 2] + [3]`: `"1,2"` + `"3"` → `"1,23"`.',
            '`price + 1` uses hint "default" → `valueOf()` first → 42 + 1 = 43.',
            '`String(price)` uses hint "string" → `toString()` first.',
            '`Symbol.toPrimitive` overrides both and receives the hint: unary `+` → "number", `String()` → "string", `+ ""` → "default".',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Query strings are always strings',
        code({
          title: 'Parsing pagination parameters',
          code: dedent(`
            const query = { page: '2', limit: '10' };
            console.log(query.page + 1);
            console.log(Number(query.page) + 1);
            console.log(Number(''), Number('abc'), parseInt('42px', 10));
            console.log(Number.isNaN(Number('abc')));

            function parsePage(raw, fallback) {
              const n = Number(raw);
              return Number.isInteger(n) && n > 0 ? n : fallback;
            }
            console.log(parsePage('3', 1), parsePage('abc', 1), parsePage('', 1));
          `),
          expectedOutput: '21\n3\n0 NaN 42\ntrue\n3 1 1',
          explanation: [
            'Express (and `URLSearchParams`) give you strings, so `+` concatenates → `"21"`.',
            'Convert explicitly with `Number()`. Beware: `Number("")` is `0`, not NaN.',
            '`parseInt` reads a numeric prefix and stops — always pass the radix 10.',
            'A validation helper rejects NaN, decimals, empty strings and negatives in one place.',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "`if (value)` to check \"was it provided?\" — rejects `0` and `''`. Use `value !== undefined` or `value != null` (the one accepted `==` idiom: matches both null and undefined).",
          'Adding query/body numbers without converting them.',
          'Using `isNaN` instead of `Number.isNaN`.',
          '`parseInt(x)` without a radix, or `parseInt` on very small floats (`parseInt(0.0000005)` → 5 because it stringifies to `"5e-7"`).',
          'Using `==` in general — prefer `===`.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('For any coercion puzzle, narrate the algorithm: "ToPrimitive on the array gives empty string, empty string ToNumber is 0…". Getting the steps right matters more than the answer.'),
        interviewTip('Know the 8 falsy values by heart, and that `[]`, `{}` and `"0"` are truthy.'),
      ),
      section('practice', 'Practice',
        text('Predict, then verify: `[] + null + 1`, `[2] * [3]`, `"b" + "a" + +"a" + "a"`, `true == "1"`, `{} + []` inside `console.log(...)`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Three conversions: ToString, ToNumber, ToBoolean; objects go through ToPrimitive first.',
          '`+` concatenates if either side is a string; `- * / %` always do math.',
          '8 falsy values; everything else is truthy.',
          'Use `===`, `Number.isNaN`, `Object.is`; convert inputs explicitly.',
        ),
      ),
    ],
    revisionNotes: [
      'Falsy: false, 0, -0, 0n, "", null, undefined, NaN.',
      '+ with a string → concat; -, *, / → numeric.',
      'null == undefined is true; null == 0 is false; null >= 0 is true.',
      '[] → "" → 0; {} → "[object Object]" → NaN.',
      'ToPrimitive: Symbol.toPrimitive, else valueOf/toString order by hint.',
      'NaN !== NaN; Object.is(NaN, NaN) true; Object.is(0, -0) false.',
      'Number("") is 0; parseInt("42px", 10) is 42.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "console.log('10' + 5 - 2);",
        options: ['13', '103', '1052', 'NaN'],
        answer: 1,
        explanation: 'Left to right: `"10" + 5` → `"105"` (string concat), then `"105" - 2` → 103 (minus converts to number). 13 would require numeric addition first.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: 'console.log([] == ![]);',
        options: ['false', 'TypeError', 'true', 'undefined'],
        answer: 2,
        explanation: '`![]` is `false` because arrays are truthy. Then `[] == false` → `false` becomes 0, `[]` becomes `""` then 0 → `0 == 0` → true.',
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'An endpoint returns the wrong total. What is the bug?',
        code: dedent(`
          app.get('/sum', (req, res) => {
            const { a, b } = req.query; // e.g. ?a=2&b=3
            res.json({ total: a + b });
          });
        `),
        options: [
          'req.query is undefined in Express',
          'Query values are strings, so + concatenates ("23"); convert with Number()',
          'res.json cannot send numbers',
          'Destructuring does not work on req.query',
        ],
        answer: 1,
        explanation: 'Query parameters are always strings. `"2" + "3"` is `"23"`. Convert (and validate) with `Number()` first.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which value is truthy?',
        options: ['0n', "''", 'NaN', "'0'"],
        answer: 3,
        explanation: "Any non-empty string is truthy, including `'0'`. `0n`, the empty string and `NaN` are all among the 8 falsy values.",
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Coercion',
        question: 'What is the difference between == and === in JavaScript?',
        shortAnswer: '`===` compares type and value without conversion; `==` converts operands to a common type first using the loose-equality algorithm.',
        detailedAnswer: [
          '`1 === "1"` is false; `1 == "1"` is true (string → number).',
          '`==` special case: `null == undefined` is true and neither equals anything else.',
          'Booleans are converted to numbers first, objects to primitives.',
          'Both treat `NaN` as unequal to itself; use `Number.isNaN` or `Object.is`.',
          'Use `===` by default; `x == null` is a common accepted shorthand for "null or undefined".',
        ],
        followUp: 'Why is `null >= 0` true but `null == 0` false?',
        trap: 'Claiming `==` "only compares values" — it runs a conversion algorithm.',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'Coercion',
        question: 'Explain step by step why `[] + {}` is "[object Object]" and `[1,2] + [3]` is "1,23".',
        shortAnswer: '`+` converts both operands to primitives; arrays become comma-joined strings and plain objects become "[object Object]", and since a string is involved, `+` concatenates.',
        detailedAnswer: [
          'Both operands go through ToPrimitive with hint "default".',
          '`valueOf()` on arrays/objects returns the object itself (not primitive), so `toString()` is used.',
          '`[].toString()` → `""`, `[1,2].toString()` → `"1,2"`, `({}).toString()` → `"[object Object]"`.',
          'Once either side is a string, `+` performs concatenation.',
        ],
        code: {
          id: 'm01-coerce-plus', language: 'javascript', runnable: true,
          code: "console.log([] + {});\nconsole.log([1, 2] + [3]);\nconsole.log([2] * [3]);",
          expectedOutput: '[object Object]\n1,23\n6',
        },
        followUp: 'What does `[2] * [3]` give and why?',
        trap: 'Thinking `[] + {}` is 0 or an error.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'advanced', topic: 'Coercion',
        question: 'How does JavaScript convert an object to a primitive, and how can you customise it?',
        shortAnswer: 'Via the abstract ToPrimitive operation: it calls `[Symbol.toPrimitive](hint)` if present, otherwise `valueOf`/`toString` in an order that depends on the hint.',
        detailedAnswer: [
          'Hints: "string" (e.g. `String(x)`, template literals), "number" (unary `+`, `-`, `*`, `<`), "default" (binary `+`, `==`).',
          'Without `Symbol.toPrimitive`: hint "string" tries `toString` then `valueOf`; otherwise `valueOf` then `toString`.',
          'The first method returning a primitive wins; if neither does → TypeError.',
          '`Date` is special: its default hint behaves like "string", so `date + 1` concatenates.',
          'Implementing `Symbol.toPrimitive` lets value objects (Money, Duration) behave sensibly in arithmetic and logs.',
        ],
        followUp: 'Why does `new Date() + 1` produce a string but `new Date() - 1` a number?',
        trap: 'Assuming `valueOf` is always called first.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  operators: {
    summary: 'Operators combine values: arithmetic, comparison, logical (&&, ||, ??) that return operands rather than booleans, optional chaining (?.), logical assignment, and type operators like typeof, instanceof and in.',
    topics: ['arithmetic', 'comparison', 'logical operators', 'short-circuit', 'nullish coalescing', 'optional chaining', 'logical assignment', 'typeof', 'instanceof', 'in', 'delete', 'increment', 'ternary', 'exponent'],
    sections: [
      section('introduction', undefined,
        text("You use operators in every line of code. A few of them behave differently from other languages: `&&` and `||` return one of their **operands**, not `true`/`false`, and `??` / `?.` exist specifically to handle `null` and `undefined` safely."),
      ),
      section('definition', 'Operator families',
        table('Common operators', ['Family', 'Operators', 'Notes'], [
          ['Arithmetic', '`+ - * / % **`', '`%` keeps the sign of the left operand; `**` is exponent'],
          ['Increment', '`++x`, `x++`, `--`', 'Prefix returns new value, postfix returns old value'],
          ['Comparison', '`=== !== == != < > <= >=`', 'Strings compare lexicographically (by UTF-16 code units)'],
          ['Logical', '`&& || !`', 'Short-circuit; return an operand'],
          ['Nullish', '`??`', 'Right side only if left is `null` or `undefined`'],
          ['Optional chaining', '`?.` `?.()` `?.[]`', 'Stops and returns `undefined` on null/undefined'],
          ['Logical assignment', '`||= &&= ??=`', 'Assign only when the logical condition says so'],
          ['Type / relation', '`typeof instanceof in delete`', '`in` checks own **and** inherited keys'],
          ['Conditional', '`cond ? a : b`', 'An expression, unlike `if`'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Default values in config are everywhere: `options.timeout ?? 5000`.',
          'Deeply nested API responses: `user?.profile?.email`.',
          'Using `||` instead of `??` turns valid `0`, `false` or `""` into the default — a classic config bug.',
        ),
      ),
      section('internals', 'How logical operators evaluate',
        bullets(
          '`a && b`: evaluate `a`. If falsy, return `a` (and never evaluate `b`). Otherwise return `b`.',
          '`a || b`: evaluate `a`. If truthy, return `a`. Otherwise return `b`.',
          '`a ?? b`: evaluate `a`. If it is not `null`/`undefined`, return `a`. Otherwise return `b`.',
          '`a?.b`: if `a` is `null`/`undefined`, the **whole chain** short-circuits to `undefined` (later `.c.d` is skipped too).',
          '`x ||= y` means `x || (x = y)` — the assignment only happens when needed (no setter call otherwise).',
          'Precedence: `??` cannot be mixed with `&&`/`||` without parentheses — `a || b ?? c` is a SyntaxError.',
        ),
      ),
      section('example', 'Examples',
        code({
          title: 'Logical operators return operands',
          code: dedent(`
            console.log('a' && 'b');
            console.log(0 && 'b');
            console.log('' || 'default');
            console.log(0 || 10);
            console.log(0 ?? 10);
            console.log(null ?? 'fallback');
            console.log(false ?? true);
          `),
          expectedOutput: 'b\n0\ndefault\n10\n0\nfallback\nfalse',
          explanation: [
            "`'a'` is truthy, so `&&` returns the second operand `'b'`.",
            '`0` is falsy, so `&&` returns `0` immediately.',
            '`||` skips any falsy left side — even a valid `0`.',
            '`??` only skips `null`/`undefined`, so `0` and `false` are kept.',
          ],
          runnable: true,
        }),
        code({
          title: 'Optional chaining',
          code: dedent(`
            const user = {
              profile: { email: 'a@b.com' },
              getName() { return 'Ana'; },
            };
            console.log(user.profile?.email);
            console.log(user.address?.city);
            console.log(user.getAge?.());
            console.log(user.getName?.());
            console.log(user.address?.city ?? 'unknown');
          `),
          expectedOutput: 'a@b.com\nundefined\nundefined\nAna\nunknown',
          explanation: [
            '`user.address` is undefined → `?.city` stops and yields `undefined` instead of throwing.',
            '`?.()` only calls the function if it exists.',
            'Combining `?.` with `??` gives a safe default in one expression.',
          ],
          runnable: true,
        }),
        code({
          title: 'Arithmetic, increment and comparison',
          code: dedent(`
            let n = 5;
            console.log(n++);
            console.log(n);
            console.log(++n);
            console.log(2 ** 10);
            console.log(7 % 3, -7 % 3);
            console.log('10' > '9');
            console.log(10 > '9');
          `),
          expectedOutput: '5\n6\n7\n1024\n1 -1\nfalse\ntrue',
          explanation: [
            'Postfix `n++` returns the old value (5) then increments; prefix `++n` increments first.',
            '`%` is a remainder, not a modulo: the result takes the sign of the left operand.',
            'Two strings compare character by character: `"1"` < `"9"`, so `"10" > "9"` is false.',
            'If one side is a number, the string is converted → `10 > 9`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Logical assignment for defaults',
          code: dedent(`
            const opts = { retries: 0, timeout: null };
            opts.retries ||= 3;
            opts.timeout ??= 5000;
            opts.debug &&= true;
            console.log(opts);
          `),
          expectedOutput: '{ retries: 3, timeout: 5000 }',
          explanation: [
            '`retries` was `0` (falsy) so `||=` replaced it — probably a bug if 0 retries was intended! `??=` would have kept it.',
            '`timeout` was `null` → `??=` assigns 5000.',
            '`debug` is undefined (falsy) → `&&=` does nothing, so no `debug` key is created.',
          ],
          versionNote: 'Logical assignment operators need Node 15+.',
          runnable: true,
        }),
        code({
          title: 'in, instanceof, delete',
          code: dedent(`
            const cfg = { port: 3000 };
            console.log('port' in cfg, 'toString' in cfg, Object.hasOwn(cfg, 'toString'));
            console.log([] instanceof Array, [] instanceof Object);
            delete cfg.port;
            console.log(cfg);
          `),
          expectedOutput: 'true true false\ntrue true\n{}',
          explanation: [
            '`in` also finds inherited keys like `toString` (from `Object.prototype`). `Object.hasOwn` checks own keys only.',
            '`instanceof` walks the prototype chain: arrays inherit from `Array.prototype` and `Object.prototype`.',
            '`delete` removes a property from an object (it does not free memory directly or delete variables).',
          ],
          versionNote: '`Object.hasOwn` needs Node 16.9+.',
          runnable: true,
        }),
      ),
      section('real-world', 'Config defaults in a service',
        code({
          title: 'Building options safely',
          code: dedent(`
            function createClient(options) {
              const timeout = options?.timeout ?? 5000;
              const retries = options?.retries ?? 3;
              const verbose = options?.verbose ?? false;
              return { timeout, retries, verbose };
            }
            console.log(createClient({ timeout: 0, retries: 0 }));
            console.log(createClient());
          `),
          expectedOutput: '{ timeout: 0, retries: 0, verbose: false }\n{ timeout: 5000, retries: 3, verbose: false }',
          explanation: [
            'Explicit zeros are respected because `??` only replaces null/undefined.',
            '`options?.` handles a missing options object.',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `||` for defaults where `0`, `false` or `""` are valid values.',
          'Overusing `?.` — hiding a bug where data *must* exist. Fail loudly for required data.',
          'Mixing `??` with `||` without parentheses (SyntaxError).',
          'Comparing numeric strings (`"10" > "9"` is false).',
          'Using `delete` on arrays — leaves a hole; use `splice` or `filter`.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Explain `||` vs `??` with a concrete `port: 0` or `retries: 0` example.'),
        interviewTip('Mention that `&&`/`||` return operands — then show `const name = user && user.name` as the pre-`?.` idiom.'),
      ),
      section('practice', 'Practice',
        text('Write `getSetting(config, path, fallback)` where `path` is like `"db.pool.max"`. Use optional chaining inside a loop and `??` for the fallback. Make sure a stored `0` is returned, not the fallback.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`&&`, `||`, `??` short-circuit and return operands.',
          '`??` and `?.` only react to `null`/`undefined`.',
          'Logical assignment (`||=`, `&&=`, `??=`) assigns only when needed.',
          '`in` includes inherited keys; `Object.hasOwn` does not.',
        ),
      ),
    ],
    revisionNotes: [
      'a && b → a if falsy else b; a || b → a if truthy else b.',
      'a ?? b → b only if a is null/undefined.',
      'a?.b.c → undefined if a is nullish (whole chain short-circuits).',
      'x ??= y assigns only if x is nullish.',
      'Cannot mix ?? with || / && without parentheses.',
      '-7 % 3 === -1; "10" > "9" is false.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "const limit = 0;\nconsole.log(limit || 100, limit ?? 100);",
        options: ['0 0', '100 100', '0 100', '100 0'],
        answer: 3,
        explanation: '`||` replaces any falsy value, so 0 → 100. `??` only replaces null/undefined, so 0 is kept.',
      },
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Fill the blank so `city` is "N/A" when `user` or `user.address` is missing, without throwing.',
        code: "const city = /* ??? */;",
        options: [
          "user.address.city || 'N/A'",
          "user?.address?.city ?? 'N/A'",
          "user && address && city",
          "user?.address.city ?? 'N/A'",
        ],
        answer: 1,
        explanation: 'Each possibly-missing link needs `?.`. `user?.address.city` still throws when `user` exists but `address` does not. The first option throws if `user` is missing.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "let i = 1;\nconst r = i++ + ++i;\nconsole.log(r, i);",
        options: ['4 3', '3 3', '4 2', '2 3'],
        answer: 0,
        explanation: '`i++` yields 1 (i becomes 2), then `++i` makes i 3 and yields 3 → 1 + 3 = 4, and `i` is 3.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Operators',
        question: 'What is the difference between || and ?? when providing default values?',
        shortAnswer: '`||` falls back for any falsy value (0, "", false, NaN, null, undefined); `??` falls back only for null or undefined.',
        detailedAnswer: [
          '`0 || 5` → 5 but `0 ?? 5` → 0.',
          'Use `??` for numeric/boolean options where 0 or false is meaningful.',
          '`??` cannot be combined with `||`/`&&` without parentheses.',
          '`??=` is the assignment form.',
        ],
        followUp: 'What does `null || undefined ?? "x"` do?',
        trap: 'Thinking they are interchangeable.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Operators',
        question: 'Explain short-circuit evaluation for &&, || and optional chaining.',
        shortAnswer: 'The right side is evaluated only if needed: `&&` stops at the first falsy operand, `||` at the first truthy one, and `?.` stops the whole chain at null/undefined.',
        detailedAnswer: [
          'Logical operators return the operand that decided the result, not a boolean.',
          'Skipped operands are never evaluated — function calls on the right do not run.',
          '`a?.b.c()` returns undefined without evaluating `.b.c()` when `a` is nullish.',
          'Common idioms: `isAdmin && deleteUser()`, `cache.get(k) || compute(k)`.',
        ],
        code: {
          id: 'm01-short-circuit', language: 'javascript', runnable: true,
          code: dedent(`
            const log = (v) => { console.log('evaluated', v); return v; };
            log(0) && log(1);
            log(2) || log(3);
            const nothing = null;
            nothing?.foo(log(4));
          `),
          expectedOutput: 'evaluated 0\nevaluated 2',
        },
        followUp: 'Why might `cache.get(k) || compute(k)` be wrong if the cached value can be 0?',
        trap: 'Expecting `log(4)` to run — arguments in a short-circuited optional call are not evaluated.',
      },
    ],
  },
};

export default content;

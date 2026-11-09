import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  functions: {
    summary: 'Functions are callable objects: they take parameters, return a value (undefined by default), can be stored, passed and returned like any value, and create a new execution context on every call.',
    topics: ['function declaration', 'function expression', 'parameters', 'default parameters', 'rest parameters', 'arguments object', 'return', 'first-class functions', 'higher-order functions', 'callbacks', 'IIFE', 'pure functions', 'recursion'],
    sections: [
      section('introduction', undefined,
        text('Functions are the main building block of Node.js code: route handlers, middleware, callbacks, event listeners and utility helpers are all functions. In JavaScript they are also **values** — you can pass them around like numbers.'),
      ),
      section('definition', 'Ways to create a function',
        table('Function forms', ['Form', 'Syntax', 'Hoisted?', 'Own `this`?'], [
          ['Declaration', '`function add(a, b) { }`', 'Yes — fully', 'Yes'],
          ['Expression', '`const add = function (a, b) { };`', 'Only the variable', 'Yes'],
          ['Named expression', '`const f = function fact(n) { };`', 'Only the variable (name visible inside)', 'Yes'],
          ['Arrow', '`const add = (a, b) => a + b;`', 'Only the variable', 'No — lexical'],
          ['Method', '`{ add(a, b) { } }`', 'n/a', 'Yes'],
          ['Constructor (`new Function`)', "`new Function('a', 'return a')`", 'n/a', 'Avoid (like eval)'],
        ]),
      ),
      section('why', 'Why functions are central',
        bullets(
          '**First-class**: functions can be assigned to variables, stored in arrays/objects, passed as arguments and returned.',
          '**Higher-order functions** take or return functions: `array.map(fn)`, `app.use(middleware)`, `setTimeout(fn)`.',
          'This is what makes callbacks, middleware chains and decorators (logging, retry, caching wrappers) possible.',
        ),
      ),
      section('internals', 'What happens on a call',
        steps(
          'The engine creates a new **function execution context** and pushes it on the call stack.',
          'Parameters are bound to arguments (missing ones are `undefined`, defaults are evaluated left to right).',
          'Local `var`/function declarations are set up (creation phase), then the body runs.',
          'The `this` binding is decided by **how** the function was called (see the this lesson).',
          '`return` (or reaching the end → `undefined`) pops the context; locals can be garbage-collected unless a closure still references them.',
        ),
        bullets(
          'A function object has properties: `name`, `length` (number of parameters before the first default/rest), and `prototype` (regular functions only).',
          'Regular functions get an array-like `arguments` object; arrow functions do not.',
        ),
      ),
      section('example', 'Parameters and return values',
        code({
          title: 'Default parameters and function.length',
          code: dedent(`
            function add(a, b = 10) {
              return a + b;
            }
            console.log(add(1));
            console.log(add(1, 2));
            console.log(add(1, undefined));
            console.log(add(1, null));
            console.log(add.length);
          `),
          expectedOutput: '11\n3\n11\n1\n1',
          explanation: [
            'Defaults apply when the argument is missing **or** `undefined`.',
            '`null` is a real value, so no default: `1 + null` → `1 + 0` → 1.',
            '`length` counts parameters before the first one with a default → 1.',
          ],
          runnable: true,
        }),
        code({
          title: 'Implicit undefined and the ASI return trap',
          code: dedent(`
            function noReturn() {}
            function asiTrap() {
              return
              { ok: true };
            }
            console.log(noReturn());
            console.log(asiTrap());
          `),
          expectedOutput: 'undefined\nundefined',
          explanation: [
            'A function without `return` returns `undefined`.',
            'Automatic Semicolon Insertion puts a `;` right after a bare `return` at the end of a line, so the object literal on the next line is never returned.',
            'Keep the opening `{` on the same line as `return`.',
          ],
          runnable: true,
        }),
        code({
          title: 'arguments vs rest parameters',
          code: dedent(`
            function oldStyle() {
              return [arguments.length, Array.isArray(arguments)];
            }
            function modern(...nums) {
              return nums.reduce((sum, n) => sum + n, 0);
            }
            console.log(oldStyle(1, 2, 3));
            console.log(modern(1, 2, 3));
          `),
          expectedOutput: '[ 3, false ]\n6',
          explanation: [
            '`arguments` is array-like but not an array (no `map`, `reduce`).',
            'Rest parameters give a real array and work in arrow functions too — prefer them.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Functions as values',
        code({
          title: 'A higher-order function that wraps another (decorator)',
          code: dedent(`
            function withLogging(fn) {
              return function (...args) {
                console.log('calling ' + fn.name + ' with', args);
                const result = fn(...args);
                console.log('result:', result);
                return result;
              };
            }
            function multiply(a, b) {
              return a * b;
            }
            const loggedMultiply = withLogging(multiply);
            loggedMultiply(3, 4);
          `),
          expectedOutput: 'calling multiply with [ 3, 4 ]\nresult: 12',
          explanation: [
            '`withLogging` receives a function and returns a new function — both make it higher-order.',
            'The returned function still has access to `fn` thanks to a closure.',
            'This exact pattern is used for timing, retries, caching and auth checks around handlers.',
          ],
          runnable: true,
        }),
        code({
          title: 'Callbacks',
          code: dedent(`
            function processOrders(orders, onEach) {
              for (const order of orders) {
                onEach(order);
              }
            }
            processOrders([{ id: 1 }, { id: 2 }], (order) => {
              console.log('processing', order.id);
            });
            const handlers = { greet: (n) => 'hi ' + n, shout: (n) => n.toUpperCase() };
            console.log(handlers.greet('ana'), handlers['shout']('ana'));
          `),
          expectedOutput: 'processing 1\nprocessing 2\nhi ana ANA',
          explanation: [
            'A callback is just a function passed in to be called later (here: synchronously).',
            'Storing functions in an object is a simple dispatch table, e.g. command handlers in a CLI.',
          ],
          runnable: true,
        }),
        code({
          title: 'IIFE and recursion',
          code: dedent(`
            const counter = (function () {
              let count = 0;
              return () => ++count;
            })();
            console.log(counter(), counter());

            function factorial(n) {
              return n <= 1 ? 1 : n * factorial(n - 1);
            }
            console.log(factorial(5));
          `),
          expectedOutput: '1 2\n120',
          explanation: [
            'An IIFE (Immediately Invoked Function Expression) runs once and creates a private scope — the pre-module way to hide variables.',
            'Recursion: each `factorial` call pushes a new frame until the base case `n <= 1`.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In Node.js',
        code({
          title: 'Express route handlers are higher-order wiring',
          code: dedent(`
            // asyncHandler is a higher-order function that returns a middleware
            const asyncHandler = (fn) => (req, res, next) =>
              Promise.resolve(fn(req, res, next)).catch(next);

            app.get('/users/:id', asyncHandler(async (req, res) => {
              const user = await userService.findById(req.params.id);
              res.json(user);
            }));
          `),
          explanation: [
            '`asyncHandler` takes your async handler and returns a new function Express can call.',
            'Rejected promises are forwarded to `next(err)` — a pattern you will build in Module 8.',
          ],
        }),
        tip('Prefer **pure functions** (same input → same output, no side effects) for business logic. They are trivial to unit-test and reason about.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Calling instead of passing: `setTimeout(doWork(), 100)` runs `doWork` now and passes its return value.',
          'Putting a newline after `return`.',
          'Relying on `arguments` inside an arrow function (it refers to the outer function\'s `arguments`).',
          'Mutating arguments (objects) inside a "helper" and surprising the caller.',
        ),
        code({
          title: 'Passing vs calling',
          code: dedent(`
            function doWork() { return 'done'; }
            setTimeout(doWork(), 100);      // wrong: passes 'done' (a string)
            setTimeout(doWork, 100);        // right: passes the function
            setTimeout(() => doWork(), 100); // right: wrapper, useful for arguments
          `),
          explanation: ['In Node, passing a non-function to `setTimeout` throws `ERR_INVALID_ARG_TYPE`.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Define "first-class functions" (functions are values) and "higher-order functions" (take/return functions) separately — they are often confused.'),
        interviewTip('Mention that declarations are fully hoisted but expressions are not.'),
      ),
      section('practice', 'Practice',
        text('Write `retry(fn, times)` that returns a new function. When called, it calls `fn` and, if it throws, tries again up to `times` total attempts, then re-throws the last error.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Declarations, expressions, arrows and methods are the main forms.',
          'Functions are first-class values; higher-order functions take or return them.',
          'Defaults apply for `undefined` only; `length` counts params before the first default.',
          'Missing `return` → `undefined`; beware ASI after `return`.',
          'Prefer rest parameters over `arguments`.',
        ),
      ),
    ],
    revisionNotes: [
      'Function declarations are hoisted fully; expressions/arrows only as variables.',
      'Default params kick in for undefined, not null.',
      'fn.length = params before first default/rest.',
      'arguments is array-like, absent in arrows; use ...rest.',
      'First-class = functions are values; higher-order = takes/returns functions.',
      'return followed by newline → returns undefined (ASI).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          function greet(name = 'guest') {
            return 'Hi ' + name;
          }
          console.log(greet(null), greet(undefined));
        `),
        options: ['Hi guest Hi guest', 'Hi null Hi guest', 'Hi null Hi undefined', 'Hi guest Hi undefined'],
        answer: 1,
        explanation: 'Defaults apply only when the argument is `undefined`. `null` is an explicit value, so it is used as-is.',
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'The cleanup should run after 1 second, but it runs immediately. Why?',
        code: "setTimeout(cleanup(), 1000);",
        options: [
          'setTimeout needs the delay first',
          'cleanup() is called now and its return value is passed; pass cleanup instead',
          '1000 is in seconds, not milliseconds',
          'cleanup must be an arrow function',
        ],
        answer: 1,
        explanation: 'The parentheses invoke the function immediately. `setTimeout` needs the function itself: `setTimeout(cleanup, 1000)`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          function build() {
            return
            [1, 2, 3];
          }
          console.log(build());
        `),
        options: ['[ 1, 2, 3 ]', 'SyntaxError', 'null', 'undefined'],
        answer: 3,
        explanation: 'ASI inserts a semicolon after `return` because a line break follows it, so nothing is returned.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Functions',
        question: 'What is the difference between a function declaration and a function expression?',
        shortAnswer: 'A declaration is a statement hoisted fully (callable before its line); an expression creates a function as a value assigned to a variable, so it is only usable after that assignment runs.',
        detailedAnswer: [
          'Declaration: `function f() {}` — the name and body are bound in the creation phase.',
          'Expression: `const f = function () {}` — follows the variable rules (TDZ for let/const, undefined for var).',
          'Named function expressions expose the name only inside the function (useful for recursion and stack traces).',
          'Arrow functions are always expressions.',
        ],
        followUp: 'What error do you get calling a `var` function expression before its assignment?',
        trap: 'Saying expressions are "not hoisted at all" — the variable is hoisted, the function value is not.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Functions',
        question: 'What does it mean that functions are first-class citizens, and what is a higher-order function?',
        shortAnswer: 'First-class means functions are ordinary values you can store, pass and return; a higher-order function is one that takes a function as an argument or returns one.',
        detailedAnswer: [
          'Functions are objects: they can have properties and be stored in data structures.',
          'Examples of higher-order functions: `Array.prototype.map`, `setTimeout`, Express `app.use`, a `withRetry(fn)` wrapper.',
          'Higher-order functions enable callbacks, composition, currying and decorators.',
          'Returning a function usually involves a closure over the outer arguments.',
        ],
        followUp: 'Write a `once(fn)` higher-order function.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Functions',
        question: 'What is a pure function and why does it matter in backend code?',
        shortAnswer: 'A pure function returns the same output for the same input and has no side effects (no I/O, no mutation of external state); this makes it predictable, cacheable and easy to test.',
        detailedAnswer: [
          'Impure examples: reading `Date.now()`, querying a DB, mutating an argument, logging.',
          'Keep business rules (pricing, validation, permission checks) pure and push I/O to the edges.',
          'Pure functions can be memoized safely and tested without mocks.',
          'Immutability (returning new objects) is the usual way to stay pure with objects.',
        ],
        followUp: 'How would you make a function that depends on the current time testable?',
        trap: 'Thinking "no return value" defines purity — side effects are the key criterion.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'arrow-functions': {
    summary: 'Arrow functions are a compact function syntax with lexical `this` and `arguments`; they cannot be used as constructors and have no `prototype`.',
    topics: ['arrow syntax', 'implicit return', 'lexical this', 'no arguments', 'not constructible', 'object literal return', 'callbacks', 'class field arrows'],
    sections: [
      section('introduction', undefined,
        text('Arrow functions (ES2015) are shorter to write and, more importantly, they **do not have their own `this`**. That makes them perfect for callbacks inside methods — and wrong for methods themselves.'),
      ),
      section('definition', 'Syntax',
        table('Arrow syntax forms', ['Form', 'Example'], [
          ['One parameter', '`x => x * 2` (parentheses optional)'],
          ['Zero or many parameters', '`() => 1`, `(a, b) => a + b`'],
          ['Block body (explicit return)', '`(a, b) => { const s = a + b; return s; }`'],
          ['Return an object literal', '`(name) => ({ name })` — wrap in parentheses'],
          ['Async', '`async (id) => await db.find(id)`'],
        ]),
      ),
      section('why', 'Why they exist',
        bullets(
          'Before ES2015, callbacks inside methods lost `this` and people wrote `var self = this;` or `.bind(this)`.',
          'Arrow functions capture `this` from the surrounding scope, so callbacks "just work".',
          'Short syntax makes array pipelines (`map`/`filter`/`reduce`) readable.',
        ),
      ),
      section('internals', 'What is different under the hood',
        table('Arrow vs regular function', ['Feature', 'Regular function', 'Arrow function'], [
          ['`this`', 'Set by the call (method, call/apply/bind, new, default)', 'Lexical — taken from the enclosing scope, cannot be changed'],
          ['`arguments`', 'Own array-like object', 'None — refers to outer function\'s `arguments`'],
          ['`new`', 'Works (has `[[Construct]]`)', 'TypeError: not a constructor'],
          ['`prototype` property', 'Yes', 'No'],
          ['`super`, `new.target`', 'Own', 'Lexical'],
          ['Hoisting', 'Declarations fully hoisted', 'Only the variable (it is an expression)'],
          ['Duplicate parameter names', 'Allowed in sloppy mode', 'Always SyntaxError'],
        ]),
        bullets(
          'The engine does not create a `this` binding in the arrow\'s environment. When the arrow body uses `this`, normal **scope lookup** finds the nearest enclosing non-arrow function (or the top level).',
          'Because of this, `call`, `apply` and `bind` can pass arguments to an arrow but **cannot** change its `this`.',
        ),
      ),
      section('example', 'Examples',
        code({
          title: 'Syntax and the object-literal trap',
          code: dedent(`
            const square = (x) => x * x;
            const sum = (a, b) => {
              return a + b;
            };
            const makeUser = (name) => ({ name, active: true });
            const broken = (name) => { name: name };
            console.log(square(4));
            console.log(sum(2, 3));
            console.log(makeUser('ana'));
            console.log(broken('ana'));
          `),
          expectedOutput: "16\n5\n{ name: 'ana', active: true }\nundefined",
          explanation: [
            'An expression body returns implicitly; a block body needs `return`.',
            'In `broken`, `{` starts a **block**, `name:` is a label, so nothing is returned → `undefined`.',
            'Wrapping the object in `( )` makes it an expression.',
          ],
          runnable: true,
        }),
        code({
          title: 'Lexical this in callbacks',
          code: dedent(`
            const timer = {
              seconds: 0,
              startRegular() {
                setTimeout(function () {
                  console.log('regular:', this === timer);
                }, 0);
              },
              startArrow() {
                setTimeout(() => {
                  this.seconds++;
                  console.log('arrow:', this === timer, this.seconds);
                }, 0);
              },
            };
            timer.startRegular();
            timer.startArrow();
          `),
          expectedOutput: 'regular: false\narrow: true 1',
          explanation: [
            'The regular callback is called by the timer system, not as `timer.method()`, so its `this` is not `timer` (in Node it is the `Timeout` object; in browsers the global object).',
            'The arrow has no own `this`; it uses `startArrow`\'s `this`, which is `timer`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Arrows as object methods (a mistake)',
          code: dedent(`
            const counter = {
              count: 10,
              regularGet() { return this.count; },
              arrowGet: () => this.count,
            };
            console.log(counter.regularGet());
            console.log(counter.arrowGet());
          `),
          expectedOutput: '10\nundefined',
          explanation: [
            'An object literal does **not** create a scope, so the arrow\'s `this` is the top-level `this`, not `counter`.',
            'Top-level `this` is the global object in a classic script (here), `module.exports` (`{}`) in a CommonJS file, and `undefined` in an ES module — in which case this line would throw a TypeError.',
          ],
          runnable: true,
        }),
        code({
          title: 'No arguments, no new, no prototype',
          code: dedent(`
            function outer() {
              const inner = () => arguments[0];
              return inner('ignored');
            }
            console.log(outer('from outer'));
            const Arrow = () => {};
            function Regular() {}
            console.log(typeof Regular.prototype, typeof Arrow.prototype);
            try {
              new Arrow();
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
          `),
          expectedOutput: 'from outer\nobject undefined\nTypeError: Arrow is not a constructor',
          explanation: [
            '`arguments` inside the arrow is `outer`\'s `arguments`.',
            'Arrows have no `prototype` and no internal `[[Construct]]` method, so `new` throws.',
          ],
          runnable: true,
        }),
        code({
          title: 'call/bind cannot change an arrow\'s this',
          code: dedent(`
            function makeArrow() {
              return () => this.tag;
            }
            const arrow = makeArrow.call({ tag: 'captured' });
            console.log(arrow());
            console.log(arrow.call({ tag: 'other' }));
            console.log(arrow.bind({ tag: 'bound' })());
          `),
          expectedOutput: 'captured\ncaptured\ncaptured',
          explanation: [
            'The arrow captured `this` from the `makeArrow` call where `this` was `{ tag: "captured" }`.',
            'Later `call`/`bind` attempts are ignored for `this`.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In Node.js',
        code({
          title: 'Arrow callbacks inside a class method',
          code: dedent(`
            class OrderService {
              constructor(repo) {
                this.repo = repo;
                this.taxRate = 0.2;
              }
              async totals(ids) {
                const orders = await this.repo.findMany(ids);
                // arrow keeps "this" = the service instance
                return orders.map((o) => o.amount * (1 + this.taxRate));
              }
            }
          `),
          explanation: [
            'Arrow callbacks in `map`, `then`, `on(\'data\')` keep the instance `this`.',
            'For EventEmitter listeners where you *want* `this` to be the emitter, use a regular function.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using arrows as object or prototype methods that need `this`.',
          'Returning an object literal without parentheses.',
          'Using arrows as constructors.',
          'Using arrows for Mongoose schema methods/hooks — Mongoose sets `this` to the document, which an arrow cannot receive.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('The key phrase: "arrow functions do not have their own `this`, `arguments`, `super` or `new.target` — they resolve them lexically."'),
        interviewTip('Give a when-NOT-to-use list: object methods, prototype methods, constructors, event handlers that need `this`, functions needing `arguments`.'),
      ),
      section('practice', 'Practice',
        text('Convert a class whose method passes `function (item) { return this.prefix + item; }` to `map` (and currently crashes) into a working version — first with an arrow, then with `.bind(this)`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Concise syntax with implicit return for expression bodies.',
          'Lexical `this`/`arguments` — ideal for callbacks inside methods.',
          'Not constructible, no prototype, `this` cannot be rebound.',
          'Wrap object literals in parentheses to return them.',
        ),
      ),
    ],
    revisionNotes: [
      'Arrow: no own this, arguments, super, new.target.',
      'call/apply/bind cannot change an arrow\'s this.',
      'new Arrow() → TypeError: Arrow is not a constructor.',
      '() => ({ a: 1 }) to return an object.',
      'Do not use arrows as object methods needing this.',
      'Object literals do not create a scope for this.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "const make = (id) => { id: id };\nconsole.log(make(1));",
        options: ['{ id: 1 }', 'undefined', 'SyntaxError', '1'],
        answer: 1,
        explanation: 'The braces are parsed as a function body block with a label `id:`; there is no return statement. Use `(id) => ({ id })`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print (in a classic script where top-level this is the global object and no global `name` is defined)?',
        code: dedent(`
          const shop = {
            title: 'Shop',
            items: ['a', 'b'],
            list() {
              return this.items.map((i) => this.title + ':' + i);
            },
          };
          console.log(shop.list());
        `),
        options: ["[ 'undefined:a', 'undefined:b' ]", "[ 'Shop:a', 'Shop:b' ]", 'TypeError', "[ ':a', ':b' ]"],
        answer: 1,
        explanation: '`list` is a regular method called as `shop.list()`, so its `this` is `shop`. The arrow callback inherits that `this`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which statement about arrow functions is true?',
        options: [
          'They can be called with new',
          'bind() can change their this',
          'They get this from the enclosing scope at creation time',
          'They have their own arguments object',
        ],
        answer: 2,
        explanation: 'Arrows resolve `this` lexically from the scope where they are defined. They are not constructors and `bind` cannot change their `this`.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Arrow functions',
        question: 'How do arrow functions differ from regular functions?',
        shortAnswer: 'Arrows have shorter syntax and no own `this`, `arguments`, `super` or `new.target`; they cannot be used with `new` and have no `prototype`.',
        detailedAnswer: [
          '`this` is lexical: taken from the surrounding scope, fixed forever.',
          '`call`/`apply`/`bind` cannot change it.',
          'No `arguments` object — use rest parameters.',
          '`new` throws TypeError; there is no `prototype` property.',
          'Expression bodies return implicitly.',
        ],
        followUp: 'When should you avoid arrow functions?',
        trap: 'Saying arrows "bind this to the object they are defined in" — object literals do not create a this scope.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Arrow functions',
        question: 'When should you not use an arrow function?',
        shortAnswer: 'When the function needs its own dynamic `this` (object/prototype methods, event handlers relying on `this`, library hooks like Mongoose), when it must be a constructor, or when you need `arguments`.',
        detailedAnswer: [
          'Object literal methods: `this` would be the outer scope, not the object.',
          'Prototype methods added with `Foo.prototype.x = () => {}` have the same problem.',
          'Constructors: arrows throw with `new`.',
          'Libraries that call your function with a specific `this` (Mongoose middleware, some test frameworks\' `this.timeout`).',
          'Recursion via a stable name is clearer with a named function declaration.',
        ],
        followUp: 'Why is defining a class field as an arrow (`handle = () => {}`) sometimes useful?',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'scope-and-closures': {
    summary: 'Scope decides where a variable is visible, based on where code is written (lexical scope); a closure is a function together with the scope it was created in, so it keeps access to those variables even after the outer function has returned.',
    topics: ['global scope', 'function scope', 'block scope', 'lexical scope', 'scope chain', 'shadowing', 'closure', 'lexical environment', '[[Environment]]', 'private state', 'factory functions', 'memoization', 'once', 'memory leaks'],
    sections: [
      section('introduction', undefined,
        text('Closures are behind counters, caches, middleware factories, rate limiters, `once()`, debouncers and private state. They feel like magic until you see the rule: **a function remembers the scope in which it was created**.'),
      ),
      section('definition', 'Definitions',
        bullets(
          '**Scope** — the region of code where a binding is visible.',
          '**Lexical (static) scope** — scope is decided by where code is *written*, not where it is called from.',
          '**Scope chain** — when a variable is not found locally, the engine looks in the outer scope, then its outer scope, up to global.',
          '**Closure** — a function plus a reference to its surrounding lexical environment. Every JavaScript function is a closure; it only becomes interesting when the function outlives its outer scope.',
        ),
        table('Scope types', ['Scope', 'Created by', 'Holds'], [
          ['Global', 'The script/module', 'Top-level bindings'],
          ['Module', 'Each CommonJS/ES module file', 'File-level bindings (not global!)'],
          ['Function', 'Each function call', 'Params, `var`, inner functions, `let`/`const` at function level'],
          ['Block', '`{ }`, `if`, `for`, `try`', '`let`, `const`, `class`'],
        ]),
      ),
      section('why', 'Why closures matter',
        bullets(
          '**Data privacy** — variables in a closure cannot be read or changed from outside.',
          '**State without classes** — counters, caches, connection singletons.',
          '**Configuration** — factories like `createLogger("api")` or `rateLimit({ max: 100 })` return functions that remember options.',
          '**Async callbacks** — a callback passed to `setTimeout` or a DB query still sees the variables of the request that created it.',
        ),
      ),
      section('internals', 'How the engine implements closures',
        steps(
          'Each scope is represented by a **lexical environment**: an environment record (the bindings) plus a reference to the **outer** environment.',
          'When a function object is created, the engine stores the *current* lexical environment in the function\'s internal `[[Environment]]` slot.',
          'When the function is later called, its new environment\'s outer reference is set to that saved `[[Environment]]` — not to the caller\'s environment. That is why scope is lexical.',
          'Variable lookup walks this chain of outer references until it finds the name or reaches global (then ReferenceError).',
          'Normally a function\'s environment is discarded when it returns. If an inner function still references it, the environment stays alive on the heap as long as that inner function is reachable.',
          'V8 optimisation: only variables actually referenced by inner functions are kept in a heap-allocated **Context**; unused locals stay on the stack and are freed.',
        ),
        flow([
          'inner() environment: own variables',
          'outer() environment: count, config',
          'module / global environment',
          'null (end of chain)',
        ], { title: 'Scope chain lookup', direction: 'vertical', caption: 'Lookup goes outward, never inward.' }),
        note('Closures capture **variables (bindings)**, not snapshot values. If the variable changes later, the closure sees the new value.'),
      ),
      section('example', 'Lexical scope and the scope chain',
        code({
          title: 'Lookup goes outward',
          code: dedent(`
            const level = 'global';
            function outer() {
              const level = 'outer';
              function inner() {
                console.log(level);
              }
              inner();
            }
            outer();
            function other() {
              console.log(level);
            }
            other();
          `),
          expectedOutput: 'outer\nglobal',
          explanation: [
            '`inner` does not declare `level`, so the engine checks `outer`\'s scope and finds `"outer"` — the inner one **shadows** the global.',
            '`other` is defined at the top level; its outer scope is global.',
          ],
          runnable: true,
        }),
        code({
          title: 'Lexical, not dynamic',
          code: dedent(`
            const value = 'lexical';
            function printValue() {
              console.log(value);
            }
            function caller() {
              const value = 'dynamic';
              printValue();
            }
            caller();
          `),
          expectedOutput: 'lexical',
          explanation: [
            '`printValue` was **written** at the top level, so its outer scope is global.',
            'Where it is called from (inside `caller`) does not matter.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Closures keep state alive',
        code({
          title: 'Private counter',
          code: dedent(`
            function createCounter() {
              let count = 0;
              return {
                increment() {
                  count++;
                  return count;
                },
                get() {
                  return count;
                },
              };
            }
            const a = createCounter();
            const b = createCounter();
            a.increment();
            a.increment();
            b.increment();
            console.log(a.get(), b.get());
            console.log(a.count);
          `),
          expectedOutput: '2 1\nundefined',
          explanation: [
            'Each call to `createCounter` creates a **new** environment with its own `count`.',
            '`a`\'s methods close over the first environment, `b`\'s over the second.',
            '`count` is not a property of the returned object — it is unreachable from outside.',
          ],
          runnable: true,
        }),
        code({
          title: 'Closures capture variables, not values',
          code: dedent(`
            function makeGreeter() {
              let greeting = 'Hello';
              const greet = (name) => greeting + ', ' + name;
              greeting = 'Hi';
              return greet;
            }
            console.log(makeGreeter()('Sam'));
          `),
          expectedOutput: 'Hi, Sam',
          explanation: [
            '`greet` holds a reference to the environment, not a copy of `greeting`.',
            'By the time it runs, `greeting` is `"Hi"`.',
          ],
          runnable: true,
        }),
        code({
          title: 'The classic loop problem — three solutions',
          code: dedent(`
            var fns = [];
            for (var i = 0; i < 3; i++) {
              fns.push(() => i);
            }
            console.log(fns.map((f) => f()));

            const fixed = [];
            for (let j = 0; j < 3; j++) {
              fixed.push(() => j);
            }
            console.log(fixed.map((f) => f()));

            const iife = [];
            for (var k = 0; k < 3; k++) {
              (function (captured) {
                iife.push(() => captured);
              })(k);
            }
            console.log(iife.map((f) => f()));
          `),
          expectedOutput: '[ 3, 3, 3 ]\n[ 0, 1, 2 ]\n[ 0, 1, 2 ]',
          explanation: [
            'With `var` there is **one** `i` for the whole loop; all three closures share it, and it ends at 3.',
            'With `let` the loop creates a fresh `j` per iteration, so each closure gets its own.',
            'Before ES2015 people used an IIFE: each call creates a new scope with its own `captured` parameter.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Practical closure patterns',
        code({
          title: 'once() — run initialisation a single time',
          code: dedent(`
            function once(fn) {
              let called = false;
              let result;
              return function (...args) {
                if (!called) {
                  called = true;
                  result = fn(...args);
                }
                return result;
              };
            }
            const connect = once(() => {
              console.log('connecting to DB...');
              return { connected: true };
            });
            console.log(connect());
            console.log(connect());
          `),
          expectedOutput: 'connecting to DB...\n{ connected: true }\n{ connected: true }',
          explanation: [
            '`called` and `result` live in `once`\'s environment, shared by every call to the returned function.',
            'The second call returns the cached result without reconnecting.',
          ],
          runnable: true,
        }),
        code({
          title: 'memoize() — cache results by argument',
          code: dedent(`
            function memoize(fn) {
              const cache = new Map();
              return (n) => {
                if (cache.has(n)) return 'cached ' + cache.get(n);
                const result = fn(n);
                cache.set(n, result);
                return 'computed ' + result;
              };
            }
            const square = memoize((n) => n * n);
            console.log(square(9));
            console.log(square(9));
            console.log(square(3));
          `),
          expectedOutput: 'computed 81\ncached 81\ncomputed 9',
          explanation: [
            'The `cache` Map survives between calls because the arrow closes over it.',
            'Each memoized function gets its own private cache.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'A per-IP rate limiter factory',
        code({
          title: 'Configuration + private state via closure',
          code: dedent(`
            function createRateLimiter(limit) {
              const hits = new Map();
              return function allow(ip) {
                const count = (hits.get(ip) || 0) + 1;
                hits.set(ip, count);
                return count <= limit;
              };
            }
            const allow = createRateLimiter(2);
            console.log(allow('1.1.1.1'), allow('1.1.1.1'), allow('1.1.1.1'), allow('2.2.2.2'));
          `),
          expectedOutput: 'true true false true',
          explanation: [
            '`limit` (config) and `hits` (state) are captured by `allow`.',
            'Express middleware factories like `rateLimit({ max })` or `cors(options)` work the same way: they return a `(req, res, next)` function that closes over options.',
            'Real limiters also expire old entries — an unbounded Map in a closure is a memory leak.',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`var` in loops with async callbacks (all callbacks see the last value).',
          'Assuming a closure snapshots values — it holds live bindings.',
          'Accidentally keeping large objects alive: a long-lived closure (event listener, interval, module-level cache) that references a big request/response object prevents garbage collection.',
          'Forgetting to remove listeners/intervals that close over per-request data.',
        ),
        warn('A closure stored in a long-lived place (global Map, `setInterval`, an EventEmitter listener) keeps its whole captured environment alive. That is the most common source of memory leaks in Node.js services.'),
      ),
      section('interview', 'Interview tips',
        interviewTip('Define it precisely: "A closure is a function bundled with references to its lexical environment, so it can access outer variables after the outer function has returned."'),
        interviewTip('Be ready to code `once`, `memoize`, `counter`, or `debounce` live, and to fix the `var` loop three ways.'),
        interviewTip('Bonus points: mention V8 only keeps referenced variables in the closure context.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write `createIdGenerator(prefix)` returning a function that yields `prefix-1`, `prefix-2`, …',
          'Write `debounce(fn, ms)` that only calls `fn` after `ms` milliseconds without new calls.',
          'Write `createCache(ttlMs)` with `get`/`set` methods that expire entries.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Scope is lexical: decided by where code is written.',
          'Lookup walks the scope chain outward to global.',
          'A closure = function + its creation environment, kept alive while the function is reachable.',
          'Closures capture bindings, not values.',
          'Great for privacy and factories; watch out for leaks in long-lived closures.',
        ),
      ),
    ],
    revisionNotes: [
      'Lexical scope: determined at write time, not call time.',
      'Function stores its creation environment in [[Environment]].',
      'Closures capture variables (live), not values.',
      'var loop + callbacks → shared variable; fix with let or IIFE.',
      'Each factory call creates a fresh environment (independent state).',
      'Long-lived closures (listeners, intervals, caches) can leak memory.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          function outer() {
            let x = 1;
            return () => ++x;
          }
          const f = outer();
          const g = outer();
          f(); f();
          console.log(f(), g());
        `),
        options: ['4 2', '2 2', '4 4', '3 2'],
        answer: 0,
        explanation: '`f` and `g` each close over a separate `x`. `f` has been called twice (x = 3), the third call gives 4. `g` starts fresh → 2.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          for (var i = 0; i < 3; i++) {
            setTimeout(() => console.log(i));
          }
        `),
        options: ['0 1 2', '3 3 3', '2 2 2', 'undefined ×3'],
        answer: 1,
        explanation: 'One function-scoped `i` is shared. The loop finishes (i = 3) before any timer runs. With `let` the output would be 0 1 2.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Complete `makeMultiplier` so that `makeMultiplier(3)(5)` returns 15.',
        code: 'function makeMultiplier(factor) {\n  /* ??? */\n}',
        options: [
          'return factor * n;',
          'return (n) => n * factor;',
          'return function () { return factor * factor; };',
          'this.factor = factor;',
        ],
        answer: 1,
        explanation: 'The function must return another function that closes over `factor` and receives `n`. The first option references an undefined `n`.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Memory grows steadily in a Node service. Each request does `emitter.on("tick", () => log(req.id))` and never removes the listener. What is happening?',
        options: [
          'Closures are copied on every tick',
          'Each listener closure keeps its request environment (req) alive, and listeners accumulate forever',
          'EventEmitter stores every emitted event',
          'Arrow functions cannot be garbage-collected',
        ],
        answer: 1,
        explanation: 'The emitter holds every listener; each listener closes over `req`, so requests can never be collected. Remove the listener (or use `once`) when the request ends.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Closures',
        question: 'What is a closure? Give a practical example.',
        shortAnswer: 'A closure is a function that keeps access to variables from the scope where it was created, even after that outer function has returned — e.g. a counter or a middleware factory that remembers its options.',
        detailedAnswer: [
          'Functions store a reference to their creation environment.',
          'If an inner function is returned or stored, that environment stays alive.',
          'Use cases: private state, `once`, memoization, factories (`createLogger(prefix)`), partial application.',
          'Each call to the outer function creates an independent environment.',
        ],
        code: {
          id: 'm01-closure-logger', language: 'javascript', runnable: true,
          code: dedent(`
            function createLogger(prefix) {
              return (msg) => console.log('[' + prefix + '] ' + msg);
            }
            const dbLog = createLogger('db');
            dbLog('connected');
          `),
          expectedOutput: '[db] connected',
        },
        followUp: 'Can closures cause memory leaks?',
        trap: 'Describing closures as "functions inside functions" without mentioning retained scope.',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'Closures',
        question: 'A for loop with var schedules setTimeout(() => console.log(i)) three times. What prints, and how many ways can you fix it?',
        shortAnswer: 'It prints 3 three times because all callbacks share one function-scoped `i`; fix with `let`, an IIFE that captures the value, or passing `i` as a setTimeout extra argument.',
        detailedAnswer: [
          '`var i` is a single binding for the whole function; the loop ends with i = 3 before timers fire.',
          '`let` creates a new binding per iteration.',
          'IIFE: `(function (j) { setTimeout(() => console.log(j)); })(i)`.',
          '`setTimeout(console.log, 0, i)` passes the current value as an argument.',
          '`.bind(null, i)` also snapshots the value.',
        ],
        followUp: 'Why does let behave differently in a for loop specifically?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Scope',
        question: 'What is lexical scope and how does the scope chain resolve a variable?',
        shortAnswer: 'Lexical scope means visibility is determined by where code is written; to resolve a name the engine checks the current environment, then each outer environment in turn up to global, throwing ReferenceError if not found.',
        detailedAnswer: [
          'Each environment has a pointer to its outer environment, fixed when the function is created.',
          'Lookup goes from inner to outer only; outer code cannot see inner variables.',
          'Inner declarations with the same name shadow outer ones.',
          'Assigning to an undeclared name in sloppy mode creates a global; strict mode throws ReferenceError.',
          'Contrast: dynamic scope (resolving by call stack) is not used by JavaScript, though `this` is dynamic.',
        ],
        followUp: 'Which JavaScript feature behaves dynamically rather than lexically?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'advanced', topic: 'Closures',
        question: 'How can closures cause memory leaks in a long-running Node.js process, and how does V8 decide what a closure retains?',
        shortAnswer: 'A closure keeps its captured environment alive as long as the closure itself is reachable; if it is stored in a long-lived place (listener, interval, global cache), the captured data can never be collected. V8 retains only variables that inner functions reference, but all closures created in the same scope share one context.',
        detailedAnswer: [
          'Leaks come from reachability: emitter listeners, `setInterval` callbacks, module-level Maps, unresolved promises holding callbacks.',
          'V8 allocates a heap "Context" per scope containing only variables referenced by any inner function.',
          'Because sibling closures share that Context, a variable captured by one closure is retained by all of them — even a closure that never uses it.',
          'Fixes: remove listeners, clear intervals, bound caches (LRU/TTL), avoid capturing whole `req`/`res` objects — copy the fields you need.',
          'Diagnose with heap snapshots (`--inspect`, Chrome DevTools) and look at retainer paths (Module 11).',
        ],
        followUp: 'How would you find which closure is retaining a large object in a heap snapshot?',
        trap: 'Believing the garbage collector frees a function\'s locals as soon as it returns, regardless of closures.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  hoisting: {
    summary: 'Hoisting is the effect of the creation phase: declarations are registered before code runs, so function declarations are callable early, `var` reads as undefined, and let/const/class throw in the TDZ.',
    topics: ['hoisting', 'creation phase', 'function declaration hoisting', 'var hoisting', 'TDZ', 'function expression', 'class hoisting', 'shadowing', 'name conflicts'],
    sections: [
      section('introduction', undefined,
        text('Why can you call a function before it appears in the file, but not a `const` arrow function? The answer is **hoisting** — and it is not code being moved, it is the engine preparing scopes before running them.'),
      ),
      section('definition', 'Definition',
        text('**Hoisting** is the behaviour where variable and function **declarations** are processed when a scope is entered, before any code in it executes. Only declarations are hoisted — assignments stay where they are.'),
        table('What gets hoisted and how', ['Declaration', 'Hoisted?', 'Value before its line'], [
          ['`function f() {}`', 'Yes', 'The full function — callable'],
          ['`var x = 1`', 'Yes', '`undefined`'],
          ['`let x = 1` / `const x = 1`', 'Yes', 'Uninitialized → ReferenceError (TDZ)'],
          ['`class C {}`', 'Yes', 'Uninitialized → ReferenceError (TDZ)'],
          ['`var f = function () {}`', 'Variable only', '`undefined` → calling it is TypeError'],
          ['`const f = () => {}`', 'Variable only', 'TDZ → ReferenceError'],
          ['`import`', 'Yes (module linking)', 'Bindings ready before module code runs'],
        ]),
      ),
      section('why', 'Why it works this way',
        bullets(
          'Function declaration hoisting lets you write the "main" logic at the top and helper functions below it.',
          'It allows mutually recursive functions to call each other regardless of order.',
          '`var` hoisting is a historical design choice; the TDZ for `let`/`const` was added to turn its silent `undefined` into a clear error.',
        ),
      ),
      section('internals', 'What the engine does',
        steps(
          'Before running a scope, the engine scans it for declarations (this is part of creating the execution context).',
          'For each function declaration: create the binding and **immediately** assign the function object.',
          'For each `var`: create the binding in the function scope (if not already there) and set it to `undefined`.',
          'For each `let`/`const`/`class`: create the binding in its block scope but leave it **uninitialized**.',
          'Then execute the code top to bottom. When a `let`/`const` line runs, the binding gets initialised and leaves the TDZ.',
        ),
        note('If a `var` and a function declaration share a name, the function wins during the creation phase (vars do not overwrite an existing binding). The later `var` **assignment**, when it executes, then overwrites it.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Declaration vs expression',
          code: dedent(`
            console.log(sayHi());
            function sayHi() {
              return 'hi from declaration';
            }
            console.log(typeof sayBye);
            try {
              sayBye();
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            var sayBye = function () {
              return 'bye';
            };
          `),
          expectedOutput: 'hi from declaration\nundefined\nTypeError: sayBye is not a function',
          explanation: [
            '`sayHi` was fully created in the creation phase, so it can be called before its line.',
            '`sayBye` is a `var` holding `undefined` at that point; calling `undefined` is a **TypeError**, not a ReferenceError.',
          ],
          runnable: true,
        }),
        code({
          title: 'const arrow functions are in the TDZ',
          code: dedent(`
            try {
              greet();
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            const greet = () => 'hello';
            console.log(greet());
          `),
          expectedOutput: "ReferenceError: Cannot access 'greet' before initialization\nhello",
          explanation: [
            '`greet` exists but is uninitialized until its line executes.',
            'After the declaration runs, it works normally.',
          ],
          runnable: true,
        }),
        code({
          title: 'var hoisting inside a function shadows the outer variable',
          code: dedent(`
            var x = 'global';
            function test() {
              console.log(x);
              var x = 'local';
              console.log(x);
            }
            test();
          `),
          expectedOutput: 'undefined\nlocal',
          explanation: [
            'Inside `test`, the local `var x` is hoisted to the top of the function with value `undefined`.',
            'It shadows the global `x` for the entire function, so the first log is `undefined`, not `"global"`.',
          ],
          runnable: true,
        }),
        code({
          title: 'The same with let: TDZ instead of undefined',
          code: dedent(`
            let token = 'outer';
            function read() {
              try {
                console.log(token);
              } catch (e) {
                console.log(e.message);
              }
              let token = 'inner';
              return token;
            }
            console.log(read());
          `),
          expectedOutput: "Cannot access 'token' before initialization\ninner",
          explanation: [
            'The inner `let token` is hoisted to the top of `read`\'s scope (uninitialized).',
            'It shadows the outer `token` everywhere in the function, so the early read throws instead of finding `"outer"`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Function and var with the same name',
          code: dedent(`
            console.log(typeof foo);
            var foo = 'string now';
            function foo() {}
            console.log(typeof foo);
          `),
          expectedOutput: 'function\nstring',
          explanation: [
            'Creation phase: `foo` is bound to the function; the `var foo` declaration does not overwrite it.',
            'Execution phase: `foo = "string now"` runs and replaces the function.',
            'The function declaration line itself does nothing at execution time.',
          ],
          runnable: true,
        }),
        code({
          title: 'Classes are hoisted but in the TDZ',
          code: dedent(`
            try {
              new Service();
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            class Service {}
            console.log(typeof Service);
          `),
          expectedOutput: "ReferenceError: Cannot access 'Service' before initialization\nfunction",
          explanation: [
            'Class declarations behave like `let`: you must define a class before using it.',
            '`typeof` a class is `"function"` — classes are special functions.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In Node.js files',
        code({
          title: 'Helpers below, entry point on top',
          code: dedent(`
            // server.js
            start();

            function start() {
              const app = createApp();
              app.listen(3000, () => console.log('listening'));
            }

            function createApp() {
              // ...
            }
          `),
          explanation: [
            'Works because `start` and `createApp` are declarations.',
            'If they were `const start = () => {}`, the first line would throw a ReferenceError.',
            'Many teams still prefer defining things before use for readability.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Saying hoisting "moves code to the top" — declarations are registered; nothing moves.',
          'Converting a function declaration to a `const` arrow and breaking code that called it earlier.',
          'Declaring a local `var` with the same name as an outer variable and reading it before assignment.',
          'Declaring functions inside `if` blocks — behaviour differs between strict and sloppy mode; use function expressions there instead.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Explain hoisting through the creation phase. Then list the three behaviours: functions (full), var (undefined), let/const/class (TDZ).'),
        interviewTip('Know the error types: calling a hoisted `var` function expression → TypeError; accessing a TDZ binding → ReferenceError; an undeclared name → ReferenceError "x is not defined".'),
      ),
      section('practice', 'Practice',
        text('Predict the output of a snippet where a function declaration, a `var` with the same name and a later assignment all appear. Then rewrite it with `const` and explain the new error.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Hoisting = declarations processed in the creation phase.',
          'Function declarations: fully usable early.',
          '`var`: `undefined` early; `let`/`const`/`class`: TDZ.',
          'Function expressions/arrows follow their variable\'s rules.',
          'Inner declarations shadow outer names for the whole scope.',
        ),
      ),
    ],
    revisionNotes: [
      'Hoisting is a consequence of the creation phase, not code movement.',
      'Function declarations hoisted with body; var → undefined; let/const/class → TDZ.',
      'Calling a var function expression early → TypeError: x is not a function.',
      'TDZ access → ReferenceError: Cannot access \'x\' before initialization.',
      'Function declaration beats var of same name in creation; later assignment overwrites.',
      'A local declaration shadows the outer variable for the entire scope.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "console.log(a);\nvar a = 5;",
        options: ['5', 'ReferenceError', 'undefined', 'null'],
        answer: 2,
        explanation: 'The `var a` binding is hoisted and initialised to `undefined`; the assignment happens on line 2.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          var name = 'global';
          function show() {
            console.log(name);
            var name = 'local';
          }
          show();
        `),
        options: ['global', 'local', 'undefined', 'ReferenceError'],
        answer: 2,
        explanation: 'The local `var name` is hoisted to the top of `show` and shadows the global. At the log it is `undefined`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What happens?',
        code: "run();\nconst run = function () { console.log('ran'); };",
        options: ['ran', 'TypeError: run is not a function', "ReferenceError: Cannot access 'run' before initialization", 'undefined'],
        answer: 2,
        explanation: '`run` is a `const`, so it is in the TDZ. With `var` it would be a TypeError instead because the value would be `undefined`.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Hoisting',
        question: 'What is hoisting in JavaScript?',
        shortAnswer: 'Hoisting is the behaviour where declarations are registered when a scope is created, before code runs — so function declarations can be called early, var reads as undefined, and let/const/class exist but throw until initialised.',
        detailedAnswer: [
          'It is a side effect of the creation phase of an execution context.',
          'Only declarations are hoisted, never assignments/initialisers.',
          'Function declarations are hoisted with their body.',
          '`let`/`const`/`class` are hoisted to the top of their block but stay in the TDZ.',
        ],
        followUp: 'What is the difference in error when you call a var function expression vs a const one before definition?',
        trap: '"Declarations are physically moved to the top of the file."',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'Hoisting',
        question: 'What happens when a var and a function declaration share the same name in one scope?',
        shortAnswer: 'During creation the function declaration wins (var does not overwrite an existing binding); when execution reaches the var assignment, the variable is reassigned to that value.',
        detailedAnswer: [
          'Creation phase: function bindings are initialised with the function; `var` declarations of an existing name are ignored.',
          'Before the assignment line, `typeof name` is `"function"`.',
          'After `name = value` executes, the function is gone.',
          'With `let`/`const` the same situation is a SyntaxError (duplicate declaration).',
        ],
        code: {
          id: 'm01-hoist-conflict', language: 'javascript', runnable: true,
          code: "console.log(typeof x);\nvar x = 1;\nfunction x() {}\nconsole.log(typeof x);",
          expectedOutput: 'function\nnumber',
        },
        followUp: 'What if there is a var declaration with no assignment, e.g. `var x;`?',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'this-keyword': {
    summary: '`this` is decided at call time by how a regular function is called: `new` → the new object, call/apply/bind → the given object, `obj.method()` → obj, plain call → undefined (strict) or the global object (sloppy); arrows inherit `this` lexically.',
    topics: ['this', 'default binding', 'implicit binding', 'explicit binding', 'new binding', 'call', 'apply', 'bind', 'lost this', 'strict mode', 'arrow functions', 'globalThis', 'binding precedence'],
    sections: [
      section('introduction', undefined,
        text('`this` is the most misunderstood keyword in JavaScript because it does **not** depend on where a function is written — it depends on **how the function is called**. Learn four rules plus the arrow exception and you can predict it every time.'),
      ),
      section('definition', 'The binding rules',
        table('How this is determined (highest priority first)', ['Rule', 'Call looks like', '`this` is'], [
          ['1. new binding', '`new Foo()`', 'The newly created object'],
          ['2. Explicit binding', '`fn.call(obj)`, `fn.apply(obj)`, `fn.bind(obj)()`', '`obj`'],
          ['3. Implicit binding', '`obj.fn()`', '`obj` (the object before the dot)'],
          ['4. Default binding', '`fn()`', '`undefined` in strict mode; `globalThis` in sloppy mode'],
          ['Arrow functions', 'any', 'Lexical: the `this` of the enclosing scope (rules do not apply)'],
        ]),
        note('Classes and ES modules are always strict mode, so in modern Node code "default binding" usually means `this === undefined`.'),
      ),
      section('why', 'Why JavaScript has a dynamic this',
        bullets(
          'It lets one function be shared by many objects via prototypes: `User.prototype.greet` uses the `this` of whichever user calls it.',
          'It is why methods can be borrowed: `Array.prototype.slice.call(arguments)`.',
          'The cost: detaching a method (passing it as a callback) loses its object.',
        ),
      ),
      section('internals', 'How the engine decides',
        steps(
          'When a function is **called**, the engine looks at the call expression.',
          'If it is a `new` expression, it creates an object with `[[Prototype]]` = `Fn.prototype` and uses it as `this`.',
          'If the callee is a **bound function** (from `bind`), its stored `this` is used (only `new` can override it).',
          'If called with `call`/`apply`, the first argument is used.',
          'If the callee came from a **property access** (`obj.fn` or `obj["fn"]`), the engine keeps a "reference" that remembers `obj` as the base — that becomes `this`.',
          'Otherwise `this` is `undefined`; in sloppy mode, `undefined`/`null` are replaced with `globalThis` and primitives are boxed.',
          'Arrow functions have no `this` binding at all; `this` inside them is looked up through the scope chain like a variable.',
        ),
        table('Top-level this', ['Environment', 'Top-level `this`'], [
          ['Browser classic script / this playground', 'Global object'],
          ['Node.js CommonJS file', '`module.exports` (initially `{}`)'],
          ['ES module (Node or browser)', '`undefined`'],
        ]),
      ),
      section('example', 'The four rules',
        code({
          title: 'Same function, different this',
          code: dedent(`
            var label = 'global label';
            const service = {
              label: 'service',
              describe() {
                return this.label;
              },
            };
            console.log(service.describe());
            const detached = service.describe;
            console.log(detached());
            console.log(detached.call({ label: 'explicit' }));
            function Widget(label) {
              this.label = label;
            }
            console.log(new Widget('constructed').label);
          `),
          expectedOutput: 'service\nglobal label\nexplicit\nconstructed',
          explanation: [
            'Implicit: called as `service.describe()` → `this` is `service`.',
            'Default (sloppy script): `detached()` has no object before the dot → `this` is the global object, where the top-level `var label` lives.',
            'Explicit: `call` sets `this` to the given object.',
            'new: `this` is the fresh object being constructed.',
            'In a Node CommonJS file, `detached()` would return `undefined` (the top-level `var` is not global there).',
          ],
          runnable: true,
        }),
        code({
          title: 'Default binding in strict mode',
          code: dedent(`
            'use strict';
            const service = {
              label: 'service',
              describe() {
                return this.label;
              },
            };
            const detached = service.describe;
            try {
              detached();
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            function whoAmI() {
              return this;
            }
            console.log(whoAmI());
          `),
          expectedOutput: "TypeError: Cannot read properties of undefined (reading 'label')\nundefined",
          explanation: [
            'In strict mode a plain call gets `this === undefined`.',
            'Reading `.label` of `undefined` throws — the most common "lost this" error you will see in logs.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'call, apply and bind',
        code({
          title: 'Explicit binding',
          code: dedent(`
            function introduce(greeting, punctuation) {
              return greeting + ', I am ' + this.name + punctuation;
            }
            const dev = { name: 'Ada' };
            console.log(introduce.call(dev, 'Hi', '!'));
            console.log(introduce.apply(dev, ['Hello', '.']));
            const bound = introduce.bind(dev, 'Hey');
            console.log(bound('?'));
            console.log(bound.call({ name: 'Other' }, '!'));
          `),
          expectedOutput: 'Hi, I am Ada!\nHello, I am Ada.\nHey, I am Ada?\nHey, I am Ada!',
          explanation: [
            '`call(thisArg, ...args)` — arguments listed individually.',
            '`apply(thisArg, argsArray)` — arguments as an array ("A for array").',
            '`bind(thisArg, ...partialArgs)` returns a **new function** with `this` fixed and optionally some arguments pre-filled (partial application).',
            'A bound function ignores a later `call`\'s `this` — only the arguments are passed through.',
          ],
          runnable: true,
        }),
        code({
          title: 'Binding precedence: bind is permanent, new beats bind',
          code: dedent(`
            function show() {
              return this.v;
            }
            const once = show.bind({ v: 'first' });
            const twice = once.bind({ v: 'second' });
            console.log(twice());

            function Point(x) {
              this.x = x;
            }
            const BoundPoint = Point.bind({ x: 'ignored' });
            const p = new BoundPoint(5);
            console.log(p.x, p instanceof Point);
          `),
          expectedOutput: 'first\n5 true',
          explanation: [
            'Re-binding a bound function does not change `this`; the first bind wins.',
            '`new` overrides a bound `this`: a fresh object is created and the bound object is ignored.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Losing this in callbacks',
        code({
          title: 'Passing a method as a callback',
          code: dedent(`
            class Logger {
              constructor(prefix) {
                this.prefix = prefix;
              }
              log(msg) {
                return this.prefix + ' ' + msg;
              }
            }
            const logger = new Logger('[api]');
            const messages = ['started', 'ready'];
            try {
              messages.map(logger.log);
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            console.log(messages.map(logger.log.bind(logger)));
            console.log(messages.map((m) => logger.log(m)));
          `),
          expectedOutput: "TypeError: Cannot read properties of undefined (reading 'prefix')\n[ '[api] started', '[api] ready' ]\n[ '[api] started', '[api] ready' ]",
          explanation: [
            '`logger.log` without `()` is just the function — the link to `logger` is lost.',
            '`map` calls it as a plain function; class bodies are strict, so `this` is `undefined`.',
            'Fix 1: `bind(logger)`. Fix 2: wrap in an arrow that calls it as a method.',
          ],
          runnable: true,
        }),
        code({
          title: 'Nested regular function vs arrow inside a method',
          code: dedent(`
            'use strict';
            const team = {
              name: 'backend',
              members: ['ana', 'raj'],
              listArrow() {
                return this.members.map((m) => m + '@' + this.name);
              },
              listRegular() {
                return this.members.map(function (m) {
                  return m + '@' + (this && this.name);
                });
              },
            };
            console.log(team.listArrow());
            console.log(team.listRegular());
          `),
          expectedOutput: "[ 'ana@backend', 'raj@backend' ]\n[ 'ana@undefined', 'raj@undefined' ]",
          explanation: [
            'The arrow inherits `listArrow`\'s `this` (`team`).',
            'The inner regular function gets its own `this` from how `map` calls it — a plain call, so `undefined` in strict mode.',
            '`map` accepts a second `thisArg` argument (`map(fn, this)`), another fix.',
          ],
          runnable: true,
        }),
        code({
          title: 'Class field arrow functions are auto-bound',
          code: dedent(`
            class Handler {
              prefix = 'handled:';
              handle = (x) => this.prefix + x;
            }
            const { handle } = new Handler();
            console.log(handle('req'));
          `),
          expectedOutput: 'handled:req',
          explanation: [
            'Class fields are initialised inside the constructor, where `this` is the instance; the arrow captures it.',
            'Trade-off: every instance gets its own function copy (not shared on the prototype).',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In Node.js and Express',
        code({
          title: 'Passing controller methods to Express',
          code: dedent(`
            class UserController {
              constructor(userService) {
                this.userService = userService;
              }
              async getUser(req, res) {
                const user = await this.userService.findById(req.params.id);
                res.json(user);
              }
            }
            const controller = new UserController(userService);

            app.get('/users/:id', controller.getUser);                  // ✗ this is undefined
            app.get('/users/:id', controller.getUser.bind(controller)); // ✓
            app.get('/users/:id', (req, res) => controller.getUser(req, res)); // ✓
          `),
          explanation: [
            'Express calls your handler as a plain function, so a detached class method loses `this`.',
            'The error appears only at request time: "Cannot read properties of undefined (reading \'userService\')".',
            'EventEmitter is the opposite case: it calls regular-function listeners with `this` = the emitter.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Passing `obj.method` as a callback (setTimeout, Express, array methods, promise `.then`).',
          'Using an arrow as an object method and expecting `this` to be the object.',
          'Assuming `this` inside a nested regular function equals the outer method\'s `this`.',
          'Calling `bind` inside `render`/hot paths repeatedly — it creates a new function each time.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Answer in this order: "It depends on the call site." Then list new → explicit → implicit → default, then "arrows are lexical".'),
        interviewTip('Be ready for: "What is `this` inside a `setTimeout` callback?" — regular function: not your object (Timeout object in Node, global in browsers); arrow: the enclosing `this`.'),
      ),
      section('practice', 'Practice',
        text('Implement your own `myBind(fn, thisArg, ...preset)` using `apply` and a closure. Bonus: make it work with `new` like the real `bind`.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`this` is decided by the call, not the definition (for regular functions).',
          'Precedence: new > bind/call/apply > obj.method() > plain call.',
          'Plain call: `undefined` in strict mode (classes, modules), global object in sloppy scripts.',
          'Arrows take `this` from the enclosing scope and cannot be rebound.',
          'Detaching a method loses `this` — bind it or wrap it in an arrow.',
        ),
      ),
    ],
    revisionNotes: [
      'new > explicit (call/apply/bind) > implicit (obj.fn()) > default.',
      'Default binding: undefined (strict) / globalThis (sloppy).',
      'Classes and ES modules are always strict.',
      'call(this, a, b), apply(this, [a, b]), bind(this, a) → new function.',
      'Bound functions cannot be re-bound; new still overrides bind.',
      'Top-level this: CJS → module.exports, ESM → undefined.',
      'Arrow: lexical this, ignores call/apply/bind.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          'use strict';
          const obj = {
            val: 42,
            getVal() { return this?.val; },
          };
          const fn = obj.getVal;
          console.log(obj.getVal(), fn());
        `),
        options: ['42 42', '42 undefined', 'undefined undefined', 'TypeError'],
        answer: 1,
        explanation: 'The method call has `obj` as `this`. `fn()` is a plain call in strict mode → `this` is undefined, and `this?.val` safely returns undefined (no TypeError thanks to `?.`).',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the difference between call and apply?',
        options: [
          'call is synchronous, apply is asynchronous',
          'call takes arguments individually, apply takes them as an array',
          'apply returns a new function, call invokes immediately',
          'There is no difference',
        ],
        answer: 1,
        explanation: 'Both invoke immediately with a given `this`; only the argument format differs. Returning a new function is what `bind` does.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What does this print?',
        code: dedent(`
          function f() { return this.n; }
          const g = f.bind({ n: 1 });
          const obj = { n: 2, g };
          console.log(obj.g(), g.call({ n: 3 }));
        `),
        options: ['2 3', '1 3', '2 1', '1 1'],
        answer: 3,
        explanation: 'A bound function always uses its bound `this`. Neither implicit binding (`obj.g()`) nor `call` can override it.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Requests to this Express route crash with "Cannot read properties of undefined (reading \'repo\')". Why?',
        code: dedent(`
          class ProductController {
            constructor(repo) { this.repo = repo; }
            async list(req, res) { res.json(await this.repo.all()); }
          }
          const pc = new ProductController(repo);
          app.get('/products', pc.list);
        `),
        options: [
          'async methods cannot be route handlers',
          'pc.list is passed detached, so Express calls it without this; use pc.list.bind(pc)',
          'The constructor must return this',
          'res.json cannot take a promise',
        ],
        answer: 1,
        explanation: 'Passing `pc.list` loses the receiver. Express calls it as a plain function; class code is strict, so `this` is undefined.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'this',
        question: 'How is the value of `this` determined in JavaScript?',
        shortAnswer: 'For regular functions it is decided at call time by how the function is called (new, call/apply/bind, method call, or plain call); arrow functions take `this` from their enclosing scope.',
        detailedAnswer: [
          '`new Fn()` → the new instance.',
          '`fn.call(obj)` / `apply` / `bind` → `obj`.',
          '`obj.fn()` → `obj`.',
          '`fn()` → `undefined` in strict mode, `globalThis` in sloppy mode.',
          'Arrows ignore all of these and use lexical `this`.',
        ],
        followUp: 'What is `this` at the top level of a CommonJS module?',
        trap: 'Saying `this` refers to the function itself or to where it was defined.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'this',
        question: 'What is the difference between call, apply and bind, and when would you use each?',
        shortAnswer: '`call` and `apply` invoke the function immediately with a chosen `this` (arguments listed vs array); `bind` returns a new function with `this` (and optionally leading arguments) permanently fixed.',
        detailedAnswer: [
          '`call`: borrowing methods, e.g. `Object.prototype.toString.call(value)`.',
          '`apply`: when arguments are already in an array (largely replaced by spread: `fn(...args)`).',
          '`bind`: passing methods as callbacks (Express handlers, event listeners, timers).',
          '`bind` also supports partial application: `const add5 = add.bind(null, 5)`.',
          'Bound functions cannot be re-bound, but `new` still creates a new object.',
        ],
        followUp: 'Implement `Function.prototype.bind` yourself.',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'this',
        question: 'Why does `this` become undefined when you pass an object method as a callback, and how do you fix it?',
        shortAnswer: 'Passing `obj.method` passes only the function, not the object; the callback is later invoked as a plain call, so default binding applies (undefined in strict code). Fix with bind, an arrow wrapper, or class-field arrows.',
        detailedAnswer: [
          'The receiver is only captured at the moment of a `obj.method()` call expression.',
          '`setTimeout(obj.m)`, `arr.map(obj.m)`, `app.get(path, ctrl.m)` all detach it.',
          'Fix: `obj.m.bind(obj)`, `(x) => obj.m(x)`, or define `m = () => {}` as a class field.',
          'Some APIs accept a `thisArg` (e.g. `arr.map(fn, thisArg)`).',
        ],
        code: {
          id: 'm01-lost-this', language: 'javascript', runnable: true,
          code: dedent(`
            'use strict';
            const counter = {
              n: 0,
              inc() { this.n++; return this.n; },
            };
            const run = (fn) => { try { return fn(); } catch (e) { return e.constructor.name; } };
            console.log(run(counter.inc));
            console.log(run(counter.inc.bind(counter)));
          `),
          expectedOutput: 'TypeError\n1',
        },
        followUp: 'Which fix creates a new function per instance and which shares one on the prototype?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'advanced', topic: 'this',
        question: 'What is the precedence among the this-binding rules, and how do bound functions interact with new?',
        shortAnswer: 'new binding is highest, then explicit (bind beats call/apply because a bound function ignores later this arguments), then implicit method calls, then default binding; `new` on a bound function ignores the bound this but keeps the preset arguments.',
        detailedAnswer: [
          '`new BoundFn()` creates a fresh object whose prototype is the original function\'s `prototype`.',
          'Bound `this` cannot be overridden by `call`, `apply`, re-`bind` or method-call syntax.',
          'Implicit binding beats default: `obj.fn()` vs `fn()`.',
          'Sloppy mode boxes primitive `this` values and replaces null/undefined with globalThis; strict mode leaves them as-is.',
          'Arrow functions sit outside this ranking: `this` is lexical and none of the rules apply.',
        ],
        followUp: 'What does `fn.call(5)` give for `this` in sloppy vs strict mode?',
        trap: 'Assuming `call` can override a bound function\'s `this`.',
      },
    ],
  },
};

export default content;

import type { InterviewQuestion } from '../../../types';
import { out } from './helpers';

/** Output questions: core JavaScript (scope, this, coercion, objects, arrays, JSON). All runnable. */
export const jsCoreOutputQuestions: InterviewQuestion[] = [
  out({
    id: 'out-001',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Hoisting',
    question: 'What does this print? Note that both the variable and the function are used before the line that defines them.',
    code: `
      console.log(a);
      var a = 5;
      console.log(a);
      console.log(greet());
      function greet() {
        return 'hi';
      }
    `,
    expectedOutput: 'undefined\n5\nhi',
    runnable: true,
    shortAnswer: '`undefined`, then `5`, then `hi` — the `var` declaration is hoisted without its value, the function declaration is hoisted completely.',
    detailedAnswer: [
      'Before any line runs, the engine creates bindings for every declaration in the scope (the creation phase).',
      '`var a` is created and initialised to `undefined`; the assignment `= 5` stays where it is.',
      'So the first `console.log(a)` prints `undefined`, and after the assignment it prints `5`.',
      'A function *declaration* is hoisted with its body, so `greet()` works on a line above its definition.',
    ],
    followUp: 'What changes if `var a` becomes `let a`, or `function greet` becomes `const greet = () => ...`?',
    trap: 'Saying the first log throws a ReferenceError — that is `let`/`const` behaviour, not `var`.',
    relatedLessonIds: ['m01-hoisting', 'm01-javascript-execution-fundamentals'],
  }),
  out({
    id: 'out-002',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Temporal dead zone',
    question: 'What does this print? There is an outer `x` and an inner `x` declared later in the function.',
    code: `
      let x = 'outer';
      function f() {
        try {
          console.log(x);
        } catch (e) {
          console.log(e.name);
        }
        let x = 'inner';
        console.log(x);
      }
      f();
    `,
    expectedOutput: 'ReferenceError\ninner',
    runnable: true,
    shortAnswer: '`ReferenceError`, then `inner` — the inner `let x` shadows the outer one for the whole function, and it is in the TDZ until its declaration line.',
    detailedAnswer: [
      '`let` declarations are hoisted too: the inner `x` binding exists from the start of `f`\'s scope.',
      'But it stays *uninitialised* until the `let x = ...` line runs — that window is the temporal dead zone.',
      'Because the inner binding shadows the outer one, `console.log(x)` does not fall back to `outer`; it hits the TDZ and throws `ReferenceError`.',
      'After the declaration runs, `x` is `inner`.',
    ],
    followUp: 'Does `typeof x` inside the TDZ also throw? (Yes — unlike an undeclared variable, where `typeof` returns "undefined".)',
    trap: 'Answering `outer` — assuming the outer variable is visible until the inner one is declared.',
    relatedLessonIds: ['m01-var-let-and-const', 'm01-hoisting'],
  }),
  out({
    id: 'out-003',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Closures in loops',
    question: 'What does this print? Two loops schedule timers, one with `var` and one with `let`.',
    code: `
      for (var i = 0; i < 3; i++) {
        setTimeout(() => console.log('var', i), 0);
      }
      for (let j = 0; j < 3; j++) {
        setTimeout(() => console.log('let', j), 0);
      }
    `,
    expectedOutput: 'var 3\nvar 3\nvar 3\nlet 0\nlet 1\nlet 2',
    runnable: true,
    shortAnswer: '`var 3` three times, then `let 0`, `let 1`, `let 2`.',
    detailedAnswer: [
      'Both loops finish synchronously before any timer callback runs.',
      '`var i` is one function-scoped variable shared by all three closures; when they run it is already `3`.',
      '`let j` creates a fresh binding per iteration, so each closure captures its own value (0, 1, 2).',
      'Timers with the same delay run in the order they were scheduled, so all `var` lines come first.',
    ],
    followUp: 'How would you fix the `var` loop without switching to `let`? (An IIFE or `setTimeout(fn, 0, i)` passing `i` as an argument.)',
    trap: 'Thinking `setTimeout(..., 0)` runs immediately inside the loop iteration.',
    relatedLessonIds: ['m01-scope-and-closures', 'm01-var-let-and-const'],
  }),
  out({
    id: 'out-004',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Closures',
    question: 'What does this print? Two counters are created from the same factory.',
    code: `
      function makeCounter() {
        let count = 0;
        return {
          inc: () => ++count,
          get: () => count,
        };
      }
      const a = makeCounter();
      const b = makeCounter();
      a.inc();
      a.inc();
      b.inc();
      console.log(a.get(), b.get());
      console.log(a.count);
    `,
    expectedOutput: '2 1\nundefined',
    runnable: true,
    shortAnswer: '`2 1`, then `undefined` — each call to `makeCounter` gets its own private `count`.',
    detailedAnswer: [
      'Every call to `makeCounter` creates a new scope with a new `count` variable.',
      '`inc` and `get` close over the `count` of the call that created them, so `a` and `b` never share state.',
      '`a` was incremented twice and `b` once, giving `2 1`.',
      '`count` is a variable in the closure, not a property of the returned object, so `a.count` is `undefined`.',
    ],
    followUp: 'How is this pattern used to implement private state, and how does it compare to `#private` class fields?',
    trap: 'Assuming both counters share one `count` because they come from the same function.',
    relatedLessonIds: ['m01-scope-and-closures'],
  }),
  out({
    id: 'out-005',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'this binding',
    question: 'What does this print? The method is called normally, extracted into a variable, and bound. (The method body is strict mode, as in modules and classes.)',
    code: `
      const user = {
        name: 'Ada',
        greet() {
          'use strict';
          return this ? 'Hi ' + this.name : 'no this: ' + this;
        },
      };
      const greet = user.greet;
      console.log(user.greet());
      console.log(greet());
      const bound = user.greet.bind({ name: 'Bob' });
      console.log(bound());
    `,
    expectedOutput: 'Hi Ada\nno this: undefined\nHi Bob',
    runnable: true,
    shortAnswer: '`Hi Ada`, `no this: undefined`, `Hi Bob` — `this` is decided by how the function is called, not where it was defined.',
    detailedAnswer: [
      '`user.greet()` is a method call, so `this` is the object before the dot: `user`.',
      '`const greet = user.greet` copies only the function; calling `greet()` plainly gives `this === undefined` in strict mode.',
      'In sloppy mode a plain call would get `globalThis` instead — still not `user`.',
      '`bind` returns a new function whose `this` is fixed to the given object, so it prints `Hi Bob`.',
    ],
    followUp: 'Where does this bite you in Node? (Passing `obj.method` as a callback, e.g. `emitter.on("x", this.handle)` or `arr.map(obj.fn)`.)',
    trap: 'Answering `Hi Ada` for the extracted call because "the function belongs to user".',
    relatedLessonIds: ['m01-this-keyword'],
  }),
  out({
    id: 'out-006',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Arrow functions and this',
    question: 'What does this print? One method uses a regular callback, the other an arrow callback.',
    code: `
      const obj = {
        value: 42,
        regular() {
          return [1].map(function () {
            'use strict';
            return this;
          })[0];
        },
        arrow() {
          return [1].map(() => this.value)[0];
        },
      };
      console.log(obj.regular());
      console.log(obj.arrow());
    `,
    expectedOutput: 'undefined\n42',
    runnable: true,
    shortAnswer: '`undefined`, then `42` — the regular callback gets its own `this`, the arrow inherits `this` from `arrow()`.',
    detailedAnswer: [
      '`Array.prototype.map` calls the callback as a plain function (no `thisArg` was passed).',
      'A regular `function` gets its own `this` per call; with a plain call in strict mode that is `undefined`.',
      'An arrow function has no `this` of its own — it uses the `this` of the enclosing function.',
      'The enclosing function `arrow()` was called as `obj.arrow()`, so `this.value` is `42`.',
    ],
    followUp: 'Why should you not define object methods as arrow functions (`arrow: () => this.value`)?',
    trap: 'Thinking the regular callback\'s `this` is `obj` because it is written inside a method of `obj`.',
    relatedLessonIds: ['m01-arrow-functions', 'm01-this-keyword'],
  }),
  out({
    id: 'out-007',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'bind, call and new',
    question: 'What does this print? A bound function is re-bound, called with `call`, attached to an object, and used with `new`.',
    code: `
      function show() {
        return this.label;
      }
      const a = { label: 'A' };
      const b = { label: 'B' };
      const bound = show.bind(a);
      console.log(bound.call(b));
      console.log(bound.bind(b)());
      const obj = { label: 'obj', show: bound };
      console.log(obj.show());

      function Point(x) {
        this.x = x;
      }
      const BoundPoint = Point.bind({ x: 'ignored' }, 7);
      console.log(new BoundPoint().x);
    `,
    expectedOutput: 'A\nA\nA\n7',
    runnable: true,
    shortAnswer: '`A`, `A`, `A`, `7` — a bound `this` cannot be overridden by `call`, another `bind`, or method-call syntax, but `new` ignores it.',
    detailedAnswer: [
      '`bind` creates a bound function exotic object whose `this` is fixed forever.',
      '`call(b)` and `bind(b)` on it can only add arguments; `this` stays `a`.',
      'Calling it as `obj.show()` also does not change `this` — it is still `a`.',
      '`new` is the one exception: it creates a fresh object as `this` and ignores the bound value, but keeps bound arguments (`7`).',
      'Precedence summary: `new` > `bind` > `call/apply` > method call > plain call.',
    ],
    followUp: 'Can you change `this` of an arrow function with `bind`? (No — arrows ignore it entirely.)',
    trap: 'Expecting `call(b)` to win because it is "called last".',
    relatedLessonIds: ['m01-this-keyword', 'm01-functions'],
  }),
  out({
    id: 'out-008',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Class methods vs arrow fields',
    question: 'What does this print? Both methods are destructured off the instance and called on their own.',
    code: `
      class Counter {
        count = 0;
        inc() {
          this.count++;
          return this.count;
        }
        incArrow = () => {
          this.count++;
          return this.count;
        };
      }
      const c = new Counter();
      const { inc, incArrow } = c;
      console.log(incArrow());
      try {
        inc();
      } catch (e) {
        console.log(e.name);
      }
      console.log(c.count);
    `,
    expectedOutput: '1\nTypeError\n1',
    runnable: true,
    shortAnswer: '`1`, `TypeError`, `1` — the arrow field is bound to its instance, the prototype method loses `this`.',
    detailedAnswer: [
      'Class bodies are always strict mode.',
      '`incArrow` is an instance field initialised with an arrow function; it captured `this` (the instance) when the constructor ran.',
      '`inc` lives on `Counter.prototype`; calling it detached gives `this === undefined`, and `undefined.count++` throws `TypeError`.',
      'Only the arrow call incremented the counter, so `c.count` is `1`.',
    ],
    followUp: 'What is the cost of arrow-function fields compared to prototype methods? (One function per instance; not on the prototype, so not overridable via `super`.)',
    trap: 'Expecting `inc()` to increment `globalThis.count` — that only happens in sloppy mode, and class code is never sloppy.',
    relatedLessonIds: ['m01-classes-and-inheritance', 'm01-this-keyword'],
  }),
  out({
    id: 'out-009',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'call/apply with primitives',
    question: 'What does this print? The same kind of function is called with `null` and a primitive as `this`, in strict and sloppy mode.',
    code: `
      function strictWho() {
        'use strict';
        return this;
      }
      function sloppyType() {
        return typeof this;
      }
      console.log(strictWho.call(null), strictWho.apply(5), typeof strictWho.call(5));
      console.log(sloppyType.call(5), sloppyType.call('x'));
      console.log(Math.max.apply(null, [3, 9, 4]));
    `,
    expectedOutput: 'null 5 number\nobject object\n9',
    runnable: true,
    shortAnswer: '`null 5 number`, then `object object`, then `9` — strict functions receive `this` as-is; sloppy functions box primitives.',
    detailedAnswer: [
      'In strict mode `this` is exactly the value passed to `call`/`apply`: `null` stays `null`, `5` stays the primitive `5`.',
      'In sloppy mode a primitive `this` is boxed into a wrapper object (`new Number(5)`), so `typeof this` is `object`.',
      'In sloppy mode `null`/`undefined` would be replaced by `globalThis`.',
      '`apply` spreads an array as arguments, so `Math.max.apply(null, [3, 9, 4])` is `9` (today you would write `Math.max(...arr)`).',
    ],
    followUp: 'What is the difference between `call`, `apply` and `bind`?',
    trap: 'Saying `strictWho.call(null)` returns the global object — that is sloppy-mode behaviour.',
    relatedLessonIds: ['m01-this-keyword', 'm01-functions'],
  }),
  out({
    id: 'out-010',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'typeof',
    question: 'What does this print?',
    code: `
      console.log(typeof null);
      console.log(typeof undefined);
      console.log(typeof NaN);
      console.log(typeof []);
      console.log(typeof function () {});
      console.log(typeof class {});
      console.log(typeof Symbol());
      console.log(typeof 10n);
    `,
    expectedOutput: 'object\nundefined\nnumber\nobject\nfunction\nfunction\nsymbol\nbigint',
    runnable: true,
    shortAnswer: '`object undefined number object function function symbol bigint` (one per line).',
    detailedAnswer: [
      '`typeof null === "object"` is a historical bug kept for compatibility — check `value === null` explicitly.',
      '`NaN` is a numeric value ("not a number" is still of type number).',
      'Arrays are objects; use `Array.isArray` to detect them.',
      'Classes are functions under the hood, so `typeof class {}` is `function`.',
      'Symbols and BigInts have their own types: `symbol` and `bigint`.',
    ],
    followUp: 'How do you reliably detect a plain object vs an array vs null?',
    trap: 'Answering `null` for `typeof null` or `array` for `typeof []`.',
    relatedLessonIds: ['m01-primitive-and-reference-types', 'm01-operators'],
  }),
  out({
    id: 'out-011',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Type coercion with +',
    question: 'What does this print?',
    code: `
      console.log(JSON.stringify([] + []));
      console.log([] + {});
      console.log([1, 2] + [3]);
      console.log(1 + '2' - 1);
      console.log('5' * '2');
      console.log(true + true);
      console.log([] == false);
    `,
    expectedOutput: '""\n[object Object]\n1,23\n11\n10\n2\ntrue',
    runnable: true,
    shortAnswer: '`""`, `[object Object]`, `1,23`, `11`, `10`, `2`, `true`.',
    detailedAnswer: [
      '`+` first converts objects to primitives: `[]` → `""`, `{}` → `"[object Object]"`, `[1, 2]` → `"1,2"`.',
      'If either side is then a string, `+` concatenates: `"" + ""`, `"" + "[object Object]"`, `"1,2" + "3"`.',
      '`1 + "2"` is `"12"`; `-` only does numbers, so `"12" - 1` is `11`.',
      '`*` converts both strings to numbers (`10`); `true + true` is `1 + 1`.',
      '`[] == false`: both sides become numbers — `""` → `0` and `false` → `0` — so it is `true`.',
    ],
    followUp: 'Why is `[] == ![]` also `true`?',
    trap: 'Expecting `[1, 2] + [3]` to produce an array `[1, 2, 3]`.',
    relatedLessonIds: ['m01-type-coercion', 'm01-operators'],
  }),
  out({
    id: 'out-012',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Loose equality and NaN',
    question: 'What does this print?',
    code: `
      console.log(null == undefined, null === undefined);
      console.log(null == 0, null >= 0);
      console.log(NaN == NaN, Object.is(NaN, NaN));
      console.log([NaN].includes(NaN), [NaN].indexOf(NaN));
      console.log('0' == false, '' == 0, '0' == '');
    `,
    expectedOutput: 'true false\nfalse true\nfalse true\ntrue -1\ntrue true false',
    runnable: true,
    shortAnswer: '`true false` / `false true` / `false true` / `true -1` / `true true false`.',
    detailedAnswer: [
      '`null == undefined` is a special rule in `==`; with `===` the types differ, so it is `false`.',
      '`null == 0` is `false` because `==` never converts `null` to a number — but relational `>=` does (`null` → `0`), so `null >= 0` is `true`.',
      '`NaN` is not equal to anything, including itself; `Object.is` uses SameValue, where `NaN` equals `NaN`.',
      '`includes` uses SameValueZero (finds `NaN`); `indexOf` uses `===` (does not, returns `-1`).',
      '`==` is not transitive: `"0" == false` and `"" == 0` are true, but two different strings `"0"` and `""` compare as strings and are unequal.',
    ],
    followUp: 'When, if ever, is `== null` acceptable in production code?',
    trap: 'Assuming `null >= 0` must be `false` because `null == 0` is `false`.',
    relatedLessonIds: ['m01-type-coercion', 'm01-operators'],
  }),
  out({
    id: 'out-013',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Numbers and NaN',
    question: 'What does this print?',
    code: `
      console.log(0.1 + 0.2 === 0.3);
      console.log((0.1 + 0.2).toFixed(2));
      console.log(isNaN('abc'), Number.isNaN('abc'));
      console.log(Number(''), Number(' 42 '), Number('42px'), parseInt('42px'));
    `,
    expectedOutput: 'false\n0.30\ntrue false\n0 42 NaN 42',
    runnable: true,
    shortAnswer: '`false`, `0.30`, `true false`, `0 42 NaN 42`.',
    detailedAnswer: [
      'Numbers are IEEE-754 doubles; `0.1 + 0.2` is `0.30000000000000004`, so strict equality fails.',
      '`toFixed(2)` rounds for display and returns a **string** (`"0.30"`).',
      'Global `isNaN` coerces first (`"abc"` → `NaN` → `true`); `Number.isNaN` only returns true for the actual `NaN` value.',
      '`Number()` converts the whole string: empty → `0`, surrounding whitespace is ignored, trailing junk → `NaN`.',
      '`parseInt` reads digits until the first invalid character, so `"42px"` → `42`.',
    ],
    followUp: 'How should a payment service store and add money amounts?',
    trap: 'Thinking `Number("")` is `NaN` — it is `0`, which silently passes many validations.',
    relatedLessonIds: ['m01-type-coercion', 'm01-primitive-and-reference-types'],
  }),
  out({
    id: 'out-014',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Prototype chain',
    question: 'What does this print? An own property shadows a prototype method and is then deleted.',
    code: `
      function Animal(name) {
        this.name = name;
      }
      Animal.prototype.speak = function () {
        return this.name + ' makes a sound';
      };
      const dog = new Animal('Rex');
      dog.speak = function () {
        return this.name + ' barks';
      };
      console.log(dog.speak());
      delete dog.speak;
      console.log(dog.speak());
      console.log(Object.getPrototypeOf(dog) === Animal.prototype);
      console.log(Object.hasOwn(dog, 'speak'), 'speak' in dog);
    `,
    expectedOutput: 'Rex barks\nRex makes a sound\ntrue\nfalse true',
    runnable: true,
    shortAnswer: '`Rex barks`, `Rex makes a sound`, `true`, `false true`.',
    detailedAnswer: [
      'Property lookup checks the object itself first, then walks up the prototype chain.',
      'The own `speak` shadows `Animal.prototype.speak`, so the first call barks.',
      '`delete` removes only the own property; the lookup now finds the prototype method.',
      '`new Animal()` links the instance to `Animal.prototype`.',
      '`Object.hasOwn` checks only own properties; `in` also searches the prototype chain.',
    ],
    followUp: 'What is the difference between `__proto__`, `prototype` and `Object.getPrototypeOf`?',
    trap: 'Thinking `delete dog.speak` deletes the method from the prototype as well.',
    relatedLessonIds: ['m01-objects-and-prototypes'],
  }),
  out({
    id: 'out-015',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Shared prototype state',
    question: 'What does this print? An array is placed on the prototype.',
    code: `
      function Team() {}
      Team.prototype.members = [];
      const a = new Team();
      const b = new Team();
      a.members.push('ann');
      b.members = ['bob'];
      console.log(a.members, b.members, Team.prototype.members);
      console.log(Object.keys(a), Object.keys(b));
    `,
    expectedOutput: "[ 'ann' ] [ 'bob' ] [ 'ann' ]\n[] [ 'members' ]",
    runnable: true,
    shortAnswer: "`[ 'ann' ] [ 'bob' ] [ 'ann' ]` then `[] [ 'members' ]` — `push` mutates the shared prototype array, assignment creates an own property.",
    detailedAnswer: [
      '`a.members` is not an own property, so reading it finds the one array on `Team.prototype`.',
      '`push` mutates that shared array — every instance without its own `members` now sees `ann`.',
      'Assignment (`b.members = ...`) never writes to the prototype; it creates an own property on `b`.',
      'So `a` has no own keys, while `b` has `members`.',
    ],
    followUp: 'Where should per-instance state live in a class? (In the constructor or class fields, never on the prototype.)',
    trap: 'Expecting `a.members.push` to create a private copy for `a`.',
    relatedLessonIds: ['m01-objects-and-prototypes', 'm01-primitive-and-reference-types'],
  }),
  out({
    id: 'out-016',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Class field initialisation order',
    question: 'What does this print? The base constructor calls a method that the subclass overrides.',
    code: `
      class Base {
        constructor() {
          this.init();
        }
        init() {
          this.type = 'base';
        }
      }
      class Child extends Base {
        label = 'child-field';
        init() {
          this.type = 'child:' + this.label;
        }
      }
      const c = new Child();
      console.log(c.type);
      console.log(c.label);
    `,
    expectedOutput: 'child:undefined\nchild-field',
    runnable: true,
    shortAnswer: '`child:undefined`, then `child-field` — the override runs during `super()`, before the subclass fields are initialised.',
    detailedAnswer: [
      '`new Child()` runs the implicit `constructor(...args) { super(...args); }`.',
      'Inside `Base`\'s constructor `this` is already the `Child` instance, so `this.init()` dispatches to `Child.prototype.init`.',
      'Subclass fields (`label`) are only defined *after* `super()` returns.',
      'So `this.label` is still `undefined` inside the override → `child:undefined`; afterwards `label` is set.',
    ],
    followUp: 'How would you restructure this so initialisation does not depend on subclass fields? (Avoid calling overridable methods from constructors; use a static factory or an explicit `init()` after construction.)',
    trap: 'Answering `base` (the override does run) or `child:child-field` (fields are not ready yet).',
    relatedLessonIds: ['m01-classes-and-inheritance'],
  }),
  out({
    id: 'out-017',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Getters, setters and spread',
    question: 'What does this print? The object has an accessor pair and is later copied with spread.',
    code: `
      const temp = {
        _c: 25,
        get f() {
          return (this._c * 9) / 5 + 32;
        },
        set f(v) {
          this._c = ((v - 32) * 5) / 9;
        },
      };
      console.log(temp.f);
      temp.f = 212;
      console.log(temp._c);
      const copy = { ...temp };
      temp._c = 0;
      console.log(copy.f, temp.f);
      console.log(Object.getOwnPropertyDescriptor(copy, 'f').get);
    `,
    expectedOutput: '77\n100\n212 32\nundefined',
    runnable: true,
    shortAnswer: '`77`, `100`, `212 32`, `undefined` — spread calls the getter once and copies the *value*, not the accessor.',
    detailedAnswer: [
      'Reading `temp.f` calls the getter: 25 °C → `77`.',
      'Assigning `temp.f = 212` calls the setter, which stores `100` in `_c`.',
      'Spread (`{ ...temp }`) reads each own enumerable property — invoking the getter — and defines plain data properties on the copy.',
      'So `copy.f` is frozen at `212`, while `temp.f` still computes live from `_c = 0` → `32`.',
      'The copy\'s descriptor has `value: 212` and no `get`, hence `undefined`.',
    ],
    followUp: 'How do you copy an object *including* its accessors? (`Object.defineProperties({}, Object.getOwnPropertyDescriptors(src))`.)',
    trap: 'Expecting `copy.f` to be `32` because "the copy has the same getter".',
    relatedLessonIds: ['m01-objects-and-prototypes', 'm01-spread-and-rest-operators'],
  }),
  out({
    id: 'out-018',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Shallow copy with spread',
    question: 'What does this print?',
    code: `
      const original = { a: 1, nested: { b: 2 } };
      const copy = { ...original };
      copy.a = 99;
      copy.nested.b = 99;
      console.log(original);
      console.log(copy.nested === original.nested);
    `,
    expectedOutput: '{ a: 1, nested: { b: 99 } }\ntrue',
    runnable: true,
    shortAnswer: '`{ a: 1, nested: { b: 99 } }` and `true` — spread is a shallow copy.',
    detailedAnswer: [
      'Spread copies the top-level properties into a new object.',
      '`a` is a primitive, so changing `copy.a` does not affect `original.a`.',
      '`nested` holds a reference; both objects point to the same inner object.',
      'Mutating `copy.nested.b` is therefore visible through `original`.',
    ],
    followUp: 'How do you deep-clone in Node today? (`structuredClone`, available globally since Node 17.)',
    trap: 'Believing `{ ...obj }` or `Object.assign` makes a deep copy.',
    relatedLessonIds: ['m01-spread-and-rest-operators', 'm01-primitive-and-reference-types'],
  }),
  out({
    id: 'out-019',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Destructuring defaults',
    question: 'What does this print? Defaults are used with missing, `undefined` and `null` values.',
    code: `
      function connect({ host = 'localhost', port = 5432 } = {}) {
        return host + ':' + port;
      }
      console.log(connect());
      console.log(connect({ port: undefined }));
      console.log(connect({ host: null }));
      const [x = 1, y = x * 2] = [undefined, undefined];
      console.log(x, y);
    `,
    expectedOutput: 'localhost:5432\nlocalhost:5432\nnull:5432\n1 2',
    runnable: true,
    shortAnswer: '`localhost:5432`, `localhost:5432`, `null:5432`, `1 2` — defaults apply only to `undefined`, never to `null`.',
    detailedAnswer: [
      'Calling `connect()` uses the parameter default `{}`, then both property defaults apply.',
      'An explicit `undefined` property also triggers the default.',
      '`null` is a real value, so `host` becomes `null` and is concatenated as `"null"`.',
      'Defaults are evaluated left to right and can reference earlier bindings: `y = x * 2` sees `x = 1`.',
    ],
    followUp: 'What happens if you call a function with `({ host = "x" })` destructuring but no `= {}` fallback and pass nothing? (TypeError: cannot destructure `undefined`.)',
    trap: 'Assuming defaults behave like `??` and replace `null` too.',
    relatedLessonIds: ['m01-destructuring', 'm01-functions'],
  }),
  out({
    id: 'out-020',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Default parameters',
    question: 'What does this print? The default value is an empty array.',
    code: `
      function add(item, list = []) {
        list.push(item);
        return list;
      }
      console.log(add(1), add(2));
      const shared = [];
      console.log(add(3, shared), add(4, shared));
    `,
    expectedOutput: '[ 1 ] [ 2 ]\n[ 3, 4 ] [ 3, 4 ]',
    runnable: true,
    shortAnswer: '`[ 1 ] [ 2 ]`, then `[ 3, 4 ] [ 3, 4 ]` — JavaScript evaluates the default on every call.',
    detailedAnswer: [
      'Default parameter expressions run each time the argument is `undefined`, creating a fresh `[]`.',
      'So `add(1)` and `add(2)` return different arrays (unlike Python\'s shared mutable defaults).',
      'When the same array is passed explicitly, both calls mutate it.',
      'Both log arguments are the same array reference, printed after both calls ran, so it shows `[ 3, 4 ]` twice.',
    ],
    followUp: 'Can a default parameter refer to a later parameter? (No — it would be in the TDZ.)',
    trap: 'Expecting `[ 1, 2 ]` from the first line, as in Python.',
    relatedLessonIds: ['m01-functions'],
  }),
  out({
    id: 'out-021',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Arrow function returning objects',
    question: 'What does this print?',
    code: `
      const makeA = () => { value: 1 };
      const makeB = () => ({ value: 1 });
      console.log(makeA(), makeB());
    `,
    expectedOutput: 'undefined { value: 1 }',
    runnable: true,
    shortAnswer: '`undefined { value: 1 }` — braces after `=>` are parsed as a function body, not an object literal.',
    detailedAnswer: [
      'In `makeA`, `{ ... }` is a block; `value:` is a *label* and `1` is an expression statement.',
      'The block has no `return`, so the function returns `undefined`.',
      'Wrapping the literal in parentheses makes it an expression, which the concise arrow returns.',
    ],
    followUp: 'What other places do labels show up in JavaScript? (`break outer;` / `continue outer;` in nested loops.)',
    trap: 'Assuming a syntax error — it is valid code that silently returns `undefined`.',
    relatedLessonIds: ['m01-arrow-functions'],
  }),
  out({
    id: 'out-022',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Pass by value vs reference',
    question: 'What does this print?',
    code: `
      function update(n, obj, arr) {
        n = 10;
        obj.x = 10;
        arr = [10];
      }
      let num = 1;
      const o = { x: 1 };
      let a = [1];
      update(num, o, a);
      console.log(num, o, a);
      console.log([1] === [1], {} == {});
    `,
    expectedOutput: '1 { x: 10 } [ 1 ]\nfalse false',
    runnable: true,
    shortAnswer: '`1 { x: 10 } [ 1 ]` then `false false` — arguments are passed by value, and for objects the value is a reference.',
    detailedAnswer: [
      'Reassigning a parameter (`n = 10`, `arr = [10]`) only changes the local variable.',
      'Mutating through the reference (`obj.x = 10`) changes the caller\'s object.',
      'Objects compare by identity: two separately created arrays/objects are never equal, with `===` or `==`.',
    ],
    followUp: 'How would you compare two objects by content? (`util.isDeepStrictEqual` in Node, or a library.)',
    trap: 'Saying `a` becomes `[ 10 ]` because "arrays are passed by reference".',
    relatedLessonIds: ['m01-primitive-and-reference-types'],
  }),
  out({
    id: 'out-023',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'const and Object.freeze',
    question: 'What does this print? (Sloppy-mode script.)',
    code: `
      const settings = { theme: 'dark' };
      settings.theme = 'light';
      console.log(settings.theme);
      try {
        settings = {};
      } catch (e) {
        console.log(e.name);
      }
      const frozen = Object.freeze({ level: 1, inner: { n: 1 } });
      frozen.level = 2;
      frozen.inner.n = 2;
      console.log(frozen);
    `,
    expectedOutput: 'light\nTypeError\n{ level: 1, inner: { n: 2 } }',
    runnable: true,
    shortAnswer: '`light`, `TypeError`, `{ level: 1, inner: { n: 2 } }`.',
    detailedAnswer: [
      '`const` prevents reassigning the *binding*, not mutating the object it points to.',
      'Reassigning a `const` throws `TypeError: Assignment to constant variable.`',
      '`Object.freeze` makes top-level properties read-only; in sloppy mode the write is silently ignored (strict mode would throw).',
      'Freeze is shallow: `inner` is a separate object and can still be mutated.',
    ],
    followUp: 'How would you deep-freeze a config object?',
    trap: 'Thinking `const` makes an object immutable, or that `freeze` is deep.',
    relatedLessonIds: ['m01-var-let-and-const', 'm01-objects-and-prototypes'],
  }),
  out({
    id: 'out-024',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Closures over loop variables',
    question: 'What does this print? An IIFE captures one value, but the closure also reads the loop variable.',
    code: `
      function createHandlers() {
        const handlers = [];
        for (var i = 0; i < 3; i++) {
          handlers.push(((j) => () => j * i)(i));
        }
        return handlers;
      }
      console.log(createHandlers().map((h) => h()));
    `,
    expectedOutput: '[ 0, 3, 6 ]',
    runnable: true,
    shortAnswer: '`[ 0, 3, 6 ]` — `j` is captured per iteration (0, 1, 2) but `i` is the single shared `var`, which is `3` when the handlers run.',
    detailedAnswer: [
      'The IIFE runs immediately each iteration, binding its parameter `j` to the current `i` (0, 1, 2).',
      'The returned arrow closes over both `j` (its own scope) and `i` (the function-scoped `var`).',
      'All three closures share the same `i`, which ends at `3` after the loop.',
      'Calling them later computes `0*3`, `1*3`, `2*3`.',
    ],
    followUp: 'What does it print with `let i`? (`[ 0, 1, 4 ]` — each iteration then has its own `i`.)',
    trap: 'Answering `[ 0, 1, 4 ]` because "the IIFE fixed the closure problem" — it only fixed `j`.',
    relatedLessonIds: ['m01-scope-and-closures'],
  }),
  out({
    id: 'out-025',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'try/finally return override',
    question: 'What does this print?',
    code: `
      function f() {
        try {
          return 'try';
        } finally {
          console.log('finally runs');
        }
      }
      function g() {
        try {
          throw new Error('lost');
        } finally {
          return 'finally wins';
        }
      }
      function h() {
        let x = 1;
        try {
          return x;
        } finally {
          x = 2;
        }
      }
      console.log(f());
      console.log(g());
      console.log(h());
    `,
    expectedOutput: 'finally runs\ntry\nfinally wins\n1',
    runnable: true,
    shortAnswer: '`finally runs`, `try`, `finally wins`, `1`.',
    detailedAnswer: [
      '`finally` always runs, even after `return` — so `finally runs` is logged before `f()` hands back `try`.',
      'A `return` inside `finally` overrides whatever the `try` did, including a thrown error: the error in `g` is silently discarded.',
      'In `h`, the return value is evaluated (`1`) *before* `finally` runs; changing `x` afterwards does not change it.',
      'Lint rules like `no-unsafe-finally` flag `return`/`throw` inside `finally` for this reason.',
    ],
    followUp: 'Does the same override happen with `Promise.prototype.finally`? (No — its callback\'s return value is ignored, only a throw/rejection overrides.)',
    trap: 'Expecting `g()` to throw `lost`, or `h()` to return `2`.',
    relatedLessonIds: ['m01-error-handling'],
  }),
  out({
    id: 'out-026',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Labeled statements',
    question: 'What does this print? The inner loop uses `continue` and `break` with a label.',
    code: `
      outer: for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (j === 1) continue outer;
          if (i === 2) break outer;
          console.log(i, j);
        }
      }
      console.log('end');
    `,
    expectedOutput: '0 0\n1 0\nend',
    runnable: true,
    shortAnswer: '`0 0`, `1 0`, `end`.',
    detailedAnswer: [
      'A label names a statement so `break`/`continue` can target an outer loop.',
      'For `i = 0` and `i = 1`, `j = 0` logs, then `j === 1` triggers `continue outer` — jumping to the next `i`, skipping `j = 2`.',
      'For `i = 2`, the `j === 1` check fails at `j = 0`, then `i === 2` triggers `break outer`, leaving both loops.',
      'Execution continues after the labelled loop, logging `end`.',
    ],
    followUp: 'Can you `break` out of `forEach` like this? (No — labels only work with real loop/block statements; use `for...of` or `some`.)',
    trap: 'Thinking `continue outer` only skips the rest of the inner iteration.',
    relatedLessonIds: ['m01-es6-plus-features', 'm01-operators'],
  }),
  out({
    id: 'out-027',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Map and Set equality',
    question: 'What does this print?',
    code: `
      const m = new Map();
      m.set(1, 'number').set('1', 'string').set(NaN, 'nan');
      console.log(m.size, m.get(1), m.get('1'), m.get(NaN));
      const key = { id: 1 };
      m.set(key, 'obj');
      console.log(m.get({ id: 1 }), m.get(key));
      const s = new Set([1, '1', 1, NaN, NaN, 0, -0]);
      console.log(s.size, [...s]);
    `,
    expectedOutput: "3 number string nan\nundefined obj\n4 [ 1, '1', NaN, 0 ]",
    runnable: true,
    shortAnswer: "`3 number string nan`, `undefined obj`, `4 [ 1, '1', NaN, 0 ]` — Map/Set use SameValueZero, with no type coercion.",
    detailedAnswer: [
      'Map keys are not converted to strings, so `1` and `"1"` are different keys (unlike plain object keys).',
      'SameValueZero treats `NaN` as equal to `NaN`, so it works as a key and dedupes in a Set.',
      'Object keys compare by identity: a new `{ id: 1 }` literal is a different key → `undefined`.',
      'SameValueZero also treats `0` and `-0` as equal, so the Set keeps four values.',
    ],
    followUp: 'When would you choose a WeakMap over a Map in a Node service?',
    trap: 'Expecting `m.get({ id: 1 })` to find the entry because the objects "look the same".',
    relatedLessonIds: ['m01-map-set-weakmap-and-weakset'],
  }),
  out({
    id: 'out-028',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Property key ordering',
    question: 'What does this print?',
    code: `
      const obj = { b: 1, 2: 'two', a: 2, 1: 'one', '-1': 'neg', 1.5: 'x' };
      console.log(Object.keys(obj));
      const map = new Map([['b', 1], [2, 'two'], [1, 'one']]);
      console.log([...map.keys()]);
    `,
    expectedOutput: "[ '1', '2', 'b', 'a', '-1', '1.5' ]\n[ 'b', 2, 1 ]",
    runnable: true,
    shortAnswer: "`[ '1', '2', 'b', 'a', '-1', '1.5' ]` and `[ 'b', 2, 1 ]` — objects list integer-like keys first in ascending order; Maps keep insertion order.",
    detailedAnswer: [
      'Own property order is specified: array-index keys (non-negative integers) ascending, then string keys in insertion order, then symbols.',
      '`2` and `1` are array indices → `"1"`, `"2"` come first.',
      '`"-1"` and `"1.5"` are not array indices, so they keep insertion order after `b` and `a`.',
      'All object keys become strings; a Map keeps the original key types and strict insertion order.',
    ],
    followUp: 'Why can this matter for an API that returns a lookup object keyed by numeric IDs?',
    trap: 'Assuming objects always preserve insertion order for every key.',
    relatedLessonIds: ['m01-objects-and-prototypes', 'm01-map-set-weakmap-and-weakset'],
  }),
  out({
    id: 'out-029',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Array sort default',
    question: 'What does this print?',
    code: `
      console.log([10, 9, 1, 100, 25].sort());
      console.log([10, 9, 1, 100, 25].sort((a, b) => a - b));
      const arr = [3, 1, 2];
      const sorted = arr.sort();
      console.log(arr === sorted, arr);
    `,
    expectedOutput: '[ 1, 10, 100, 25, 9 ]\n[ 1, 9, 10, 25, 100 ]\ntrue [ 1, 2, 3 ]',
    runnable: true,
    shortAnswer: '`[ 1, 10, 100, 25, 9 ]`, `[ 1, 9, 10, 25, 100 ]`, `true [ 1, 2, 3 ]` — default sort compares strings, and sort mutates in place.',
    detailedAnswer: [
      'Without a comparator, `sort` converts elements to strings and compares UTF-16 code units: `"100" < "25" < "9"`.',
      'A numeric comparator `(a, b) => a - b` gives numeric order.',
      '`sort` mutates the original array and returns the same reference.',
      'Use `toSorted()` (Node 20+) or `[...arr].sort()` for a non-mutating sort.',
    ],
    followUp: 'Is `Array.prototype.sort` stable in Node? (Yes, required since ES2019.)',
    trap: 'Expecting numeric order from `.sort()` on numbers.',
    relatedLessonIds: ['m01-arrays-and-array-methods'],
  }),
  out({
    id: 'out-030',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'map with parseInt',
    question: 'What does this print?',
    code: `
      console.log(['1', '2', '3'].map(parseInt));
      console.log(['10', '10', '10'].map(parseInt));
      console.log(['1', '2', '3'].map(Number));
    `,
    expectedOutput: '[ 1, NaN, NaN ]\n[ 10, NaN, 2 ]\n[ 1, 2, 3 ]',
    runnable: true,
    shortAnswer: '`[ 1, NaN, NaN ]`, `[ 10, NaN, 2 ]`, `[ 1, 2, 3 ]` — `map` passes the index as `parseInt`\'s radix.',
    detailedAnswer: [
      '`map` calls the callback with `(element, index, array)`.',
      '`parseInt(string, radix)` takes the index as radix: `parseInt("1", 0)` (0 means auto → 10) is `1`.',
      '`parseInt("2", 1)` — radix 1 is invalid → `NaN`; `parseInt("3", 2)` — `3` is not a binary digit → `NaN`.',
      'For `"10"`: radix 0 → `10`, radix 1 → `NaN`, radix 2 → binary `10` = `2`.',
      '`Number` ignores extra arguments, so it works as a callback.',
    ],
    followUp: 'Which other built-ins misbehave when passed directly as callbacks?',
    trap: 'Answering `[ 1, 2, 3 ]` without noticing the hidden index argument.',
    relatedLessonIds: ['m01-arrays-and-array-methods', 'm01-functions'],
  }),
  out({
    id: 'out-031',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'slice vs splice',
    question: 'What does this print?',
    code: `
      const a = [1, 2, 3, 4, 5];
      console.log(a.slice(1, 3), a);
      console.log(a.splice(1, 2), a);
    `,
    expectedOutput: '[ 2, 3 ] [ 1, 2, 3, 4, 5 ]\n[ 2, 3 ] [ 1, 4, 5 ]',
    runnable: true,
    shortAnswer: '`[ 2, 3 ] [ 1, 2, 3, 4, 5 ]` then `[ 2, 3 ] [ 1, 4, 5 ]` — `slice` copies, `splice` removes in place.',
    detailedAnswer: [
      '`slice(start, end)` returns a new array from `start` up to but not including `end`; the original is untouched.',
      '`splice(start, deleteCount)` removes `deleteCount` items starting at `start`, mutating the array, and returns the removed items.',
      'Arguments are evaluated before `console.log` runs, so the second line shows the array after removal.',
    ],
    followUp: 'Which array methods mutate and which return new arrays? (`push/pop/shift/unshift/splice/sort/reverse/fill` mutate.)',
    trap: 'Treating `splice(1, 2)` as "from index 1 to index 2".',
    relatedLessonIds: ['m01-arrays-and-array-methods'],
  }),
  out({
    id: 'out-032',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'reduce initial value',
    question: 'What does this print?',
    code: `
      console.log([1, 2, 3].reduce((a, b) => a + b));
      console.log([].reduce((a, b) => a + b, 0));
      try {
        [].reduce((a, b) => a + b);
      } catch (e) {
        console.log(e.name + ': ' + e.message);
      }
      console.log([[1, 2], [3]].reduce((acc, x) => acc.concat(x)));
      console.log(['a', 'b'].reduce((acc, x) => acc + x, 1));
    `,
    expectedOutput: '6\n0\nTypeError: Reduce of empty array with no initial value\n[ 1, 2, 3 ]\n1ab',
    runnable: true,
    shortAnswer: '`6`, `0`, `TypeError: Reduce of empty array with no initial value`, `[ 1, 2, 3 ]`, `1ab`.',
    detailedAnswer: [
      'Without an initial value, `reduce` uses the first element as the accumulator and starts at index 1.',
      'On an empty array with no initial value there is nothing to start from, so it throws `TypeError`.',
      'Always pass an initial value when the array might be empty (e.g. results from a DB query).',
      'The accumulator type comes from the initial value: starting at number `1` and adding strings concatenates → `"1ab"`.',
    ],
    followUp: 'How would you group an array of orders by status with `reduce` (or `Object.groupBy` in Node 21+)?',
    trap: 'Assuming `[].reduce(fn)` returns `undefined` or `0`.',
    relatedLessonIds: ['m01-arrays-and-array-methods'],
  }),
  out({
    id: 'out-033',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'JSON.stringify edge cases',
    question: 'What does this print?',
    code: `
      const data = {
        a: undefined,
        b: () => 1,
        c: Symbol('s'),
        d: NaN,
        e: Infinity,
        f: new Date(0),
        g: [undefined, () => 1],
        h: null,
      };
      console.log(JSON.stringify(data));
      console.log(JSON.stringify(undefined), JSON.stringify('x'));
      try {
        JSON.stringify({ n: 1n });
      } catch (e) {
        console.log(e.name);
      }
    `,
    expectedOutput: '{"d":null,"e":null,"f":"1970-01-01T00:00:00.000Z","g":[null,null],"h":null}\nundefined "x"\nTypeError',
    runnable: true,
    shortAnswer: 'Properties with `undefined`, functions and symbols vanish; `NaN`/`Infinity` become `null`; inside arrays the unsupported values become `null`; Dates become ISO strings; BigInt throws.',
    detailedAnswer: [
      'In objects, properties whose value is `undefined`, a function, or a symbol are omitted.',
      'In arrays the same values are replaced by `null` so indexes stay aligned.',
      '`NaN` and `Infinity` are not valid JSON numbers → `null`.',
      '`Date` has a `toJSON` method that returns `toISOString()`.',
      '`JSON.stringify(undefined)` returns `undefined` (not a string); a string is quoted.',
      'BigInt has no JSON representation → `TypeError: Do not know how to serialize a BigInt`.',
    ],
    followUp: 'How would you serialise BigInt IDs from a database driver in an API response?',
    trap: 'Expecting `"a":undefined` or `"a":null` in the output.',
    relatedLessonIds: ['m01-es6-plus-features', 'm07-content-types'],
  }),
  out({
    id: 'out-034',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'toJSON and replacer',
    question: 'What does this print? A class defines `toJSON`, and different replacers are used.',
    code: `
      class Money {
        constructor(cents) {
          this.cents = cents;
        }
        toJSON() {
          return (this.cents / 100).toFixed(2);
        }
      }
      const order = { id: 7, total: new Money(1999), secret: 'x' };
      console.log(JSON.stringify(order));
      console.log(JSON.stringify(order, ['id', 'total']));
      console.log(JSON.stringify(order, (k, v) => (k === 'secret' ? undefined : v)));
      console.log(JSON.stringify({ when: new Date(0) }, (k, v) => (k === 'when' ? typeof v : v)));
    `,
    expectedOutput: '{"id":7,"total":"19.99","secret":"x"}\n{"id":7,"total":"19.99"}\n{"id":7,"total":"19.99"}\n{"when":"string"}',
    runnable: true,
    shortAnswer: '`toJSON` output replaces the object; an array replacer whitelists keys; a function replacer returning `undefined` drops a key; and `toJSON` runs *before* the replacer.',
    detailedAnswer: [
      'For each value, `JSON.stringify` first calls its `toJSON()` if present — `Money` becomes the string `"19.99"`.',
      'An array replacer is an allow-list of property names: `secret` is dropped.',
      'A function replacer is called for every key/value; returning `undefined` omits that property.',
      'The replacer receives the value *after* `toJSON` — a Date is already an ISO string, so `typeof v` is `"string"`.',
      'This is why "revive a Date in the replacer" never sees a Date object.',
    ],
    followUp: 'What is the `reviver` argument of `JSON.parse` used for?',
    trap: 'Expecting the last line to print `"object"` because the input was a Date.',
    relatedLessonIds: ['m01-objects-and-prototypes', 'm01-classes-and-inheritance'],
  }),
  out({
    id: 'out-035',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Symbol properties',
    question: 'What does this print?',
    code: `
      const id = Symbol('id');
      const obj = { name: 'x', [id]: 123 };
      console.log(Object.keys(obj));
      console.log(JSON.stringify(obj));
      console.log(obj[id], Symbol('id') === Symbol('id'), Symbol.for('id') === Symbol.for('id'));
      console.log(Object.getOwnPropertySymbols(obj).length);
      console.log(id.toString(), id.description);
    `,
    expectedOutput: "[ 'name' ]\n{\"name\":\"x\"}\n123 false true\n1\nSymbol(id) id",
    runnable: true,
    shortAnswer: "`[ 'name' ]`, `{\"name\":\"x\"}`, `123 false true`, `1`, `Symbol(id) id` — symbol keys are hidden from keys/JSON but still own properties.",
    detailedAnswer: [
      '`Object.keys`, `for...in` and `JSON.stringify` skip symbol-keyed properties.',
      'They are still readable with the symbol and listed by `Object.getOwnPropertySymbols` / `Reflect.ownKeys`.',
      'Every `Symbol()` call creates a unique value, even with the same description.',
      '`Symbol.for` uses a global registry, so the same key returns the same symbol.',
    ],
    followUp: 'Name well-known symbols you have used (`Symbol.iterator`, `Symbol.asyncIterator`, `util.inspect.custom`).',
    trap: 'Treating symbol properties as private — they are only non-enumerable by string APIs.',
    relatedLessonIds: ['m01-es6-plus-features', 'm01-primitive-and-reference-types'],
  }),
  out({
    id: 'out-036',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Optional chaining and nullish coalescing',
    question: 'What does this print?',
    code: `
      const cfg = { port: 0, db: null, retry: { enabled: false } };
      console.log(cfg.port || 3000, cfg.port ?? 3000);
      console.log(cfg.db?.host, cfg.cache?.ttl.value);
      console.log(cfg.retry?.enabled ?? true, cfg.retry.enabled || true);
      console.log(cfg.log?.('hello'));
      let calls = 0;
      const res = cfg.db?.[calls++];
      console.log(res, calls);
    `,
    expectedOutput: '3000 0\nundefined undefined\nfalse true\nundefined\nundefined 0',
    runnable: true,
    shortAnswer: '`3000 0`, `undefined undefined`, `false true`, `undefined`, `undefined 0`.',
    detailedAnswer: [
      '`||` falls back on any falsy value (`0`, `false`, `""`); `??` only on `null`/`undefined` — so a port of `0` survives `??`.',
      '`?.` stops and returns `undefined` when the left side is `null`/`undefined`.',
      'Short-circuiting covers the whole chain: `cfg.cache?.ttl.value` does not throw even though `.ttl` is not optional.',
      '`fn?.()` calls only if `fn` is not nullish.',
      'When short-circuited, the rest of the expression is skipped entirely — `calls++` never runs.',
    ],
    followUp: 'Why can you not mix `??` with `||` without parentheses?',
    trap: 'Using `||` for config defaults and turning a valid `0` or `false` into the default.',
    relatedLessonIds: ['m01-es6-plus-features', 'm01-operators'],
  }),
  out({
    id: 'out-037',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Private and static class members',
    question: 'What does this print?',
    code: `
      class Account {
        static count = 0;
        #balance = 0;
        constructor() {
          Account.count++;
        }
        deposit(n) {
          this.#balance += n;
          return this;
        }
        get balance() {
          return this.#balance;
        }
      }
      const a = new Account().deposit(50).deposit(25);
      new Account();
      console.log(a.balance, Account.count, a.count);
      console.log(Object.keys(a), JSON.stringify(a));
    `,
    expectedOutput: '75 2 undefined\n[] {}',
    runnable: true,
    shortAnswer: '`75 2 undefined` then `[] {}` — private fields are invisible from outside, static fields live on the class, getters on the prototype are not own keys.',
    detailedAnswer: [
      'Returning `this` from `deposit` enables chaining: 50 + 25 = `75`.',
      '`static count` belongs to the `Account` constructor, not to instances — two constructions → `2`, and `a.count` is `undefined`.',
      '`#balance` is truly private: not a property key, not enumerable, not serialised.',
      'The `balance` getter is defined on `Account.prototype`, so it is not an own key and `JSON.stringify` ignores it → `{}`.',
    ],
    followUp: 'How would you make `JSON.stringify(account)` include the balance? (Add a `toJSON()` method.)',
    trap: 'Expecting `JSON.stringify(a)` to show `balance` because there is a getter.',
    relatedLessonIds: ['m01-classes-and-inheritance'],
  }),
];

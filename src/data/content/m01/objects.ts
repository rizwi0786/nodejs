import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, section, steps, table, text, tip } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'objects-and-prototypes': {
    summary: 'Objects are collections of key/value properties; every object has a hidden [[Prototype]] link, and property lookups that miss on the object continue up this prototype chain — the mechanism behind inheritance in JavaScript.',
    topics: ['object literal', 'shorthand properties', 'computed keys', 'property access', 'Object.keys', 'Object.entries', 'getters', 'property descriptors', '[[Prototype]]', 'prototype chain', '__proto__', 'Object.create', 'constructor functions', 'new', 'prototype pollution'],
    sections: [
      section('introduction', undefined,
        text('Almost everything in JavaScript is an object — request bodies, config, errors, even functions. And unlike class-based languages, JavaScript objects inherit **directly from other objects** through a link called the **prototype**.'),
      ),
      section('definition', 'Definitions',
        bullets(
          '**Object** — an unordered collection of properties (string or symbol keys → values).',
          '**`[[Prototype]]`** — a hidden internal link from an object to another object (or `null`). Read it with `Object.getPrototypeOf(obj)`.',
          '**Prototype chain** — the sequence obj → its prototype → that prototype\'s prototype … → `Object.prototype` → `null`.',
          '**`Fn.prototype`** — a normal property on functions. It is the object that becomes the `[[Prototype]]` of instances created with `new Fn()`.',
        ),
        table('__proto__ vs prototype', ['', '`obj.__proto__`', '`Fn.prototype`'], [
          ['Exists on', 'Every object (legacy accessor from `Object.prototype`)', 'Regular functions and classes'],
          ['Points to', 'That object\'s own `[[Prototype]]`', 'The object future instances will inherit from'],
          ['Modern equivalent', '`Object.getPrototypeOf` / `Object.setPrototypeOf`', '— (still how it works)'],
          ['Relationship', '`new Fn().__proto__ === Fn.prototype`', ''],
        ]),
      ),
      section('why', 'Why prototypes',
        bullets(
          'Memory: methods live once on the prototype instead of being copied into every instance.',
          'Every array can call `map` because `Array.prototype` holds it.',
          'Classes (next lesson) are syntax on top of exactly this mechanism.',
          'Security: user input that reaches `__proto__` can modify prototypes (prototype pollution).',
        ),
      ),
      section('internals', 'How property lookup works',
        steps(
          '**Get** `obj.key`: look for an **own** property `key` on `obj`.',
          'If not found, follow `[[Prototype]]` and look there. Repeat.',
          'If the chain reaches `null`, the result is `undefined` (no error).',
          '**Set** `obj.key = v`: normally creates/updates an **own** property on `obj` — it does not change the prototype (it *shadows* the inherited one). Exception: if the inherited property is a setter or is read-only.',
          '`delete obj.key` only removes own properties.',
        ),
        flow([
          'dog: own props: kind',
          'animal: eats, describe()',
          'Object.prototype: toString, hasOwnProperty…',
          'null',
        ], { title: 'Prototype chain of dog = Object.create(animal)', direction: 'vertical' }),
        bullets(
          'V8 speeds up lookups with **hidden classes (shapes)** and inline caches: objects created with the same keys in the same order share a shape. Adding/deleting keys randomly makes objects slower.',
          'Each property has a **descriptor**: `value`, `writable`, `enumerable`, `configurable` (or `get`/`set` for accessors).',
        ),
      ),
      section('example', 'Object basics',
        code({
          title: 'Literals, shorthand, computed keys, access',
          code: dedent(`
            const field = 'role';
            const username = 'ana';
            const user = { username, [field]: 'admin', 'created-at': 2024 };
            console.log(user);
            console.log(user['created-at'], user.role);
            console.log(Object.keys(user));
            console.log(Object.values(user));
            console.log(user.missing);
          `),
          expectedOutput: "{ username: 'ana', role: 'admin', 'created-at': 2024 }\n2024 admin\n[ 'username', 'role', 'created-at' ]\n[ 'ana', 'admin', 2024 ]\nundefined",
          explanation: [
            '`{ username }` is shorthand for `{ username: username }`.',
            '`[field]` is a computed key — the key is the value of `field`.',
            'Keys that are not valid identifiers need quotes and bracket access.',
            'Reading a missing property returns `undefined` (after checking the whole prototype chain).',
          ],
          runnable: true,
        }),
        code({
          title: 'Getters and property descriptors',
          code: dedent(`
            const account = {
              first: 'Ada',
              last: 'Lovelace',
              get full() {
                return this.first + ' ' + this.last;
              },
            };
            console.log(account.full);
            console.log(Object.getOwnPropertyDescriptor(account, 'first'));
            Object.defineProperty(account, 'id', { value: 7, enumerable: false });
            console.log(account.id, Object.keys(account));
          `),
          expectedOutput: "Ada Lovelace\n{ value: 'Ada', writable: true, enumerable: true, configurable: true }\n7 [ 'first', 'last', 'full' ]",
          explanation: [
            'A getter runs a function when the property is read.',
            'Normal properties are writable, enumerable and configurable.',
            '`defineProperty` defaults everything to `false` — `id` exists but is hidden from `Object.keys` and JSON.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'The prototype chain',
        code({
          title: 'Object.create and lookup',
          code: dedent(`
            const animal = {
              eats: true,
              describe() {
                return this.kind + ' eats: ' + this.eats;
              },
            };
            const dog = Object.create(animal);
            dog.kind = 'dog';
            console.log(dog.describe());
            console.log(Object.getPrototypeOf(dog) === animal);
            console.log(Object.hasOwn(dog, 'eats'), 'eats' in dog);
            console.log(Object.getPrototypeOf(animal) === Object.prototype);
            console.log(Object.getPrototypeOf(Object.prototype));
          `),
          expectedOutput: 'dog eats: true\ntrue\nfalse true\ntrue\nnull',
          explanation: [
            '`describe` and `eats` are not on `dog`; they are found on its prototype `animal`.',
            '`this` inside `describe` is still `dog` (implicit binding), so `this.kind` reads `dog`\'s own property.',
            '`Object.hasOwn` checks only own properties; `in` checks the whole chain.',
            'The chain ends at `Object.prototype`, whose prototype is `null`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Writes create own properties (shadowing)',
          code: dedent(`
            const base = { greeting: 'hello' };
            const child = Object.create(base);
            child.greeting = 'hi';
            console.log(child.greeting, base.greeting);
            delete child.greeting;
            console.log(child.greeting);
          `),
          expectedOutput: 'hi hello\nhello',
          explanation: [
            'Assigning on `child` creates an own property that shadows the inherited one; `base` is untouched.',
            'After deleting the own property, lookup falls through to the prototype again.',
          ],
          runnable: true,
        }),
        code({
          title: 'Constructor functions and Fn.prototype',
          code: dedent(`
            function User(username) {
              this.username = username;
            }
            User.prototype.greet = function () {
              return 'Hi ' + this.username;
            };
            const u1 = new User('ana');
            const u2 = new User('raj');
            console.log(u1.greet(), u2.greet());
            console.log(u1.greet === u2.greet);
            console.log(Object.getPrototypeOf(u1) === User.prototype);
            console.log(u1.constructor === User);
            console.log(u1);
          `),
          expectedOutput: "Hi ana Hi raj\ntrue\ntrue\ntrue\nUser { username: 'ana' }",
          explanation: [
            'Both instances share one `greet` function stored on `User.prototype`.',
            '`new User()` sets the instance\'s `[[Prototype]]` to `User.prototype`.',
            '`constructor` is inherited from `User.prototype.constructor`.',
            'util.inspect shows the constructor name and only own properties.',
          ],
          runnable: true,
        }),
        code({
          title: 'What new does — implemented by hand',
          code: dedent(`
            function myNew(Ctor, ...args) {
              const obj = Object.create(Ctor.prototype);
              const result = Ctor.apply(obj, args);
              return result !== null && typeof result === 'object' ? result : obj;
            }
            function Car(model) {
              this.model = model;
            }
            Car.prototype.drive = function () {
              return this.model + ' drives';
            };
            const c = myNew(Car, 'Tesla');
            console.log(c.drive(), c instanceof Car);
          `),
          expectedOutput: 'Tesla drives true',
          explanation: [
            '1) Create an empty object linked to `Ctor.prototype`.',
            '2) Call the constructor with `this` = that object.',
            '3) If the constructor returns an object, use it; otherwise return the new object.',
            '`instanceof` checks whether `Car.prototype` is anywhere on `c`\'s prototype chain.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Prototype pollution (security)',
        code({
          title: 'A naive deep merge of user input',
          code: dedent(`
            function naiveMerge(target, source) {
              for (const key of Object.keys(source)) {
                if (typeof source[key] === 'object' && source[key] !== null) {
                  if (typeof target[key] !== 'object') target[key] = {};
                  naiveMerge(target[key], source[key]);
                } else {
                  target[key] = source[key];
                }
              }
              return target;
            }
            const payload = JSON.parse('{"__proto__": {"isAdmin": true}}');
            console.log(Object.keys(payload));
            naiveMerge({}, payload);
            console.log({}.isAdmin);
            delete Object.prototype.isAdmin;
            console.log({}.isAdmin);
          `),
          expectedOutput: "[ '__proto__' ]\ntrue\nundefined",
          explanation: [
            '`JSON.parse` creates an **own** property literally named `__proto__`.',
            'In the merge, `target["__proto__"]` reads the accessor → `Object.prototype`, and the recursion writes `isAdmin` onto it.',
            'Now **every** object in the process has `isAdmin === true` — a real class of vulnerability in Node apps.',
            'Defences: skip `__proto__`/`constructor`/`prototype` keys, use `Object.create(null)` or `Map` for dictionaries, validate input with a schema (Module 12).',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using a plain object as a dictionary of user-supplied keys — keys like `__proto__` or `constructor` collide with inherited properties. Use `Map` or `Object.create(null)`.',
          'Using `for...in` and accidentally iterating inherited enumerable properties; prefer `Object.keys`/`Object.entries`.',
          'Confusing `obj.__proto__` (the link) with `Fn.prototype` (the template for instances).',
          'Adding methods to built-in prototypes (`Array.prototype.myThing`) — breaks other code and future standards.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Draw the chain: instance → Fn.prototype → Object.prototype → null, and explain lookup vs assignment.'),
        interviewTip('Listing the 3–4 steps of `new` is a frequent follow-up; mentioning prototype pollution shows backend security awareness.'),
      ),
      section('practice', 'Practice',
        text('Create `const base = { hello() { return "hi " + this.name; } }`, then three objects with `Object.create(base)`. Add a method to `base` after creating them and confirm all three can call it. Explain why.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Objects hold own properties and a hidden `[[Prototype]]` link.',
          'Reads walk the chain; writes create own properties.',
          '`new Fn()` links the instance to `Fn.prototype`.',
          'Use `Object.getPrototypeOf`, `Object.create`, `Object.hasOwn` in modern code.',
          'Never merge untrusted input into objects without guarding `__proto__`.',
        ),
      ),
    ],
    revisionNotes: [
      'Lookup: own → prototype → … → Object.prototype → null → undefined.',
      'Assignment creates/updates own property (shadows), unless a setter/readonly exists up the chain.',
      'new Fn().__proto__ === Fn.prototype.',
      'new: create obj linked to prototype, call with this, return obj unless ctor returns an object.',
      'Object.create(null) has no prototype — safe dictionary.',
      'Prototype pollution: user input writing to __proto__ affects all objects.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          const proto = { color: 'red' };
          const car = Object.create(proto);
          car.color = 'blue';
          console.log(car.color, proto.color);
        `),
        options: ['red red', 'blue blue', 'blue red', 'red blue'],
        answer: 2,
        explanation: 'Assigning to `car.color` creates an own property on `car` that shadows the prototype\'s. The prototype keeps `red`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Given `function Foo() {}` and `const f = new Foo()`, which expression is true?',
        options: ['f.prototype === Foo.prototype', 'Object.getPrototypeOf(f) === Foo.prototype', 'Foo.__proto__ === Foo.prototype', 'Object.getPrototypeOf(Foo) === f'],
        answer: 1,
        explanation: 'An instance\'s [[Prototype]] is the constructor\'s `prototype` property. Instances do not have a `prototype` property themselves (`f.prototype` is undefined). `Foo.__proto__` is `Function.prototype`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          function Person() {}
          Person.prototype.hi = () => 'hi';
          const p = new Person();
          Person.prototype.bye = () => 'bye';
          console.log(p.bye());
        `),
        options: ["TypeError: p.bye is not a function", 'undefined', 'bye', 'hi'],
        answer: 2,
        explanation: 'The prototype is a live link, not a copy. Methods added to `Person.prototype` later are visible to existing instances.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Prototypes',
        question: 'What is the prototype chain in JavaScript?',
        shortAnswer: 'Every object has an internal link to another object (its prototype); when a property is not found on an object, the engine looks it up along this chain until it reaches null.',
        detailedAnswer: [
          'The link is `[[Prototype]]`, readable with `Object.getPrototypeOf`.',
          'Typical chain: instance → Class.prototype → Object.prototype → null.',
          'Reads walk the chain; writes create own properties.',
          'Methods shared on prototypes are how inheritance and built-ins like `Array.prototype.map` work.',
        ],
        followUp: 'What happens when you assign to a property that exists only on the prototype?',
        trap: 'Thinking objects copy their prototype\'s properties at creation.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Prototypes',
        question: 'What is the difference between __proto__ and prototype?',
        shortAnswer: '`__proto__` is a (legacy) accessor on every object exposing its own [[Prototype]]; `prototype` is a property on constructor functions/classes holding the object that instances created with `new` will link to.',
        detailedAnswer: [
          '`new Foo().__proto__ === Foo.prototype`.',
          'Functions themselves have a `__proto__` too: `Foo.__proto__ === Function.prototype`.',
          'Arrow functions and methods have no `prototype` property.',
          'Prefer `Object.getPrototypeOf`/`setPrototypeOf`/`Object.create` over `__proto__`.',
          '`__proto__` as a key in JSON input is a prototype pollution vector.',
        ],
        followUp: 'Why is `Object.setPrototypeOf` discouraged on hot objects?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Prototypes',
        question: 'What does the new keyword do, step by step?',
        shortAnswer: 'It creates a new object whose [[Prototype]] is `Fn.prototype`, calls `Fn` with `this` bound to it, and returns that object unless the constructor explicitly returns another object.',
        detailedAnswer: [
          'Step 1: `const obj = Object.create(Fn.prototype)`.',
          'Step 2: `const ret = Fn.apply(obj, args)`.',
          'Step 3: return `ret` if it is an object (or function), otherwise `obj`.',
          'For derived classes, `this` is created by the base constructor via `super()` instead.',
          'Calling a class without `new` throws a TypeError.',
        ],
        followUp: 'What happens if a constructor returns a primitive like 42?',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'classes-and-inheritance': {
    summary: 'Classes are syntax over prototypes: `constructor`, methods on the prototype, `extends` linking prototype chains, `super` for parent access, plus fields, static members, getters and true private `#fields`.',
    topics: ['class', 'constructor', 'methods', 'extends', 'super', 'class fields', 'private fields', 'static', 'getters and setters', 'instanceof', 'composition', 'syntactic sugar'],
    sections: [
      section('introduction', undefined,
        text('Classes give a familiar syntax for creating many objects with the same shape and behaviour — services, repositories, custom errors, domain models. Under the hood they still use the prototype chain you learned in the previous lesson.'),
      ),
      section('definition', 'Class anatomy',
        table('Class members', ['Member', 'Syntax', 'Lives on'], [
          ['Constructor', '`constructor(a) { this.a = a; }`', 'Runs on `new`'],
          ['Method', '`save() { }`', '`Class.prototype` (shared, non-enumerable)'],
          ['Public field', '`count = 0;`', 'Each instance (own property)'],
          ['Private field/method', '`#secret = 1;` `#hash() { }`', 'Each instance, only accessible inside the class body'],
          ['Static', '`static create() { }`, `static count = 0`', 'The class (constructor function) itself'],
          ['Getter/setter', '`get total() { }` / `set total(v) { }`', '`Class.prototype`'],
          ['Static block', '`static { /* init */ }`', 'Runs once when the class is defined'],
        ]),
      ),
      section('why', 'Why use classes',
        bullets(
          'Readable structure for objects with state + behaviour (e.g. `UserService` with a repository dependency).',
          '`extends Error` is the standard way to make custom error types.',
          'Private `#fields` give real encapsulation enforced by the engine.',
          'Many Node frameworks (NestJS, TypeORM) are class-based.',
        ),
        table('Class vs constructor function', ['', 'class', 'function + prototype'], [
          ['Call without new', 'TypeError', 'Runs (this = global/undefined)'],
          ['Hoisting', 'TDZ', 'Fully hoisted'],
          ['Strict mode', 'Always', 'Only if opted in'],
          ['Methods enumerable', 'No', 'Yes (when assigned)'],
          ['Private state', '`#field`', 'Closures/WeakMap only'],
        ]),
      ),
      section('internals', 'What extends and super actually do',
        steps(
          '`class Dog extends Animal` sets `Object.getPrototypeOf(Dog.prototype) === Animal.prototype` (instances inherit methods).',
          'It also sets `Object.getPrototypeOf(Dog) === Animal` (static methods are inherited).',
          'In a derived constructor, `this` does **not exist** until `super(...)` runs — the base constructor creates the object. Touching `this` earlier throws a ReferenceError.',
          'If a derived class has no constructor, the engine adds `constructor(...args) { super(...args); }`.',
          '`super.method()` looks up `method` starting from the parent prototype (via the method\'s internal `[[HomeObject]]`), with the current `this`.',
          'Class fields are defined on the instance right after `super()` returns (or at the start of a base constructor).',
        ),
      ),
      section('example', 'Examples',
        code({
          title: 'extends, super and the prototype chain',
          code: dedent(`
            class Animal {
              constructor(name) {
                this.name = name;
              }
              speak() {
                return this.name + ' makes a sound';
              }
            }
            class Dog extends Animal {
              constructor(name, breed) {
                super(name);
                this.breed = breed;
              }
              speak() {
                return super.speak() + ' (woof)';
              }
            }
            const d = new Dog('Rex', 'lab');
            console.log(d.speak());
            console.log(d);
            console.log(d instanceof Dog, d instanceof Animal);
            console.log(typeof Animal);
            console.log(Object.getPrototypeOf(Dog.prototype) === Animal.prototype);
          `),
          expectedOutput: "Rex makes a sound (woof)\nDog { name: 'Rex', breed: 'lab' }\ntrue true\nfunction\ntrue",
          explanation: [
            '`super(name)` runs `Animal`\'s constructor, which creates `this` and sets `name`.',
            '`Dog#speak` overrides `Animal#speak` but can still call it via `super.speak()`.',
            'A class is a function; `extends` links `Dog.prototype` to `Animal.prototype`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Fields, private fields, static members and getters',
          code: dedent(`
            class BankAccount {
              static count = 0;
              #balance = 0;
              owner;
              constructor(owner) {
                this.owner = owner;
                BankAccount.count++;
              }
              deposit(amount) {
                if (amount <= 0) throw new RangeError('Amount must be positive');
                this.#balance += amount;
                return this;
              }
              get balance() {
                return this.#balance;
              }
              static isAccount(obj) {
                return #balance in obj;
              }
            }
            const acc = new BankAccount('ana');
            acc.deposit(50).deposit(25);
            console.log(acc.balance);
            console.log(acc);
            console.log(BankAccount.count);
            console.log(BankAccount.isAccount(acc), BankAccount.isAccount({}));
            console.log(acc.balance = 1000, acc.balance);
          `),
          expectedOutput: "75\nBankAccount { owner: 'ana' }\n1\ntrue false\n1000 75",
          explanation: [
            '`#balance` is truly private: `acc.#balance` outside the class is a **SyntaxError**.',
            'util.inspect (Node 20) does not show private fields.',
            'Returning `this` enables method chaining.',
            '`#balance in obj` (ES2022) checks whether an object has that private field — a reliable brand check.',
            'Assigning to a getter-only property is silently ignored in sloppy code (it would throw in strict code); the balance stays 75.',
          ],
          versionNote: 'Private fields: Node 12+. `#x in obj`: Node 16.4+.',
          runnable: true,
        }),
        code({
          title: 'You must call super() before using this',
          code: dedent(`
            class Base {
              constructor() {
                this.createdAt = 'now';
              }
            }
            class Broken extends Base {
              constructor() {
                try {
                  this.x = 1;
                } catch (e) {
                  console.log(e.name);
                }
                super();
                console.log('after super:', this.createdAt);
              }
            }
            new Broken();
          `),
          expectedOutput: 'ReferenceError\nafter super: now',
          explanation: [
            'Before `super()`, the derived constructor has no `this` — the base constructor creates it.',
            'Message: "Must call super constructor in derived class before accessing \'this\' or returning from derived constructor".',
          ],
          runnable: true,
        }),
        code({
          title: 'Classes are stricter than constructor functions',
          code: dedent(`
            class Thing {
              method() {}
            }
            function OldThing() {}
            OldThing.prototype.method = function () {};
            console.log(Object.keys(Thing.prototype));
            console.log(Object.keys(OldThing.prototype));
            try {
              Thing();
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
          `),
          expectedOutput: "[]\n[ 'method' ]\nTypeError: Class constructor Thing cannot be invoked without 'new'",
          explanation: [
            'Class methods are non-enumerable, so they do not show up in `Object.keys` or `for...in`.',
            'Calling a class like a function throws.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'A repository hierarchy',
        code({
          title: 'Base repository + specialised subclass',
          code: dedent(`
            class Repository {
              constructor() {
                this.items = new Map();
              }
              create(item) {
                this.items.set(item.id, item);
                return item;
              }
              findById(id) {
                return this.items.get(id) ?? null;
              }
            }
            class UserRepository extends Repository {
              findByEmail(email) {
                for (const user of this.items.values()) {
                  if (user.email === email) return user;
                }
                return null;
              }
            }
            const repo = new UserRepository();
            repo.create({ id: 1, email: 'a@x.io' });
            console.log(repo.findById(1));
            console.log(repo.findByEmail('a@x.io').id);
            console.log(repo.findById(2));
          `),
          expectedOutput: "{ id: 1, email: 'a@x.io' }\n1\nnull",
          explanation: [
            '`UserRepository` has no constructor, so a default one calls `super()`.',
            'It inherits `create`/`findById` and adds a specific query.',
            'In real apps the base class would wrap a DB client; this pattern returns in Module 9.',
          ],
          runnable: true,
        }),
        tip('Prefer **composition** (pass collaborators into the constructor) over deep inheritance chains. Two levels of `extends` is usually the most you want in service code.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting `super()` (or using `this` before it) in a derived constructor.',
          'Passing class methods as callbacks and losing `this` (see the this lesson).',
          'Using `_private` naming and believing it is private — it is just a convention.',
          'Deep inheritance hierarchies that are hard to change; prefer composition.',
          'Thinking classes are hoisted like functions — they are in the TDZ.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Say "classes are mostly syntactic sugar over prototypes" — and then name what is **not** sugar: private `#fields`, mandatory `new`, strict mode, `super` and `[[HomeObject]]`, non-enumerable methods.'),
      ),
      section('practice', 'Practice',
        text('Build `class Shape { area() }` with `Circle` and `Rectangle` subclasses, a static `Shape.compare(a, b)`, and a private `#id` assigned from a static counter. Print the shapes sorted by area.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Classes create constructor functions with methods on the prototype.',
          '`extends` links both prototype chains (instances and statics).',
          'Derived constructors must call `super()` before `this`.',
          '`#private` fields are engine-enforced privacy.',
          'Classes are strict, not hoisted (TDZ), and require `new`.',
        ),
      ),
    ],
    revisionNotes: [
      'class methods → Class.prototype (non-enumerable); fields → instance.',
      'extends: Child.prototype → Parent.prototype, Child → Parent (statics).',
      'Derived ctor: no this until super() → ReferenceError.',
      'Default derived constructor: constructor(...args) { super(...args); }',
      '#private: SyntaxError outside the class; #x in obj brand check.',
      'Class() without new → TypeError; classes are in the TDZ.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          class A { hi() { return 'A'; } }
          class B extends A { hi() { return 'B' + super.hi(); } }
          console.log(new B().hi());
        `),
        options: ['A', 'B', 'BA', 'AB'],
        answer: 2,
        explanation: '`B#hi` returns "B" concatenated with the parent implementation\'s "A".',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Creating an `AdminUser` throws a ReferenceError. Why?',
        code: dedent(`
          class User {
            constructor(name) { this.name = name; }
          }
          class AdminUser extends User {
            constructor(name) {
              this.role = 'admin';
              super(name);
            }
          }
        `),
        options: [
          'AdminUser must not define a constructor',
          'this is used before super() is called',
          'role must be declared as a class field',
          'super must be called with no arguments',
        ],
        answer: 1,
        explanation: 'In a derived class, `this` is created by the parent constructor. Call `super(name)` first, then set `this.role`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which is true about `#count` in `class Counter { #count = 0 }`?',
        options: [
          'It can be read as counter["#count"]',
          'It is stored on Counter.prototype',
          'Accessing it outside the class body is a SyntaxError',
          'It is just a naming convention like _count',
        ],
        answer: 2,
        explanation: 'Private names are checked by the parser: `obj.#count` outside the class does not even compile. The string key "#count" is a different, unrelated property.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Classes',
        question: 'Are JavaScript classes real classes or syntactic sugar?',
        shortAnswer: 'Mostly syntactic sugar over constructor functions and prototypes — a class is a function and methods live on its prototype — but they add real semantics such as private fields, mandatory new, strict mode and super.',
        detailedAnswer: [
          '`typeof MyClass === "function"`; methods are on `MyClass.prototype`.',
          '`extends` sets up the same prototype chain you could build manually.',
          'Not pure sugar: `#private` fields, `super`/`[[HomeObject]]`, calling without `new` throws, TDZ, non-enumerable methods.',
          'Derived classes have `this` created by the base constructor, which enables subclassing built-ins like `Error` and `Array` correctly.',
        ],
        followUp: 'How would you write the same inheritance with Object.create?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Classes',
        question: 'Why must you call super() before accessing this in a derived class constructor?',
        shortAnswer: 'Because in a derived class the object is created by the parent constructor; until super() returns there is no `this` to access, so the engine throws a ReferenceError.',
        detailedAnswer: [
          'Base constructors allocate the instance; derived constructors only initialise it.',
          'This design allows subclassing built-ins (Error, Array, Map) whose internal slots must be set up by the base.',
          'Class fields of the derived class are initialised right after `super()` returns.',
          'Returning from a derived constructor without calling `super()` also throws (unless you return an object).',
        ],
        followUp: 'In what order are parent fields, parent constructor body, and child fields initialised?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Classes',
        question: 'What are private class fields (#) and how do they differ from the underscore convention or closures?',
        shortAnswer: '`#fields` are engine-enforced private slots only accessible inside the class body; `_name` is a public property by convention; closures give privacy but cost a function per instance and do not work with prototype methods.',
        detailedAnswer: [
          '`obj.#x` outside the class is a SyntaxError — not even reflection (Object.keys, JSON, Proxy) can see it.',
          '`_x` is fully public and enumerable.',
          'Closure-based privacy requires methods defined inside the constructor.',
          'WeakMap-based privacy was the pre-ES2022 alternative.',
          '`#x in obj` provides a brand check.',
        ],
        followUp: 'Can a subclass access the parent\'s #private field?',
        trap: 'Assuming subclasses inherit access to `#fields` — they do not.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'arrays-and-array-methods': {
    summary: 'Arrays are ordered, zero-indexed list objects; their methods split into mutating (push, splice, sort, reverse) and non-mutating ones (map, filter, reduce, slice, concat, toSorted) — choosing correctly is key to bug-free data processing.',
    topics: ['array', 'map', 'filter', 'reduce', 'find', 'findIndex', 'some', 'every', 'includes', 'sort', 'toSorted', 'splice', 'slice', 'flat', 'flatMap', 'Array.from', 'at', 'forEach', 'mutating vs non-mutating'],
    sections: [
      section('introduction', undefined,
        text('Backend code transforms lists constantly: rows from a database, items in a cart, lines in a log file. JavaScript arrays come with a rich set of methods — knowing which ones **mutate** the array and which return a **new** one prevents subtle bugs.'),
      ),
      section('definition', 'Method cheat sheet',
        table('Essential array methods', ['Method', 'Returns', 'Mutates?'], [
          ['`map(fn)`', 'New array of transformed items', 'No'],
          ['`filter(fn)`', 'New array of items where fn is truthy', 'No'],
          ['`reduce(fn, init)`', 'A single accumulated value', 'No'],
          ['`find(fn)` / `findIndex(fn)`', 'First match / its index (`undefined` / `-1`)', 'No'],
          ['`some(fn)` / `every(fn)`', 'Boolean', 'No'],
          ['`includes(v)` / `indexOf(v)`', 'Boolean / index (`includes` finds NaN)', 'No'],
          ['`slice(start, end)`', 'Shallow copy of a range', 'No'],
          ['`concat(...)`, `flat()`, `flatMap()`', 'New array', 'No'],
          ['`toSorted`, `toReversed`, `toSpliced`, `with`', 'New array (ES2023)', 'No'],
          ['`push`/`pop`/`shift`/`unshift`', 'New length / removed item', '**Yes**'],
          ['`splice(start, count, ...items)`', 'Array of removed items', '**Yes**'],
          ['`sort(fn)` / `reverse()`', 'The same array', '**Yes**'],
          ['`forEach(fn)`', '`undefined`', 'No (but used for side effects)'],
        ]),
      ),
      section('why', 'Why these methods matter',
        bullets(
          'Declarative pipelines (`filter → map → reduce`) are easier to read than index loops.',
          'Non-mutating methods keep shared data (caches, config, request state) safe.',
          '`sort` without a comparator and `forEach` with `async` are two of the most common production bugs.',
        ),
      ),
      section('internals', 'How arrays work',
        bullets(
          'An array is an object with integer-like keys and a magic `length` property (always largest index + 1).',
          'V8 stores dense arrays of small integers or doubles in fast contiguous "elements" backing stores; mixing types or creating holes (`arr[1000] = 1`) switches to slower representations.',
          'Callback methods call your function as `fn(element, index, array)` — this is why `["1","2","3"].map(parseInt)` misbehaves.',
          'Default `sort()` converts elements to **strings** and compares UTF-16 code units. Sorting is stable since ES2019.',
          '`reduce` without an initial value uses the first element as the accumulator and throws on an empty array.',
        ),
      ),
      section('example', 'Transforming data',
        code({
          title: 'filter → map → reduce, plus find/some/every',
          code: dedent(`
            const orders = [
              { id: 1, total: 50, status: 'paid' },
              { id: 2, total: 20, status: 'pending' },
              { id: 3, total: 80, status: 'paid' },
            ];
            const paid = orders.filter((o) => o.status === 'paid');
            const totals = paid.map((o) => o.total);
            const revenue = totals.reduce((sum, t) => sum + t, 0);
            console.log(totals);
            console.log(revenue);
            console.log(orders.find((o) => o.total > 60));
            console.log(orders.findIndex((o) => o.id === 2));
            console.log(orders.some((o) => o.status === 'pending'), orders.every((o) => o.total > 10));
          `),
          expectedOutput: "[ 50, 80 ]\n130\n{ id: 3, total: 80, status: 'paid' }\n1\ntrue true",
          explanation: [
            '`filter` keeps paid orders, `map` extracts totals, `reduce` sums them starting from 0.',
            '`find` returns the first matching **element**; `findIndex` its position.',
            '`some` stops at the first true; `every` stops at the first false.',
          ],
          runnable: true,
        }),
        code({
          title: 'reduce for grouping, and other helpers',
          code: dedent(`
            const logs = ['error', 'info', 'error', 'warn', 'info', 'error'];
            const counts = logs.reduce((acc, level) => {
              acc[level] = (acc[level] || 0) + 1;
              return acc;
            }, {});
            console.log(counts);
            console.log([[1, 2], [3, [4]]].flat());
            console.log([[1, 2], [3, [4]]].flat(Infinity));
            console.log(['a b', 'c'].flatMap((s) => s.split(' ')));
            console.log(Array.from({ length: 3 }, (_, i) => i * 2));
            console.log([1, 2, 3].at(-1));
          `),
          expectedOutput: "{ error: 3, info: 2, warn: 1 }\n[ 1, 2, 3, [ 4 ] ]\n[ 1, 2, 3, 4 ]\n[ 'a', 'b', 'c' ]\n[ 0, 2, 4 ]\n3",
          explanation: [
            'The accumulator object starts as `{}` and is returned each step.',
            '`flat()` flattens one level by default; `flat(Infinity)` flattens fully.',
            '`flatMap` = `map` then `flat(1)`.',
            '`Array.from({ length: n }, fn)` builds arrays of a given size.',
            '`at(-1)` reads from the end.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Mutation and sorting traps',
        code({
          title: 'Default sort is lexicographic and in place',
          code: dedent(`
            const nums = [10, 1, 5, 100, 25];
            console.log([...nums].sort());
            console.log([...nums].sort((a, b) => a - b));
            const original = [3, 1, 2];
            const sorted = original.sort();
            console.log(original, sorted === original);
            const arr = [3, 1, 2];
            console.log(arr.toSorted(), arr);
          `),
          expectedOutput: '[ 1, 10, 100, 25, 5 ]\n[ 1, 5, 10, 25, 100 ]\n[ 1, 2, 3 ] true\n[ 1, 2, 3 ] [ 3, 1, 2 ]',
          explanation: [
            'Without a comparator, numbers are compared as strings: `"10" < "5"`.',
            '`(a, b) => a - b` sorts numerically ascending (negative = a first).',
            '`sort` mutates and returns the **same** array.',
            '`toSorted` returns a sorted copy and leaves the original alone.',
          ],
          versionNote: '`toSorted`/`toReversed`/`toSpliced`/`with` require Node 20+.',
          runnable: true,
        }),
        code({
          title: 'Mutating vs non-mutating',
          code: dedent(`
            const a = [1, 2, 3];
            a.push(4);
            const removed = a.splice(1, 2);
            console.log(a, removed);
            const b = [1, 2, 3, 4];
            console.log(b.slice(1, 3), b);
            console.log(b.concat([5]), b.length);
            console.log(b.includes(NaN), [NaN].includes(NaN), [NaN].indexOf(NaN));
          `),
          expectedOutput: '[ 1, 4 ] [ 2, 3 ]\n[ 2, 3 ] [ 1, 2, 3, 4 ]\n[ 1, 2, 3, 4, 5 ] 4\nfalse true -1',
          explanation: [
            '`splice(1, 2)` removes 2 items starting at index 1, mutating `a`, and returns the removed ones.',
            '`slice(1, 3)` copies indexes 1 and 2 without touching `b`.',
            '`includes` uses SameValueZero (finds NaN); `indexOf` uses `===` (cannot find NaN).',
          ],
          runnable: true,
        }),
        code({
          title: 'map(parseInt) — callbacks receive (value, index, array)',
          code: dedent(`
            console.log(['1', '2', '3'].map(parseInt));
            console.log(['1', '2', '3'].map(Number));
            console.log(['1', '2', '3'].map((s) => parseInt(s, 10)));
          `),
          expectedOutput: '[ 1, NaN, NaN ]\n[ 1, 2, 3 ]\n[ 1, 2, 3 ]',
          explanation: [
            '`map` calls `parseInt("1", 0)`, `parseInt("2", 1)`, `parseInt("3", 2)`.',
            'Radix 0 means "auto" (→ 1); radix 1 is invalid (→ NaN); "3" is not a binary digit (→ NaN).',
            '`Number` takes one argument, so it is safe here; or wrap `parseInt` explicitly.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'forEach does not wait for async callbacks',
        code({
          title: 'Fetching users: forEach vs Promise.all',
          code: dedent(`
            const ids = [1, 2, 3];
            const fakeFetch = (id) => new Promise((resolve) => setTimeout(() => resolve('user' + id), 10));

            async function wrong() {
              const results = [];
              ids.forEach(async (id) => {
                results.push(await fakeFetch(id));
              });
              console.log('forEach results:', results);
            }
            async function right() {
              const results = await Promise.all(ids.map(fakeFetch));
              console.log('Promise.all results:', results);
            }
            wrong().then(right);
          `),
          expectedOutput: "forEach results: []\nPromise.all results: [ 'user1', 'user2', 'user3' ]",
          explanation: [
            '`forEach` ignores the promises returned by async callbacks, so `wrong` logs before any fetch completes.',
            '`map` returns the array of promises; `Promise.all` waits for all of them in parallel and keeps order.',
            'Use `for...of` with `await` when the calls must run one after another (covered with async/await).',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`sort()` on numbers without a comparator.',
          'Sorting/reversing a shared array in place (e.g. a cached DB result) — copy first or use `toSorted`.',
          '`forEach` with `async` callbacks.',
          '`reduce` without an initial value on a possibly-empty array → TypeError.',
          'Using `map` purely for side effects (use `forEach`/`for...of`), or `filter(...)[0]` instead of `find`.',
          '`delete arr[i]` leaves a hole; use `splice` or `filter`.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Interviewers often ask you to implement `map` or `filter` with `reduce`, or to group/count items. Practise writing reducers with an explicit initial value.'),
        interviewTip('Mention `toSorted` and friends (ES2023) as the non-mutating alternatives.'),
      ),
      section('practice', 'Practice',
        steps(
          'Given `[{ name, dept, salary }]`, compute the average salary per department with one `reduce`.',
          'Implement `chunk(arr, size)` → `chunk([1,2,3,4,5], 2)` is `[[1,2],[3,4],[5]]`.',
          'Implement `uniqueBy(arr, key)` keeping the first item for each key.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'map/filter/reduce/find/some/every/slice/concat/flat never mutate.',
          'push/pop/shift/unshift/splice/sort/reverse mutate.',
          'Always pass a comparator to `sort` for numbers; `toSorted` copies.',
          'Callbacks receive `(value, index, array)`.',
          'forEach + async = fire-and-forget; use `Promise.all(arr.map(...))` or `for...of`.',
        ),
      ),
    ],
    revisionNotes: [
      'Default sort compares strings: [10, 1, 5].sort() → [1, 10, 5].',
      'sort/reverse/splice mutate; toSorted/toReversed/toSpliced/with copy (Node 20+).',
      'reduce(fn) on [] without init → TypeError.',
      '["1","2","3"].map(parseInt) → [1, NaN, NaN].',
      'includes finds NaN, indexOf does not.',
      'forEach does not await async callbacks.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: 'console.log([5, 25, 100, 1].sort());',
        options: ['[ 1, 5, 25, 100 ]', '[ 1, 100, 25, 5 ]', '[ 100, 25, 5, 1 ]', '[ 5, 25, 100, 1 ]'],
        answer: 1,
        explanation: 'Default sort compares string forms: "1" < "100" < "25" < "5". Use `sort((a, b) => a - b)` for numeric order.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Fill the blank so `byId` becomes `{ 1: {id:1,…}, 2: {id:2,…} }`.',
        code: 'const byId = users.reduce(/* ??? */, {});',
        options: [
          '(acc, u) => acc[u.id] = u',
          '(acc, u) => { acc[u.id] = u; return acc; }',
          '(u, acc) => ({ ...acc, [u.id]: u })',
          '(acc, u) => { acc.push(u); return acc; }',
        ],
        answer: 1,
        explanation: 'The reducer must return the accumulator. Option 1 returns `u` (the assignment result). Option 3 swaps parameter order. Option 4 treats an object like an array.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This handler responds before emails are sent. Why?',
        code: dedent(`
          async function notifyAll(users) {
            users.forEach(async (u) => {
              await sendEmail(u.email);
            });
            return 'done';
          }
        `),
        options: [
          'sendEmail must be called without await',
          'forEach does not wait for the promises returned by async callbacks',
          'async functions cannot be used with arrays',
          'return must be placed inside forEach',
        ],
        answer: 1,
        explanation: '`forEach` discards the returned promises. Use `await Promise.all(users.map((u) => sendEmail(u.email)))` or a `for...of` loop with `await`.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Arrays',
        question: 'What is the difference between map, filter and reduce?',
        shortAnswer: '`map` transforms every element into a new array of the same length, `filter` returns a new array with only the elements that pass a test, and `reduce` folds the array into a single value.',
        detailedAnswer: [
          'All three are non-mutating and take a callback `(element, index, array)`.',
          '`reduce` also receives the accumulator and an initial value.',
          '`reduce` can implement both `map` and `filter`, plus grouping and counting.',
          'Chaining them makes data pipelines readable, at the cost of creating intermediate arrays.',
        ],
        followUp: 'Implement map using reduce.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Arrays',
        question: 'Which array methods mutate the original array, and why does it matter?',
        shortAnswer: 'push, pop, shift, unshift, splice, sort, reverse, fill and copyWithin mutate; map, filter, slice, concat, flat and the ES2023 toSorted/toReversed/toSpliced/with return new arrays. Mutation matters when the array is shared.',
        detailedAnswer: [
          'Mutating a shared array (cache, config, function argument) changes it for all holders of the reference.',
          '`sort()` returns the same array, which hides the mutation.',
          'Copy first with `[...arr]` or use the `to*` variants (Node 20+).',
          'Immutability is also important for change detection in UI state and predictable tests.',
        ],
        followUp: 'How would you remove an item at index i without mutating?',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'Arrays',
        question: 'Why does ["1", "2", "3"].map(parseInt) return [1, NaN, NaN]?',
        shortAnswer: '`map` passes `(value, index, array)`, so parseInt receives the index as its radix: parseInt("1", 0) → 1, parseInt("2", 1) → NaN (invalid radix), parseInt("3", 2) → NaN (3 is not a binary digit).',
        detailedAnswer: [
          'Radix 0 is treated as "not specified" → base 10.',
          'Radix must be 2–36; 1 is invalid → NaN.',
          'In base 2 only 0 and 1 are valid digits.',
          'Fix: `.map(Number)` or `.map((s) => parseInt(s, 10))`.',
        ],
        followUp: 'What other built-ins behave unexpectedly when passed directly to map?',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  destructuring: {
    summary: 'Destructuring unpacks values from arrays (by position) and objects (by property name) into variables, with support for renaming, defaults (for undefined only), nesting and rest.',
    topics: ['object destructuring', 'array destructuring', 'renaming', 'default values', 'nested destructuring', 'rest in destructuring', 'parameter destructuring', 'swapping', 'Object.entries'],
    sections: [
      section('introduction', undefined,
        text("Instead of writing `const id = req.params.id; const name = req.body.name;`, destructuring lets you pull out exactly what you need in one line: `const { id } = req.params;`. It is everywhere in modern Node code — imports, function options, API handlers."),
      ),
      section('definition', 'Syntax at a glance',
        table('Destructuring patterns', ['Pattern', 'Meaning'], [
          ['`const { a, b } = obj`', 'Take `obj.a` and `obj.b`'],
          ['`const { a: alias } = obj`', 'Take `obj.a` into a variable named `alias`'],
          ['`const { a = 5 } = obj`', 'Default when `obj.a` is `undefined`'],
          ['`const { a: { b } } = obj`', 'Nested: take `obj.a.b`'],
          ['`const { a, ...rest } = obj`', 'Remaining own enumerable props into `rest`'],
          ['`const [x, y] = arr`', 'By position'],
          ['`const [, second] = arr`', 'Skip elements'],
          ['`const [head, ...tail] = arr`', 'Rest of the array'],
          ['`function f({ a, b } = {}) {}`', 'Destructure parameters with a fallback'],
        ]),
      ),
      section('why', 'Why use it',
        bullets(
          'Shorter, clearer code: names what you use from an object.',
          'Named options for functions: `createServer({ port, host })` instead of positional arguments.',
          'Removing fields cleanly: `const { password, ...safeUser } = user`.',
        ),
      ),
      section('internals', 'How it works',
        bullets(
          'Object patterns read properties with normal `[[Get]]` — so getters run and the prototype chain is consulted.',
          'Array patterns use the **iterator protocol** — they work on any iterable (strings, Sets, Maps, generators), not just arrays.',
          'Default values are evaluated **lazily**, only if the value is `undefined`. `null` does not trigger a default.',
          'Destructuring `null` or `undefined` throws a TypeError, because the engine first converts the right side with ToObject.',
          'Object rest copies only own enumerable properties into a new plain object (shallow).',
        ),
      ),
      section('example', 'Examples',
        code({
          title: 'Objects and arrays',
          code: dedent(`
            const user = { id: 7, email: 'a@x.io', profile: { city: 'Pune' } };
            const { id, email: mail, role = 'user', profile: { city } } = user;
            console.log(id, mail, role, city);

            const [first, , third = 'default', ...others] = ['a', 'b', undefined, 'd', 'e'];
            console.log(first, third, others);
            const [x, y] = 'hi';
            console.log(x, y);
          `),
          expectedOutput: "7 a@x.io user Pune\na default [ 'd', 'e' ]\nh i",
          explanation: [
            '`email: mail` renames; `role = "user"` defaults because `user.role` is undefined.',
            '`profile: { city }` reaches into the nested object (no `profile` variable is created).',
            'Commas skip positions; `third` is undefined so its default applies; `...others` collects the rest.',
            'Strings are iterable, so array destructuring works on them.',
          ],
          runnable: true,
        }),
        code({
          title: 'Defaults apply only to undefined',
          code: dedent(`
            const { a = 1, b = 2, c = 3 } = { a: undefined, b: null, c: 0 };
            console.log(a, b, c);
          `),
          expectedOutput: '1 null 0',
          explanation: [
            'Only `a` is `undefined`, so only `a` uses its default.',
            '`null` and `0` are real values. Combine with `??` if you also want to replace `null`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Swapping and parameter destructuring',
          code: dedent(`
            let x = 1;
            let y = 2;
            [x, y] = [y, x];
            console.log(x, y);

            function createServer({ port = 3000, host = 'localhost' } = {}) {
              return host + ':' + port;
            }
            console.log(createServer({ port: 8080 }));
            console.log(createServer());
          `),
          expectedOutput: '2 1\nlocalhost:8080\nlocalhost:3000',
          explanation: [
            'Array destructuring swaps without a temporary variable.',
            'The `= {}` default makes `createServer()` safe — without it, destructuring `undefined` throws.',
          ],
          runnable: true,
        }),
        code({
          title: 'Destructuring null/undefined throws',
          code: dedent(`
            function handle(body) {
              try {
                const { address: { city } } = body;
                return city;
              } catch (e) {
                return e.name;
              }
            }
            console.log(handle({ address: { city: 'Oslo' } }));
            console.log(handle({}));
            console.log(handle(null));
          `),
          expectedOutput: 'Oslo\nTypeError\nTypeError',
          explanation: [
            'With `{}`, `address` is undefined, and destructuring `{ city }` from undefined throws.',
            'With `null`, the outer destructuring already throws.',
            'Add defaults: `const { address: { city } = {} } = body ?? {};`.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In an API handler',
        code({
          title: 'Strip secrets and iterate entries',
          code: dedent(`
            const dbUser = { id: 1, email: 'a@x.io', passwordHash: 'x9f', salt: 'abc' };
            const { passwordHash, salt, ...safeUser } = dbUser;
            console.log(safeUser);
            for (const [key, value] of Object.entries({ host: 'db', port: 5432 })) {
              console.log(key + '=' + value);
            }
          `),
          expectedOutput: "{ id: 1, email: 'a@x.io' }\nhost=db\nport=5432",
          explanation: [
            'Object rest collects everything except the named secrets — safe to send as JSON.',
            '`Object.entries` + array destructuring is the idiomatic way to loop key/value pairs.',
            'In Express you will often write `const { id } = req.params; const { page = "1" } = req.query;`.',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Destructuring a possibly-undefined parameter without `= {}`.',
          'Expecting defaults to replace `null`.',
          'Assigning to existing variables without parentheses: `{ a } = obj;` is a SyntaxError (the `{` starts a block). Write `({ a } = obj);`.',
          'Over-nesting patterns until they are unreadable — destructure in two steps instead.',
          'Expecting object rest to deep-copy.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Show the `function f({ a = 1 } = {})` pattern and explain both defaults (the inner one for the property, the outer one for the missing argument).'),
      ),
      section('practice', 'Practice',
        text('Write `parsePagination(query)` that destructures `page` and `limit` from `query` (which may be undefined) with string defaults, converts them to numbers, and returns `{ page, limit, offset }`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Objects destructure by name, arrays by position (any iterable).',
          'Rename with `:`, default with `=`, collect with `...`.',
          'Defaults only replace `undefined`.',
          'Destructuring null/undefined throws — default parameters to `{}`.',
        ),
      ),
    ],
    revisionNotes: [
      'const { a: alias = 5 } = obj — rename + default.',
      'Defaults trigger on undefined only, not null.',
      'Array destructuring works on any iterable.',
      'Destructuring null/undefined → TypeError.',
      'function f({ x } = {}) to allow f().',
      '({ a } = obj) needs parentheses when not declaring.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "const { a = 10, b = 20 } = { a: null };\nconsole.log(a, b);",
        options: ['10 20', 'null 20', 'null undefined', '10 undefined'],
        answer: 1,
        explanation: '`a` is `null` (a value, so no default). `b` is missing (`undefined`), so its default 20 applies.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Calling `connect()` with no arguments crashes. Why?',
        code: "function connect({ host = 'localhost', port = 5432 }) {\n  return host + ':' + port;\n}\nconnect();",
        options: [
          'Default values cannot be used in parameters',
          'The parameter itself is undefined, and destructuring undefined throws; add = {}',
          'host must be declared with let',
          'port must be a string',
        ],
        answer: 1,
        explanation: 'Property defaults only work once there is an object to destructure. `function connect({ host = "localhost", port = 5432 } = {})` fixes it.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const [a, [b, c = 3], ...d] = [1, [2], 4, 5];\nconsole.log(a, b, c, d);",
        options: ['1 2 3 [ 4, 5 ]', '1 2 undefined [ 4, 5 ]', '1 [ 2 ] 3 [ 4, 5 ]', '1 2 3 4'],
        answer: 0,
        explanation: 'Nested array pattern pulls 2 from `[2]`; `c` is missing so it defaults to 3; rest collects `[4, 5]`.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Destructuring',
        question: 'What is destructuring, and how do default values work with it?',
        shortAnswer: 'Destructuring is syntax that extracts values from objects (by key) or iterables (by position) into variables; a default after `=` is used only when the extracted value is undefined.',
        detailedAnswer: [
          'Object: `const { id, name: userName = "anon" } = user`.',
          'Array: `const [first, , third] = list`.',
          'Defaults are lazily evaluated and ignore `null`, `0`, `""`.',
          'Supports nesting and rest (`...rest`).',
        ],
        followUp: 'How do you destructure while renaming and providing a default at the same time?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Destructuring',
        question: 'How do you safely destructure nested properties of an input that might be missing, such as a request body?',
        shortAnswer: 'Give each level a default object (`const { a: { b } = {} } = input ?? {}`), default function parameters to `{}`, or use optional chaining for deep reads.',
        detailedAnswer: [
          'Destructuring `undefined`/`null` throws a TypeError at any level.',
          'Parameter default: `function f({ page = 1 } = {})`.',
          'Nested default: `const { address: { city } = {} } = body`.',
          '`null` does not trigger defaults — normalise with `?? {}`.',
          'For untrusted input prefer schema validation (zod/Joi) before destructuring.',
        ],
        followUp: 'When is optional chaining clearer than destructuring?',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'spread-and-rest-operators': {
    summary: 'The same `...` syntax either spreads an iterable/object out into individual elements or properties (spread) or collects remaining items into an array/object (rest) — spread copies are always shallow.',
    topics: ['spread syntax', 'rest parameters', 'rest in destructuring', 'array spread', 'object spread', 'shallow copy', 'merging objects', 'immutability', 'Math.max'],
    sections: [
      section('introduction', undefined,
        text('`...` appears in two opposite roles. In a function **call** or a literal it **spreads** values out; in a function **parameter list** or a destructuring pattern it **collects** them. Same three dots, opposite directions.'),
      ),
      section('definition', 'Spread vs rest',
        table('Spread vs rest', ['', 'Spread', 'Rest'], [
          ['Where', 'Array literal, object literal, function call', 'Function parameters, destructuring patterns'],
          ['Direction', 'Expands one value into many', 'Gathers many values into one'],
          ['Example', '`fn(...args)`, `[...a, ...b]`, `{ ...defaults, ...opts }`', '`function f(...args)`, `const [h, ...t] = arr`'],
          ['Position', 'Anywhere, multiple times', 'Must be last, only once'],
          ['Works on', 'Arrays: any iterable. Objects: any value (own enumerable props)', '—'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Immutable updates: `{ ...state, user: newUser }` instead of mutating.',
          'Merging config: defaults ← file config ← env overrides.',
          'Variadic functions: `log(level, ...messages)`.',
          'Replaces `apply`: `Math.max(...numbers)`.',
        ),
      ),
      section('internals', 'How the engine evaluates it',
        bullets(
          '**Array spread** `[...x]` calls `x[Symbol.iterator]()` and pushes each value. Non-iterables (including `null`, `undefined`, plain objects) throw a TypeError.',
          '**Object spread** `{...x}` copies **own enumerable** properties (string and symbol keys) using `[[Get]]` — getters are invoked and their *values* copied. `null`/`undefined` are silently ignored.',
          'Object spread **defines** properties on the new object (like `Object.defineProperty`), so setters on the target are not triggered — a difference from `Object.assign`, which **sets**.',
          'Later properties win; key order follows first appearance.',
          'Prototype and non-enumerable properties (like class methods) are not copied.',
          'Spreading very large arrays into a call (`fn(...hugeArray)`) can exceed the maximum argument count / stack size.',
        ),
      ),
      section('example', 'Spread',
        code({
          title: 'Arrays, strings and objects',
          code: dedent(`
            const base = [1, 2];
            const more = [...base, 3, ...[4, 5]];
            console.log(more);
            console.log(Math.max(...more));
            console.log([...'hey']);
            const defaults = { port: 3000, host: 'localhost', debug: false };
            const env = { port: 8080, debug: true };
            console.log({ ...defaults, ...env });
            console.log({ ...env, ...defaults });
          `),
          expectedOutput: "[ 1, 2, 3, 4, 5 ]\n5\n[ 'h', 'e', 'y' ]\n{ port: 8080, host: 'localhost', debug: true }\n{ port: 3000, debug: false, host: 'localhost' }",
          explanation: [
            'Array spread flattens one level of each iterable into the new array.',
            '`Math.max(...more)` passes each element as a separate argument.',
            'In object merges, **later wins**: put overrides last.',
            'Key order follows first appearance — in the second merge `port` and `debug` came from `env` first.',
          ],
          runnable: true,
        }),
        code({
          title: 'Spread copies are shallow',
          code: dedent(`
            const state = { user: { name: 'ana' }, tags: ['a'] };
            const copy = { ...state };
            copy.user.name = 'changed';
            copy.tags = [...copy.tags, 'b'];
            console.log(state.user.name, state.tags);
            const updated = { ...state, user: { ...state.user, name: 'immutable' } };
            console.log(state.user.name, updated.user.name);
          `),
          expectedOutput: "changed [ 'a' ]\nchanged immutable",
          explanation: [
            '`copy.user` is the same object as `state.user`, so mutating it leaks into `state`.',
            'Replacing `copy.tags` with a new array does not affect `state.tags`.',
            'For nested immutable updates, spread each level you change.',
          ],
          runnable: true,
        }),
        code({
          title: 'Edge cases',
          code: dedent(`
            console.log({ ...null, ...undefined, ...'hi', ...[9] });
            try {
              [...undefined];
            } catch (e) {
              console.log(e.name);
            }
            class Point {
              constructor() { this.x = 1; }
              norm() { return 1; }
            }
            const p = { ...new Point() };
            console.log(p, typeof p.norm);
          `),
          expectedOutput: "{ '0': 9, '1': 'i' }\nTypeError\n{ x: 1 } undefined",
          explanation: [
            'Object spread ignores `null`/`undefined`; a string spreads its characters as index keys; `[9]` then overwrites key `0`.',
            'Array spread needs an iterable — `undefined` throws.',
            'Class methods live on the prototype and are not copied; the result is a plain object.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Rest',
        code({
          title: 'Rest parameters and rest in patterns',
          code: dedent(`
            function log(level, ...messages) {
              console.log('[' + level + ']', messages.join(' | '), messages.length);
            }
            log('info', 'server', 'started');
            log('warn', 'disk');
            const [head, ...tail] = [1, 2, 3];
            const { id, ...fields } = { id: 9, name: 'x', active: true };
            console.log(head, tail, id, fields);
          `),
          expectedOutput: "[info] server | started 2\n[warn] disk 1\n1 [ 2, 3 ] 9 { name: 'x', active: true }",
          explanation: [
            'Rest parameters always produce a real array (empty if no extra args).',
            'Rest must be the last item in a parameter list or pattern.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Layered configuration',
        code({
          title: 'defaults ← file ← environment',
          code: dedent(`
            const defaults = { port: 3000, db: { pool: 10, host: 'localhost' } };
            const fileConfig = { db: { host: 'db.internal' } };
            const envConfig = { port: 8080 };

            const shallow = { ...defaults, ...fileConfig, ...envConfig };
            console.log(shallow.db);

            const merged = {
              ...defaults,
              ...fileConfig,
              ...envConfig,
              db: { ...defaults.db, ...fileConfig.db },
            };
            console.log(merged);
          `),
          expectedOutput: "{ host: 'db.internal' }\n{ port: 8080, db: { pool: 10, host: 'db.internal' } }",
          explanation: [
            'A shallow merge **replaces** the whole `db` object — `pool` is lost.',
            'Merge nested sections explicitly (or use a deep-merge helper that guards against `__proto__`).',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Treating spread as a deep clone.',
          'Wrong merge order: `{ ...overrides, ...defaults }` lets defaults win.',
          'Spreading huge arrays into function calls (`Math.max(...millionItems)`) → RangeError; use `reduce`.',
          'Expecting class instances to keep methods after `{ ...instance }`.',
          'Putting rest anywhere but last: `function f(...a, b)` is a SyntaxError.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Define both in one sentence: "spread expands, rest collects; same syntax, decided by position."'),
        interviewTip('Mention that object spread uses define semantics while `Object.assign` uses set semantics (setters are triggered by assign).'),
      ),
      section('practice', 'Practice',
        text('Write `updateUser(state, id, changes)` that returns a new state where `state.users` (an array) has the user with `id` merged with `changes` — without mutating anything.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Spread expands iterables/objects; rest gathers into an array/object.',
          'Object merges: later keys win.',
          'Spread is shallow; nested data needs per-level spreads or `structuredClone`.',
          'Array spread needs iterables; object spread ignores null/undefined.',
        ),
      ),
    ],
    revisionNotes: [
      'Spread: fn(...arr), [...a, ...b], { ...a, ...b }. Rest: (...args), [h, ...t], { a, ...rest }.',
      'Later properties override earlier ones.',
      'Shallow copy only.',
      '[...null] throws; { ...null } is {}.',
      'Prototype/non-enumerable props are not copied by object spread.',
      'Rest must be last.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "const a = { x: 1, y: 2 };\nconst b = { ...a, x: 10 };\nconsole.log(a.x, b.x, b.y);",
        options: ['10 10 2', '1 10 2', '1 1 2', '1 10 undefined'],
        answer: 1,
        explanation: '`b` is a new object; the later `x: 10` overrides the spread value. `a` is not changed.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const orig = { list: [1] };\nconst copy = { ...orig };\ncopy.list.push(2);\nconsole.log(orig.list);",
        options: ['[ 1 ]', '[ 1, 2 ]', '[ 2 ]', 'TypeError'],
        answer: 1,
        explanation: 'Spread is shallow: `copy.list` and `orig.list` reference the same array.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which line uses rest (not spread)?',
        options: ['Math.max(...nums)', 'const all = [...a, ...b]', 'function sum(...nums) {}', 'const c = { ...defaults }'],
        answer: 2,
        explanation: 'In a parameter list, `...nums` collects arguments into an array — that is rest. The others expand values — spread.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Spread/rest',
        question: 'What is the difference between the spread and rest operators?',
        shortAnswer: 'Both use `...`; spread expands an iterable or object into individual elements/properties, while rest collects multiple elements or arguments into a single array or object.',
        detailedAnswer: [
          'Spread appears in calls and literals: `f(...args)`, `[...a]`, `{ ...o }`.',
          'Rest appears in parameter lists and destructuring patterns: `(...args)`, `[x, ...others]`.',
          'Rest must be last and appear once.',
          'Rest parameters replace the `arguments` object.',
        ],
        followUp: 'Can you use rest in object destructuring?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Spread/rest',
        question: 'When merging objects with spread, what happens to duplicate keys, nested objects, getters and prototype methods?',
        shortAnswer: 'Later keys win; nested objects are copied by reference (shallow); getters are invoked and their values copied; prototype and non-enumerable properties (like class methods) are not copied.',
        detailedAnswer: [
          'Key order follows first appearance, value follows last assignment.',
          'Only own enumerable string and symbol keys are copied.',
          'Spread defines properties, so target setters are not triggered (unlike Object.assign).',
          'The result is always a plain object with `Object.prototype` as its prototype.',
          'Deep merging needs a recursive helper — guard against `__proto__` keys.',
        ],
        followUp: 'How does Object.assign differ from object spread?',
      },
    ],
  },
};

export default content;

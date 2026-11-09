import type { ModuleContent } from '../../../types';
import basics from './basics';
import functions from './functions';
import objects from './objects';
import collections from './collections';
import asyncLessons from './async';

// m01 — JavaScript Foundations for Node.js
// basics:      execution, var/let/const, types, coercion, operators
// functions:   functions, arrows, scope & closures, hoisting, this
// objects:     objects & prototypes, classes, arrays, destructuring, spread/rest
// collections: Map/Set/Weak*, error handling, ES6+ features
// async:       promises, async/await, event loop fundamentals
const content = {
  ...basics,
  ...functions,
  ...objects,
  ...collections,
  ...asyncLessons,
} as ModuleContent;

export default content;

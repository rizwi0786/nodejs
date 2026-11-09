import type { ModuleContent } from '../../../types';
import runtimeInternals from './runtime-internals';
import memoryAndThreads from './memory-and-threads';
import scaling from './scaling';
import performance from './performance';
import asyncSystems from './async-systems';
import operations from './operations';

// Module 11 — Advanced Node.js (24 lessons), split by theme.
const content = {
  ...runtimeInternals,
  ...memoryAndThreads,
  ...scaling,
  ...performance,
  ...asyncSystems,
  ...operations,
} as ModuleContent;

export default content;

import type { ModuleContent } from '../../../types';
import modulesBasics from './modules-basics';
import modulesInterop from './modules-interop';
import fsPathOs from './fs-path-os';
import httpHttpsEvents from './http-https-events';
import urlCryptoUtil from './url-crypto-util';
import streamBufferProcess from './stream-buffer-process';
import childWorker from './child-worker';

// Module m03 — Node.js Core Modules (20 lessons)
const content = {
  ...modulesBasics,
  ...modulesInterop,
  ...fsPathOs,
  ...httpHttpsEvents,
  ...urlCryptoUtil,
  ...streamBufferProcess,
  ...childWorker,
} as ModuleContent;

export default content;

import type { ModuleContent } from '../../../types';
import intro from './intro';
import landscape from './landscape';
import setup from './setup';
import architecture from './architecture';
import concurrency from './concurrency';

const content = {
  ...intro,
  ...landscape,
  ...setup,
  ...architecture,
  ...concurrency,
} as ModuleContent;

export default content;

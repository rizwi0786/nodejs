import type { ModuleContent } from '../../../types';
import architecture from './architecture';
import principles from './principles';
import patterns from './patterns';
import behavioral from './behavioral';
import systems from './systems';
import distributed from './distributed';

const content = {
  ...architecture,
  ...principles,
  ...patterns,
  ...behavioral,
  ...systems,
  ...distributed,
} as ModuleContent;

export default content;

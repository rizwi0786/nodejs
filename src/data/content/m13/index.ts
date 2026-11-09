import type { ModuleContent } from '../../../types';
import fundamentals from './fundamentals';
import runners from './runners';
import doublesCoverage from './doubles-coverage';
import debugging from './debugging';
import observability from './observability';

const content = {
  ...fundamentals,
  ...runners,
  ...doublesCoverage,
  ...debugging,
  ...observability,
} as ModuleContent;
export default content;

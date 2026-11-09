import type { ModuleContent } from '../../../types';
import basics from './basics';
import tokens from './tokens';
import access from './access';
import flows from './flows';

const content = {
  ...basics,
  ...tokens,
  ...access,
  ...flows,
} as ModuleContent;

export default content;

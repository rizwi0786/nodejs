import type { ModuleContent } from '../../../types';
import npmBasics from './npm-basics';
import dependencies from './dependencies';
import lifecycle from './lifecycle';
import publishing from './publishing';

const content = {
  ...npmBasics,
  ...dependencies,
  ...lifecycle,
  ...publishing,
} as ModuleContent;

export default content;

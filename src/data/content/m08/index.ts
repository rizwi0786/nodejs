import type { ModuleContent } from '../../../types';
import basics from './basics';
import request from './request';
import middleware from './middleware';
import structure from './structure';
import production from './production';

const content = {
  ...basics,
  ...request,
  ...middleware,
  ...structure,
  ...production,
} as ModuleContent;

export default content;

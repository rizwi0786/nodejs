import type { ModuleContent } from '../../../types';
import httpBasics from './http-basics';
import requestParts from './request-parts';
import rest from './rest';
import apiOps from './api-ops';

const content = {
  ...httpBasics,
  ...requestParts,
  ...rest,
  ...apiOps,
} as ModuleContent;

export default content;

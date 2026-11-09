import type { ModuleContent } from '../../../types';
import injection from './injection';
import webAttacks from './web-attacks';
import accessValidation from './access-validation';
import headersLimitsCookies from './headers-limits-cookies';
import secretsDeps from './secrets-deps';
import apiTls from './api-tls';

const content = {
  ...injection,
  ...webAttacks,
  ...accessValidation,
  ...headersLimitsCookies,
  ...secretsDeps,
  ...apiTls,
} as ModuleContent;
export default content;

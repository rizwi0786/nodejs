import type { ModuleContent } from '../../../types';
import environments from './environments';
import docker from './docker';
import cicd from './cicd';
import nginx from './nginx';
import scaling from './scaling';
import operations from './operations';
import observability from './observability';

const content = {
  ...environments,
  ...docker,
  ...cicd,
  ...nginx,
  ...scaling,
  ...operations,
  ...observability,
} as ModuleContent;

export default content;

import type { ModuleContent } from '../../../types';
import sqlBasics from './sql-basics';
import postgresRuntime from './postgres-runtime';
import securityNosql from './security-nosql';
import mongodbMongoose from './mongodb-mongoose';
import mongodbAdvanced from './mongodb-advanced';
import ormArchitecture from './orm-architecture';

// Module 9 — Database Integration
const content = {
  ...sqlBasics,
  ...postgresRuntime,
  ...securityNosql,
  ...mongodbMongoose,
  ...mongodbAdvanced,
  ...ormArchitecture,
} as ModuleContent;

export default content;

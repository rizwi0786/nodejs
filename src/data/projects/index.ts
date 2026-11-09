import type { Project } from '../../types';
import { p01 } from './p01-cli-task-manager';
import { p02 } from './p02-file-manager';
import { p03 } from './p03-simple-http-server';
import { p04 } from './p04-blog-rest-api';
import { p05 } from './p05-authentication-system';
import { p06 } from './p06-employee-management-api';
import { p07 } from './p07-ecommerce-rest-api';
import { p08 } from './p08-realtime-chat';
import { p09 } from './p09-notification-service';
import { p10 } from './p10-background-jobs';
import { p11 } from './p11-url-shortener';
import { p12 } from './p12-production-ecommerce';

// Module 16 — Real-World Projects.
// Progression: p01–p03 Node core only · p04–p07 Express + databases + auth ·
// p08–p12 real-time, queues, caching and production concerns.
export const projects: Project[] = [p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11, p12];

export { p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11, p12 };

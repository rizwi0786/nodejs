import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p06: Project = {
  id: 'p06',
  number: 6,
  level: 'intermediate',
  title: 'Employee Management API',
  status: 'ready',
  summary: 'Departments, employees and leave requests on Express 5 + Prisma/PostgreSQL with role- and permission-based access, resource-level ownership rules, transactional leave approval and an audit log.',
  skills: ['RBAC + permissions', 'Prisma', 'Interactive transactions', 'Layered architecture', 'Field-level access', 'Audit logging', 'Integration testing'],
  estHours: 14,
  prerequisites: [
    'm10-role-based-access-control',
    'm10-permission-based-access',
    'm10-authentication-middleware',
    'm09-prisma',
    'm09-transactions',
    'm12-broken-access-control',
    'm15-layered-architecture',
    'm13-integration-testing',
  ],
  requirements: {
    functional: [
      'Roles: `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`, each mapped to a set of permissions (`employee:write`, `leave:approve`…).',
      'HR creates employees (with a login account and yearly leave balances in one transaction), updates and terminates them.',
      'Managers see and approve/reject leave only for their **direct reports**; employees see only themselves.',
      'Salary is returned only to HR/ADMIN (field-level authorisation).',
      'Employees request leave: working days calculated, overlaps rejected, balance checked.',
      'Approval decrements the balance atomically; double approval or insufficient balance returns `409`.',
      'Every write (create/update/approve/reject/terminate) is recorded in `audit_logs` with before/after JSON.',
      'List endpoints filter by department, status and search text, with pagination.',
    ],
    nonFunctional: [
      'Authorisation enforced in two places: route-level `authorize(permission)` + service-level resource checks.',
      'Approval is race-safe under concurrent requests (conditional `updateMany` inside an interactive transaction).',
      'Migrations managed by `prisma migrate`; seed script for local data.',
      'Integration tests run against a real Postgres in CI.',
      'Consistent error format; `403` for "authenticated but not allowed", `404` for resources outside your scope where existence should not leak.',
    ],
  },
  architecture: {
    diagramId: 'middleware-pipeline',
    flow: [
      { label: 'requireAuth', detail: 'JWT → req.user { id, role, employeeId }' },
      { label: 'authorize(perm)', detail: 'role → permissions map' },
      { label: 'validate(zod)', detail: 'params / query / body' },
      { label: 'Controller', detail: 'HTTP mapping' },
      { label: 'Service', detail: 'scope checks, rules, $transaction' },
      { label: 'Prisma → Postgres', detail: 'repository via Prisma Client' },
    ],
    notes: [
      'Permissions live in one module (`permissions.js`). Routes ask "can this role do X?", never "is this an admin?".',
      'Resource scope ("is this my report?") needs data, so it lives in the service, next to the query.',
      'Prisma Client is the repository layer here; services receive `prisma` (or a `tx`) so they can join a transaction.',
      'Audit entries are written inside the same transaction as the change — no change without its audit row.',
    ],
  },
  folderStructure: dedent(`
    employee-api/
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seed.js
    ├── src/
    │   ├── app.js / server.js
    │   ├── db.js                     # PrismaClient singleton
    │   ├── auth/
    │   │   ├── permissions.js        # role -> permissions, can()
    │   │   ├── authorize.js          # authorize(...perms) middleware
    │   │   └── require-auth.js
    │   ├── modules/
    │   │   ├── departments/ (routes, controller, service, schema)
    │   │   ├── employees/   (routes, controller, service, schema, serializer)
    │   │   ├── leave/       (routes, controller, service, schema, working-days.js)
    │   │   └── audit/       (audit.service.js, routes)
    │   └── middleware/{validate.js,error-handler.js}
    └── test/
        ├── permissions.test.js
        └── leave.test.js
  `),
  databaseDesign: [
    entity('users', [
      ['id', 'SERIAL', 'PK', ''],
      ['email', 'TEXT', 'UNIQUE NOT NULL', ''],
      ['password_hash', 'TEXT', 'NOT NULL', 'bcrypt'],
      ['role', 'Role enum', "NOT NULL DEFAULT 'EMPLOYEE'", 'ADMIN | HR | MANAGER | EMPLOYEE'],
      ['employee_id', 'INT', 'UNIQUE NULL FK employees', 'Login ↔ employee record'],
    ]),
    entity('departments', [
      ['id', 'SERIAL', 'PK', ''],
      ['name', 'TEXT', 'UNIQUE NOT NULL', ''],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
    ]),
    entity('employees', [
      ['id', 'SERIAL', 'PK', ''],
      ['first_name / last_name', 'TEXT', 'NOT NULL', ''],
      ['email', 'TEXT', 'UNIQUE NOT NULL', 'Work email'],
      ['job_title', 'TEXT', 'NOT NULL', ''],
      ['salary', 'DECIMAL(12,2)', 'NOT NULL', 'Visible to HR/ADMIN only'],
      ['hire_date', 'DATE', 'NOT NULL', ''],
      ['status', 'EmployeeStatus enum', "DEFAULT 'ACTIVE'", 'ACTIVE | ON_LEAVE | TERMINATED (soft delete)'],
      ['department_id', 'INT', 'NOT NULL FK departments ON DELETE RESTRICT', 'Index'],
      ['manager_id', 'INT', 'NULL FK employees (self)', 'Index — "direct reports" queries'],
    ]),
    entity('leave_balances', [
      ['employee_id', 'INT', 'FK employees ON DELETE CASCADE', 'PK (employee_id, year, type)'],
      ['year', 'INT', 'NOT NULL', ''],
      ['type', 'LeaveType enum', 'NOT NULL', 'ANNUAL | SICK | UNPAID'],
      ['allowance', 'INT', 'NOT NULL', 'Days granted'],
      ['remaining', 'INT', 'NOT NULL CHECK (remaining >= 0)', 'Decremented on approval'],
    ]),
    entity('leave_requests', [
      ['id', 'SERIAL', 'PK', ''],
      ['employee_id', 'INT', 'NOT NULL FK employees', 'Index (employee_id, status)'],
      ['type', 'LeaveType enum', 'NOT NULL', ''],
      ['start_date / end_date', 'DATE', 'NOT NULL, end >= start', ''],
      ['days', 'INT', 'NOT NULL > 0', 'Working days, computed server-side'],
      ['reason', 'TEXT', 'NULL', ''],
      ['status', 'LeaveStatus enum', "DEFAULT 'PENDING'", 'PENDING | APPROVED | REJECTED | CANCELLED'],
      ['reviewer_id', 'INT', 'NULL FK employees', ''],
      ['reviewed_at', 'TIMESTAMPTZ', 'NULL', ''],
    ]),
    entity('audit_logs', [
      ['id', 'BIGSERIAL', 'PK', ''],
      ['actor_id', 'INT', 'NOT NULL FK users', ''],
      ['action', 'TEXT', 'NOT NULL', 'e.g. `leave.approve`'],
      ['entity / entity_id', 'TEXT / TEXT', 'NOT NULL', 'Index (entity, entity_id)'],
      ['before / after', 'JSONB', 'NULL', 'Snapshots (salary included — table is ADMIN-only)'],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
    ]),
  ],
  endpoints: [
    { method: 'POST', path: '/api/v1/auth/login', description: 'Login (reuse the p05 auth module).', auth: 'public' },
    { method: 'GET', path: '/api/v1/departments', description: 'List departments with headcount.', auth: 'department:read' },
    { method: 'POST', path: '/api/v1/departments', description: 'Create department.', auth: 'HR, ADMIN' },
    { method: 'DELETE', path: '/api/v1/departments/:id', description: '409 if it still has employees.', auth: 'ADMIN' },
    { method: 'GET', path: '/api/v1/employees?departmentId=&status=&q=&page=', description: 'HR/ADMIN: all; MANAGER: direct reports.', auth: 'employee:read' },
    { method: 'GET', path: '/api/v1/employees/me', description: 'Own profile and leave balances.', auth: 'any role' },
    { method: 'GET', path: '/api/v1/employees/:id', description: 'One employee (salary only for HR/ADMIN).', auth: 'employee:read (scoped)' },
    { method: 'POST', path: '/api/v1/employees', description: 'Create employee + user + balances (transaction).', auth: 'HR, ADMIN' },
    { method: 'PATCH', path: '/api/v1/employees/:id', description: 'Update fields, department, manager, salary.', auth: 'HR, ADMIN' },
    { method: 'DELETE', path: '/api/v1/employees/:id', description: 'Soft-terminate (status = TERMINATED).', auth: 'ADMIN' },
    { method: 'POST', path: '/api/v1/leave-requests', description: 'Request leave for yourself.', auth: 'leave:create' },
    { method: 'GET', path: '/api/v1/leave-requests?status=PENDING', description: 'Own / team / all, depending on role.', auth: 'any role (scoped)' },
    { method: 'POST', path: '/api/v1/leave-requests/:id/approve', description: 'Approve + decrement balance.', auth: 'manager of employee, HR' },
    { method: 'POST', path: '/api/v1/leave-requests/:id/reject', description: 'Reject with a comment.', auth: 'manager of employee, HR' },
    { method: 'POST', path: '/api/v1/leave-requests/:id/cancel', description: 'Owner cancels a pending request.', auth: 'owner' },
    { method: 'GET', path: '/api/v1/audit-logs?entity=&entityId=', description: 'Audit trail.', auth: 'ADMIN' },
  ],
  steps: [
    {
      title: 'Model the domain in Prisma',
      bullets: [
        'Install `prisma` (dev) and `@prisma/client` (third-party). `npx prisma init`, write the schema, `npx prisma migrate dev --name init`.',
        'Self-relation for `manager`/`reports` needs a named relation.',
        'Add the `CHECK (remaining >= 0)` constraint by editing the generated SQL migration — Prisma has no check-constraint syntax.',
      ],
      code: {
        id: 'p06-s1',
        title: 'prisma/schema.prisma',
        language: 'text',
        code: dedent(`
          generator client {
            provider = "prisma-client-js"
          }

          datasource db {
            provider = "postgresql"
            url      = env("DATABASE_URL")
          }

          enum Role {
            ADMIN
            HR
            MANAGER
            EMPLOYEE
          }

          enum EmployeeStatus {
            ACTIVE
            ON_LEAVE
            TERMINATED
          }

          enum LeaveType {
            ANNUAL
            SICK
            UNPAID
          }

          enum LeaveStatus {
            PENDING
            APPROVED
            REJECTED
            CANCELLED
          }


          model User {
            id           Int       @id @default(autoincrement())
            email        String    @unique
            passwordHash String    @map("password_hash")
            role         Role      @default(EMPLOYEE)
            employeeId   Int?      @unique @map("employee_id")
            employee     Employee? @relation(fields: [employeeId], references: [id])
            auditLogs    AuditLog[]
            @@map("users")
          }

          model Department {
            id        Int        @id @default(autoincrement())
            name      String     @unique
            employees Employee[]
            createdAt DateTime   @default(now()) @map("created_at")
            @@map("departments")
          }

          model Employee {
            id            Int            @id @default(autoincrement())
            firstName     String         @map("first_name")
            lastName      String         @map("last_name")
            email         String         @unique
            jobTitle      String         @map("job_title")
            salary        Decimal        @db.Decimal(12, 2)
            hireDate      DateTime       @db.Date @map("hire_date")
            status        EmployeeStatus @default(ACTIVE)
            departmentId  Int            @map("department_id")
            department    Department     @relation(fields: [departmentId], references: [id], onDelete: Restrict)
            managerId     Int?           @map("manager_id")
            manager       Employee?      @relation("Reports", fields: [managerId], references: [id])
            reports       Employee[]     @relation("Reports")
            user          User?
            leaveRequests LeaveRequest[] @relation("Requester")
            reviewed      LeaveRequest[] @relation("Reviewer")
            balances      LeaveBalance[]
            @@index([departmentId])
            @@index([managerId])
            @@map("employees")
          }

          model LeaveBalance {
            employeeId Int       @map("employee_id")
            employee   Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
            year       Int
            type       LeaveType
            allowance  Int
            remaining  Int
            @@id([employeeId, year, type])
            @@map("leave_balances")
          }

          model LeaveRequest {
            id         Int         @id @default(autoincrement())
            employeeId Int         @map("employee_id")
            employee   Employee    @relation("Requester", fields: [employeeId], references: [id])
            type       LeaveType
            startDate  DateTime    @db.Date @map("start_date")
            endDate    DateTime    @db.Date @map("end_date")
            days       Int
            reason     String?
            status     LeaveStatus @default(PENDING)
            reviewerId Int?        @map("reviewer_id")
            reviewer   Employee?   @relation("Reviewer", fields: [reviewerId], references: [id])
            reviewedAt DateTime?   @map("reviewed_at")
            createdAt  DateTime    @default(now()) @map("created_at")
            @@index([employeeId, status])
            @@map("leave_requests")
          }

          model AuditLog {
            id        BigInt   @id @default(autoincrement())
            actorId   Int      @map("actor_id")
            actor     User     @relation(fields: [actorId], references: [id])
            action    String
            entity    String
            entityId  String   @map("entity_id")
            before    Json?
            after     Json?
            createdAt DateTime @default(now()) @map("created_at")
            @@index([entity, entityId])
            @@map("audit_logs")
          }
        `),
        versionNote: 'Prisma 5/6 (`prisma-client-js` generator).',
      },
    },
    {
      title: 'Permissions: one source of truth',
      bullets: [
        'Map roles → permissions; check permissions, not role names, in routes.',
        '`authorize(...perms)` passes if the role has **any** of the listed permissions; the service narrows the scope afterwards.',
      ],
      code: {
        id: 'p06-s2',
        title: 'src/auth/permissions.js + src/auth/authorize.js',
        language: 'javascript',
        code: dedent(`
          // permissions.js
          export const PERMISSIONS = Object.freeze({
            ADMIN: ['*'],
            HR: [
              'department:read', 'department:write',
              'employee:read', 'employee:write', 'employee:read_salary',
              'leave:create', 'leave:read_all', 'leave:review_all',
            ],
            MANAGER: ['department:read', 'employee:read', 'leave:create', 'leave:read_team', 'leave:review_team'],
            EMPLOYEE: ['department:read', 'leave:create'],
          });

          export function can(role, permission) {
            const granted = PERMISSIONS[role] ?? [];
            return granted.includes('*') || granted.includes(permission);
          }

          // authorize.js
          import { ForbiddenError } from '../errors.js';

          export const authorize = (...permissions) => (req, res, next) => {
            if (!req.user) return next(new ForbiddenError());
            if (permissions.some((p) => can(req.user.role, p))) return next();
            next(new ForbiddenError(\`Requires one of: \${permissions.join(', ')}\`));
          };
        `),
      },
    },
    {
      title: 'Scope queries by role (resource-level authorisation)',
      bullets: [
        'Build a Prisma `where` fragment from the user: HR sees all, a manager only `managerId = me`.',
        'For `GET /employees/:id` outside your scope answer `404` — do not confirm the record exists.',
        'Serialize through one function that drops `salary` unless `employee:read_salary`.',
      ],
      code: {
        id: 'p06-s3',
        title: 'modules/employees/employees.service.js',
        language: 'javascript',
        code: dedent(`
          import { prisma } from '../../db.js';
          import { can } from '../../auth/permissions.js';
          import { NotFoundError } from '../../errors.js';

          export function employeeScope(user) {
            if (can(user.role, 'employee:read_salary')) return {}; // HR / ADMIN: everyone
            if (user.role === 'MANAGER') return { OR: [{ managerId: user.employeeId }, { id: user.employeeId }] };
            return { id: user.employeeId }; // EMPLOYEE: only self
          }

          export function serialize(user, employee) {
            const { salary, ...rest } = employee;
            return can(user.role, 'employee:read_salary') ? { ...rest, salary: salary.toString() } : rest;
          }

          export async function list(user, { departmentId, status, q, page, limit }) {
            const where = {
              AND: [
                employeeScope(user),
                departmentId ? { departmentId } : {},
                status ? { status } : {},
                q
                  ? { OR: ['firstName', 'lastName', 'email'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) }
                  : {},
              ],
            };
            const [items, total] = await prisma.$transaction([
              prisma.employee.findMany({
                where,
                include: { department: { select: { id: true, name: true } } },
                orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
              }),
              prisma.employee.count({ where }),
            ]);
            return { items: items.map((e) => serialize(user, e)), total };
          }

          export async function getById(user, id) {
            const employee = await prisma.employee.findFirst({ where: { AND: [{ id }, employeeScope(user)] } });
            if (!employee) throw new NotFoundError('Employee not found');
            return serialize(user, employee);
          }
        `),
      },
    },
    {
      title: 'Create an employee with nested writes',
      bullets: [
        'One `prisma.employee.create` with nested `user` and `balances` runs as a single transaction automatically.',
        'Generate a temporary password and send an invite (reuse p05\'s reset flow) instead of returning a password.',
      ],
      code: {
        id: 'p06-s4',
        title: 'employees.service.js — create()',
        language: 'javascript',
        code: dedent(`
          import bcrypt from 'bcrypt';
          import { randomBytes } from 'node:crypto';
          import { prisma } from '../../db.js';
          import { audit } from '../audit/audit.service.js';

          const DEFAULT_ALLOWANCE = { ANNUAL: 25, SICK: 10, UNPAID: 30 };

          export async function create(actor, input) {
            const year = new Date().getUTCFullYear();
            const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 12);

            return prisma.$transaction(async (tx) => {
              const { role = 'EMPLOYEE', ...fields } = input; // zod-validated: names, email, jobTitle, salary, hireDate, departmentId, managerId, role
              const employee = await tx.employee.create({
                data: {
                  ...fields,
                  user: { create: { email: fields.email, passwordHash, role } },
                  balances: {
                    create: Object.entries(DEFAULT_ALLOWANCE).map(([type, days]) => ({
                      year,
                      type,
                      allowance: days,
                      remaining: days,
                    })),
                  },
                },
              });
              await audit(tx, actor, 'employee.create', 'employee', employee.id, null, employee);
              return employee;
            });
          }
        `),
      },
    },
    {
      title: 'Request leave: working days and overlap check',
      bullets: [
        'Compute days server-side (never trust a client-sent `days`).',
        'Overlap rule: an existing PENDING/APPROVED request where `start <= newEnd AND end >= newStart`.',
        'Check the balance at request time for fast feedback; it is enforced again at approval.',
      ],
      code: {
        id: 'p06-s5',
        title: 'modules/leave/working-days.js + leave.service.js — request()',
        language: 'javascript',
        code: dedent(`
          import { prisma } from '../../db.js';
          import { ConflictError, BadRequestError } from '../../errors.js';

          export function workingDays(start, end) {
            let days = 0;
            for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
              const dow = d.getUTCDay();
              if (dow !== 0 && dow !== 6) days++;
            }
            return days;
          }

          export async function requestLeave(user, { type, startDate, endDate, reason }) {
            if (endDate < startDate) throw new BadRequestError('endDate must be on or after startDate');
            if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
              throw new BadRequestError('Split leave that crosses a year boundary');
            }
            const days = workingDays(startDate, endDate);
            if (days === 0) throw new BadRequestError('Range contains no working days');

            const overlap = await prisma.leaveRequest.findFirst({
              where: {
                employeeId: user.employeeId,
                status: { in: ['PENDING', 'APPROVED'] },
                startDate: { lte: endDate },
                endDate: { gte: startDate },
              },
            });
            if (overlap) throw new ConflictError(\`Overlaps leave request #\${overlap.id}\`);

            const balance = await prisma.leaveBalance.findUnique({
              where: { employeeId_year_type: { employeeId: user.employeeId, year: startDate.getUTCFullYear(), type } },
            });
            if (!balance || balance.remaining < days) throw new ConflictError('Insufficient leave balance');

            return prisma.leaveRequest.create({
              data: { employeeId: user.employeeId, type, startDate, endDate, days, reason },
            });
          }
        `),
      },
    },
    {
      title: 'Approve leave inside an interactive transaction',
      bullets: [
        '**Claim** the request first: `updateMany({ where: { id, status: \'PENDING\' } })`. If `count === 0`, someone else already reviewed it → `409`.',
        'Then decrement the balance with a conditional `updateMany({ remaining: { gte: days } })`; `count === 0` → insufficient → throw, which rolls back the claim.',
        'Both statements are row-level atomic in Postgres, so two concurrent approvals cannot double-spend the balance.',
        'Scope rule: HR can review anyone; a manager only their direct reports; nobody approves their own leave.',
      ],
      code: {
        id: 'p06-s6',
        title: 'leave.service.js — approve()',
        language: 'javascript',
        code: dedent(`
          import { prisma } from '../../db.js';
          import { can } from '../../auth/permissions.js';
          import { audit } from '../audit/audit.service.js';
          import { ConflictError, ForbiddenError, NotFoundError } from '../../errors.js';

          function assertCanReview(user, leave) {
            if (leave.employeeId === user.employeeId) throw new ForbiddenError('You cannot review your own leave');
            if (can(user.role, 'leave:review_all')) return;
            if (can(user.role, 'leave:review_team') && leave.employee.managerId === user.employeeId) return;
            throw new NotFoundError('Leave request not found'); // outside scope: do not leak existence
          }

          export async function approve(user, id) {
            return prisma.$transaction(async (tx) => {
              const leave = await tx.leaveRequest.findUnique({
                where: { id },
                include: { employee: { select: { managerId: true } } },
              });
              if (!leave) throw new NotFoundError('Leave request not found');
              assertCanReview(user, leave);

              const claimed = await tx.leaveRequest.updateMany({
                where: { id, status: 'PENDING' },
                data: { status: 'APPROVED', reviewerId: user.employeeId, reviewedAt: new Date() },
              });
              if (claimed.count === 0) throw new ConflictError(\`Leave request is already \${leave.status.toLowerCase()}\`);

              if (leave.type !== 'UNPAID') {
                const debited = await tx.leaveBalance.updateMany({
                  where: {
                    employeeId: leave.employeeId,
                    year: leave.startDate.getUTCFullYear(),
                    type: leave.type,
                    remaining: { gte: leave.days },
                  },
                  data: { remaining: { decrement: leave.days } },
                });
                if (debited.count === 0) throw new ConflictError('Insufficient leave balance'); // rolls back the claim
              }

              const updated = await tx.leaveRequest.findUniqueOrThrow({ where: { id } });
              await audit(tx, user, 'leave.approve', 'leave_request', id, leave, updated);
              return updated;
            });
          }
        `),
        versionNote: 'Interactive `$transaction(async (tx) => …)` is GA since Prisma 4.7. Default timeout 5 s — keep work inside short.',
      },
    },
    {
      title: 'Audit log helper and routes',
      bullets: [
        '`audit(tx, …)` takes the transaction client so the audit row commits or rolls back with the change.',
        'Routes combine `requireAuth` → `authorize` → `validate` → controller.',
      ],
      code: {
        id: 'p06-s7',
        title: 'audit.service.js + leave.routes.js',
        language: 'javascript',
        code: dedent(`
          // modules/audit/audit.service.js
          const toJson = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));

          export function audit(tx, actor, action, entity, entityId, before, after) {
            return tx.auditLog.create({
              data: { actorId: actor.id, action, entity, entityId: String(entityId), before: toJson(before), after: toJson(after) },
            });
          }

          // modules/leave/leave.routes.js
          import { Router } from 'express';
          import { z } from 'zod';
          import { requireAuth } from '../../auth/require-auth.js';
          import { authorize } from '../../auth/authorize.js';
          import { validate } from '../../middleware/validate.js';
          import * as leave from './leave.service.js';

          const idParams = z.object({ id: z.coerce.number().int().positive() });
          const createBody = z.object({
            type: z.enum(['ANNUAL', 'SICK', 'UNPAID']),
            startDate: z.coerce.date(),
            endDate: z.coerce.date(),
            reason: z.string().max(500).optional(),
          });

          export const leaveRouter = Router();
          leaveRouter.use(requireAuth);

          leaveRouter.post('/', authorize('leave:create'), validate({ body: createBody }), async (req, res) => {
            res.status(201).json({ data: await leave.requestLeave(req.user, req.valid.body) });
          });

          leaveRouter.post(
            '/:id/approve',
            authorize('leave:review_all', 'leave:review_team'),
            validate({ params: idParams }),
            async (req, res) => res.json({ data: await leave.approve(req.user, req.valid.params.id) }),
          );
        `),
      },
    },
    {
      title: 'Seed data',
      bullets: [
        'Seed one user per role so you can try every permission path: `npx prisma db seed`.',
        'Configure in package.json: `"prisma": { "seed": "node prisma/seed.js" }`.',
        'Seed IT department: an HR user, a manager with two reports, and balances for the current year.',
      ],
    },
  ],
  testing: {
    bullets: [
      'Unit test the permission matrix (`can`) as a table — cheap and catches accidental grants.',
      'Integration tests (Vitest + Supertest) with tokens for each role: manager approves a report (200), a non-report (404), own leave (403).',
      'Concurrency test: fire two approvals with `Promise.all` — exactly one `200`, one `409`, and the balance decremented once.',
      'Reset the DB between test files with `prisma migrate reset --force --skip-seed` or `TRUNCATE ... CASCADE`.',
    ],
    code: {
      id: 'p06-test',
      title: 'test/leave.test.js',
      language: 'javascript',
      code: dedent(`
        import { describe, it, expect, beforeEach, afterAll } from 'vitest';
        import request from 'supertest';
        import { app } from '../src/app.js';
        import { prisma } from '../src/db.js';
        import { can } from '../src/auth/permissions.js';
        import { seedFixture, tokenFor } from './fixtures.js'; // creates HR, manager, 2 reports, outsider

        describe('permission matrix', () => {
          it.each([
            ['ADMIN', 'employee:write', true],
            ['HR', 'employee:read_salary', true],
            ['MANAGER', 'employee:read_salary', false],
            ['EMPLOYEE', 'leave:review_team', false],
          ])('%s can %s → %s', (role, perm, expected) => {
            expect(can(role, perm)).toBe(expected);
          });
        });

        describe('leave approval', () => {
          let f;
          beforeEach(async () => {
            f = await seedFixture(prisma);
          });
          afterAll(() => prisma.$disconnect());

          const requestLeave = (who) =>
            request(app)
              .post('/api/v1/leave-requests')
              .set('Authorization', \`Bearer \${tokenFor(who)}\`)
              .send({ type: 'ANNUAL', startDate: '2026-12-07', endDate: '2026-12-11' }); // Mon-Fri = 5 days

          const approve = (who, id) =>
            request(app).post(\`/api/v1/leave-requests/\${id}/approve\`).set('Authorization', \`Bearer \${tokenFor(who)}\`);

          it('manager approves a direct report and the balance drops by 5', async () => {
            const { body } = await requestLeave(f.report1).expect(201);
            expect(body.data.days).toBe(5);
            await approve(f.manager, body.data.id).expect(200);

            const balance = await prisma.leaveBalance.findUnique({
              where: { employeeId_year_type: { employeeId: f.report1.employeeId, year: 2026, type: 'ANNUAL' } },
            });
            expect(balance.remaining).toBe(20);
          });

          it('manager cannot see leave of someone outside the team', async () => {
            const { body } = await requestLeave(f.outsider).expect(201);
            await approve(f.manager, body.data.id).expect(404);
          });

          it('employees cannot approve anything', async () => {
            const { body } = await requestLeave(f.report1).expect(201);
            await approve(f.report2, body.data.id).expect(403);
          });

          it('concurrent approvals: one wins, balance debited once', async () => {
            const { body } = await requestLeave(f.report1).expect(201);
            const results = await Promise.all([approve(f.manager, body.data.id), approve(f.hr, body.data.id)]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
            const balance = await prisma.leaveBalance.findUnique({
              where: { employeeId_year_type: { employeeId: f.report1.employeeId, year: 2026, type: 'ANNUAL' } },
            });
            expect(balance.remaining).toBe(20);
          });
        });
      `),
    },
  },
  security: [
    'Deny by default: every router starts with `requireAuth`; every write route has an explicit `authorize(...)`.',
    'Broken access control (OWASP #1): resource scope enforced in the query (`where` includes the scope), not by filtering results afterwards.',
    'Field-level: salary removed by the serializer unless `employee:read_salary` — and never logged.',
    'Mass assignment: zod schemas for PATCH do not include `role`, `status` or `salary` unless the caller has the matching permission (separate HR schema).',
    'IDs in URLs are not a secret — scope checks make guessing useless (IDOR prevention).',
    'Audit log is append-only for the app user: grant only `INSERT, SELECT` on `audit_logs` to the DB role.',
    'Role changes take effect at next token refresh — keep access tokens short (15 min) or re-check role on sensitive actions.',
  ],
  deployment: {
    bullets: [
      'Run `npx prisma migrate deploy` as a release step before new pods start (never `migrate dev` in production).',
      '`npx prisma generate` during the image build; ship only production deps + generated client.',
      'CI spins up Postgres as a service container and runs the integration suite on every PR.',
    ],
    code: {
      id: 'p06-deploy',
      title: '.github/workflows/ci.yml',
      language: 'yaml',
      code: dedent(`
        name: ci
        on: [push, pull_request]
        jobs:
          test:
            runs-on: ubuntu-latest
            services:
              postgres:
                image: postgres:17
                env:
                  POSTGRES_PASSWORD: postgres
                  POSTGRES_DB: employees_test
                ports: ["5432:5432"]
                options: >-
                  --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
            env:
              DATABASE_URL: postgresql://postgres:postgres@localhost:5432/employees_test
              JWT_ACCESS_SECRET: test-secret-that-is-at-least-32-chars
              NODE_ENV: test
            steps:
              - uses: actions/checkout@v4
              - uses: actions/setup-node@v4
                with:
                  node-version: 22
                  cache: npm
              - run: npm ci
              - run: npx prisma migrate deploy
              - run: npm test -- --coverage
      `),
    },
  },
  extensions: [
    'Store roles/permissions in tables so admins can create custom roles without a deploy.',
    'Org chart endpoint using a recursive CTE (`prisma.$queryRaw`) over `manager_id`.',
    'Public holidays table excluded from `workingDays`.',
    'Payroll export as a streamed CSV.',
    'Attribute-based rules (e.g. HR in one region only) with a policy library such as CASL.',
    'Email the manager when a request is created (hook into p09\'s notification service).',
  ],
};

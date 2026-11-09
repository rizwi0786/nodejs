/**
 * Content validator:  npx tsx scripts/validate-content.ts [m05 m06 ...]
 * - every lesson slug has content, no unknown slugs
 * - quiz answer index in range, options unique
 * - interview fields present, no duplicate questions (whole course)
 * - runnable examples execute in a sandbox and match expectedOutput
 * - challenge solutions pass their tests; output/scenario banks well-formed
 */
import vm from 'node:vm';
import { inspect } from 'node:util';
import { modules } from '../src/data/modules/curriculum';
import type { CodeExample, ContentBlock, ModuleContent } from '../src/types';

const only = process.argv.slice(2);
let errors = 0;
let warnings = 0;
const err = (m: string) => { errors++; console.log('  ✗ ' + m); };
const warnMsg = (m: string) => { warnings++; console.log('  ! ' + m); };

async function runJs(src: string, timeoutMs = 1500): Promise<string> {
  const out: string[] = [];
  const fmt = (v: unknown): string => (typeof v === 'string' ? v : inspect(v, { depth: 4 }));
  const consoleShim = { log: (...a: unknown[]) => out.push(a.map(fmt).join(' ')), error: (...a: unknown[]) => out.push(a.map(fmt).join(' ')), warn: (...a: unknown[]) => out.push(a.map(fmt).join(' ')), info: (...a: unknown[]) => out.push(a.map(fmt).join(' ')) };
  // Track pending timers so the run ends as soon as the program is idle (like Node exiting).
  let pending = 0;
  const live = new Set<ReturnType<typeof setTimeout>>();
  let wake: (() => void) | null = null;
  const settle = () => { if (pending === 0 && wake) setTimeout(() => pending === 0 && wake?.(), 0); };
  const st = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    pending++;
    const id = setTimeout(() => { live.delete(id); pending--; try { fn(...args); } catch (e) { out.push(`Uncaught ${(e as Error).name}: ${(e as Error).message}`); } settle(); }, ms);
    live.add(id);
    return id;
  };
  const ct = (id: ReturnType<typeof setTimeout>) => { if (live.delete(id)) { clearTimeout(id); pending--; settle(); } };
  const intervals = new Set<ReturnType<typeof setInterval>>();
  const si = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => { pending++; const id = setInterval(fn, ms, ...args); intervals.add(id); return id; };
  const ci = (id: ReturnType<typeof setInterval>) => { if (intervals.delete(id)) { clearInterval(id); pending--; settle(); } };
  const ctx = vm.createContext({ console: consoleShim, setTimeout: st, clearTimeout: ct, setInterval: si, clearInterval: ci, queueMicrotask, structuredClone, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, performance, btoa, atob });
  try {
    vm.runInContext(src, ctx, { timeout: timeoutMs });
  } catch (e) {
    out.push(`Uncaught ${(e as Error).name}: ${(e as Error).message}`);
  }
  await new Promise<void>((r) => {
    const hard = setTimeout(() => { for (const id of live) clearTimeout(id); for (const id of intervals) clearInterval(id); r(); }, timeoutMs * 2);
    wake = () => { clearTimeout(hard); r(); };
    settle();
  });
  return out.join('\n');
}

const norm = (s: string) => s.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();

function blocksOf(c: { sections: { blocks: ContentBlock[] }[] }): ContentBlock[] {
  return c.sections.flatMap((s) => s.blocks);
}

const seenQuestions = new Map<string, string>();
const key = (q: string) => q.toLowerCase().replace(/[^a-z0-9]/g, '');

async function checkExample(where: string, ex: CodeExample) {
  if (!ex.runnable) return;
  if (ex.expectedOutput == null) return warnMsg(`${where}: runnable example "${ex.title ?? ex.id}" has no expectedOutput`);
  const got = await runJs(ex.code);
  if (norm(got) !== norm(ex.expectedOutput)) {
    err(`${where}: runnable example "${ex.title ?? ex.id}" output mismatch\n      expected: ${JSON.stringify(norm(ex.expectedOutput))}\n      got:      ${JSON.stringify(norm(got))}`);
  }
}

async function main() {
  const stats = { lessons: 0, quiz: 0, interview: { beginner: 0, intermediate: 0, advanced: 0 } as Record<string, number>, runnable: 0 };
  for (const m of modules) {
    if (only.length && !only.includes(m.id)) continue;
    let content: ModuleContent;
    try {
      content = (await import(`../src/data/content/${m.id}/index.ts`)).default;
    } catch (e) {
      console.log(`${m.id}: failed to import — ${(e as Error).message}`);
      errors++;
      continue;
    }
    const keys = Object.keys(content);
    console.log(`${m.id} ${m.title}: ${keys.length}/${m.lessons.length} lessons`);
    const slugs = new Set(m.lessons.map((l) => l.slug));
    for (const k of keys) if (!slugs.has(k)) err(`unknown slug "${k}"`);
    for (const l of m.lessons) {
      const c = content[l.slug];
      if (!c) { if (keys.length) err(`missing lesson "${l.slug}"`); continue; }
      stats.lessons++;
      const w = `${l.slug}`;
      if (!c.summary) err(`${w}: no summary`);
      if (!c.sections?.length) err(`${w}: no sections`);
      const blocks = blocksOf(c);
      const codes = blocks.filter((b): b is Extract<ContentBlock, { type: 'code' }> => b.type === 'code');
      if (!codes.length) warnMsg(`${w}: no code example`);
      for (const b of codes) {
        if (b.example.runnable) stats.runnable++;
        await checkExample(w, b.example);
      }
      if (!c.revisionNotes?.length) warnMsg(`${w}: no revisionNotes`);
      if ((c.quiz?.length ?? 0) < 2) warnMsg(`${w}: fewer than 2 quiz questions`);
      c.quiz?.forEach((q, i) => {
        stats.quiz++;
        if (!Array.isArray(q.options) || q.options.length < 2) err(`${w} quiz ${i + 1}: needs options`);
        else if (q.answer < 0 || q.answer >= q.options.length) err(`${w} quiz ${i + 1}: answer index out of range`);
        if (new Set(q.options).size !== q.options.length) err(`${w} quiz ${i + 1}: duplicate options`);
        if (!q.explanation) err(`${w} quiz ${i + 1}: no explanation`);
      });
      if (!c.interview?.length) warnMsg(`${w}: no interview questions`);
      for (const [i, q] of (c.interview ?? []).entries()) {
        stats.interview[q.difficulty]++;
        if (!q.shortAnswer || !q.detailedAnswer?.length) err(`${w} interview ${i + 1}: missing answer`);
        const k = key(q.question);
        if (seenQuestions.has(k)) err(`${w} interview ${i + 1}: duplicate of ${seenQuestions.get(k)} — "${q.question}"`);
        seenQuestions.set(k, w);
        if (q.code) await checkExample(`${w} interview ${i + 1}`, q.code);
      }
    }
  }

  if (!only.length || only.includes('banks')) {
    for (const [file, exp] of [['output', 'outputQuestions'], ['scenario', 'scenarioQuestions']] as const) {
      try {
        const mod = await import(`../src/data/questions/${file}.ts`);
        const list = mod[exp] as import('../src/types').InterviewQuestion[];
        console.log(`bank ${file}: ${list.length}`);
        const ids = new Set<string>();
        for (const q of list) {
          if (ids.has(q.id)) err(`${file}: duplicate id ${q.id}`);
          ids.add(q.id);
          const k = key(q.question + (q.code?.code ?? ''));
          if (seenQuestions.has(k)) err(`${file} ${q.id}: duplicate question`);
          seenQuestions.set(k, q.id);
          if (q.code) await checkExample(`${file} ${q.id}`, q.code);
        }
      } catch (e) { warnMsg(`bank ${file}: ${(e as Error).message}`); }
    }
    try {
      const { challenges } = await import('../src/data/challenges/index.ts');
      console.log(`challenges: ${challenges.length}`);
      for (const ch of challenges as import('../src/types').CodingChallenge[]) {
        for (const t of ch.tests) {
          const src = `${ch.solution}\n;(async()=>{try{const v=await (${t.call});console.log(JSON.stringify(v))}catch(e){console.log('THREW '+e.message)}})()`;
          const got = norm(await runJs(src));
          if (got !== norm(t.expected)) err(`challenge ${ch.id}: test ${t.call} expected ${t.expected} got ${got}`);
        }
      }
    } catch (e) { warnMsg(`challenges: ${(e as Error).message}`); }
  }

  // Sprint plan references real lessons and challenges and covers exactly 24 h.
  if (!only.length || only.includes('sprint')) {
    const { sprintPlan, SPRINT_MINUTES } = await import('../src/data/sprint/plan.ts');
    const { lessonById } = await import('../src/data/modules/curriculum.ts');
    const { challenges } = await import('../src/data/challenges/index.ts');
    let t = 0;
    for (const b of sprintPlan) {
      if (b.start !== t) err(`sprint ${b.id}: starts at ${b.start}, expected ${t}`);
      t = b.start + b.duration;
      for (const id of b.lessons?.include ?? []) if (!lessonById.has(id)) err(`sprint ${b.id}: unknown lesson ${id}`);
      for (const id of b.challenges ?? []) if (!challenges.some((c: { id: string }) => c.id === id)) err(`sprint ${b.id}: unknown challenge ${id}`);
    }
    if (t !== SPRINT_MINUTES) err(`sprint plan covers ${t} minutes, expected ${SPRINT_MINUTES}`);
    console.log(`sprint plan: ${sprintPlan.length} blocks, ${t / 60} h`);
  }

  console.log(`\nlessons with content: ${stats.lessons}, quiz: ${stats.quiz}, runnable examples: ${stats.runnable}`);
  console.log(`interview (lesson) — beginner ${stats.interview.beginner}, intermediate ${stats.interview.intermediate}, advanced ${stats.interview.advanced}`);
  console.log(`${errors} errors, ${warnings} warnings`);
  process.exit(errors ? 1 : 0);
}
main();

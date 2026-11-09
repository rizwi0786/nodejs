// ─────────────────────────────────────────────────────────────
// A compact port of Node's util.inspect (default options, no colors)
// so the browser playground prints what `node` would print.
// Covers primitives, arrays (incl. Node's column grouping), objects,
// class instances, Map/Set, Date, RegExp, Error, functions, symbols,
// typed arrays, circular refs and depth limiting (depth 2).
// ─────────────────────────────────────────────────────────────

const BREAK_LENGTH = 80;
const COMPACT = 3;
const MAX_DEPTH = 2;
const MAX_ARRAY = 100;

interface Ctx {
  seen: object[];
  circular: Map<object, number>;
  indentationLvl: number;
  currentDepth: number;
}

const IDENT = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

function quoteString(s: string): string {
  let quote = "'";
  if (s.includes("'")) {
    if (!s.includes('"')) quote = '"';
    else if (!s.includes('`') && !s.includes('${')) quote = '`';
  }
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(new RegExp(String.fromCharCode(8), 'g'), '\\b')
    .replace(/\f/g, '\\f')
    .replace(/\v/g, '\\v')
    .replace(new RegExp(quote, 'g'), quote === "'" ? "\\'" : quote);
  return quote + escaped + quote;
}

function formatKey(key: string | symbol): string {
  if (typeof key === 'symbol') return `[${key.toString()}]`;
  if (IDENT.test(key)) return key;
  return quoteString(key);
}

function formatNumber(n: number): string {
  return Object.is(n, -0) ? '-0' : String(n);
}

function fnName(fn: (...a: unknown[]) => unknown): string {
  const src = Function.prototype.toString.call(fn);
  if (src.startsWith('class')) return fn.name ? `[class ${fn.name}]` : '[class (anonymous)]';
  let type = 'Function';
  const ctorName = Object.getPrototypeOf(fn)?.constructor?.name;
  if (ctorName === 'AsyncFunction') type = 'AsyncFunction';
  else if (ctorName === 'GeneratorFunction') type = 'GeneratorFunction';
  else if (ctorName === 'AsyncGeneratorFunction') type = 'AsyncGeneratorFunction';
  return fn.name ? `[${type}: ${fn.name}]` : `[${type} (anonymous)]`;
}

function constructorName(obj: object): string | null {
  let proto = Object.getPrototypeOf(obj);
  if (proto === null) return null;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'constructor');
    if (desc && typeof desc.value === 'function' && desc.value.name) return desc.value.name;
    proto = Object.getPrototypeOf(proto);
  }
  return '';
}

function isBelowBreakLength(output: string[], start: number, base: string): boolean {
  let total = output.length + start;
  if (total + output.length > BREAK_LENGTH) return false;
  for (const o of output) {
    total += o.length;
    if (total > BREAK_LENGTH) return false;
  }
  return base === '' || !base.includes('\n');
}

function groupArrayElements(ctx: Ctx, output: string[], value: unknown[] | undefined): string[] {
  let totalLength = 0;
  let maxLength = 0;
  let outputLength = output.length;
  if (value && value.length > MAX_ARRAY && output.length > MAX_ARRAY) outputLength--;
  const separatorSpace = 2;
  const dataLen: number[] = new Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const len = output[i].length;
    dataLen[i] = len;
    totalLength += len + separatorSpace;
    if (maxLength < len) maxLength = len;
  }
  const actualMax = maxLength + separatorSpace;
  if (actualMax * 3 + ctx.indentationLvl < BREAK_LENGTH && (totalLength / actualMax > 5 || maxLength <= 6)) {
    const averageBias = Math.sqrt(actualMax - totalLength / output.length);
    const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
    const columns = Math.min(
      Math.round(Math.sqrt(2.5 * biasedMax * outputLength) / biasedMax),
      Math.floor((BREAK_LENGTH - ctx.indentationLvl) / actualMax),
      COMPACT * 4,
      15,
    );
    if (columns <= 1) return output;
    const tmp: string[] = [];
    const maxLineLength: number[] = [];
    for (let i = 0; i < columns; i++) {
      let lineLength = 0;
      for (let j = i; j < output.length; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j];
      maxLineLength.push(lineLength + separatorSpace);
    }
    let padStart = true;
    if (value !== undefined) {
      for (let i = 0; i < output.length; i++) {
        if (typeof value[i] !== 'number' && typeof value[i] !== 'bigint') {
          padStart = false;
          break;
        }
      }
    }
    for (let i = 0; i < outputLength; i += columns) {
      const max = Math.min(i + columns, outputLength);
      let str = '';
      let j = i;
      for (; j < max - 1; j++) {
        const padding = maxLineLength[j - i];
        str += padStart ? `${output[j]}, `.padStart(padding, ' ') : `${output[j]}, `.padEnd(padding, ' ');
      }
      if (padStart) str += output[j].padStart(maxLineLength[j - i] - separatorSpace, ' ');
      else str += output[j];
      tmp.push(str);
    }
    if (outputLength < output.length) tmp.push(output[outputLength]);
    return tmp;
  }
  return output;
}

function reduceToSingleString(
  ctx: Ctx,
  output: string[],
  base: string,
  braces: [string, string],
  isArrayLike: boolean,
  recurseTimes: number,
  value: unknown[] | undefined,
): string {
  const entries = output.length;
  if (isArrayLike && entries > 6) output = groupArrayElements(ctx, output, value);
  if (ctx.currentDepth - recurseTimes < COMPACT && entries === output.length) {
    const start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
    if (isBelowBreakLength(output, start, base)) {
      const joined = output.join(', ');
      if (!joined.includes('\n')) return `${base ? `${base} ` : ''}${braces[0]} ${joined} ${braces[1]}`;
    }
  }
  const indentation = `\n${' '.repeat(ctx.indentationLvl)}`;
  return `${base ? `${base} ` : ''}${braces[0]}${indentation}  ${output.join(`,${indentation}  `)}${indentation}${braces[1]}`;
}

function formatPrimitive(v: unknown): string {
  switch (typeof v) {
    case 'string':
      return quoteString(v);
    case 'number':
      return formatNumber(v);
    case 'bigint':
      return `${v}n`;
    case 'boolean':
      return String(v);
    case 'undefined':
      return 'undefined';
    case 'symbol':
      return v.toString();
    default:
      return String(v);
  }
}

function formatProperty(ctx: Ctx, obj: object, key: string | symbol, recurseTimes: number, isArrayItem = false): string {
  const desc = Object.getOwnPropertyDescriptor(obj, key)!;
  let str: string;
  if (desc.value !== undefined || !('get' in desc || 'set' in desc)) {
    ctx.indentationLvl += isArrayItem ? 2 : 2;
    str = formatValue(ctx, desc.value, recurseTimes);
    ctx.indentationLvl -= 2;
  } else if (desc.get) {
    str = desc.set ? '[Getter/Setter]' : '[Getter]';
  } else {
    str = desc.set ? '[Setter]' : 'undefined';
  }
  if (isArrayItem) return str;
  return `${formatKey(key)}: ${str}`;
}

function errorString(e: Error): string {
  const name = e.name || 'Error';
  const head = e.message ? `${name}: ${e.message}` : name;
  return head;
}

export function formatValue(ctx: Ctx, value: unknown, recurseTimes: number): string {
  if (value === null) return 'null';
  if (typeof value !== 'object' && typeof value !== 'function') return formatPrimitive(value);

  const obj = value as object;
  if (ctx.seen.includes(obj)) {
    let index = ctx.circular.get(obj);
    if (index === undefined) {
      index = ctx.circular.size + 1;
      ctx.circular.set(obj, index);
    }
    return `[Circular *${index}]`;
  }
  return formatRaw(ctx, obj, recurseTimes);
}

function ownKeys(obj: object, skipIndices: boolean): (string | symbol)[] {
  const keys: (string | symbol)[] = Object.keys(obj);
  const syms = Object.getOwnPropertySymbols(obj).filter((s) => Object.getOwnPropertyDescriptor(obj, s)?.enumerable);
  const out = skipIndices ? keys.filter((k) => !/^(0|[1-9]\d*)$/.test(k as string)) : keys;
  return [...out, ...syms];
}

function formatRaw(ctx: Ctx, value: object, recurseTimes: number): string {
  const ctor = constructorName(value);
  const nullProto = ctor === null;
  const prefixFor = (fallback: string, size?: number) => {
    const name = ctor ?? '[Object: null prototype]';
    const sz = size !== undefined ? `(${size}) ` : ' ';
    return name === fallback ? `${fallback}${sz}` : `${name}${size !== undefined ? ` [${fallback}]${sz}` : ` [${fallback}] `}`;
  };

  let base = '';
  let braces: [string, string] = ['{', '}'];
  let keys: (string | symbol)[] = [];
  let isArrayLike = false;
  let formatter: (() => string[]) | null = null;
  let arrayValue: unknown[] | undefined;

  if (Array.isArray(value)) {
    isArrayLike = true;
    arrayValue = value;
    keys = ownKeys(value, true);
    const prefix = ctor !== 'Array' ? `${ctor ?? '[Array: null prototype]'}(${value.length}) ` : '';
    braces = [`${prefix}[`, ']'];
    if (value.length === 0 && keys.length === 0) return `${braces[0]}]`;
    formatter = () => formatArray(ctx, value, recurseTimes);
  } else if (value instanceof Set) {
    keys = ownKeys(value, false);
    const prefix = prefixFor('Set', value.size);
    braces = [`${prefix}{`, '}'];
    if (value.size === 0 && keys.length === 0) return `${prefix}{}`;
    formatter = () => {
      ctx.indentationLvl += 2;
      const out = [...value].map((v) => formatValue(ctx, v, recurseTimes));
      ctx.indentationLvl -= 2;
      return out;
    };
  } else if (value instanceof Map) {
    keys = ownKeys(value, false);
    const prefix = prefixFor('Map', value.size);
    braces = [`${prefix}{`, '}'];
    if (value.size === 0 && keys.length === 0) return `${prefix}{}`;
    formatter = () => {
      ctx.indentationLvl += 2;
      const out = [...value].map(([k, v]) => `${formatValue(ctx, k, recurseTimes)} => ${formatValue(ctx, v, recurseTimes)}`);
      ctx.indentationLvl -= 2;
      return out;
    };
  } else if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const ta = value as unknown as ArrayLike<number | bigint> & { length: number };
    isArrayLike = true;
    arrayValue = Array.from(ta as ArrayLike<number>);
    keys = ownKeys(value, true);
    braces = [`${ctor}(${ta.length}) [`, ']'];
    if (ta.length === 0 && keys.length === 0) return `${braces[0]}]`;
    formatter = () => Array.from(ta as ArrayLike<number>, (n) => formatPrimitive(n)).slice(0, MAX_ARRAY);
  } else {
    keys = ownKeys(value, false);
    if (typeof value === 'function') {
      base = fnName(value as (...a: unknown[]) => unknown);
      keys = keys.filter((k) => k !== 'prototype');
      if (keys.length === 0) return base;
    } else if (value instanceof RegExp) {
      base = RegExp.prototype.toString.call(value);
      if (keys.length === 0) return base;
    } else if (value instanceof Date) {
      base = Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
      if (keys.length === 0) return base;
    } else if (value instanceof Error) {
      base = errorString(value);
      keys = keys.filter((k) => k !== 'stack' && k !== 'message');
      if (keys.length === 0) return base;
    } else if (value instanceof Promise) {
      braces = ['Promise {', '}'];
      formatter = () => ['<pending>'];
    } else if (value instanceof WeakMap || value instanceof WeakSet) {
      return `${ctor} { <items unknown> }`;
    } else if (typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function' && ctor?.endsWith('Iterator')) {
      return `Object [${ctor}] {}`;
    } else {
      if (nullProto) braces = ['[Object: null prototype] {', '}'];
      else if (ctor !== 'Object') braces = [`${ctor} {`, '}'];
      const tag = (value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag];
      if (typeof tag === 'string' && tag && tag !== ctor) braces = [`${ctor ?? 'Object'} [${tag}] {`, '}'];
      if (keys.length === 0) return `${braces[0]}}`;
    }
  }

  if (recurseTimes > MAX_DEPTH) {
    if (Array.isArray(value)) return '[Array]';
    const name = ctor ?? 'Object';
    return `[${name}]`;
  }

  recurseTimes += 1;
  ctx.seen.push(value);
  ctx.currentDepth = recurseTimes;
  let output: string[] = formatter ? formatter() : [];
  for (const k of keys) output.push(formatProperty(ctx, value, k, recurseTimes));
  ctx.seen.pop();

  const idx = ctx.circular.get(value);
  if (idx !== undefined) {
    const ref = `<ref *${idx}>`;
    if (base) base = `${ref} ${base}`;
    else braces[0] = `${ref} ${braces[0]}`;
  }
  output = output.filter((o) => o !== undefined);
  const res = reduceToSingleString(ctx, output, base, braces, isArrayLike, recurseTimes, arrayValue);
  return res;
}

function formatArray(ctx: Ctx, arr: unknown[], recurseTimes: number): string[] {
  const out: string[] = [];
  const len = Math.min(arr.length, MAX_ARRAY);
  let holes = 0;
  const flushHoles = () => {
    if (holes) out.push(`<${holes} empty item${holes > 1 ? 's' : ''}>`);
    holes = 0;
  };
  for (let i = 0; i < len; i++) {
    if (!Object.prototype.hasOwnProperty.call(arr, i)) {
      holes++;
      continue;
    }
    flushHoles();
    out.push(formatProperty(ctx, arr, String(i), recurseTimes, true));
  }
  flushHoles();
  if (arr.length > MAX_ARRAY) {
    const rest = arr.length - MAX_ARRAY;
    out.push(`... ${rest} more item${rest > 1 ? 's' : ''}`);
  }
  return out;
}

export function inspect(value: unknown): string {
  const ctx: Ctx = { seen: [], circular: new Map(), indentationLvl: 0, currentDepth: 0 };
  return formatValue(ctx, value, 0);
}

/** console.log argument formatting: strings raw, everything else inspected; basic %s %d %i %f %j %o %O %%. */
export function formatLogArgs(args: unknown[]): string {
  if (!args.length) return '';
  const first = args[0];
  let rest = args.slice(1);
  let head: string;
  if (typeof first === 'string' && /%[sdifjoOc%]/.test(first) && rest.length) {
    head = first.replace(/%([sdifjoOc%])/g, (m, f: string) => {
      if (f === '%') return '%';
      if (!rest.length) return m;
      const v = rest.shift();
      switch (f) {
        case 's':
          return typeof v === 'string' ? v : typeof v === 'object' && v !== null ? inspect(v) : String(v);
        case 'd':
        case 'i': {
          const n = Number(v);
          return f === 'i' ? String(Math.trunc(n)) : formatNumber(n);
        }
        case 'f':
          return String(parseFloat(String(v)));
        case 'j':
          return JSON.stringify(v);
        case 'c':
          return '';
        default:
          return inspect(v);
      }
    });
    rest = [...rest];
  } else {
    head = typeof first === 'string' ? first : inspect(first);
  }
  return [head, ...rest.map((a) => (typeof a === 'string' ? a : inspect(a)))].join(' ');
}

import { useEffect, useState } from 'react';
import { loadAllContent, loadModuleContent, type AllContent, type ResolvedModuleContent } from '../data/content';
import { loadBanks, type Banks } from '../data/questions/banks';

// Resolved values by key, so a component mounting after the data has loaded
// renders it immediately instead of flashing a loading state.
const resolved = new Map<string, unknown>();

function useAsync<T>(key: string, load: () => Promise<T>): T | null {
  const [value, setValue] = useState<{ key: string; v: T } | null>(() =>
    resolved.has(key) ? { key, v: resolved.get(key) as T } : null,
  );
  useEffect(() => {
    if (resolved.has(key)) {
      setValue((cur) => (cur?.key === key ? cur : { key, v: resolved.get(key) as T }));
      return;
    }
    let alive = true;
    load().then((v) => {
      resolved.set(key, v);
      if (alive) setValue({ key, v });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (value?.key === key) return value.v;
  return resolved.has(key) ? (resolved.get(key) as T) : null;
}

/** Lesson content for one module (lazy chunk). null while loading. */
export function useModuleContent(moduleId: string): ResolvedModuleContent | null {
  return useAsync(`module:${moduleId}`, () => loadModuleContent(moduleId));
}

/** Every module's content — used by practice, interview, revision and search. */
export function useAllContent(): AllContent | null {
  return useAsync('all', loadAllContent);
}

/** Output / scenario interview banks and coding challenges. */
export function useBanks(): Banks | null {
  return useAsync('banks', loadBanks);
}

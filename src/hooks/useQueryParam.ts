import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** A string filter stored in the URL (?key=value) so it survives reloads and can be shared. */
export function useQueryParam<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key) as T | null;
  const value = raw && allowed.includes(raw) ? raw : fallback;
  const set = useCallback(
    (v: T) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v === fallback) n.delete(key);
          else n.set(key, v);
          return n;
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  );
  return [value, set];
}

import { useEffect, useRef } from 'react';

/** Dispatch on window to open the keyboard-shortcut help dialog. */
export const OPEN_SHORTCUTS_EVENT = 'nm:open-shortcuts';

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

/** True when the user is typing, or focus is inside an area that owns its keys (e.g. a code editor). */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"], [data-no-shortcuts]'));
}

/**
 * Registers single-key shortcuts (no Ctrl/Alt/Meta). Keys are matched on `event.key`,
 * case-insensitive for letters: { ArrowLeft: fn, m: fn, '?': fn }.
 */
export function useKeyboardShortcuts(map: ShortcutMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const fn = ref.current[key] ?? ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

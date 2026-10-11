import { useEffect, useState } from "react";

/*
 * Shows a long list in steps so the page appears at once.
 *
 * With thousands of rows, drawing the whole table in one go keeps the
 * browser busy for a second or more before anything is visible. This hook
 * returns the first `first` rows immediately and adds `step` more on each
 * following frame until the full list is shown. The end result is exactly
 * the same table - it just starts appearing straight away.
 */
export function useProgressiveList<T>(items: T[], first = 60, step = 250): T[] {
  const [state, setState] = useState({ items, count: first });

  // A new list (search, reload) starts again from the first rows.
  const count = state.items === items ? state.count : first;
  if (state.items !== items) setState({ items, count: first });

  useEffect(() => {
    if (count >= items.length) return;
    const id = requestAnimationFrame(() =>
      setState((s) => (s.items === items ? { items, count: s.count + step } : s)),
    );
    return () => cancelAnimationFrame(id);
  }, [count, items, step]);

  return count >= items.length ? items : items.slice(0, count);
}

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { apiError } from "../services/api";
import { fetchCache as cache } from "../services/fetchCache";

/*
 * Small data-loading hook with an optional in-memory cache.
 *
 * Pass `{ key }` to turn caching on for a request. Then:
 *   - coming back to a page shows the last data instantly (no spinner),
 *     and it is refreshed in the background;
 *   - two components asking for the same key at the same time share ONE
 *     request instead of sending two;
 *   - setData() also updates the cache, so an edit is not "undone" when
 *     the page is opened again;
 *   - any save (POST/PUT/DELETE) clears the whole cache - see api.ts.
 *
 * The key must describe the request exactly, e.g. `order:${orderNo}`.
 * Without a key the hook behaves exactly as before.
 */

function load<T>(key: string | undefined, fetcher: () => Promise<T>): Promise<T> {
  if (!key) return fetcher();
  const entry = cache.get(key) ?? {};
  if (entry.inflight) return entry.inflight as Promise<T>;
  const p = fetcher().then(
    (data) => {
      // Only store it if nobody cleared the cache while we were waiting
      // (a save in the meantime means this answer may already be stale).
      if (cache.get(key)?.inflight === p) cache.set(key, { data });
      return data;
    },
    (err) => {
      const e = cache.get(key);
      if (e) delete e.inflight;
      throw err;
    },
  );
  cache.set(key, { ...entry, inflight: p });
  return p;
}

export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: { key?: string } = {},
) {
  const { key } = options;
  const cached = key !== undefined ? (cache.get(key)?.data as T | undefined) : undefined;

  const [data, setDataState] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const depKey = JSON.stringify(deps) + "|" + (key ?? "");

  useEffect(() => {
    let cancelled = false;
    const k = keyRef.current;
    const hit = k !== undefined ? (cache.get(k)?.data as T | undefined) : undefined;

    if (hit !== undefined) {
      // Show what we have straight away; refresh quietly behind it.
      setDataState(hit);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");

    load(k, () => fetcherRef.current())
      .then((result) => {
        if (!cancelled) setDataState(result);
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [depKey, reloadKey]);

  // Keeps the cache in step with local edits.
  const setData: Dispatch<SetStateAction<T | null>> = (value) => {
    setDataState((prev) => {
      const next =
        typeof value === "function" ? (value as (p: T | null) => T | null)(prev) : value;
      const k = keyRef.current;
      if (k !== undefined) {
        if (next === null) cache.delete(k);
        else cache.set(k, { data: next });
      }
      return next;
    });
  };

  const reload = () => {
    const k = keyRef.current;
    if (k !== undefined) cache.delete(k);
    setReloadKey((n) => n + 1);
  };

  return { data, loading, error, setData, setError, reload };
}

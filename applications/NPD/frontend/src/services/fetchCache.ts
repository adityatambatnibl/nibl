/**
 * In-memory cache behind useFetch({ key }).
 *
 * Lives in its own module so the API client can clear it after every write
 * without an import cycle. Any successful POST / PUT / DELETE clears it, so
 * a cached page can never show data from before a save.
 */

export type CacheEntry = { data?: unknown; inflight?: Promise<unknown> };

export const fetchCache = new Map<string, CacheEntry>();

/** Forget everything - after any write, and on logout. */
export function clearFetchCache() {
  fetchCache.clear();
}

// Rolling 24-hour limit for the PUBLIC demo check (5 per visitor). Uses the local atomic store.
// Not applied to private local record keeping (those never call the server).
export const DEMO_LIMIT = 5;
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function createRateLimiter(store, { limit = DEMO_LIMIT, windowMs = WINDOW_MS } = {}) {
  return {
    async check(visitorId, now = Date.now()) {
      return store.update('rate-limit', {}, (all) => {
        const hits = (all[visitorId] || []).filter((t) => now - t < windowMs);
        const allowed = hits.length < limit;
        if (allowed) hits.push(now);
        all[visitorId] = hits;
        // Garbage-collect stale visitors.
        for (const k of Object.keys(all)) if (!all[k].some((t) => now - t < windowMs)) delete all[k];
        const resetAt = hits.length ? Math.min(...hits) + windowMs : now + windowMs;
        return { value: all, result: { allowed, remaining: Math.max(0, limit - hits.length), resetAt } };
      });
    },
  };
}

import { config } from '../config/index.js';

/**
 * Remote token validation — the resilient fallback for when this service's
 * local `jwt.verify` rejects a token it *should* accept (the classic symptom
 * of a JWT_SECRET drift between this gameplay API and the main API that issues
 * the tokens). Instead of forcing the two deployments to share a secret, we
 * simply ask the main API "is this token yours, and who is it?" via its `me`
 * query, and trust the answer.
 *
 * Results are cached in-memory (positive 5 min, negative 30 s) so a flurry of
 * moves doesn't hammer the main API — local verification is still the fast path
 * and is tried first, so once secrets are aligned this code never runs.
 */

interface RemoteUser {
  userId: string;
  role: string;
}

const POSITIVE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const cache = new Map<string, { user: RemoteUser | null; expires: number }>();

const ME_QUERY = '{ me { id role } }';

export async function validateViaMainApi(token: string): Promise<RemoteUser | null> {
  const now = Date.now();
  const cached = cache.get(token);
  if (cached && cached.expires > now) return cached.user;

  let user: RemoteUser | null = null;
  try {
    const res = await fetch(config.mainApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Required by the main API's Apollo CSRF protection.
        'Apollo-Require-Preflight': 'true',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: ME_QUERY }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { me?: { id?: string; role?: string } | null };
      };
      const me = json?.data?.me;
      if (me?.id) {
        user = { userId: me.id, role: me.role ?? 'STUDENT' };
      }
    }
  } catch {
    user = null; // unreachable / timeout / bad response — fail closed
  }

  cache.set(token, { user, expires: now + (user ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });

  // Opportunistic cleanup so the cache can't grow unbounded.
  if (cache.size > 1000) {
    for (const [key, value] of cache) {
      if (value.expires <= now) cache.delete(key);
    }
  }

  return user;
}

/**
 * Chess.com PubAPI data bridge — server-side.
 *
 * Pulls a sample of a player's recent games from the Chess.com public API
 * and returns them in a normalised shape. No auth required for public
 * games. We deliberately avoid chess.js here so the backend has zero extra
 * runtime dependencies; all PGN analysis is regex-based and run in
 * `playerStyle.service.ts`.
 */

const PUB_BASE = 'https://api.chess.com/pub';

export interface ChessComArchiveList {
  archives: string[];
}

export interface ChessComGameRaw {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: string;
  rules: string;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

export interface ChessComMonthGames {
  games: ChessComGameRaw[];
}

export interface NormalisedGame {
  url: string;
  pgn: string;
  timeControl: string;
  timeClass: string;
  endedAt: Date;
  rules: string;
  rated: boolean;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  /** Result from the *target* user's perspective. */
  perspective?: { color: 'white' | 'black'; outcome: 'win' | 'loss' | 'draw'; rating: number };
}

interface UserAgentOptions {
  /** Optional UA string for outbound requests (Chess.com recommends one). */
  userAgent?: string;
}

async function fetchJson<T>(url: string, opts: UserAgentOptions = {}): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(opts.userAgent ? { 'User-Agent': opts.userAgent } : {}),
    },
    // Server-side runtime: no cache by default; the higher-level service
    // controls TTL via an in-memory map.
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('User not found on Chess.com');
    }
    throw new Error(`Chess.com request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function deriveResult(white: string, black: string): NormalisedGame['result'] {
  if (white === 'win') return '1-0';
  if (black === 'win') return '0-1';
  const drawish = new Set(['agreed', 'stalemate', 'repetition', 'insufficient', '50move', 'timevsinsufficient']);
  if (drawish.has(white)) return '1/2-1/2';
  return '*';
}

function normaliseGame(raw: ChessComGameRaw, target?: string): NormalisedGame {
  const result = deriveResult(raw.white.result, raw.black.result);
  const g: NormalisedGame = {
    url: raw.url,
    pgn: raw.pgn,
    timeControl: raw.time_control,
    timeClass: raw.time_class,
    endedAt: new Date(raw.end_time * 1000),
    rules: raw.rules,
    rated: raw.rated,
    white: raw.white,
    black: raw.black,
    result,
  };
  if (target) {
    const t = target.trim().toLowerCase();
    const isWhite = raw.white.username.toLowerCase() === t;
    const isBlack = raw.black.username.toLowerCase() === t;
    if (isWhite || isBlack) {
      const color: 'white' | 'black' = isWhite ? 'white' : 'black';
      const myResult = isWhite ? raw.white.result : raw.black.result;
      const outcome: 'win' | 'loss' | 'draw' =
        myResult === 'win' ? 'win' : result === '1/2-1/2' ? 'draw' : 'loss';
      g.perspective = {
        color,
        outcome,
        rating: isWhite ? raw.white.rating : raw.black.rating,
      };
    }
  }
  return g;
}

export async function listArchives(username: string, opts: UserAgentOptions = {}): Promise<string[]> {
  const u = username.trim().toLowerCase();
  if (!u) throw new Error('username required');
  const data = await fetchJson<ChessComArchiveList>(
    `${PUB_BASE}/player/${encodeURIComponent(u)}/games/archives`,
    opts,
  );
  return data.archives ?? [];
}

export async function fetchMonth(
  username: string,
  year: number,
  month: number,
  opts: UserAgentOptions = {},
): Promise<NormalisedGame[]> {
  const u = username.trim().toLowerCase();
  const mm = String(month).padStart(2, '0');
  const data = await fetchJson<ChessComMonthGames>(
    `${PUB_BASE}/player/${encodeURIComponent(u)}/games/${year}/${mm}`,
    opts,
  );
  return (data.games ?? []).map((g) => normaliseGame(g, username)).reverse();
}

/**
 * Walk backwards through monthly archives and return at most `limit` games.
 * Cheaper than fetching every month — stops as soon as we have enough.
 */
export async function recentGames(
  username: string,
  limit: number = 50,
  opts: UserAgentOptions = {},
): Promise<NormalisedGame[]> {
  const archives = await listArchives(username, opts);
  const out: NormalisedGame[] = [];
  for (let i = archives.length - 1; i >= 0 && out.length < limit; i--) {
    const url = archives[i];
    const m = url ? url.match(/(\d{4})\/(\d{2})$/) : null;
    if (!m || !m[1] || !m[2]) continue;
    try {
      const month = await fetchMonth(username, parseInt(m[1], 10), parseInt(m[2], 10), opts);
      for (const g of month) {
        if (out.length >= limit) break;
        out.push(g);
      }
    } catch {
      // Skip the month on a transient error and continue with the next.
      continue;
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────
 * In-memory cache — the same username will usually be hit several times
 * per session (HUD, status window, recommendations). 5-minute TTL keeps
 * us friendly to Chess.com's rate limits.
 * ─────────────────────────────────────────────────────────────────── */

interface CacheEntry {
  expires: number;
  games: NormalisedGame[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

export async function getCachedRecentGames(
  username: string,
  limit: number = 50,
  opts: UserAgentOptions = {},
): Promise<NormalisedGame[]> {
  const key = `${username.trim().toLowerCase()}:${limit}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.games;
  const games = await recentGames(username, limit, opts);
  cache.set(key, { expires: now + CACHE_TTL_MS, games });
  return games;
}

/** Test/admin helper to drop the in-memory cache. */
export function clearChessComCache(): void {
  cache.clear();
}

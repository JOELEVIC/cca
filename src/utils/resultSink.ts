import { config } from '../config/index.js';
import type { GameResult } from '../domains/game/game-session.types.js';

/**
 * Persist a finished live game back to the main API (ccanext), which owns the
 * database + ratings. cca is the authority on the *outcome* of a live session,
 * but it has no DB of its own — so when a game ends (checkmate, resignation,
 * timeout, abandonment, agreed draw) we call the main API's `recordGameResult`
 * mutation, authenticating as one of the participants using a bearer token we
 * captured from that player's most recent request. No shared service secret
 * required.
 *
 * `result === null` means the game was aborted (voided) — the main API marks it
 * ABANDONED and applies no rating change.
 */
const MUTATION = `
  mutation RecordGameResult($gameId: ID!, $result: GameResult, $reason: String, $moves: String) {
    recordGameResult(gameId: $gameId, result: $result, reason: $reason, moves: $moves) {
      id
      status
      result
    }
  }
`;

const REQUEST_TIMEOUT_MS = 8000;

export async function recordResultOnMainApi(params: {
  token: string;
  gameId: string;
  result: GameResult | null;
  reason: string;
  moves: string;
}): Promise<boolean> {
  const { token, gameId, result, reason, moves } = params;
  try {
    const res = await fetch(config.mainApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Apollo-Require-Preflight': 'true',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: MUTATION,
        variables: { gameId, result, reason, moves },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: { recordGameResult?: { id?: string } }; errors?: unknown };
    return Boolean(json?.data?.recordGameResult?.id);
  } catch {
    return false;
  }
}

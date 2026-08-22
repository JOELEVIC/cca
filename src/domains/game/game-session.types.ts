/**
 * In-memory game session types (no Prisma).
 * Used for real-time gameplay and GraphQL subscriptions.
 */

export const GAME_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
} as const;
export type GameStatus = (typeof GAME_STATUS)[keyof typeof GAME_STATUS];

export const GAME_RESULT = {
  WHITE_WIN: 'WHITE_WIN',
  BLACK_WIN: 'BLACK_WIN',
  DRAW: 'DRAW',
  STALEMATE: 'STALEMATE',
} as const;
export type GameResult = (typeof GAME_RESULT)[keyof typeof GAME_RESULT];

/**
 * Mirrors ccanext's `ValidationState` enum (ccanext/prisma/schema.prisma).
 * NOT_REQUIRED is an ordinary online game — rated here, at completion.
 * Anything else means the game belongs to a fixture board and is rated later,
 * at arbiter validation (BUILD_PLAN §4.4), so this server must not rate it.
 */
export const VALIDATION_STATE = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  VALIDATED: 'VALIDATED',
  DISPUTED: 'DISPUTED',
} as const;
export type ValidationState = (typeof VALIDATION_STATE)[keyof typeof VALIDATION_STATE];

/**
 * Coerce whatever the caller supplied into a known state. A missing, null or
 * unrecognised value means "ordinary online game" — legacy games and every
 * existing client, which send nothing, keep rating exactly as before.
 */
export function toValidationState(value?: string | null): ValidationState {
  return value != null && Object.prototype.hasOwnProperty.call(VALIDATION_STATE, value)
    ? (value as ValidationState)
    : VALIDATION_STATE.NOT_REQUIRED;
}

export interface GameSessionState {
  gameId: string;
  whiteId: string;
  blackId: string;
  moves: string;
  status: GameStatus;
  result?: GameResult | null;
  timeControl: string;
  drawOfferBy?: string | null; // userId who offered draw
  // NOT_REQUIRED = rate this game here when it ends. Anything else = a fixture
  // board's game, rated at arbiter validation instead (BUILD_PLAN §4.4).
  validationState: ValidationState;
  // ── Clocks (all milliseconds) ──
  initialMs: number; // base time per side
  incrementMs: number; // Fischer increment added after each move
  whiteMs: number; // white's remaining time, anchored at `turnStartedAt`
  blackMs: number; // black's remaining time, anchored at `turnStartedAt`
  turnStartedAt: number | null; // epoch ms when the side-to-move's clock started ticking; null = not running
  // ── Bookkeeping ──
  endReason?: string | null;
  resultRecorded?: boolean; // true once the result has been persisted to the main API
  tokens: { white?: string; black?: string }; // most-recent bearer token seen per player (for server-side write-back)
  createdAt: Date;
  updatedAt: Date;
}

export type GameUpdateEvent =
  | 'GAME_STATE'
  | 'MOVE'
  | 'GAME_END'
  | 'DRAW_OFFER'
  | 'DRAW_ACCEPTED'
  | 'DRAW_REJECTED'
  | 'CHAT'
  | 'OPPONENT_LEFT'
  | 'OPPONENT_RETURNED'
  | 'ABORT_ARMED';

export interface GameUpdatePayload {
  gameId: string;
  event: GameUpdateEvent;
  moves: string;
  status: GameStatus;
  result?: GameResult | null;
  drawOfferBy?: string | null;
  move?: string;
  reason?: string;
  // ── Clocks ──
  whiteMs?: number; // anchored remaining time
  blackMs?: number;
  serverTime?: number; // epoch ms the clock values were anchored at (client extrapolates the running side)
  // ── Chat ──
  chatUserId?: string;
  chatText?: string;
  // ── Presence countdowns (OPPONENT_LEFT / OPPONENT_RETURNED / ABORT_ARMED) ──
  awayUserId?: string; // the player who left (OPPONENT_LEFT / OPPONENT_RETURNED)
  deadline?: number; // epoch ms when the pending action (forfeit / abort) fires
}

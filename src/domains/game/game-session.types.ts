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

export interface GameSessionState {
  gameId: string;
  whiteId: string;
  blackId: string;
  moves: string;
  status: GameStatus;
  result?: GameResult | null;
  timeControl: string;
  drawOfferBy?: string | null; // userId who offered draw
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
  | 'CHAT';

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
}

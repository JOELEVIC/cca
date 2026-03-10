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
  createdAt: Date;
  updatedAt: Date;
}

export type GameUpdateEvent =
  | 'GAME_STATE'
  | 'MOVE'
  | 'GAME_END'
  | 'DRAW_OFFER'
  | 'DRAW_ACCEPTED'
  | 'DRAW_REJECTED';

export interface GameUpdatePayload {
  gameId: string;
  event: GameUpdateEvent;
  moves: string;
  status: GameStatus;
  result?: GameResult | null;
  drawOfferBy?: string | null;
  move?: string;
  reason?: string;
}

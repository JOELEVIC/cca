import { GameStatus, GameResult } from '@prisma/client';

// Game DTOs
export interface CreateGameDTO {
  whiteId: string;
  blackId: string;
  timeControl: string; // e.g., "10+0", "30+0"
  tournamentId?: string;
}

export interface MakeMoveDTO {
  gameId: string;
  move: string; // e.g., "e2e4" in algebraic notation
  userId: string;
}

export interface UpdateGameDTO {
  moves?: string;
  status?: GameStatus;
  result?: GameResult;
}

export interface GameFilters {
  userId?: string;
  status?: GameStatus;
  tournamentId?: string;
}

// WebSocket message types
export interface GameMessage {
  type: 'MOVE' | 'JOIN' | 'LEAVE' | 'RESIGN' | 'OFFER_DRAW' | 'ACCEPT_DRAW' | 'REJECT_DRAW';
  gameId: string;
  move?: string;
  userId: string;
  timestamp: number;
}

export interface GameState {
  gameId: string;
  whiteId: string;
  blackId: string;
  moves: string;
  status: GameStatus;
  result?: GameResult;
  timeControl: string;
}

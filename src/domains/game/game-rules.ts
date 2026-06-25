/**
 * Pure chess-rules + time-control helpers, backed by chess.js.
 * Keeps the session service focused on state/transitions.
 */
import { Chess } from 'chess.js';
import { GAME_RESULT, GameResult } from './game-session.types.js';

export interface ParsedTimeControl {
  initialMs: number;
  incrementMs: number;
}

/** "5+0" / "15+10" → { initialMs, incrementMs }. Throws on malformed input. */
export function parseTimeControl(timeControl: string): ParsedTimeControl {
  const m = /^(\d+)\+(\d+)$/.exec(timeControl.trim());
  if (!m) {
    throw new Error('Invalid time control format. Use "minutes+increment", e.g. "5+0".');
  }
  return {
    initialMs: parseInt(m[1], 10) * 60_000,
    incrementMs: parseInt(m[2], 10) * 1_000,
  };
}

function splitMoves(moves: string): string[] {
  return moves ? moves.split(' ').filter(Boolean) : [];
}

/** Number of half-moves (plies) played so far. */
export function plyCount(moves: string): number {
  return splitMoves(moves).length;
}

/**
 * Replay a space-separated move list into a Chess instance.
 * Moves are accepted in non-strict notation (UCI like "e2e4"/"e7e8q" or SAN).
 * Throws if any move is illegal — callers treat that as a corrupt/invalid sequence.
 */
export function replay(moves: string): Chess {
  const chess = new Chess();
  for (const token of splitMoves(moves)) {
    applyToken(chess, token);
  }
  return chess;
}

/** Apply one move token to a Chess instance, returning the normalized object, or throwing if illegal. */
export function applyToken(chess: Chess, token: string): ReturnType<Chess['move']> {
  // Prefer explicit from/to parsing for UCI tokens so promotions are unambiguous.
  const uci = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(token);
  if (uci) {
    return chess.move({ from: uci[1], to: uci[2], promotion: (uci[3] as 'q' | 'r' | 'b' | 'n') || 'q' });
  }
  return chess.move(token);
}

export interface EndState {
  result: GameResult;
  reason: string;
}

/**
 * Inspect a position (after a move was applied) for a natural game end.
 * `whiteJustMoved` is true if the move that produced this position was white's.
 */
export function detectEnd(chess: Chess, whiteJustMoved: boolean): EndState | null {
  if (chess.isCheckmate()) {
    return {
      result: whiteJustMoved ? GAME_RESULT.WHITE_WIN : GAME_RESULT.BLACK_WIN,
      reason: 'checkmate',
    };
  }
  if (chess.isStalemate()) {
    return { result: GAME_RESULT.STALEMATE, reason: 'stalemate' };
  }
  if (chess.isInsufficientMaterial()) {
    return { result: GAME_RESULT.DRAW, reason: 'insufficient material' };
  }
  if (chess.isThreefoldRepetition()) {
    return { result: GAME_RESULT.DRAW, reason: 'threefold repetition' };
  }
  // Catches the 50-move rule (and any other draw chess.js recognizes).
  if (chess.isDraw()) {
    return { result: GAME_RESULT.DRAW, reason: 'fifty-move rule' };
  }
  return null;
}

/**
 * When a side flags (runs out of time), the opponent wins — unless the opponent
 * cannot possibly deliver mate with the material on the board, in which case it's
 * a draw (standard FIDE / chess.com rule).
 */
export function resultOnFlag(moves: string, flaggedWhite: boolean): EndState {
  let insufficientForOpponent = false;
  try {
    insufficientForOpponent = replay(moves).isInsufficientMaterial();
  } catch {
    insufficientForOpponent = false;
  }
  if (insufficientForOpponent) {
    return { result: GAME_RESULT.DRAW, reason: 'timeout vs insufficient material' };
  }
  return {
    result: flaggedWhite ? GAME_RESULT.BLACK_WIN : GAME_RESULT.WHITE_WIN,
    reason: 'timeout',
  };
}

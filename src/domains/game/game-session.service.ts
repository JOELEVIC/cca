import { PubSub } from 'graphql-subscriptions';
import {
  GameSessionState,
  GameResult,
  GameUpdatePayload,
  GAME_STATUS,
  GAME_RESULT,
} from './game-session.types.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../../types/index.js';

const GAME_UPDATED_TOPIC = 'GAME_UPDATED';

export class GameSessionService {
  private sessions = new Map<string, GameSessionState>();
  constructor(private pubsub: PubSub) {}

  /**
   * Register a game session (call after game is created on ccanext).
   * Idempotent: if session exists, returns current state.
   */
  startSession(gameId: string, whiteId: string, blackId: string, timeControl: string): GameSessionState {
    const existing = this.sessions.get(gameId);
    if (existing) {
      return existing;
    }
    const timeControlRegex = /^\d+\+\d+$/;
    if (!timeControlRegex.test(timeControl)) {
      throw new ValidationError('Invalid time control format. Use format: "minutes+increment"');
    }
    if (whiteId === blackId) {
      throw new ValidationError('Players cannot play against themselves');
    }
    const now = new Date();
    const state: GameSessionState = {
      gameId,
      whiteId,
      blackId,
      moves: '',
      status: GAME_STATUS.PENDING,
      timeControl,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(gameId, state);
    return state;
  }

  getSession(gameId: string): GameSessionState | null {
    return this.sessions.get(gameId) ?? null;
  }

  getSessionOrThrow(gameId: string): GameSessionState {
    const session = this.sessions.get(gameId);
    if (!session) {
      throw new NotFoundError('Game session not found');
    }
    return session;
  }

  private publish(gameId: string, payload: GameUpdatePayload): void {
    this.pubsub.publish(`${GAME_UPDATED_TOPIC}_${gameId}`, { gameUpdated: payload });
  }

  makeMove(gameId: string, userId: string, move: string): GameSessionState {
    const session = this.getSessionOrThrow(gameId);
    if (session.status !== GAME_STATUS.ACTIVE && session.status !== GAME_STATUS.PENDING) {
      throw new ValidationError('Game is not active');
    }
    const moves = session.moves ? session.moves.split(' ').filter(Boolean) : [];
    const isWhiteTurn = moves.length % 2 === 0;
    if (isWhiteTurn && userId !== session.whiteId) {
      throw new AuthorizationError("Not white's turn");
    }
    if (!isWhiteTurn && userId !== session.blackId) {
      throw new AuthorizationError("Not black's turn");
    }
    const updatedMoves = session.moves ? `${session.moves} ${move}` : move;
    const newStatus = session.status === GAME_STATUS.PENDING ? GAME_STATUS.ACTIVE : session.status;
    const updated: GameSessionState = {
      ...session,
      moves: updatedMoves,
      status: newStatus,
      updatedAt: new Date(),
    };
    this.sessions.set(gameId, updated);
    this.publish(gameId, {
      gameId,
      event: 'MOVE',
      moves: updated.moves,
      status: updated.status,
      move,
    });
    return updated;
  }

  resignGame(gameId: string, userId: string): GameSessionState {
    const session = this.getSessionOrThrow(gameId);
    if (session.status !== GAME_STATUS.ACTIVE && session.status !== GAME_STATUS.PENDING) {
      throw new ValidationError('Game is not active');
    }
    if (userId !== session.whiteId && userId !== session.blackId) {
      throw new AuthorizationError('Only players can resign');
    }
    const result: GameResult = userId === session.whiteId ? GAME_RESULT.BLACK_WIN : GAME_RESULT.WHITE_WIN;
    const updated: GameSessionState = {
      ...session,
      status: GAME_STATUS.COMPLETED,
      result,
      updatedAt: new Date(),
    };
    this.sessions.set(gameId, updated);
    this.publish(gameId, {
      gameId,
      event: 'GAME_END',
      moves: updated.moves,
      status: updated.status,
      result: updated.result ?? undefined,
      reason: 'resignation',
    });
    return updated;
  }

  offerDraw(gameId: string, userId: string): GameSessionState {
    const session = this.getSessionOrThrow(gameId);
    if (session.status !== GAME_STATUS.ACTIVE && session.status !== GAME_STATUS.PENDING) {
      throw new ValidationError('Game is not active');
    }
    if (userId !== session.whiteId && userId !== session.blackId) {
      throw new AuthorizationError('Only players can offer draw');
    }
    const updated: GameSessionState = {
      ...session,
      drawOfferBy: userId,
      updatedAt: new Date(),
    };
    this.sessions.set(gameId, updated);
    this.publish(gameId, {
      gameId,
      event: 'DRAW_OFFER',
      moves: updated.moves,
      status: updated.status,
      drawOfferBy: userId,
    });
    return updated;
  }

  acceptDraw(gameId: string, userId: string): GameSessionState {
    const session = this.getSessionOrThrow(gameId);
    if (session.status !== GAME_STATUS.ACTIVE && session.status !== GAME_STATUS.PENDING) {
      throw new ValidationError('Game is not active');
    }
    if (!session.drawOfferBy || session.drawOfferBy === userId) {
      throw new ValidationError('No draw offer to accept or cannot accept own offer');
    }
    const updated: GameSessionState = {
      ...session,
      status: GAME_STATUS.COMPLETED,
      result: GAME_RESULT.DRAW,
      drawOfferBy: undefined,
      updatedAt: new Date(),
    };
    this.sessions.set(gameId, updated);
    this.publish(gameId, {
      gameId,
      event: 'DRAW_ACCEPTED',
      moves: updated.moves,
      status: updated.status,
      result: GAME_RESULT.DRAW,
      reason: 'agreement',
    });
    return updated;
  }

  rejectDraw(gameId: string, _userId: string): GameSessionState {
    const session = this.getSessionOrThrow(gameId);
    if (!session.drawOfferBy) {
      throw new ValidationError('No draw offer to reject');
    }
    const updated: GameSessionState = {
      ...session,
      drawOfferBy: undefined,
      updatedAt: new Date(),
    };
    this.sessions.set(gameId, updated);
    this.publish(gameId, {
      gameId,
      event: 'DRAW_REJECTED',
      moves: updated.moves,
      status: updated.status,
    });
    return updated;
  }

  /** Used by subscription resolver to get topic per game */
  static topicForGame(gameId: string): string {
    return `${GAME_UPDATED_TOPIC}_${gameId}`;
  }
}

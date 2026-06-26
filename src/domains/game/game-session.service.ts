import { PubSub } from 'graphql-subscriptions';
import {
  GameSessionState,
  GameResult,
  GameUpdatePayload,
  GameUpdateEvent,
  GAME_STATUS,
  GAME_RESULT,
} from './game-session.types.js';
import {
  parseTimeControl,
  plyCount,
  replay,
  applyToken,
  detectEnd,
  resultOnFlag,
} from './game-rules.js';
import { recordResultOnMainApi } from '../../utils/resultSink.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../../types/index.js';

const GAME_UPDATED_TOPIC = 'GAME_UPDATED';

// Before both players have moved, a game can still be aborted (no rating change).
// If the side to move doesn't move within this window, the game auto-aborts.
const ABORT_MS = 30_000;
// Once a game is rated (both moved), if a player disconnects we give them this
// long to come back before awarding the win to the present opponent.
const ABANDON_GRACE_MS = 120_000;
// Brief drops are normal on flaky/mobile networks (graphql-ws reconnects in a
// few seconds). Don't alarm the room or start the visible forfeit countdown
// until a player has actually been gone this long — avoids constant
// "opponent left / returned" churn and premature forfeits for slow connections.
const LEFT_NOTICE_DELAY_MS = 12_000;
const MAX_CHAT_LEN = 500;

/** The public (GraphQL-facing) projection of a session, with live clock values. */
export interface PublicGameSession {
  gameId: string;
  whiteId: string;
  blackId: string;
  moves: string;
  status: GameSessionState['status'];
  result?: GameResult | null;
  timeControl: string;
  drawOfferBy?: string | null;
  whiteMs: number;
  blackMs: number;
  serverTime: number;
  createdAt: Date;
  updatedAt: Date;
}

export class GameSessionService {
  private sessions = new Map<string, GameSessionState>();
  // gameId → timer that fires if the opening isn't played in time (auto-abort).
  private abortTimers = new Map<string, NodeJS.Timeout>();
  // gameId → timer that fires when the side-to-move's clock reaches zero (flag).
  private flagTimers = new Map<string, NodeJS.Timeout>();
  // `${gameId}:${userId}` → timer that awards the win if an absent player doesn't return.
  private abandonTimers = new Map<string, NodeJS.Timeout>();
  // `${gameId}:${userId}` → timer that announces OPPONENT_LEFT only after a sustained absence.
  private leftNoticeTimers = new Map<string, NodeJS.Timeout>();
  // `${gameId}:${userId}` we've actually announced as gone (so we only say "returned" for a real absence).
  private leftAnnounced = new Set<string>();
  // gameId → set of userIds currently subscribed (present) — players and spectators.
  private presence = new Map<string, Set<string>>();

  constructor(private pubsub: PubSub) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Register a game session (call after game is created on ccanext).
   * Idempotent: if the session exists, refreshes the caller's token and returns it.
   */
  startSession(
    gameId: string,
    whiteId: string,
    blackId: string,
    timeControl: string,
    callerId?: string,
    token?: string,
  ): GameSessionState {
    const existing = this.sessions.get(gameId);
    if (existing) {
      this.captureToken(existing, callerId, token);
      return existing;
    }
    const { initialMs, incrementMs } = parseTimeControl(timeControl);
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
      initialMs,
      incrementMs,
      whiteMs: initialMs,
      blackMs: initialMs,
      turnStartedAt: null, // clocks start on the first move
      tokens: {},
      createdAt: now,
      updatedAt: now,
    };
    this.captureToken(state, callerId, token);
    this.sessions.set(gameId, state);
    // The opening-abort countdown is armed once BOTH players are present (see
    // registerPresence) — not here — so a game never aborts while one player is
    // still navigating in.
    return state;
  }

  getSession(gameId: string): GameSessionState | null {
    return this.sessions.get(gameId) ?? null;
  }

  getPublicSession(gameId: string): PublicGameSession | null {
    const s = this.sessions.get(gameId);
    return s ? this.toPublic(s) : null;
  }

  private getSessionOrThrow(gameId: string): GameSessionState {
    const session = this.sessions.get(gameId);
    if (!session) {
      throw new NotFoundError('Game session not found');
    }
    return session;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Moves
  // ──────────────────────────────────────────────────────────────────────────

  makeMove(gameId: string, userId: string, move: string, token?: string): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    this.captureToken(session, userId, token);
    if (session.status !== GAME_STATUS.ACTIVE && session.status !== GAME_STATUS.PENDING) {
      throw new ValidationError('Game is not active');
    }
    const plies = plyCount(session.moves);
    const moverIsWhite = plies % 2 === 0;
    if (moverIsWhite && userId !== session.whiteId) {
      throw new AuthorizationError("Not white's turn");
    }
    if (!moverIsWhite && userId !== session.blackId) {
      throw new AuthorizationError("Not black's turn");
    }

    // Validate the move against the real position (chess.js, non-strict notation).
    const chess = replay(session.moves);
    try {
      applyToken(chess, move);
    } catch {
      throw new ValidationError('Illegal move');
    }

    const now = Date.now();
    // Charge the mover's clock for the time spent (clocks run only once the game is ACTIVE).
    if (session.turnStartedAt != null) {
      const elapsed = now - session.turnStartedAt;
      if (moverIsWhite) session.whiteMs -= elapsed;
      else session.blackMs -= elapsed;
      const moverMs = moverIsWhite ? session.whiteMs : session.blackMs;
      if (moverMs <= 0) {
        // Flagged before the move could land.
        return this.flag(gameId, moverIsWhite);
      }
      if (moverIsWhite) session.whiteMs += session.incrementMs;
      else session.blackMs += session.incrementMs;
    }

    session.moves = session.moves ? `${session.moves} ${move}` : move;
    session.status = GAME_STATUS.ACTIVE;
    session.drawOfferBy = null; // a pending draw offer expires once a move is played
    session.updatedAt = new Date(now);

    // Natural end (checkmate / stalemate / draw) — clocks already updated above.
    const end = detectEnd(chess, moverIsWhite);
    if (end) {
      return this.finish(gameId, GAME_STATUS.COMPLETED, end.result, end.reason);
    }

    // Hand the clock to the opponent and (re)arm the right timer.
    session.turnStartedAt = now;
    this.clearTimers(gameId);
    if (plyCount(session.moves) < 2) this.scheduleAbort(gameId);
    else this.scheduleFlag(gameId);

    this.publish(gameId, 'MOVE', { move });
    return this.toPublic(session);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Resign / abort / draw
  // ──────────────────────────────────────────────────────────────────────────

  resignGame(gameId: string, userId: string, token?: string): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    this.captureToken(session, userId, token);
    this.assertParticipant(session, userId, 'resign');
    this.assertActive(session);
    if (plyCount(session.moves) < 2) {
      throw new ValidationError('Cannot resign before both players have moved — abort instead');
    }
    const result: GameResult = userId === session.whiteId ? GAME_RESULT.BLACK_WIN : GAME_RESULT.WHITE_WIN;
    return this.finish(gameId, GAME_STATUS.COMPLETED, result, 'resignation');
  }

  /** Void a game that hasn't really started (no rating change). Only valid before both players have moved. */
  abortGame(gameId: string, userId: string, token?: string): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    this.captureToken(session, userId, token);
    this.assertParticipant(session, userId, 'abort');
    this.assertActive(session);
    if (plyCount(session.moves) >= 2) {
      throw new ValidationError('The game is under way — resign instead of aborting');
    }
    return this.finish(gameId, GAME_STATUS.ABANDONED, null, 'aborted');
  }

  offerDraw(gameId: string, userId: string, token?: string): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    this.captureToken(session, userId, token);
    this.assertParticipant(session, userId, 'offer a draw');
    this.assertActive(session);
    session.drawOfferBy = userId;
    session.updatedAt = new Date();
    this.publish(gameId, 'DRAW_OFFER', { drawOfferBy: userId });
    return this.toPublic(session);
  }

  acceptDraw(gameId: string, userId: string, token?: string): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    this.captureToken(session, userId, token);
    this.assertActive(session);
    if (!session.drawOfferBy || session.drawOfferBy === userId) {
      throw new ValidationError('No draw offer to accept or cannot accept own offer');
    }
    return this.finish(gameId, GAME_STATUS.COMPLETED, GAME_RESULT.DRAW, 'agreement');
  }

  rejectDraw(gameId: string, userId: string, token?: string): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    this.captureToken(session, userId, token);
    if (!session.drawOfferBy) {
      throw new ValidationError('No draw offer to reject');
    }
    session.drawOfferBy = null;
    session.updatedAt = new Date();
    this.publish(gameId, 'DRAW_REJECTED', {});
    return this.toPublic(session);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Chat
  // ──────────────────────────────────────────────────────────────────────────

  sendChatMessage(gameId: string, userId: string, text: string): boolean {
    const session = this.getSessionOrThrow(gameId);
    const clean = (text ?? '').toString().trim().slice(0, MAX_CHAT_LEN);
    if (!clean) throw new ValidationError('Empty message');
    this.publish(gameId, 'CHAT', { chatUserId: userId, chatText: clean }, session);
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Presence (drives prompt abandonment for rated games)
  // ──────────────────────────────────────────────────────────────────────────

  registerPresence(gameId: string, userId: string): void {
    let set = this.presence.get(gameId);
    if (!set) {
      set = new Set();
      this.presence.set(gameId, set);
    }
    set.add(userId);
    const key = `${gameId}:${userId}`;
    // A pending soft-notice means this was just a brief blip — cancel it silently.
    const notice = this.leftNoticeTimers.get(key);
    if (notice) {
      clearTimeout(notice);
      this.leftNoticeTimers.delete(key);
    }
    // They're back — cancel the forfeit timer; only tell the room "returned" if we
    // actually announced them gone (otherwise nobody ever saw them leave).
    const t = this.abandonTimers.get(key);
    if (t) {
      clearTimeout(t);
      this.abandonTimers.delete(key);
      if (this.leftAnnounced.has(key)) {
        this.leftAnnounced.delete(key);
        this.publish(gameId, 'OPPONENT_RETURNED', { awayUserId: userId });
      }
    }
    // Once both players are in the room, start the opening auto-abort countdown.
    this.maybeArmOpeningAbort(gameId);
  }

  /** Arm the 30s no-move auto-abort, but only once both players are present and the game is still abortable. */
  private maybeArmOpeningAbort(gameId: string): void {
    const session = this.sessions.get(gameId);
    if (!session) return;
    if (session.status !== GAME_STATUS.PENDING && session.status !== GAME_STATUS.ACTIVE) return;
    if (plyCount(session.moves) >= 2) return;
    if (this.abortTimers.has(gameId)) return;
    const present = this.presence.get(gameId);
    if (!present || !present.has(session.whiteId) || !present.has(session.blackId)) return;

    // Both players are in → the match begins. Start White's clock immediately
    // (and flip the game ACTIVE) so White can see it's their move — players kept
    // forgetting to make the first move because nothing looked "live". GAME_STATE
    // makes the clients apply the running clock; the opening still aborts (no
    // rating) if no move arrives in time.
    if (session.status === GAME_STATUS.PENDING && session.turnStartedAt == null) {
      session.status = GAME_STATUS.ACTIVE;
      session.turnStartedAt = Date.now();
      session.updatedAt = new Date();
      this.publish(gameId, 'GAME_STATE', {});
    }

    this.scheduleAbort(gameId);
    this.publish(gameId, 'ABORT_ARMED', { deadline: Date.now() + ABORT_MS });
  }

  unregisterPresence(gameId: string, userId: string): void {
    const set = this.presence.get(gameId);
    if (set) set.delete(userId);
    const session = this.sessions.get(gameId);
    if (!session) return;
    // Only rated, in-progress games punish a departure; the opening just aborts on its own timer.
    const isParticipant = userId === session.whiteId || userId === session.blackId;
    if (!isParticipant) return;
    if (session.status !== GAME_STATUS.ACTIVE || plyCount(session.moves) < 2) return;
    const key = `${gameId}:${userId}`;
    if (this.abandonTimers.has(key)) return;
    const deadline = Date.now() + ABANDON_GRACE_MS;
    // Hard forfeit timer — only awards the win after a *sustained* absence.
    this.abandonTimers.set(key, setTimeout(() => this.onAbandon(gameId, userId), ABANDON_GRACE_MS));
    // Soft notice — wait out brief reconnects before showing the room a countdown.
    this.leftNoticeTimers.set(
      key,
      setTimeout(() => {
        this.leftNoticeTimers.delete(key);
        const present = this.presence.get(gameId);
        if (present && present.has(userId)) return; // already back — never alarm
        this.leftAnnounced.add(key);
        this.publish(gameId, 'OPPONENT_LEFT', { awayUserId: userId, deadline });
      }, LEFT_NOTICE_DELAY_MS),
    );
  }

  private onAbandon(gameId: string, userId: string): void {
    const key = `${gameId}:${userId}`;
    this.abandonTimers.delete(key);
    this.leftAnnounced.delete(key);
    const session = this.sessions.get(gameId);
    if (!session || session.status !== GAME_STATUS.ACTIVE || plyCount(session.moves) < 2) return;
    // Still gone? Award the win to the opponent.
    const present = this.presence.get(gameId);
    if (present && present.has(userId)) return;
    const result: GameResult = userId === session.whiteId ? GAME_RESULT.BLACK_WIN : GAME_RESULT.WHITE_WIN;
    this.finish(gameId, GAME_STATUS.COMPLETED, result, 'abandonment');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Timers
  // ──────────────────────────────────────────────────────────────────────────

  private scheduleAbort(gameId: string): void {
    this.clearAbort(gameId);
    this.abortTimers.set(gameId, setTimeout(() => this.onAbort(gameId), ABORT_MS));
  }

  private onAbort(gameId: string): void {
    this.abortTimers.delete(gameId);
    const session = this.sessions.get(gameId);
    if (!session) return;
    if (session.status === GAME_STATUS.COMPLETED || session.status === GAME_STATUS.ABANDONED) return;
    if (plyCount(session.moves) >= 2) return; // no longer abortable
    this.finish(gameId, GAME_STATUS.ABANDONED, null, 'aborted: no move in time');
  }

  private scheduleFlag(gameId: string): void {
    this.clearFlag(gameId);
    const session = this.sessions.get(gameId);
    if (!session) return;
    const live = this.liveClocks(session);
    const whiteToMove = plyCount(session.moves) % 2 === 0;
    const ms = Math.max(0, whiteToMove ? live.whiteMs : live.blackMs);
    this.flagTimers.set(gameId, setTimeout(() => this.onFlag(gameId), ms));
  }

  private onFlag(gameId: string): PublicGameSession | void {
    this.flagTimers.delete(gameId);
    const session = this.sessions.get(gameId);
    if (!session || session.status !== GAME_STATUS.ACTIVE) return;
    const whiteToMove = plyCount(session.moves) % 2 === 0;
    return this.flag(gameId, whiteToMove);
  }

  /** End a game because `flaggedWhite`'s clock hit zero. */
  private flag(gameId: string, flaggedWhite: boolean): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    if (flaggedWhite) session.whiteMs = 0;
    else session.blackMs = 0;
    const { result, reason } = resultOnFlag(session.moves, flaggedWhite);
    return this.finish(gameId, GAME_STATUS.COMPLETED, result, reason);
  }

  private clearAbort(gameId: string): void {
    const t = this.abortTimers.get(gameId);
    if (t) clearTimeout(t);
    this.abortTimers.delete(gameId);
  }

  private clearFlag(gameId: string): void {
    const t = this.flagTimers.get(gameId);
    if (t) clearTimeout(t);
    this.flagTimers.delete(gameId);
  }

  private clearTimers(gameId: string): void {
    this.clearAbort(gameId);
    this.clearFlag(gameId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Finishing + persistence
  // ──────────────────────────────────────────────────────────────────────────

  private finish(
    gameId: string,
    status: typeof GAME_STATUS.COMPLETED | typeof GAME_STATUS.ABANDONED,
    result: GameResult | null,
    reason: string,
  ): PublicGameSession {
    const session = this.getSessionOrThrow(gameId);
    this.clearTimers(gameId);
    // Freeze the clocks at their current live values.
    const live = this.liveClocks(session);
    session.whiteMs = live.whiteMs;
    session.blackMs = live.blackMs;
    session.turnStartedAt = null;
    session.status = status;
    session.result = result;
    session.endReason = reason;
    session.drawOfferBy = null;
    session.updatedAt = new Date();
    this.publish(gameId, 'GAME_END', { result: result ?? undefined, reason });
    this.persistResult(session, result, reason);
    return this.toPublic(session);
  }

  private persistResult(session: GameSessionState, result: GameResult | null, reason: string): void {
    if (session.resultRecorded) return;
    const token = session.tokens.white ?? session.tokens.black;
    if (!token) return; // no credential captured yet — best-effort; outcome still broadcast live
    session.resultRecorded = true;
    void recordResultOnMainApi({
      token,
      gameId: session.gameId,
      result,
      reason,
      moves: session.moves,
    }).then((ok) => {
      if (!ok) session.resultRecorded = false; // allow a later retry path to try again
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private captureToken(session: GameSessionState, userId?: string, token?: string): void {
    if (!userId || !token) return;
    if (userId === session.whiteId) session.tokens.white = token;
    else if (userId === session.blackId) session.tokens.black = token;
  }

  private assertParticipant(session: GameSessionState, userId: string, action: string): void {
    if (userId !== session.whiteId && userId !== session.blackId) {
      throw new AuthorizationError(`Only players can ${action}`);
    }
  }

  private assertActive(session: GameSessionState): void {
    if (session.status !== GAME_STATUS.ACTIVE && session.status !== GAME_STATUS.PENDING) {
      throw new ValidationError('Game is not active');
    }
  }

  /** Remaining clocks right now, extrapolating the running side from `turnStartedAt`. */
  private liveClocks(session: GameSessionState): { whiteMs: number; blackMs: number } {
    let whiteMs = session.whiteMs;
    let blackMs = session.blackMs;
    if (session.turnStartedAt != null) {
      const elapsed = Date.now() - session.turnStartedAt;
      const whiteToMove = plyCount(session.moves) % 2 === 0;
      if (whiteToMove) whiteMs = Math.max(0, whiteMs - elapsed);
      else blackMs = Math.max(0, blackMs - elapsed);
    }
    return { whiteMs, blackMs };
  }

  private toPublic(session: GameSessionState): PublicGameSession {
    const live = this.liveClocks(session);
    return {
      gameId: session.gameId,
      whiteId: session.whiteId,
      blackId: session.blackId,
      moves: session.moves,
      status: session.status,
      result: session.result ?? null,
      timeControl: session.timeControl,
      drawOfferBy: session.drawOfferBy ?? null,
      whiteMs: Math.round(live.whiteMs),
      blackMs: Math.round(live.blackMs),
      serverTime: Date.now(),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private publish(
    gameId: string,
    event: GameUpdateEvent,
    extra: Partial<GameUpdatePayload>,
    sessionOverride?: GameSessionState,
  ): void {
    const session = sessionOverride ?? this.sessions.get(gameId);
    if (!session) return;
    const live = this.liveClocks(session);
    const payload: GameUpdatePayload = {
      gameId,
      event,
      moves: session.moves,
      status: session.status,
      result: session.result ?? undefined,
      drawOfferBy: session.drawOfferBy ?? undefined,
      whiteMs: Math.round(live.whiteMs),
      blackMs: Math.round(live.blackMs),
      serverTime: Date.now(),
      ...extra,
    };
    this.pubsub.publish(`${GAME_UPDATED_TOPIC}_${gameId}`, { gameUpdated: payload });
  }

  /** Used by the subscription resolver to get the topic per game. */
  static topicForGame(gameId: string): string {
    return `${GAME_UPDATED_TOPIC}_${gameId}`;
  }
}

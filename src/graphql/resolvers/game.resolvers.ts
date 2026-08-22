import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';
import { GameSessionService } from '../../domains/game/game-session.service.js';
import type { GameUpdatePayload, ValidationState } from '../../domains/game/game-session.types.js';
import { pubsub } from '../pubsub.js';

function requireUser(context: GraphQLContextWithServices) {
  if (!context.user) {
    throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return context.user;
}

export const gameResolvers = {
  Query: {
    gameSession: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      return context.gameSessionService.getPublicSession(gameId);
    },
  },

  Mutation: {
    startGameSession: async (
      _: unknown,
      { gameId, whiteId, blackId, timeControl, validationState }: {
        gameId: string;
        whiteId: string;
        blackId: string;
        timeControl: string;
        validationState?: ValidationState | null;
      },
      context: GraphQLContextWithServices,
    ) => {
      const user = requireUser(context);
      context.gameSessionService.startSession(
        gameId,
        whiteId,
        blackId,
        timeControl,
        user.userId,
        context.token,
        validationState,
      );
      return context.gameSessionService.getPublicSession(gameId);
    },

    makeMove: async (
      _: unknown,
      { gameId, move }: { gameId: string; move: string },
      context: GraphQLContextWithServices,
    ) => {
      const user = requireUser(context);
      return context.gameSessionService.makeMove(gameId, user.userId, move, context.token);
    },

    resignGame: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      const user = requireUser(context);
      return context.gameSessionService.resignGame(gameId, user.userId, context.token);
    },

    abortGame: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      const user = requireUser(context);
      return context.gameSessionService.abortGame(gameId, user.userId, context.token);
    },

    offerDraw: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      const user = requireUser(context);
      return context.gameSessionService.offerDraw(gameId, user.userId, context.token);
    },

    acceptDraw: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      const user = requireUser(context);
      return context.gameSessionService.acceptDraw(gameId, user.userId, context.token);
    },

    rejectDraw: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      const user = requireUser(context);
      return context.gameSessionService.rejectDraw(gameId, user.userId, context.token);
    },

    sendChatMessage: async (
      _: unknown,
      { gameId, text }: { gameId: string; text: string },
      context: GraphQLContextWithServices,
    ) => {
      const user = requireUser(context);
      return context.gameSessionService.sendChatMessage(gameId, user.userId, text);
    },
  },

  Subscription: {
    gameUpdated: {
      subscribe: async (
        _: unknown,
        { gameId }: { gameId: string },
        context: GraphQLContextWithServices,
      ) => {
        const user = requireUser(context);
        const topic = GameSessionService.topicForGame(gameId);
        const service = context.gameSessionService;

        // Send the current state immediately so a (re)joining client/spectator is in sync.
        const session = service.getPublicSession(gameId);
        if (session) {
          const payload = {
            gameId: session.gameId,
            event: 'GAME_STATE' as const,
            moves: session.moves,
            status: session.status,
            result: session.result ?? undefined,
            drawOfferBy: session.drawOfferBy ?? undefined,
            whiteMs: session.whiteMs,
            blackMs: session.blackMs,
            serverTime: session.serverTime,
          };
          setImmediate(() => pubsub.publish(topic, { gameUpdated: payload }));
        }

        // Track presence so a rated game can be awarded if a player leaves and doesn't return.
        service.registerPresence(gameId, user.userId);
        const iterator = pubsub.asyncIterableIterator<{ gameUpdated: GameUpdatePayload }>(topic);
        const originalReturn = iterator.return?.bind(iterator);
        iterator.return = async () => {
          service.unregisterPresence(gameId, user.userId);
          return originalReturn
            ? originalReturn()
            : ({ value: undefined, done: true } as IteratorResult<{ gameUpdated: GameUpdatePayload }>);
        };
        return iterator;
      },
    },
  },
};

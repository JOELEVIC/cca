import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';
import { GameSessionService } from '../../domains/game/game-session.service.js';
import type { GameUpdatePayload } from '../../domains/game/game-session.types.js';
import { pubsub } from '../pubsub.js';

export const gameResolvers = {
  Query: {
    gameSession: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      return context.gameSessionService.getSession(gameId);
    },
  },

  Mutation: {
    startGameSession: async (
      _: unknown,
      { gameId, whiteId, blackId, timeControl }: { gameId: string; whiteId: string; blackId: string; timeControl: string },
      context: GraphQLContextWithServices,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return context.gameSessionService.startSession(gameId, whiteId, blackId, timeControl);
    },

    makeMove: async (
      _: unknown,
      { gameId, move }: { gameId: string; move: string },
      context: GraphQLContextWithServices,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return context.gameSessionService.makeMove(gameId, context.user.userId, move);
    },

    resignGame: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return context.gameSessionService.resignGame(gameId, context.user.userId);
    },

    offerDraw: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return context.gameSessionService.offerDraw(gameId, context.user.userId);
    },

    acceptDraw: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return context.gameSessionService.acceptDraw(gameId, context.user.userId);
    },

    rejectDraw: async (_: unknown, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return context.gameSessionService.rejectDraw(gameId, context.user.userId);
    },
  },

  Subscription: {
    gameUpdated: {
      subscribe: async (
        _: unknown,
        { gameId }: { gameId: string },
        context: GraphQLContextWithServices,
      ) => {
        if (!context.user) {
          throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
        }
        const topic = GameSessionService.topicForGame(gameId);
        const session = context.gameSessionService.getSession(gameId);
        if (session) {
          const payload = {
            gameId: session.gameId,
            event: 'GAME_STATE' as const,
            moves: session.moves,
            status: session.status,
            result: session.result ?? undefined,
            drawOfferBy: session.drawOfferBy ?? undefined,
          };
          setImmediate(() => pubsub.publish(topic, { gameUpdated: payload }));
        }
        return pubsub.asyncIterableIterator<{ gameUpdated: GameUpdatePayload }>(topic);
      },
    },
  },
};

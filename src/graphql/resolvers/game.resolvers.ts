import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';
import { GameStatus } from '@prisma/client';

export const gameResolvers = {
  Query: {
    game: async (_: any, { id }: { id: string }, context: GraphQLContextWithServices) => {
      return context.services.gameService.getGameById(id);
    },

    myGames: async (_: any, { status }: { status?: GameStatus }, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.gameService.getUserGames(context.user.userId, status);
    },

    liveGames: async (_: any, __: any, context: GraphQLContextWithServices) => {
      return context.services.gameService.getActiveGames();
    },
  },

  Mutation: {
    createGame: async (_: any, { input }: any, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.gameService.createGame(input);
    },

    makeMove: async (
      _: any,
      { gameId, move }: { gameId: string; move: string },
      context: GraphQLContextWithServices,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.gameService.makeMove({
        gameId,
        move,
        userId: context.user.userId,
      });
    },

    resignGame: async (_: any, { gameId }: { gameId: string }, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.gameService.resignGame(gameId, context.user.userId);
    },
  },

  Game: {
    white: async (parent: any) => {
      return parent.white;
    },
    black: async (parent: any) => {
      return parent.black;
    },
    tournament: async (parent: any) => {
      return parent.tournament;
    },
  },
};

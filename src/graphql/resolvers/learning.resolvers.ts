import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';

export const learningResolvers = {
  Query: {
    dailyPuzzle: async (_: any, __: any, context: GraphQLContextWithServices) => {
      return context.services.learningService.getDailyPuzzle();
    },

    puzzles: async (
      _: any,
      { difficulty }: { difficulty?: number },
      context: GraphQLContextWithServices,
    ) => {
      return context.services.learningService.getPuzzles(
        difficulty ? { difficulty } : undefined,
      );
    },

    puzzle: async (_: any, { id }: { id: string }, context: GraphQLContextWithServices) => {
      return context.services.learningService.getPuzzleById(id);
    },
  },

  Mutation: {
    checkPuzzleSolution: async (
      _: any,
      { puzzleId, solution }: { puzzleId: string; solution: string },
      context: GraphQLContextWithServices,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.learningService.checkSolution({
        puzzleId,
        userSolution: solution,
      });
    },
  },
};

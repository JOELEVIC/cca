import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';

export const schoolResolvers = {
  Query: {
    school: async (_: any, { id }: { id: string }, context: GraphQLContextWithServices) => {
      return context.services.institutionService.getSchoolById(id);
    },

    schools: async (_: any, __: any, context: GraphQLContextWithServices) => {
      return context.services.institutionService.getAllSchools();
    },

    schoolsByRegion: async (
      _: any,
      { region }: { region: string },
      context: GraphQLContextWithServices,
    ) => {
      return context.services.institutionService.getSchoolsByRegion(region);
    },

    schoolLeaderboard: async (
      _: any,
      { schoolId }: { schoolId: string },
      context: GraphQLContextWithServices,
    ) => {
      const leaderboard = await context.services.institutionService.getSchoolLeaderboard(schoolId);
      
      // Transform to match GraphQL schema
      return leaderboard.map((entry) => ({
        user: {
          id: entry.userId,
          username: entry.username,
          rating: entry.rating,
          profile: entry.profile,
        },
        gamesPlayed: entry.gamesPlayed,
      }));
    },

    schoolStats: async (
      _: any,
      { schoolId }: { schoolId: string },
      context: GraphQLContextWithServices,
    ) => {
      return context.services.institutionService.getSchoolStats(schoolId);
    },
  },

  Mutation: {
    createSchool: async (_: any, { input }: any, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.institutionService.createSchool(input);
    },
  },

  School: {
    students: async (parent: any) => {
      return parent.students || [];
    },
    tournaments: async (parent: any) => {
      return parent.tournaments || [];
    },
  },
};

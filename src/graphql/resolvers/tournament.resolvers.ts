import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';
import { TournamentStatus } from '@prisma/client';

export const tournamentResolvers = {
  Query: {
    tournament: async (_: any, { id }: { id: string }, context: GraphQLContextWithServices) => {
      return context.services.tournamentService.getTournamentById(id);
    },

    schoolTournaments: async (
      _: any,
      { schoolId }: { schoolId: string },
      context: GraphQLContextWithServices,
    ) => {
      return context.services.tournamentService.getSchoolTournaments(schoolId);
    },

    tournaments: async (
      _: any,
      { status }: { status?: TournamentStatus },
      context: GraphQLContextWithServices,
    ) => {
      return context.services.tournamentService.getTournaments(
        status ? { status } : undefined,
      );
    },
  },

  Mutation: {
    createTournament: async (_: any, { input }: any, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.tournamentService.createTournament(input);
    },

    joinTournament: async (
      _: any,
      { tournamentId }: { tournamentId: string },
      context: GraphQLContextWithServices,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      await context.services.tournamentService.addParticipant({
        tournamentId,
        userId: context.user.userId,
      });

      return context.services.tournamentService.getTournamentById(tournamentId);
    },

    startTournament: async (
      _: any,
      { tournamentId }: { tournamentId: string },
      context: GraphQLContextWithServices,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.tournamentService.startTournament(tournamentId);
    },

    completeTournament: async (
      _: any,
      { tournamentId }: { tournamentId: string },
      context: GraphQLContextWithServices,
    ) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.tournamentService.completeTournament(tournamentId);
    },
  },

  Tournament: {
    school: async (parent: any) => {
      return parent.school;
    },
    participants: async (parent: any) => {
      return parent.participants;
    },
    games: async (parent: any) => {
      return parent.games;
    },
  },

  TournamentParticipant: {
    user: async (parent: any) => {
      return parent.user;
    },
  },
};

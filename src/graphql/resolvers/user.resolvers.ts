import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';
import { UserRole } from '@prisma/client';

export const userResolvers = {
  Query: {
    me: async (_: any, __: any, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.userService.getUserById(context.user.userId);
    },

    user: async (_: any, { id }: { id: string }, context: GraphQLContextWithServices) => {
      return context.services.userService.getUserById(id);
    },

    users: async (_: any, { filters }: any, context: GraphQLContextWithServices) => {
      return context.services.userService.getUsers(filters);
    },
  },

  Mutation: {
    register: async (_: any, { input }: any, context: GraphQLContextWithServices) => {
      const profileData = input.firstName && input.lastName
        ? {
            firstName: input.firstName,
            lastName: input.lastName,
          }
        : undefined;

      return context.services.userService.createUser({
        email: input.email,
        username: input.username,
        password: input.password,
        role: input.role as UserRole,
        schoolId: input.schoolId,
        profile: profileData,
      });
    },

    login: async (_: any, { input }: any, context: GraphQLContextWithServices) => {
      return context.services.userService.authenticateUser(input);
    },

    updateProfile: async (_: any, { input }: any, context: GraphQLContextWithServices) => {
      if (!context.user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      return context.services.userService.updateProfile(context.user.userId, input);
    },
  },

  User: {
    profile: async (parent: any) => {
      return parent.profile;
    },
    school: async (parent: any) => {
      return parent.school;
    },
  },

  Profile: {
    badges: async (parent: any, _: any, context: GraphQLContextWithServices) => {
      return context.services.learningService.getUserBadges(parent.id);
    },
  },
};

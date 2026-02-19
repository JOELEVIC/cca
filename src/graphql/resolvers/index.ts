import { GraphQLScalarType, Kind } from 'graphql';
import { userResolvers } from './user.resolvers.js';
import { gameResolvers } from './game.resolvers.js';
import { tournamentResolvers } from './tournament.resolvers.js';
import { learningResolvers } from './learning.resolvers.js';
import { schoolResolvers } from './school.resolvers.js';

// DateTime scalar for handling dates
const dateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value: any) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

// Merge all resolvers
export const resolvers = {
  DateTime: dateTimeScalar,

  Query: {
    ...userResolvers.Query,
    ...gameResolvers.Query,
    ...tournamentResolvers.Query,
    ...learningResolvers.Query,
    ...schoolResolvers.Query,
  },

  Mutation: {
    ...userResolvers.Mutation,
    ...gameResolvers.Mutation,
    ...tournamentResolvers.Mutation,
    ...learningResolvers.Mutation,
    ...schoolResolvers.Mutation,
  },

  User: userResolvers.User,
  Profile: userResolvers.Profile,
  Game: gameResolvers.Game,
  Tournament: tournamentResolvers.Tournament,
  TournamentParticipant: tournamentResolvers.TournamentParticipant,
  School: schoolResolvers.School,
};

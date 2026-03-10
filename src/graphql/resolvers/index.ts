import { GraphQLScalarType, Kind } from 'graphql';
import { gameResolvers } from './game.resolvers.js';

const dateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value: unknown) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  },
  parseValue(value: unknown) {
    return value ? new Date(value as string) : null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

export const resolvers = {
  DateTime: dateTimeScalar,

  Query: gameResolvers.Query,
  Mutation: gameResolvers.Mutation,
  Subscription: gameResolvers.Subscription,
};

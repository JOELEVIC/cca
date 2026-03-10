import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers/index.js';

export const executableSchema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

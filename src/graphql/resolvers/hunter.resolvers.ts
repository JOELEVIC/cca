/**
 * Hunter resolvers — the R2M data bridge.
 *
 * Single query: `hunterProfile(chesscomUsername)` pulls the player's recent
 * games from Chess.com, parses them with the regex PGN analyser, and maps
 * them onto the 6-attribute R2M profile + Hunter Class.
 *
 * The Chess.com call is cached in-memory for 5 minutes (see
 * chesscom.service.ts) so successive resolver calls within a session are
 * cheap.
 */

import { GraphQLError } from 'graphql';
import { GraphQLContextWithServices } from '../context.js';
import { getCachedRecentGames } from '../../services/chesscom.service.js';
import { styleFromGames } from '../../services/playerStyle.service.js';

const UA = 'Cameroon-Chess-Academy/1.0 (https://cca.cm; +r2m)';

export const hunterResolvers = {
  Query: {
    hunterProfile: async (
      _: unknown,
      { chesscomUsername, sampleSize }: { chesscomUsername: string; sampleSize?: number },
      _ctx: GraphQLContextWithServices,
    ) => {
      const username = chesscomUsername?.trim();
      if (!username) {
        throw new GraphQLError('chesscomUsername is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      const limit = Math.max(10, Math.min(150, sampleSize ?? 50));
      try {
        const games = await getCachedRecentGames(username, limit, { userAgent: UA });
        const style = styleFromGames(username, games);
        // Flatten the timeClassMix into a list for GraphQL output.
        const timeClassMix = Object.entries(style.sample.timeClassMix).map(([cls, count]) => ({
          timeClass: cls,
          count,
        }));
        return {
          username: style.username,
          computedAt: style.computedAt,
          attributes: style.attributes,
          hunterClass: style.hunterClass,
          sample: {
            games: style.sample.games,
            medianRating: style.sample.medianRating,
            avgPlies: style.sample.avgPlies,
            timeClassMix,
          },
          recommendation: style.recommendation,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        if (message.toLowerCase().includes('not found')) {
          throw new GraphQLError(message, { extensions: { code: 'NOT_FOUND' } });
        }
        throw new GraphQLError(`Hunter profile failed: ${message}`, {
          extensions: { code: 'CHESSCOM_BRIDGE_ERROR' },
        });
      }
    },
  },
};

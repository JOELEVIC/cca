/**
 * Engine resolvers — server-side fallback for clients that can't run
 * Stockfish in a WebAssembly worker (e.g. browser blocked the .wasm,
 * mobile webview, file mis-served behind a CDN). Wraps the spawned
 * Stockfish binary in `services/stockfish.service.ts`.
 */
import { GraphQLError } from 'graphql';
import { getBestMove, getEvaluation } from '../../services/stockfish.service.js';

const FEN_SHAPE = /^[1-8pnbrqkPNBRQK/]+ [wb] [KQkqA-Ha-h-]+ (-|[a-h][1-8]) \d+ \d+$/;

export const engineResolvers = {
  Query: {
    engineBestMove: async (
      _: unknown,
      { fen, elo }: { fen: string; elo?: number | null },
    ): Promise<string | null> => {
      if (!fen || !FEN_SHAPE.test(fen.trim())) {
        throw new GraphQLError('Invalid FEN', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      try {
        return await getBestMove(fen.trim(), elo ?? 1600);
      } catch (err) {
        throw new GraphQLError(
          err instanceof Error ? `Engine error: ${err.message}` : 'Engine error',
          { extensions: { code: 'ENGINE_ERROR' } },
        );
      }
    },

    engineEvaluation: async (
      _: unknown,
      { fen }: { fen: string },
    ): Promise<{ cp: number | null; mate: number | null }> => {
      if (!fen || !FEN_SHAPE.test(fen.trim())) {
        throw new GraphQLError('Invalid FEN', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      try {
        return await getEvaluation(fen.trim());
      } catch (err) {
        throw new GraphQLError(
          err instanceof Error ? `Engine error: ${err.message}` : 'Engine error',
          { extensions: { code: 'ENGINE_ERROR' } },
        );
      }
    },
  },
};

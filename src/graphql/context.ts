import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database.js';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
import { UserService } from '../domains/user/user.service.js';
import { GameService } from '../domains/game/game.service.js';
import { TournamentService } from '../domains/tournament/tournament.service.js';
import { LearningService } from '../domains/learning/learning.service.js';
import { InstitutionService } from '../domains/institution/institution.service.js';
import { AuthContext } from '../types/index.js';

export interface GraphQLContextWithServices {
  user?: AuthContext;
  prisma: typeof prisma;
  services: {
    userService: UserService;
    gameService: GameService;
    tournamentService: TournamentService;
    learningService: LearningService;
    institutionService: InstitutionService;
  };
  request: FastifyRequest;
  reply: FastifyReply;
}

/**
 * Build GraphQL context from Fastify request
 */
export const buildContext = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<GraphQLContextWithServices> => {
  // Authenticate user (optional - doesn't fail if no token)
  await optionalAuthenticate(request);

  const user = (request as any).user;

  // Initialize services
  const userService = new UserService(prisma);
  const gameService = new GameService(prisma);
  const tournamentService = new TournamentService(prisma);
  const learningService = new LearningService(prisma);
  const institutionService = new InstitutionService(prisma);

  return {
    user,
    prisma,
    services: {
      userService,
      gameService,
      tournamentService,
      learningService,
      institutionService,
    },
    request,
    reply,
  };
};

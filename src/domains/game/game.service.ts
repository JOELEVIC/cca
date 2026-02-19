import { PrismaClient, GameStatus, GameResult } from '@prisma/client';
import { GameRepository } from './game.repository.js';
import { CreateGameDTO, MakeMoveDTO, GameFilters } from './game.types.js';
import { ValidationError, NotFoundError, AuthorizationError } from '../../types/index.js';
import { UserService } from '../user/user.service.js';

export class GameService {
  private gameRepository: GameRepository;
  private userService: UserService;

  constructor(prisma: PrismaClient) {
    this.gameRepository = new GameRepository(prisma);
    this.userService = new UserService(prisma);
  }

  /**
   * Create a new game
   */
  async createGame(data: CreateGameDTO) {
    // Validate players exist
    const white = await this.userService.getUserById(data.whiteId);
    const black = await this.userService.getUserById(data.blackId);

    if (!white || !black) {
      throw new ValidationError('Invalid player IDs');
    }

    if (data.whiteId === data.blackId) {
      throw new ValidationError('Players cannot play against themselves');
    }

    // Validate time control format (e.g., "10+0", "30+5")
    const timeControlRegex = /^\d+\+\d+$/;
    if (!timeControlRegex.test(data.timeControl)) {
      throw new ValidationError('Invalid time control format. Use format: "minutes+increment"');
    }

    return this.gameRepository.create(data);
  }

  /**
   * Get game by ID
   */
  async getGameById(id: string) {
    const game = await this.gameRepository.findById(id);

    if (!game) {
      throw new NotFoundError('Game not found');
    }

    return game;
  }

  /**
   * Get games with filters
   */
  async getGames(filters?: GameFilters) {
    return this.gameRepository.findMany(filters);
  }

  /**
   * Get user's games
   */
  async getUserGames(userId: string, status?: GameStatus) {
    return this.gameRepository.findUserGames(userId, status);
  }

  /**
   * Get all active games
   */
  async getActiveGames() {
    return this.gameRepository.findActiveGames();
  }

  /**
   * Make a move in a game
   */
  async makeMove(data: MakeMoveDTO) {
    const game = await this.getGameById(data.gameId);

    // Validate game status
    if (game.status !== GameStatus.ACTIVE && game.status !== GameStatus.PENDING) {
      throw new ValidationError('Game is not active');
    }

    // Validate it's the player's turn
    const moves = game.moves ? game.moves.split(' ').filter(Boolean) : [];
    const isWhiteTurn = moves.length % 2 === 0;

    if (isWhiteTurn && data.userId !== game.whiteId) {
      throw new AuthorizationError('Not white\'s turn');
    }

    if (!isWhiteTurn && data.userId !== game.blackId) {
      throw new AuthorizationError('Not black\'s turn');
    }

    // Add move to moves string
    const updatedMoves = game.moves ? `${game.moves} ${data.move}` : data.move;

    // Update game status if this was the first move
    const newStatus = game.status === GameStatus.PENDING ? GameStatus.ACTIVE : game.status;

    return this.gameRepository.update(data.gameId, {
      moves: updatedMoves,
      status: newStatus,
    });
  }

  /**
   * Resign game
   */
  async resignGame(gameId: string, userId: string) {
    const game = await this.getGameById(gameId);

    if (game.status !== GameStatus.ACTIVE && game.status !== GameStatus.PENDING) {
      throw new ValidationError('Game is not active');
    }

    if (userId !== game.whiteId && userId !== game.blackId) {
      throw new AuthorizationError('Only players can resign');
    }

    const result = userId === game.whiteId ? GameResult.BLACK_WIN : GameResult.WHITE_WIN;

    const updatedGame = await this.gameRepository.update(gameId, {
      status: GameStatus.COMPLETED,
      result,
    });

    // Update player ratings
    await this.updateRatingsAfterGame(updatedGame);

    return updatedGame;
  }

  /**
   * End game with result
   */
  async endGame(gameId: string, result: GameResult) {
    const game = await this.getGameById(gameId);

    if (game.status !== GameStatus.ACTIVE) {
      throw new ValidationError('Game is not active');
    }

    const updatedGame = await this.gameRepository.update(gameId, {
      status: GameStatus.COMPLETED,
      result,
    });

    // Update player ratings
    await this.updateRatingsAfterGame(updatedGame);

    return updatedGame;
  }

  /**
   * Check game status for checkmate, stalemate, etc.
   * This is a placeholder - would integrate with chess engine
   */
  async checkGameStatus(gameId: string): Promise<GameStatus> {
    const game = await this.getGameById(gameId);
    
    // TODO: Integrate with chess engine to check for:
    // - Checkmate
    // - Stalemate
    // - Draw by repetition
    // - Draw by insufficient material
    // - 50-move rule
    
    return game.status;
  }

  /**
   * Update player ratings after game completion
   */
  private async updateRatingsAfterGame(game: any) {
    if (!game.result) return;

    const whiteScore = game.result === GameResult.WHITE_WIN ? 1 : game.result === GameResult.DRAW ? 0.5 : 0;
    const blackScore = game.result === GameResult.BLACK_WIN ? 1 : game.result === GameResult.DRAW ? 0.5 : 0;

    // Calculate new ratings
    const whiteNewRating = this.userService.calculateEloRating(
      game.white.rating,
      game.black.rating,
      whiteScore,
    );

    const blackNewRating = this.userService.calculateEloRating(
      game.black.rating,
      game.white.rating,
      blackScore,
    );

    // Update ratings
    await Promise.all([
      this.userService.updateUserRating(game.whiteId, whiteNewRating),
      this.userService.updateUserRating(game.blackId, blackNewRating),
    ]);
  }
}

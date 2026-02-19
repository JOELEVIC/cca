import { PrismaClient } from '@prisma/client';
import { LearningRepository } from './learning.repository.js';
import { CreatePuzzleDTO, PuzzleFilters, CheckSolutionDTO, BadgeDTO } from './learning.types.js';
import { NotFoundError, ValidationError } from '../../types/index.js';

export class LearningService {
  private learningRepository: LearningRepository;

  constructor(private prisma: PrismaClient) {
    this.learningRepository = new LearningRepository(prisma);
  }

  /**
   * Get daily puzzle
   */
  async getDailyPuzzle() {
    const puzzle = await this.learningRepository.getDailyPuzzle();
    
    if (!puzzle) {
      throw new NotFoundError('No puzzles available');
    }

    return puzzle;
  }

  /**
   * Get puzzles with filters
   */
  async getPuzzles(filters?: PuzzleFilters) {
    return this.learningRepository.findPuzzles(filters);
  }

  /**
   * Get puzzle by ID
   */
  async getPuzzleById(id: string) {
    const puzzle = await this.learningRepository.findPuzzleById(id);

    if (!puzzle) {
      throw new NotFoundError('Puzzle not found');
    }

    return puzzle;
  }

  /**
   * Create a new puzzle
   */
  async createPuzzle(data: CreatePuzzleDTO) {
    // Validate FEN format (basic check)
    if (!data.fen || data.fen.split(' ').length < 4) {
      throw new ValidationError('Invalid FEN format');
    }

    // Validate difficulty range
    if (data.difficulty < 0 || data.difficulty > 3000) {
      throw new ValidationError('Difficulty must be between 0 and 3000');
    }

    return this.learningRepository.createPuzzle(data);
  }

  /**
   * Check puzzle solution
   */
  async checkSolution(data: CheckSolutionDTO): Promise<{ correct: boolean; solution: string }> {
    const puzzle = await this.getPuzzleById(data.puzzleId);

    // Normalize solutions for comparison
    const normalizedSolution = puzzle.solution.trim().toLowerCase();
    const normalizedUserSolution = data.userSolution.trim().toLowerCase();

    const correct = normalizedSolution === normalizedUserSolution;

    return {
      correct,
      solution: puzzle.solution,
    };
  }

  /**
   * Award badge to user
   */
  async awardBadge(data: BadgeDTO) {
    // Check if profile exists
    const profile = await this.prisma.profile.findUnique({
      where: { id: data.profileId },
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    return this.learningRepository.createBadge(data);
  }

  /**
   * Get user badges
   */
  async getUserBadges(profileId: string) {
    return this.learningRepository.getUserBadges(profileId);
  }

  /**
   * Track puzzle progress (placeholder for future implementation)
   */
  async trackPuzzleProgress(userId: string, puzzleId: string, solved: boolean) {
    // TODO: Implement puzzle progress tracking
    // This would store user puzzle attempts and statistics
    return {
      userId,
      puzzleId,
      solved,
      timestamp: new Date(),
    };
  }
}

import { PrismaClient } from '@prisma/client';
import { PuzzleFilters } from './learning.types.js';

export class LearningRepository {
  constructor(private prisma: PrismaClient) {}

  async findPuzzleById(id: string) {
    return this.prisma.puzzle.findUnique({
      where: { id },
    });
  }

  async findPuzzles(filters?: PuzzleFilters) {
    const where: any = {};

    if (filters?.difficulty) {
      where.difficulty = {
        gte: filters.difficulty - 100,
        lte: filters.difficulty + 100,
      };
    }

    if (filters?.theme) {
      where.theme = {
        has: filters.theme,
      };
    }

    return this.prisma.puzzle.findMany({
      where,
      orderBy: { difficulty: 'asc' },
    });
  }

  async getDailyPuzzle() {
    // Get a random puzzle - in production, this would be more sophisticated
    const count = await this.prisma.puzzle.count();
    const skip = Math.floor(Math.random() * count);
    
    return this.prisma.puzzle.findFirst({
      skip,
    });
  }

  async createPuzzle(data: {
    fen: string;
    solution: string;
    difficulty: number;
    theme: string[];
  }) {
    return this.prisma.puzzle.create({
      data,
    });
  }

  async createBadge(data: {
    profileId: string;
    name: string;
    description: string;
  }) {
    return this.prisma.badge.create({
      data,
      include: {
        profile: true,
      },
    });
  }

  async getUserBadges(profileId: string) {
    return this.prisma.badge.findMany({
      where: { profileId },
      orderBy: { earnedAt: 'desc' },
    });
  }
}

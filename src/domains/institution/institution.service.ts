import { PrismaClient, TournamentStatus } from '@prisma/client';
import { InstitutionRepository } from './institution.repository.js';
import { CreateSchoolDTO, UpdateSchoolDTO, SchoolStats, LeaderboardEntry } from './institution.types.js';
import { NotFoundError, ValidationError } from '../../types/index.js';

export class InstitutionService {
  private institutionRepository: InstitutionRepository;

  constructor(private prisma: PrismaClient) {
    this.institutionRepository = new InstitutionRepository(prisma);
  }

  /**
   * Create a new school
   */
  async createSchool(data: CreateSchoolDTO) {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('School name is required');
    }

    if (!data.region || data.region.trim().length === 0) {
      throw new ValidationError('Region is required');
    }

    return this.institutionRepository.create(data);
  }

  /**
   * Get school by ID
   */
  async getSchoolById(id: string) {
    const school = await this.institutionRepository.findById(id);

    if (!school) {
      throw new NotFoundError('School not found');
    }

    return school;
  }

  /**
   * Get all schools
   */
  async getAllSchools() {
    return this.institutionRepository.findAll();
  }

  /**
   * Get schools by region
   */
  async getSchoolsByRegion(region: string) {
    return this.institutionRepository.findByRegion(region);
  }

  /**
   * Update school
   */
  async updateSchool(id: string, data: UpdateSchoolDTO) {
    const school = await this.getSchoolById(id);

    if (!school) {
      throw new NotFoundError('School not found');
    }

    return this.institutionRepository.update(id, data);
  }

  /**
   * Get school leaderboard
   */
  async getSchoolLeaderboard(schoolId: string): Promise<LeaderboardEntry[]> {
    const students = await this.institutionRepository.getSchoolStudents(schoolId);

    // Get game counts for each student
    const leaderboard = await Promise.all(
      students.map(async (student: any) => {
        const gamesCount = await this.prisma.game.count({
          where: {
            OR: [{ whiteId: student.id }, { blackId: student.id }],
            status: 'COMPLETED',
          },
        });

        return {
          userId: student.id,
          username: student.username,
          rating: student.rating,
          gamesPlayed: gamesCount,
          profile: student.profile
            ? {
                firstName: student.profile.firstName,
                lastName: student.profile.lastName,
              }
            : undefined,
        };
      })
    );

    // Sort by rating (already sorted from query, but ensure it)
    return leaderboard.sort((a: any, b: any) => b.rating - a.rating);
  }

  /**
   * Get school statistics
   */
  async getSchoolStats(schoolId: string): Promise<SchoolStats> {
    const school = await this.getSchoolById(schoolId);

    // Get total students
    const totalStudents = school.students.length;

    // Calculate average rating
    const averageRating =
      totalStudents > 0
        ? Math.round(school.students.reduce((sum: number, s: any) => sum + s.rating, 0) / totalStudents)
        : 0;

    // Get total games played by school students
    const totalGames = await this.prisma.game.count({
      where: {
        OR: [
          { whiteId: { in: school.students.map((s: any) => s.id) } },
          { blackId: { in: school.students.map((s: any) => s.id) } },
        ],
        status: 'COMPLETED',
      },
    });

    // Get active tournaments
    const activeTournaments = await this.prisma.tournament.count({
      where: {
        schoolId,
        status: {
          in: [TournamentStatus.UPCOMING, TournamentStatus.ONGOING],
        },
      },
    });

    return {
      totalStudents,
      averageRating,
      totalGames,
      activeTournaments,
    };
  }

  /**
   * Delete school
   */
  async deleteSchool(id: string) {
    const school = await this.getSchoolById(id);

    // Check if school has students
    if (school.students.length > 0) {
      throw new ValidationError('Cannot delete school with registered students');
    }

    return this.institutionRepository.delete(id);
  }
}

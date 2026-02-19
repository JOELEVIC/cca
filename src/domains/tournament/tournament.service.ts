import { PrismaClient, TournamentStatus } from '@prisma/client';
import { TournamentRepository } from './tournament.repository.js';
import { CreateTournamentDTO, UpdateTournamentDTO, JoinTournamentDTO, TournamentFilters, TournamentStanding } from './tournament.types.js';
import { ValidationError, NotFoundError } from '../../types/index.js';

export class TournamentService {
  private tournamentRepository: TournamentRepository;

  constructor(private prisma: PrismaClient) {
    this.tournamentRepository = new TournamentRepository(prisma);
  }

  /**
   * Create a new tournament
   */
  async createTournament(data: CreateTournamentDTO) {
    // Validate school exists
    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
    });

    if (!school) {
      throw new ValidationError('School not found');
    }

    // Validate dates
    if (data.endDate && data.endDate < data.startDate) {
      throw new ValidationError('End date must be after start date');
    }

    return this.tournamentRepository.create(data);
  }

  /**
   * Get tournament by ID
   */
  async getTournamentById(id: string) {
    const tournament = await this.tournamentRepository.findById(id);

    if (!tournament) {
      throw new NotFoundError('Tournament not found');
    }

    return tournament;
  }

  /**
   * Get tournaments with filters
   */
  async getTournaments(filters?: TournamentFilters) {
    return this.tournamentRepository.findMany(filters);
  }

  /**
   * Get school tournaments
   */
  async getSchoolTournaments(schoolId: string) {
    return this.tournamentRepository.findBySchoolId(schoolId);
  }

  /**
   * Update tournament
   */
  async updateTournament(id: string, data: UpdateTournamentDTO) {
    const tournament = await this.getTournamentById(id);

    if (tournament.status === TournamentStatus.COMPLETED) {
      throw new ValidationError('Cannot update completed tournament');
    }

    return this.tournamentRepository.update(id, data);
  }

  /**
   * Add participant to tournament
   */
  async addParticipant(data: JoinTournamentDTO) {
    const tournament = await this.getTournamentById(data.tournamentId);

    // Check if tournament is accepting participants
    if (tournament.status !== TournamentStatus.UPCOMING) {
      throw new ValidationError('Tournament is not accepting new participants');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
    });

    if (!user) {
      throw new ValidationError('User not found');
    }

    // Check if already participant
    const existing = tournament.participants.find((p) => p.userId === data.userId);
    if (existing) {
      throw new ValidationError('User is already a participant');
    }

    return this.tournamentRepository.addParticipant(data.tournamentId, data.userId);
  }

  /**
   * Remove participant from tournament
   */
  async removeParticipant(tournamentId: string, userId: string) {
    const tournament = await this.getTournamentById(tournamentId);

    if (tournament.status !== TournamentStatus.UPCOMING) {
      throw new ValidationError('Cannot remove participant from ongoing or completed tournament');
    }

    return this.tournamentRepository.removeParticipant(tournamentId, userId);
  }

  /**
   * Start tournament
   */
  async startTournament(id: string) {
    const tournament = await this.getTournamentById(id);

    if (tournament.status !== TournamentStatus.UPCOMING) {
      throw new ValidationError('Tournament has already started');
    }

    if (tournament.participants.length < 2) {
      throw new ValidationError('Tournament must have at least 2 participants');
    }

    return this.tournamentRepository.update(id, {
      status: TournamentStatus.ONGOING,
    });
  }

  /**
   * Generate pairings for tournament
   * This is a simple round-robin implementation
   */
  async generatePairings(tournamentId: string) {
    const tournament = await this.getTournamentById(tournamentId);

    if (tournament.status !== TournamentStatus.ONGOING) {
      throw new ValidationError('Tournament must be ongoing to generate pairings');
    }

    const participants = tournament.participants.map((p: any) => p.userId);
    
    // Simple round-robin pairing
    // In a real system, this would use Swiss system or other tournament formats
    const pairings: Array<{ whiteId: string; blackId: string }> = [];

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        pairings.push({
          whiteId: participants[i],
          blackId: participants[j],
        });
      }
    }

    return pairings;
  }

  /**
   * Update tournament standings
   */
  async updateStandings(tournamentId: string): Promise<TournamentStanding[]> {
    const tournament = await this.getTournamentById(tournamentId);

    // Calculate scores from games
    const standings = new Map<string, { score: number; rating: number; username: string }>();

    // Initialize standings
    tournament.participants.forEach((p: any) => {
      standings.set(p.userId, {
        score: 0,
        rating: p.user.rating,
        username: p.user.username,
      });
    });

    // Calculate scores from completed games
    tournament.games.forEach((game: any) => {
      if (game.status === 'COMPLETED' && game.result) {
        const whiteData = standings.get(game.whiteId);
        const blackData = standings.get(game.blackId);

        if (whiteData && blackData) {
          if (game.result === 'WHITE_WIN') {
            whiteData.score += 1;
          } else if (game.result === 'BLACK_WIN') {
            blackData.score += 1;
          } else if (game.result === 'DRAW') {
            whiteData.score += 0.5;
            blackData.score += 0.5;
          }
        }
      }
    });

    // Update participant scores in database
    await Promise.all(
      Array.from(standings.entries()).map(([userId, data]) =>
        this.tournamentRepository.updateParticipantScore(tournamentId, userId, data.score)
      )
    );

    // Return sorted standings
    return Array.from(standings.entries())
      .map(([userId, data]) => ({
        userId,
        username: data.username,
        score: data.score,
        rating: data.rating,
      }))
      .sort((a, b) => b.score - a.score || b.rating - a.rating);
  }

  /**
   * Complete tournament
   */
  async completeTournament(id: string) {
    const tournament = await this.getTournamentById(id);

    if (tournament.status !== TournamentStatus.ONGOING) {
      throw new ValidationError('Only ongoing tournaments can be completed');
    }

    // Update final standings
    await this.updateStandings(id);

    return this.tournamentRepository.update(id, {
      status: TournamentStatus.COMPLETED,
      endDate: new Date(),
    });
  }
}

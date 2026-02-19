// Institution DTOs
export interface CreateSchoolDTO {
  name: string;
  region: string;
}

export interface UpdateSchoolDTO {
  name?: string;
  region?: string;
}

export interface SchoolStats {
  totalStudents: number;
  averageRating: number;
  totalGames: number;
  activeTournaments: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  rating: number;
  gamesPlayed: number;
  profile?: {
    firstName: string;
    lastName: string;
  };
}

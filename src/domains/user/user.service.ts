import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { UserRepository } from './user.repository.js';
import { CreateUserDTO, LoginDTO, AuthResponse, UpdateUserDTO, UpdateProfileDTO, UserFilters } from './user.types.js';
import { generateToken } from '../../utils/jwt.js';
import { AuthenticationError, ValidationError, NotFoundError } from '../../types/index.js';

const SALT_ROUNDS = 12;

export class UserService {
  private userRepository: UserRepository;

  constructor(prisma: PrismaClient) {
    this.userRepository = new UserRepository(prisma);
  }

  /**
   * Register a new user
   */
  async createUser(data: CreateUserDTO): Promise<AuthResponse> {
    // Check if email already exists
    const existingEmail = await this.userRepository.findByEmail(data.email);
    if (existingEmail) {
      throw new ValidationError('Email already in use');
    }

    // Check if username already exists
    const existingUsername = await this.userRepository.findByUsername(data.username);
    if (existingUsername) {
      throw new ValidationError('Username already in use');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Create user
    const user = await this.userRepository.create({
      email: data.email,
      username: data.username,
      passwordHash,
      role: data.role,
      schoolId: data.schoolId,
      profile: data.profile,
    });

    // Generate token
    const token = generateToken(user.id, user.role);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        rating: user.rating,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(data: LoginDTO): Promise<AuthResponse> {
    const user = await this.userRepository.findByEmail(data.email);

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    const token = generateToken(user.id, user.role);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        rating: user.rating,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /**
   * Get multiple users with filters
   */
  async getUsers(filters?: UserFilters) {
    return this.userRepository.findMany(filters);
  }

  /**
   * Update user data
   */
  async updateUser(id: string, data: UpdateUserDTO) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Check email uniqueness if being updated
    if (data.email && data.email !== user.email) {
      const existingEmail = await this.userRepository.findByEmail(data.email);
      if (existingEmail) {
        throw new ValidationError('Email already in use');
      }
    }

    // Check username uniqueness if being updated
    if (data.username && data.username !== user.username) {
      const existingUsername = await this.userRepository.findByUsername(data.username);
      if (existingUsername) {
        throw new ValidationError('Username already in use');
      }
    }

    return this.userRepository.update(id, data);
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateProfileDTO) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.profile) {
      throw new NotFoundError('User profile not found');
    }

    return this.userRepository.updateProfile(userId, data);
  }

  /**
   * Update user rating (ELO calculation would go here)
   */
  async updateUserRating(userId: string, newRating: number) {
    if (newRating < 0 || newRating > 3000) {
      throw new ValidationError('Rating must be between 0 and 3000');
    }

    return this.userRepository.updateRating(userId, newRating);
  }

  /**
   * Calculate new ELO rating after a game
   * K-factor: 32 for players under 2100, 24 for players 2100-2400, 16 for players above 2400
   */
  calculateEloRating(currentRating: number, opponentRating: number, score: number): number {
    const K = currentRating < 2100 ? 32 : currentRating < 2400 ? 24 : 16;
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - currentRating) / 400));
    const newRating = Math.round(currentRating + K * (score - expectedScore));
    return Math.max(0, Math.min(3000, newRating));
  }
}

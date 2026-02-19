import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '../../src/domains/user/user.service';
import { PrismaClient, UserRole } from '@prisma/client';

// Mock Prisma Client
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  profile: {
    update: vi.fn(),
  },
} as any as PrismaClient;

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService(mockPrisma);
    vi.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a new user with hashed password', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        passwordHash: 'hashed_password',
        role: UserRole.STUDENT,
        rating: 1200,
        schoolId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique = vi.fn().mockResolvedValue(null);
      mockPrisma.user.create = vi.fn().mockResolvedValue(mockUser);

      const result = await userService.createUser({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: UserRole.STUDENT,
      });

      expect(result).toHaveProperty('token');
      expect(result.user).toMatchObject({
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
      });
    });

    it('should throw error if email already exists', async () => {
      mockPrisma.user.findUnique = vi.fn().mockResolvedValue({
        email: 'test@example.com',
      });

      await expect(
        userService.createUser({
          email: 'test@example.com',
          username: 'testuser',
          password: 'password123',
          role: UserRole.STUDENT,
        })
      ).rejects.toThrow('Email already in use');
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: UserRole.STUDENT,
        rating: 1200,
        profile: null,
        school: null,
      };

      mockPrisma.user.findUnique = vi.fn().mockResolvedValue(mockUser);

      const result = await userService.getUserById('123');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '123' },
        include: { profile: true, school: true },
      });
    });

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique = vi.fn().mockResolvedValue(null);

      await expect(userService.getUserById('999')).rejects.toThrow('User not found');
    });
  });

  describe('calculateEloRating', () => {
    it('should calculate correct ELO rating for a win', () => {
      const newRating = userService.calculateEloRating(1200, 1200, 1);
      
      // With equal ratings, expected score is 0.5
      // K=32 for rating under 2100
      // New rating = 1200 + 32 * (1 - 0.5) = 1216
      expect(newRating).toBe(1216);
    });

    it('should calculate correct ELO rating for a loss', () => {
      const newRating = userService.calculateEloRating(1200, 1200, 0);
      
      // New rating = 1200 + 32 * (0 - 0.5) = 1184
      expect(newRating).toBe(1184);
    });

    it('should use different K-factor for higher rated players', () => {
      // For rating 2100-2400, K=24
      const newRating = userService.calculateEloRating(2200, 2200, 1);
      
      // New rating = 2200 + 24 * (1 - 0.5) = 2212
      expect(newRating).toBe(2212);
    });
  });
});

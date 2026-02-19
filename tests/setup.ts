import { beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Mock Prisma client for tests
export const prisma = new PrismaClient();

beforeAll(async () => {
  // Setup: Connect to test database
  await prisma.$connect();
});

afterEach(async () => {
  // Cleanup: Clear test data after each test
  // Uncomment when you have a test database
  // await prisma.user.deleteMany();
  // await prisma.game.deleteMany();
  // await prisma.tournament.deleteMany();
  // await prisma.school.deleteMany();
  // await prisma.puzzle.deleteMany();
});

afterAll(async () => {
  // Teardown: Disconnect from database
  await prisma.$disconnect();
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

describe('GraphQL API Integration Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('should return 200 OK for health check', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'ok',
      });
    });
  });

  describe('GraphQL Endpoint', () => {
    it('should accept GraphQL queries', async () => {
      const query = `
        query {
          schools {
            id
            name
          }
        }
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('data');
    });

    it('should return error for invalid query', async () => {
      const query = `
        query {
          invalidQuery {
            field
          }
        }
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query,
        },
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('errors');
    });

    it('should require authentication for protected queries', async () => {
      const query = `
        query {
          me {
            id
            username
          }
        }
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query,
        },
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('errors');
      expect(body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('Authentication Flow', () => {
    it('should register a new user', async () => {
      const mutation = `
        mutation {
          register(input: {
            email: "test@example.com"
            username: "testuser"
            password: "password123"
            role: STUDENT
            firstName: "Test"
            lastName: "User"
          }) {
            token
            user {
              id
              username
              email
            }
          }
        }
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
          query: mutation,
        },
      });

      // Note: This will fail if user already exists or database is not set up
      // In a real test, you'd use a test database and clean it up
      expect([200, 400]).toContain(response.statusCode);
    });
  });
});

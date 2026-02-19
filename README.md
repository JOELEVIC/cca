# Cameroon Chess Academy Platform - API

A production-grade GraphQL API built with Fastify, Apollo Server, and Supabase for the Cameroon Chess Academy chess learning and competition platform.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)

## Features

### Phase 1 MVP

- **User Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (RBAC)
  - Multiple user roles: Student, Coach, School Admin, Regional Admin, National Admin, Volunteer

- **Chess Gameplay**
  - Live and async games
  - Real-time move broadcasting via WebSocket
  - ELO rating system
  - Game history and analysis

- **Tournaments**
  - School-level tournaments
  - Automatic pairing generation
  - Live standings and leaderboards
  - Tournament lifecycle management

- **Learning**
  - Chess puzzles with difficulty ratings
  - Solution validation
  - Badge and achievement system
  - Daily puzzle feature

- **School Management**
  - School registration and profiles
  - Student leaderboards
  - School statistics and analytics
  - Regional organization

## Tech Stack

- **Framework**: Fastify
- **GraphQL**: Apollo Server
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Prisma 7 (with PostgreSQL adapter)
- **Authentication**: JWT (jsonwebtoken)
- **Real-time**: WebSocket (@fastify/websocket)
- **Validation**: Zod
- **Logging**: Pino
- **Testing**: Vitest
- **Language**: TypeScript (strict mode)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (Supabase account recommended)
- Git

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd cca
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
NODE_ENV=development
PORT=4000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/cca

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# JWT (generate a secure random string for production)
JWT_SECRET=your-secret-key-minimum-32-characters
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3000
```

4. **Run database migrations**

```bash
npm run prisma:migrate
```

5. **Generate Prisma Client**

```bash
npm run prisma:generate
```

6. **Start the development server**

```bash
npm run dev
```

The API will be available at `http://localhost:4000/graphql`

### Quick Test

Visit `http://localhost:4000/health` to verify the server is running.

## Project Structure

```
cca/
├── src/
│   ├── app.ts                      # Fastify app setup
│   ├── server.ts                   # Server entry point
│   ├── config/                     # Configuration
│   │   ├── index.ts                # Environment config
│   │   └── database.ts             # Prisma client
│   ├── graphql/                    # GraphQL layer
│   │   ├── schema.ts               # Type definitions
│   │   ├── context.ts              # Context builder
│   │   └── resolvers/              # Modular resolvers
│   │       ├── index.ts
│   │       ├── user.resolvers.ts
│   │       ├── game.resolvers.ts
│   │       ├── tournament.resolvers.ts
│   │       ├── learning.resolvers.ts
│   │       └── school.resolvers.ts
│   ├── domains/                    # Domain services (DDD)
│   │   ├── user/
│   │   │   ├── user.service.ts
│   │   │   ├── user.repository.ts
│   │   │   └── user.types.ts
│   │   ├── game/
│   │   │   ├── game.service.ts
│   │   │   ├── game.repository.ts
│   │   │   ├── game.types.ts
│   │   │   └── websocket/
│   │   │       └── game.handler.ts
│   │   ├── tournament/
│   │   ├── learning/
│   │   └── institution/
│   ├── middleware/                 # Fastify middleware
│   │   ├── auth.middleware.ts
│   │   ├── rbac.middleware.ts
│   │   └── error.middleware.ts
│   ├── utils/                      # Utilities
│   │   ├── jwt.ts
│   │   ├── validation.ts
│   │   └── logger.ts
│   └── types/                      # Shared types
│       └── index.ts
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── migrations/                 # Migration history
├── tests/                          # Test files
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
└── README.md
```

## API Documentation

### GraphQL Playground

When running in development mode, access the GraphQL Playground at:
```
http://localhost:4000/graphql
```

### WebSocket Endpoints

**Live Game Updates**
```
ws://localhost:4000/ws/game/:gameId
```

Requires authentication via `Authorization` header with Bearer token.

### Key Operations

#### Authentication

```graphql
# Register a new user
mutation Register {
  register(input: {
    email: "user@example.com"
    username: "username"
    password: "securepassword"
    role: STUDENT
    firstName: "John"
    lastName: "Doe"
  }) {
    token
    user {
      id
      username
      rating
    }
  }
}

# Login
mutation Login {
  login(input: {
    email: "user@example.com"
    password: "securepassword"
  }) {
    token
    user {
      id
      username
      role
    }
  }
}
```

#### Games

```graphql
# Create a game
mutation CreateGame {
  createGame(input: {
    whiteId: "user-id-1"
    blackId: "user-id-2"
    timeControl: "10+0"
  }) {
    id
    status
    white { username }
    black { username }
  }
}

# Make a move
mutation MakeMove {
  makeMove(gameId: "game-id", move: "e2e4") {
    id
    moves
    status
  }
}
```

#### Tournaments

```graphql
# Create tournament
mutation CreateTournament {
  createTournament(input: {
    name: "School Championship 2026"
    schoolId: "school-id"
    startDate: "2026-03-01T10:00:00Z"
  }) {
    id
    name
    status
  }
}

# Join tournament
mutation JoinTournament {
  joinTournament(tournamentId: "tournament-id") {
    id
    participants {
      user { username }
    }
  }
}
```

## Development

### Available Scripts

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run Prisma Studio (database GUI)
npm run prisma:studio

# Generate Prisma Client
npm run prisma:generate

# Create new migration
npm run prisma:migrate

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Lint code
npm run lint

# Format code
npm run format
```

### Code Quality

The project enforces:
- **TypeScript strict mode** - Maximum type safety
- **ESLint** - Code quality and consistency
- **Prettier** - Automatic code formatting
- **Zod** - Runtime validation
- **Production-ready patterns** - Error handling, logging, security

### Environment-Specific Behavior

- **Development**: Detailed logging, GraphQL Playground enabled
- **Production**: Minimal logging, error messages sanitized, security headers enforced

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- user.service.test.ts
```

## Deployment

### Environment Variables

Ensure all required environment variables are set in production:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=<production-database-url>
JWT_SECRET=<secure-random-string-min-32-chars>
SUPABASE_URL=<production-supabase-url>
SUPABASE_ANON_KEY=<production-supabase-key>
CORS_ORIGIN=<production-frontend-url>
```

### Vercel (serverless)

The API is configured for Vercel via `api/index.ts` and `vercel.json`. To avoid **500 FUNCTION_INVOCATION_FAILED**:

1. **Set these environment variables** in the Vercel project (Settings → Environment Variables). All are required:
   - `DATABASE_URL` – PostgreSQL URL (use Supabase pooler: port **6543** with `?pgbouncer=true`)
   - `JWT_SECRET` – at least **32 characters**
   - `SUPABASE_URL` – e.g. `https://your-project.supabase.co`
   - `SUPABASE_ANON_KEY` – your Supabase anon key
   - `CORS_ORIGIN` – frontend origin (e.g. your ccaui Vercel URL)
   - `NODE_ENV` – set to `production`

2. **Redeploy** after adding or changing env vars.

3. If you see **503** with "Server configuration error", check the Vercel function logs; the app will log which env var failed validation.

### Other deployment platforms

Recommended platforms:
- **Railway** - Easy deployment with PostgreSQL
- **Render** - Free tier with PostgreSQL
- **Fly.io** - Global edge deployment
- **Heroku** - Classic PaaS

### Pre-deployment Checklist

- [ ] Run database migrations
- [ ] Set secure JWT_SECRET (minimum 32 characters)
- [ ] Configure CORS_ORIGIN for frontend
- [ ] Enable SSL/TLS for database connection
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Run security audit: `npm audit`

## Architecture

### Domain-Driven Design

The codebase follows DDD principles with clear separation:

1. **GraphQL Layer** - API contract and resolvers
2. **Service Layer** - Business logic
3. **Repository Layer** - Data access
4. **Domain Types** - Type definitions per domain

### Key Design Decisions

- **Custom JWT Auth** - Full control over authentication flow
- **WebSocket for Games** - Low-latency real-time updates
- **Prisma ORM** - Type-safe database queries
- **Modular Resolvers** - Easy to maintain and extend
- **RBAC Middleware** - Granular permission control

## Contributing

1. Follow the existing code structure
2. Write tests for new features
3. Use TypeScript strict mode
4. Run linter before committing
5. Keep files under 300 lines

## License

ISC

## Support

For issues or questions, please open an issue on GitHub or contact the development team.

---

**Built with ❤️ for the Cameroon Chess Academy**

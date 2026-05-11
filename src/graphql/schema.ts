export const typeDefs = `#graphql
  scalar DateTime

  enum GameStatus {
    PENDING
    ACTIVE
    COMPLETED
    ABANDONED
  }

  enum GameResult {
    WHITE_WIN
    BLACK_WIN
    DRAW
    STALEMATE
  }

  enum GameUpdateEvent {
    GAME_STATE
    MOVE
    GAME_END
    DRAW_OFFER
    DRAW_ACCEPTED
    DRAW_REJECTED
  }

  type GameSession {
    gameId: ID!
    whiteId: ID!
    blackId: ID!
    moves: String!
    status: GameStatus!
    result: GameResult
    timeControl: String!
    drawOfferBy: ID
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type GameUpdatePayload {
    gameId: ID!
    event: GameUpdateEvent!
    moves: String!
    status: GameStatus!
    result: GameResult
    drawOfferBy: ID
    move: String
    reason: String
  }

  # ── Road to Master · Hunter Profile (data bridge from Chess.com) ──
  type Attributes {
    strength: Int!
    agility: Int!
    intelligence: Int!
    vitality: Int!
    sense: Int!
    willpower: Int!
  }

  type HunterMentor {
    name: String!
    era: String!
    quote: String!
  }

  type HunterClass {
    id: String!
    name: String!
    tagline: String!
    primary: [String!]!
    mentor: HunterMentor!
  }

  type TimeClassCount {
    timeClass: String!
    count: Int!
  }

  type HunterSample {
    games: Int!
    medianRating: Int!
    avgPlies: Int!
    timeClassMix: [TimeClassCount!]!
  }

  type HunterRecommendation {
    attribute: String!
    title: String!
    href: String!
  }

  type HunterProfile {
    username: String!
    computedAt: String!
    attributes: Attributes!
    hunterClass: HunterClass!
    sample: HunterSample!
    recommendation: HunterRecommendation!
  }

  type Query {
    gameSession(gameId: ID!): GameSession
    "Compute a Hunter Profile from the player's recent Chess.com games. Cached 5 min server-side."
    hunterProfile(chesscomUsername: String!, sampleSize: Int): HunterProfile!
  }

  type Mutation {
    startGameSession(gameId: ID!, whiteId: ID!, blackId: ID!, timeControl: String!): GameSession!
    makeMove(gameId: ID!, move: String!): GameSession!
    resignGame(gameId: ID!): GameSession!
    offerDraw(gameId: ID!): GameSession!
    acceptDraw(gameId: ID!): GameSession!
    rejectDraw(gameId: ID!): GameSession!
  }

  type Subscription {
    gameUpdated(gameId: ID!): GameUpdatePayload!
  }
`;

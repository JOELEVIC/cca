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

  type Query {
    gameSession(gameId: ID!): GameSession
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

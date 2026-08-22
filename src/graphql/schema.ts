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

  "Mirrors ccanext's ValidationState. NOT_REQUIRED = an ordinary online game."
  enum ValidationState {
    NOT_REQUIRED
    PENDING
    VALIDATED
    DISPUTED
  }

  enum GameUpdateEvent {
    GAME_STATE
    MOVE
    GAME_END
    DRAW_OFFER
    DRAW_ACCEPTED
    DRAW_REJECTED
    CHAT
    OPPONENT_LEFT
    OPPONENT_RETURNED
    ABORT_ARMED
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
    "White's remaining time in milliseconds (anchored at serverTime)."
    whiteMs: Int
    "Black's remaining time in milliseconds (anchored at serverTime)."
    blackMs: Int
    "Epoch ms the clock values were anchored at; clients extrapolate the running side."
    serverTime: Float
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
    "White's remaining time in milliseconds (anchored at serverTime)."
    whiteMs: Int
    "Black's remaining time in milliseconds (anchored at serverTime)."
    blackMs: Int
    "Epoch ms the clock values were anchored at; clients extrapolate the running side."
    serverTime: Float
    "CHAT event: the sender's userId."
    chatUserId: ID
    "CHAT event: the message text."
    chatText: String
    "OPPONENT_LEFT / OPPONENT_RETURNED: the player who left."
    awayUserId: ID
    "OPPONENT_LEFT / ABORT_ARMED: epoch ms when the forfeit/abort fires."
    deadline: Float
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

  type EngineEvaluation {
    cp: Int
    mate: Int
  }

  type Query {
    gameSession(gameId: ID!): GameSession
    "Compute a Hunter Profile from the player's recent Chess.com games. Cached 5 min server-side."
    hunterProfile(chesscomUsername: String!, sampleSize: Int): HunterProfile!
    "Server-side Stockfish best move — fallback when the browser WASM engine is unavailable."
    engineBestMove(fen: String!, elo: Int): String
    "Server-side Stockfish evaluation."
    engineEvaluation(fen: String!): EngineEvaluation
  }

  type Mutation {
    "Register a live session for a game that already exists on the main API. Pass validationState PENDING for a fixture board's game: its result and moves are still recorded, but it is rated later, at arbiter validation, not at completion. Omitted / NOT_REQUIRED = an ordinary rated game."
    startGameSession(gameId: ID!, whiteId: ID!, blackId: ID!, timeControl: String!, validationState: ValidationState): GameSession!
    makeMove(gameId: ID!, move: String!): GameSession!
    resignGame(gameId: ID!): GameSession!
    "Void a game that hasn't really started (no rating change). Valid only before both players have moved."
    abortGame(gameId: ID!): GameSession!
    offerDraw(gameId: ID!): GameSession!
    acceptDraw(gameId: ID!): GameSession!
    rejectDraw(gameId: ID!): GameSession!
    "Send an in-game chat message (players and spectators). Delivered via the gameUpdated subscription."
    sendChatMessage(gameId: ID!, text: String!): Boolean!
  }

  type Subscription {
    gameUpdated(gameId: ID!): GameUpdatePayload!
  }
`;

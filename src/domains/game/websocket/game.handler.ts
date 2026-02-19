import { WebSocket } from 'ws';
import { FastifyRequest } from 'fastify';
import { GameMessage, GameState } from '../game.types.js';
import { GameService } from '../game.service.js';
import { extractTokenFromHeader, verifyToken } from '../../../utils/jwt.js';
import logger from '../../../utils/logger.js';
import { PrismaClient } from '@prisma/client';

// Game rooms: Map<gameId, Set<WebSocket>>
const gameRooms = new Map<string, Set<WebSocket>>();

// WebSocket to user mapping
const wsToUser = new Map<WebSocket, { userId: string; gameId: string }>();

/**
 * WebSocket handler for live chess games
 */
export const gameWebSocketHandler = (prisma: PrismaClient) => {
  const gameService = new GameService(prisma);

  return async (connection: any, request: FastifyRequest) => {
    const ws: WebSocket = connection.socket;
    const gameId = (request.params as any).gameId;

    try {
      // Authenticate WebSocket connection
      const authHeader = request.headers.authorization;
      const token = extractTokenFromHeader(authHeader);

      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      const payload = verifyToken(token);
      const userId = payload.userId;

      // Verify game exists and user is a participant
      const game = await gameService.getGameById(gameId);

      if (game.whiteId !== userId && game.blackId !== userId) {
        ws.close(1008, 'Not a participant in this game');
        return;
      }

      // Add connection to game room
      if (!gameRooms.has(gameId)) {
        gameRooms.set(gameId, new Set());
      }
      gameRooms.get(gameId)!.add(ws);
      wsToUser.set(ws, { userId, gameId });

      logger.info(`User ${userId} joined game ${gameId}`);

      // Send current game state to the connecting user
      const gameState: GameState = {
        gameId: game.id,
        whiteId: game.whiteId,
        blackId: game.blackId,
        moves: game.moves,
        status: game.status,
        result: game.result || undefined,
        timeControl: game.timeControl,
      };

      ws.send(
        JSON.stringify({
          type: 'GAME_STATE',
          data: gameState,
        })
      );

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message: GameMessage = JSON.parse(data.toString());

          // Validate message
          if (message.userId !== userId) {
            ws.send(
              JSON.stringify({
                type: 'ERROR',
                message: 'Invalid user ID',
              })
            );
            return;
          }

          await handleGameMessage(message, ws, gameService);
        } catch (error: any) {
          logger.error({ err: error, msg: 'Error handling WebSocket message' });
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              message: 'Invalid message format',
            })
          );
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        const userData = wsToUser.get(ws);
        if (userData) {
          const room = gameRooms.get(userData.gameId);
          if (room) {
            room.delete(ws);
            if (room.size === 0) {
              gameRooms.delete(userData.gameId);
            }
          }
          wsToUser.delete(ws);
          logger.info(`User ${userData.userId} left game ${userData.gameId}`);
        }
      });

      ws.on('error', (error: Error) => {
        logger.error({ err: error, msg: 'WebSocket error' });
      });
    } catch (error: any) {
      logger.error({ err: error, msg: 'WebSocket connection error' });
      ws.close(1011, 'Internal server error');
    }
  };
};

/**
 * Handle game messages
 */
async function handleGameMessage(
  message: GameMessage,
  senderWs: WebSocket,
  gameService: GameService
) {
  const { type, gameId, userId } = message;

  try {
    switch (type) {
      case 'MOVE':
        if (!message.move) {
          throw new Error('Move is required');
        }

        // Make move in database
        const updatedGame = await gameService.makeMove({
          gameId,
          move: message.move,
          userId,
        });

        // Broadcast move to all participants in the room
        broadcast(gameId, {
          type: 'MOVE',
          data: {
            gameId,
            move: message.move,
            moves: updatedGame.moves,
            status: updatedGame.status,
          },
        });
        break;

      case 'RESIGN':
        const resignedGame = await gameService.resignGame(gameId, userId);

        // Broadcast resignation
        broadcast(gameId, {
          type: 'GAME_END',
          data: {
            gameId,
            status: resignedGame.status,
            result: resignedGame.result,
            reason: 'resignation',
          },
        });
        break;

      case 'OFFER_DRAW':
        // Broadcast draw offer to opponent
        broadcast(
          gameId,
          {
            type: 'DRAW_OFFER',
            data: { gameId, userId },
          },
          senderWs
        );
        break;

      case 'ACCEPT_DRAW':
        const drawnGame = await gameService.endGame(gameId, 'DRAW');

        // Broadcast draw acceptance
        broadcast(gameId, {
          type: 'GAME_END',
          data: {
            gameId,
            status: drawnGame.status,
            result: drawnGame.result,
            reason: 'agreement',
          },
        });
        break;

      case 'REJECT_DRAW':
        // Broadcast draw rejection
        broadcast(
          gameId,
          {
            type: 'DRAW_REJECTED',
            data: { gameId, userId },
          },
          senderWs
        );
        break;

      case 'JOIN':
        // Already handled in connection setup
        break;

      case 'LEAVE':
        senderWs.close();
        break;

      default:
        logger.warn(`Unknown message type: ${type}`);
    }
  } catch (error: any) {
    logger.error({ err: error, msg: 'Error handling game message' });
    senderWs.send(
      JSON.stringify({
        type: 'ERROR',
        message: error.message || 'Failed to process message',
      })
    );
  }
}

/**
 * Broadcast message to all participants in a game room
 */
function broadcast(gameId: string, message: any, excludeWs?: WebSocket) {
  const room = gameRooms.get(gameId);
  if (!room) return;

  const messageStr = JSON.stringify(message);

  room.forEach((ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}

/**
 * Send message to specific user in a game
 */
export function sendToUser(gameId: string, userId: string, message: any) {
  const room = gameRooms.get(gameId);
  if (!room) return;

  const messageStr = JSON.stringify(message);

  room.forEach((ws) => {
    const userData = wsToUser.get(ws);
    if (userData?.userId === userId && ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
}

/**
 * Get active connections count for a game
 */
export function getGameConnectionsCount(gameId: string): number {
  const room = gameRooms.get(gameId);
  return room ? room.size : 0;
}

/**
 * Close all connections for a game
 */
export function closeGameRoom(gameId: string) {
  const room = gameRooms.get(gameId);
  if (!room) return;

  room.forEach((ws) => {
    ws.close(1000, 'Game ended');
    wsToUser.delete(ws);
  });

  gameRooms.delete(gameId);
}

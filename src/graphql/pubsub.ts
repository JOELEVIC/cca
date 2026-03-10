import { PubSub } from 'graphql-subscriptions';
import { GameSessionService } from '../domains/game/game-session.service.js';

const pubsub = new PubSub();
export const gameSessionService = new GameSessionService(pubsub);
export { pubsub };

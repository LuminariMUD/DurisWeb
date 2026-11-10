import { Router, type IRouter } from 'express';
import { optionalAuth } from '../../middleware/auth.js';
import { forumContentRoutes } from './contentRoutes.js';
import { forumReactionPollRoutes } from './reactionPollRoutes.js';
import { forumSubscriptionRoutes } from './subscriptionRoutes.js';
import { forumSearchRoutes } from './searchRoutes.js';
import { forumModerationRoutes } from './moderationRoutes.js';
import { forumProfileRoutes } from './profileRoutes.js';
import { forumImageRoutes } from './imageRoutes.js';

/** `/api/forum`: optional authentication first, then the route groups. */
export const forumRouter: IRouter = Router();

// Apply optional authentication to all forum routes (anonymous users can view public content)
forumRouter.use(optionalAuth);

for (const group of [
  forumContentRoutes,
  forumReactionPollRoutes,
  forumSubscriptionRoutes,
  forumSearchRoutes,
  forumModerationRoutes,
  forumProfileRoutes,
  forumImageRoutes,
]) {
  forumRouter.use(group);
}

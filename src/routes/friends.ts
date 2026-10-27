import { Router } from "express";
import { createFriendController } from "../controllers/friend.controller.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { friendshipRepository } from "../repositories/friendship.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { createFriendService } from "../services/friend.service.js";
import { env } from "../shared/config/env.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";

const router = Router();
const requireAuthenticatedUser = createAuthMiddleware(
  createSessionTokenService(env.JWT_SECRET),
  userRepository,
);
export const friendService = createFriendService(friendshipRepository, userRepository);
const friendController = createFriendController(friendService);

router.get("/friends/search", requireAuthenticatedUser, (req, res, next) =>
  friendController.search(req, res, next),
);
router.post("/friends/requests", requireAuthenticatedUser, (req, res, next) =>
  friendController.sendRequest(req, res, next),
);
router.get("/friends/requests", requireAuthenticatedUser, (req, res, next) =>
  friendController.listRequests(req, res, next),
);
router.post("/friends/requests/:id/accept", requireAuthenticatedUser, (req, res, next) =>
  friendController.accept(req, res, next),
);
router.delete("/friends/requests/:id", requireAuthenticatedUser, (req, res, next) =>
  friendController.removeRequest(req, res, next),
);
router.get("/friends", requireAuthenticatedUser, (req, res, next) =>
  friendController.listFriends(req, res, next),
);

export default router;

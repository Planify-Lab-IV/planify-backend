import { Router } from "express";
import { createGroupController } from "../controllers/group.controller.js";
import { groupRepository } from "../repositories/group.repository.js";
import { createGroupService } from "../services/group.service.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { env } from "../shared/config/env.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";

const router = Router();

const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuthenticatedUser = createAuthMiddleware(sessionTokenService);

const groupService = createGroupService(groupRepository);
const groupController = createGroupController(groupService);

router.get("/me/groups", requireAuthenticatedUser, (req, res, next) =>
  groupController.listMyGroups(req, res, next),
);

export default router;

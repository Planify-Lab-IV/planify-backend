import type { NextFunction, Request, Response } from "express";
import {
  toFriendRequestResponseDTO,
  toFriendResponseDTO,
  toFriendSearchResponseDTO,
} from "../dtos/friend/friend.response.dto.js";
import type { FriendService } from "../services/friend.service.js";
import { getAuthenticatedUserId } from "../shared/request.helpers.js";
import {
  validateFriendRequestId,
  validateSearchFriendsDTO,
  validateSendFriendRequestDTO,
} from "../validators/friend/friend.validator.js";

export interface FriendController {
  search(req: Request, res: Response, next: NextFunction): Promise<void>;
  sendRequest(req: Request, res: Response, next: NextFunction): Promise<void>;
  listRequests(req: Request, res: Response, next: NextFunction): Promise<void>;
  accept(req: Request, res: Response, next: NextFunction): Promise<void>;
  removeRequest(req: Request, res: Response, next: NextFunction): Promise<void>;
  listFriends(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createFriendController(friendService: FriendService): FriendController {
  return {
    async search(req, res, next) {
      try {
        const userId = getAuthenticatedUserId(req);
        const { q } = validateSearchFriendsDTO(req.query);
        const users = await friendService.search(userId, q);
        res.status(200).json({ users: users.map(toFriendSearchResponseDTO) });
      } catch (error) {
        next(error);
      }
    },

    async sendRequest(req, res, next) {
      try {
        const requesterId = getAuthenticatedUserId(req);
        const { userId } = validateSendFriendRequestDTO(req.body ?? {});
        const request = await friendService.sendRequest(requesterId, userId);
        res.status(201).json({ request: toFriendRequestResponseDTO(request) });
      } catch (error) {
        next(error);
      }
    },

    async listRequests(req, res, next) {
      try {
        const userId = getAuthenticatedUserId(req);
        const requests = await friendService.listRequests(userId);
        res.status(200).json({
          received: requests.received.map(toFriendRequestResponseDTO),
          sent: requests.sent.map(toFriendRequestResponseDTO),
        });
      } catch (error) {
        next(error);
      }
    },

    async accept(req, res, next) {
      try {
        const userId = getAuthenticatedUserId(req);
        await friendService.accept(userId, validateFriendRequestId(req.params.id));
        res.sendStatus(204);
      } catch (error) {
        next(error);
      }
    },

    async removeRequest(req, res, next) {
      try {
        const userId = getAuthenticatedUserId(req);
        await friendService.removeRequest(userId, validateFriendRequestId(req.params.id));
        res.sendStatus(204);
      } catch (error) {
        next(error);
      }
    },

    async listFriends(req, res, next) {
      try {
        const friends = await friendService.listFriends(getAuthenticatedUserId(req));
        res.status(200).json({ friends: friends.map(toFriendResponseDTO) });
      } catch (error) {
        next(error);
      }
    },
  };
}

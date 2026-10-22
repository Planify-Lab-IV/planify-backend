import type { PublicUser } from "../../repositories/user.repository.js";
import type { FriendRequest, FriendSearchResult } from "../../services/friend.service.js";

export interface FriendResponseDTO {
  id: string;
  name: string;
  username: string;
}

export interface FriendSearchResponseDTO extends FriendResponseDTO {
  relationship: FriendSearchResult["relationship"];
  requestId: string | null;
}

export interface FriendRequestResponseDTO {
  id: string;
  user: FriendResponseDTO;
  createdAt: Date;
}

export function toFriendResponseDTO(user: PublicUser): FriendResponseDTO {
  return { id: user.id, name: user.name, username: user.username };
}

export function toFriendSearchResponseDTO(user: FriendSearchResult): FriendSearchResponseDTO {
  return {
    ...toFriendResponseDTO(user),
    relationship: user.relationship,
    requestId: user.requestId,
  };
}

export function toFriendRequestResponseDTO(request: FriendRequest): FriendRequestResponseDTO {
  return { id: request.id, user: toFriendResponseDTO(request.user), createdAt: request.createdAt };
}

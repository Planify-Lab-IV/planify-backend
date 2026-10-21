import { z } from "zod";
import { ValidationError } from "../../shared/errors/index.js";

const searchFriendsSchema = z.object({ q: z.string().trim().min(2) }).strict();
const sendFriendRequestSchema = z.object({ userId: z.string().trim().min(1) }).strict();

export type SearchFriendsDTO = z.infer<typeof searchFriendsSchema>;
export type SendFriendRequestDTO = z.infer<typeof sendFriendRequestSchema>;

export function validateSearchFriendsDTO(input: unknown): SearchFriendsDTO {
  const result = searchFriendsSchema.safeParse(input);
  if (!result.success) throw new ValidationError("La búsqueda contiene campos inválidos");
  return result.data;
}

export function validateSendFriendRequestDTO(input: unknown): SendFriendRequestDTO {
  const result = sendFriendRequestSchema.safeParse(input);
  if (!result.success) throw new ValidationError("El body contiene campos inválidos");
  return result.data;
}

export function validateFriendRequestId(input: unknown): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ValidationError("El id de la solicitud es requerido");
  }
  return input;
}

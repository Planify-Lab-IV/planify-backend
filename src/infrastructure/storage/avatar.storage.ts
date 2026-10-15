import { randomUUID } from "node:crypto";

export const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarMimeType = (typeof avatarMimeTypes)[number];

export interface AvatarStorage {
  save(input: { buffer: Buffer; mimeType: string }): Promise<string>;
  remove(url: string): Promise<void>;
}

const extensionByMimeType: Record<AvatarMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const generatedAvatarFilenamePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function createAvatarFilename(mimeType: string): string {
  const extension = extensionByMimeType[mimeType as AvatarMimeType];

  if (!extension) {
    throw new Error(`Unsupported avatar MIME type: ${mimeType}`);
  }

  return `${randomUUID()}.${extension}`;
}

export function isGeneratedAvatarFilename(filename: string): boolean {
  return generatedAvatarFilenamePattern.test(filename);
}

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  createAvatarFilename,
  isGeneratedAvatarFilename,
  type AvatarStorage,
} from "./avatar.storage.js";

export interface AvatarS3Client {
  send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface S3AvatarStorageOptions {
  client: AvatarS3Client;
  bucket: string;
  region: string;
}

export function createS3AvatarStorage({
  client,
  bucket,
  region,
}: S3AvatarStorageOptions): AvatarStorage {
  const origin = `https://${bucket}.s3.${region}.amazonaws.com`;

  return {
    async save({ buffer, mimeType }): Promise<string> {
      const key = `avatars/${createAvatarFilename(mimeType)}`;

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      return `${origin}/${key}`;
    },

    async remove(url: string): Promise<void> {
      const key = getOwnedAvatarKey(url, origin);
      if (!key) {
        return;
      }

      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    },
  };
}

function getOwnedAvatarKey(url: string, origin: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== origin) {
      return null;
    }

    const key = parsedUrl.pathname.slice(1);
    const filename = key.startsWith("avatars/") ? key.slice("avatars/".length) : "";

    return isGeneratedAvatarFilename(filename) ? key : null;
  } catch {
    return null;
  }
}

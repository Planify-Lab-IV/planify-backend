import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAvatarFilename,
  isGeneratedAvatarFilename,
  type AvatarStorage,
} from "./avatar.storage.js";

const localAvatarUrlPrefix = "/uploads/avatars/";

export function createLocalAvatarStorage(baseDir: string): AvatarStorage {
  return {
    async save({ buffer, mimeType }): Promise<string> {
      const filename = createAvatarFilename(mimeType);

      await mkdir(baseDir, { recursive: true });
      await writeFile(join(baseDir, filename), buffer);

      return `${localAvatarUrlPrefix}${filename}`;
    },

    async remove(url: string): Promise<void> {
      if (!url.startsWith(localAvatarUrlPrefix)) {
        return;
      }

      const filename = url.slice(localAvatarUrlPrefix.length);
      if (!isGeneratedAvatarFilename(filename)) {
        return;
      }

      try {
        await unlink(join(baseDir, filename));
      } catch (error) {
        if (isFileNotFoundError(error)) {
          return;
        }

        throw error;
      }
    },
  };
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

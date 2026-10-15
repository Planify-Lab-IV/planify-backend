import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalAvatarStorage } from "../src/infrastructure/storage/local-avatar.storage.js";
import { createS3AvatarStorage } from "../src/infrastructure/storage/s3-avatar.storage.js";

const bucket = "planify-avatars";
const region = "us-east-1";
const origin = `https://${bucket}.s3.${region}.amazonaws.com`;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("createLocalAvatarStorage", () => {
  it("guarda el buffer con un nombre generado y devuelve una URL relativa", async () => {
    const baseDir = await createTemporaryDirectory();
    const storage = createLocalAvatarStorage(baseDir);
    const buffer = Buffer.from("avatar-content");

    const url = await storage.save({ buffer, mimeType: "image/png" });

    expect(url).toMatch(/^\/uploads\/avatars\/[0-9a-f-]{36}\.png$/);
    const filename = url.split("/").at(-1)!;
    await expect(readFile(join(baseDir, filename))).resolves.toEqual(buffer);
  });

  it("elimina únicamente archivos que pertenecen a su almacenamiento", async () => {
    const baseDir = await createTemporaryDirectory();
    const storage = createLocalAvatarStorage(baseDir);
    const url = await storage.save({
      buffer: Buffer.from("avatar-content"),
      mimeType: "image/jpeg",
    });

    await storage.remove("/uploads/avatars/not-owned.jpg");
    const filename = url.split("/").at(-1)!;
    await expect(readFile(join(baseDir, filename))).resolves.toEqual(Buffer.from("avatar-content"));

    await storage.remove(url);
    await expect(readFile(join(baseDir, filename))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("createS3AvatarStorage", () => {
  it("envía el objeto con caché inmutable y devuelve su URL pública", async () => {
    const client = { send: vi.fn(async () => ({})) };
    const storage = createS3AvatarStorage({ client, bucket, region });
    const buffer = Buffer.from("avatar-content");

    const url = await storage.save({ buffer, mimeType: "image/webp" });

    expect(url).toMatch(new RegExp(`^${origin}/avatars/[0-9a-f-]{36}\\.webp$`));
    const command = vi.mocked(client.send).mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: bucket,
      Key: url.slice(`${origin}/`.length),
      Body: buffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    });
  });

  it("borra la clave de una URL S3 propia e ignora una URL ajena", async () => {
    const client = { send: vi.fn(async () => ({})) };
    const storage = createS3AvatarStorage({ client, bucket, region });
    const url = await storage.save({
      buffer: Buffer.from("avatar-content"),
      mimeType: "image/jpeg",
    });

    await storage.remove(url);

    const command = vi.mocked(client.send).mock.calls[1]?.[0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect((command as DeleteObjectCommand).input).toEqual({
      Bucket: bucket,
      Key: url.slice(`${origin}/`.length),
    });

    await storage.remove("/uploads/avatars/not-owned.jpg");
    expect(client.send).toHaveBeenCalledTimes(2);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "planify-avatar-storage-"));
  temporaryDirectories.push(directory);
  return directory;
}

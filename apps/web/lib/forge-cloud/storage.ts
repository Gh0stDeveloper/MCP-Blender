import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type StoredObject = {
  key: string;
  checksumSha256: string;
  sizeBytes: number;
};

function safeKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("../") || normalized.includes("/..")) {
    throw new Error("invalid storage key");
  }
  return normalized;
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function storageDriver(): "local" | "s3" {
  return process.env.NEXORA_STORAGE_DRIVER === "s3" ? "s3" : "local";
}

function s3Client(): S3Client {
  const endpoint = process.env.NEXORA_S3_ENDPOINT || undefined;
  const accessKeyId = process.env.NEXORA_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.NEXORA_S3_SECRET_ACCESS_KEY;
  return new S3Client({
    region: process.env.NEXORA_S3_REGION ?? "auto",
    endpoint,
    forcePathStyle: process.env.NEXORA_S3_FORCE_PATH_STYLE === "true",
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
}

export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<StoredObject> {
  const clean = safeKey(key);
  const checksumSha256 = checksum(bytes);

  if (storageDriver() === "s3") {
    const bucket = process.env.NEXORA_S3_BUCKET;
    if (!bucket) throw new Error("NEXORA_S3_BUCKET is not configured");
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: clean,
        Body: bytes,
        ContentType: contentType,
        Metadata: { sha256: checksumSha256 },
      }),
    );
  } else {
    const root = resolve(process.env.NEXORA_STORAGE_ROOT ?? ".nexora-storage");
    const path = resolve(root, clean);
    if (!path.startsWith(root)) throw new Error("storage path escaped root");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  return { key: clean, checksumSha256, sizeBytes: bytes.byteLength };
}

export async function getObject(key: string): Promise<Uint8Array> {
  const clean = safeKey(key);
  if (storageDriver() === "s3") {
    const bucket = process.env.NEXORA_S3_BUCKET;
    if (!bucket) throw new Error("NEXORA_S3_BUCKET is not configured");
    const response = await s3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: clean }),
    );
    if (!response.Body) throw new Error("stored object has no body");
    return response.Body.transformToByteArray();
  }

  const root = resolve(process.env.NEXORA_STORAGE_ROOT ?? ".nexora-storage");
  const path = resolve(root, clean);
  if (!path.startsWith(root)) throw new Error("storage path escaped root");
  return readFile(path);
}

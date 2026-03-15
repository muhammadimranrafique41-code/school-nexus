import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type PresignUploadInput = {
  filename: string;
  contentType: string;
  folder?: string;
  expiresIn?: number;
};

type PresignDownloadInput = {
  key: string;
  expiresIn?: number;
};

const toBool = (value?: string) => value === "true" || value === "1";

const config = {
  region: process.env.S3_REGION || process.env.AWS_REGION || "",
  bucket: process.env.S3_BUCKET || "",
  endpoint: process.env.S3_ENDPOINT || "",
  accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  sessionToken: process.env.AWS_SESSION_TOKEN || "",
  forcePathStyle: toBool(process.env.S3_FORCE_PATH_STYLE),
};

let s3Client: S3Client | null = null;

function getClient() {
  if (s3Client) return s3Client;
  if (!config.region || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error("S3 configuration is missing required environment variables.");
  }

  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.endpoint ? config.forcePathStyle : undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken || undefined,
    },
  });

  return s3Client;
}

const sanitizeFilename = (name: string) =>
  name
    .trim()
    .replace(/[^\w.\-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);

export async function createPresignedUpload(input: PresignUploadInput) {
  const client = getClient();
  const expiresIn = input.expiresIn ?? 900;
  const safeName = sanitizeFilename(input.filename);
  const folder = input.folder?.trim().replace(/\/+$/, "") || "homework";
  const key = `${folder}/${randomUUID()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: input.contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return { key, url, expiresIn };
}

export async function createPresignedDownload(input: PresignDownloadInput) {
  const client = getClient();
  const expiresIn = input.expiresIn ?? 900;
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return { url, expiresIn };
}

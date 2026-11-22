import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const STORAGE_DIR = path.resolve(process.cwd(), '../../.local-storage/documents');
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";

let s3Client: S3Client | null = null;
if (STORAGE_PROVIDER === "s3") {
  s3Client = new S3Client({
    region: process.env.STORAGE_REGION || "us-east-1",
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY || "",
      secretAccessKey: process.env.STORAGE_SECRET_KEY || "",
    },
    forcePathStyle: true,
  });
}

export async function initStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

export async function saveDocument(originalName: string, buffer: Buffer): Promise<string> {
  const fileExt = path.extname(originalName);
  const randomName = crypto.randomBytes(16).toString("hex") + fileExt;

  if (STORAGE_PROVIDER === "s3" && s3Client) {
    try {
      const bucket = process.env.STORAGE_BUCKET || "justice-connect-docs";
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: randomName,
        Body: buffer,
        ContentType: fileExt === '.pdf' ? 'application/pdf' : 'image/jpeg',
      }));
      return randomName;
    } catch (e) {
      console.error("S3 Upload Failed:", e);
      // Fallback to local if S3 fails
    }
  }

  // Local storage fallback
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const filePath = path.join(STORAGE_DIR, randomName);
  await fs.writeFile(filePath, buffer);
  return randomName;
}

export async function getDocumentPath(storedFileName: string): Promise<string> {
  // Ensure we don't allow directory traversal attacks
  const safeFilename = path.basename(storedFileName);
  return path.join(STORAGE_DIR, safeFilename);
}

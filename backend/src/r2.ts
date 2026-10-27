/**
 * Private storage in Cloudflare R2, through Bun's own S3 client: no AWS SDK.
 *
 * The client is made on first use, not at load, so loading the app never needs the
 * storage settings. Keys are random and never logged.
 * See docs/decisions/2026-10-27-cloudflare-r2-for-clips-frames-and-masks.md
 */
import { S3Client } from "bun";

let client: S3Client | null = null;

function r2(): S3Client {
  if (client) return client;
  const { STORAGE_BUCKET, STORAGE_REGION, STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY } = process.env;
  if (!STORAGE_BUCKET || !STORAGE_ENDPOINT || !STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY) {
    throw new Error("The STORAGE_ settings must be set in backend/.env");
  }
  client = new S3Client({
    bucket: STORAGE_BUCKET,
    region: STORAGE_REGION || "auto",
    endpoint: STORAGE_ENDPOINT,
    accessKeyId: STORAGE_ACCESS_KEY_ID,
    secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  });
  return client;
}

export const r2Files = {
  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await r2().write(key, bytes, { type: contentType });
  },

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await r2().file(key).arrayBuffer());
  },
};

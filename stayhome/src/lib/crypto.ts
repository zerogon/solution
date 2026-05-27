import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = process.env.RESORT_CRED_SECRET;

function getKey(): Buffer {
  if (!KEY_ENV) {
    throw new Error(
      "RESORT_CRED_SECRET is not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const buf = Buffer.from(KEY_ENV, "base64");
  if (buf.length !== 32) {
    throw new Error("RESORT_CRED_SECRET must decode to exactly 32 bytes (base64-encoded AES-256 key)");
  }
  return buf;
}

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decrypt(packed: string): string {
  const key = getKey();
  const buf = Buffer.from(packed, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("ciphertext too short");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

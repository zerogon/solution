export const AUTH_COOKIE_NAME = "auth_session";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  if (!secret) throw new Error("AUTH_SECRET or APP_PASSWORD must be set");
  return secret;
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(): Promise<string> {
  const signature = await hmacSign("authenticated", getSecret());
  return `authenticated:${signature}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const [message, providedSig] = token.split(":");
  if (message !== "authenticated" || !providedSig) return false;

  const expectedSig = await hmacSign("authenticated", getSecret());

  if (providedSig.length !== expectedSig.length) return false;
  let mismatch = 0;
  for (let i = 0; i < providedSig.length; i++) {
    mismatch |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return mismatch === 0;
}

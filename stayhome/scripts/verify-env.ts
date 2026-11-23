import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { decrypt } from "../src/lib/crypto";

/**
 * Pre/post-migration check for moving the deployment to another Vercel / Neon
 * account (docs/notes/vercel-migration.md). Read-only.
 *
 *   npx tsx scripts/verify-env.ts                     # whatever .env points at
 *   DATABASE_URL=<new> DIRECT_URL=<new> npx tsx scripts/verify-env.ts
 *   npx tsx scripts/verify-env.ts --production        # also require INNGEST_*
 *
 * It answers the one question a migration cannot recover from afterwards:
 * **does this `RESORT_CRED_SECRET` open the credentials in this database?**
 * Vercel stores the old value as Sensitive, so it can't be read back; if the
 * key we carry over is not the one the rows were sealed with, every crawl fails
 * with what looks like a login error. Here it fails as "decrypt FAILED" instead.
 *
 * Security rule 2 (CLAUDE.md): this decrypts but never hands plaintext to a
 * caller — it prints only ok/FAILED per row, no values, no lengths — so it is
 * not a REVEAL_CREDENTIAL path and writes no audit row.
 *
 * Row counts per table are printed so the same command run against the old and
 * the new database compares a restore.
 */
const REQUIRED = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "RESORT_CRED_SECRET",
  "CRON_SECRET",
  "CHROMIUM_PACK_URL",
] as const;
const REQUIRED_PROD = ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"] as const;
const RECOMMENDED = ["SLACK_WEBHOOK_URL"] as const;

function hostOf(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const production = process.argv.includes("--production");
  let failed = false;

  console.log("== env");
  for (const key of [...REQUIRED, ...(production ? REQUIRED_PROD : [])]) {
    const ok = !!process.env[key];
    if (!ok) failed = true;
    console.log(`  ${ok ? "ok     " : "MISSING"} ${key}`);
  }
  for (const key of RECOMMENDED) {
    console.log(`  ${process.env[key] ? "ok     " : "warn   "} ${key}${process.env[key] ? "" : " (empty → crawl failures are silent)"}`);
  }
  console.log(`  DATABASE_URL host: ${hostOf(process.env.DATABASE_URL)}`);
  console.log(`  DIRECT_URL   host: ${hostOf(process.env.DIRECT_URL)}`);

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.log("\nno database URL — stopping");
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    console.log("\n== credentials (RESORT_CRED_SECRET ↔ resort_accounts)");
    const accounts = await prisma.resortAccount.findMany({
      select: { label: true, idEncrypted: true, pwEncrypted: true, resort: { select: { slug: true, active: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (accounts.length === 0) console.log("  (no accounts)");
    for (const a of accounts) {
      const res = (["idEncrypted", "pwEncrypted"] as const).map((f) => {
        try {
          decrypt(a[f]);
          return "ok";
        } catch {
          failed = true;
          return "FAILED";
        }
      });
      console.log(
        `  ${a.resort.slug.padEnd(10)} ${a.resort.active ? "active  " : "inactive"} id=${res[0].padEnd(6)} pw=${res[1].padEnd(6)} ${a.label}`,
      );
    }

    console.log("\n== row counts");
    const tables = await prisma.$queryRaw<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`;
    for (const { name } of tables) {
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`,
      );
      console.log(`  ${name.padEnd(28)} ${String(n).padStart(8)}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(failed ? "\nRESULT: FAILED" : "\nRESULT: ok");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

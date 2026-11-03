import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js와 같은 우선순위 — .env.local이 .env를 덮는다.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // drizzle-kit은 설치된 `pg`(devDependency)로 직접 붙는다 — 로컬은 docker Postgres, 프로덕션은 Neon.
  dbCredentials: { url: process.env.DATABASE_URL! },
});

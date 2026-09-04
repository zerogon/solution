// Prisma CLI / 시드·스크립트용 환경변수 로더.
// .env.local을 .env보다 먼저 로드한다. dotenv 기본 override:false라 먼저 로드된 값이 이기므로
// 로컬(.env.local)이 운영(.env)을 덮어쓴다. 또한 이미 process.env에 있는 값(예: Vercel 주입분)은
// 둘 다 덮어쓰지 않으므로 운영 환경에는 영향이 없다.
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

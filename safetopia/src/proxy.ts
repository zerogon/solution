import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next 16: middleware.ts → proxy.ts. Prisma가 없는 auth.config만 써서 edge에서 돈다.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline|icons|manifest.json|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};

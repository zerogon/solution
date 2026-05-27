import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|sw.js.map|workbox-.*|fallback-.*|icons|manifest.json|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};

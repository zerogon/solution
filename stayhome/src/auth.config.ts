import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;

      const isPublic =
        pathname === "/login" ||
        // 서비스워커가 오프라인 폴백으로 precache하는 페이지 — 로그인 전에도
        // 받아올 수 있어야 하고, 네트워크가 끊긴 상태에서 리다이렉트도 불가능하다.
        pathname === "/offline" ||
        pathname === "/manifest.json" ||
        pathname.startsWith("/icons/") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/inngest") ||
        pathname.startsWith("/api/cron");
      if (isPublic) return true;

      if (!auth?.user) {
        const loginUrl = new URL("/login", nextUrl);
        if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
        return Response.redirect(loginUrl);
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.email = user.email ?? undefined;
        token.name = user.name ?? undefined;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      if (token.email) session.user.email = token.email;
      if (token.name) session.user.name = token.name;
      return session;
    },
  },
  providers: [],
};

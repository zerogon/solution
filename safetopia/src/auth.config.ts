import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30일 — "로그인 유지" 체크 시 지속 기간
  },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;

      const isPublic =
        pathname === "/login" ||
        // 서비스워커가 precache하는 오프라인 폴백 — 인증 없이 열려야 한다.
        pathname === "/offline" ||
        pathname === "/manifest.json" ||
        pathname.startsWith("/icons/") ||
        pathname.startsWith("/api/auth");
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
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = "owner";
      session.user.name = (token.name as string) ?? session.user.name;
      return session;
    },
  },
  providers: [],
};

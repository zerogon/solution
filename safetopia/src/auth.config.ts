import type { NextAuthConfig } from "next-auth";
import { Role } from "@/generated/prisma/enums";

/** 접두사별 허용 역할. 나열되지 않은 경로는 세션만 있으면 모든 역할이 접근한다(관리자도 직원 화면을 본다). */
const ROLE_PREFIX: Array<{ prefix: string; allowed: Role[] }> = [
  { prefix: "/admin", allowed: [Role.ADMIN] },
];

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
        pathname.startsWith("/api/auth") ||
        // Vercel Cron 호출 경로 — 세션 대신 라우트 내부에서 CRON_SECRET으로 인증
        pathname.startsWith("/api/cron/");
      if (isPublic) return true;

      if (!auth?.user) {
        const loginUrl = new URL("/login", nextUrl);
        if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
        return Response.redirect(loginUrl);
      }

      const role = auth.user.role;
      for (const { prefix, allowed } of ROLE_PREFIX) {
        if (pathname.startsWith(prefix) && !allowed.includes(role)) {
          return Response.redirect(new URL("/", nextUrl));
        }
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.role = token.role as Role;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      session.user.name = (token.name as string) ?? session.user.name;
      return session;
    },
  },
  providers: [],
};

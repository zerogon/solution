import type { NextAuthConfig } from "next-auth";
import { Role } from "@/generated/prisma/enums";

const ROLE_PREFIX: Array<{ prefix: string; allowed: Role[] }> = [
  { prefix: "/admin", allowed: [Role.ADMIN] },
  { prefix: "/teacher", allowed: [Role.TEACHER, Role.ADMIN] },
  { prefix: "/student", allowed: [Role.STUDENT, Role.ADMIN] },
];

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
        pathname === "/manifest.json" ||
        pathname.startsWith("/icons/") ||
        pathname.startsWith("/api/auth");
      if (isPublic) return true;

      if (!auth?.user) {
        const loginUrl = new URL("/login", nextUrl);
        if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
        return Response.redirect(loginUrl);
      }

      // 첫 로그인 시 비밀번호 변경 강제
      if (
        auth.user.mustChangePassword &&
        pathname !== "/account/password" &&
        !pathname.startsWith("/api/")
      ) {
        return Response.redirect(new URL("/account/password", nextUrl));
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

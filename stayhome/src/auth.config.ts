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

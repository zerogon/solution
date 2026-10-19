import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";

/** 사용자는 한 명뿐이라 아이디가 없다 — 비밀번호 하나로 `Owner` 행과 대조한다. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse({ password: credentials?.password });
        if (!parsed.success) return null;

        const owner = await prisma.owner.findUnique({ where: { id: "owner" } });
        if (!owner) return null;

        const passwordOk = await bcrypt.compare(parsed.data.password, owner.password);
        if (!passwordOk) return null;

        return { id: owner.id, name: owner.name };
      },
    }),
  ],
});

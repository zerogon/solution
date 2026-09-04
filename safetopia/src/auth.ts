import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { EmployeeStatus } from "@/generated/prisma/enums";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        loginId: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse({
          loginId: credentials?.loginId,
          password: credentials?.password,
        });
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { loginId: parsed.data.loginId },
        });
        // 휴직(INACTIVE)·퇴사(RETIRED)는 로그인 자체를 막는다 (FR-001).
        if (!user || user.status !== EmployeeStatus.ACTIVE) return null;

        const passwordOk = await bcrypt.compare(parsed.data.password, user.password);
        if (!passwordOk) return null;

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});

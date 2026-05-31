import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { Role, UserStatus } from "@/generated/prisma/enums";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        loginId: { label: "로그인 ID", type: "text" },
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
        if (!user || user.status !== UserStatus.ACTIVE) return null;

        // 학생은 ID(휴대폰 8자리)만으로 로그인. 선생님/관리자는 기존 비밀번호 필수.
        if (user.role !== Role.STUDENT) {
          if (!parsed.data.password) return null;
          const passwordOk = await bcrypt.compare(
            parsed.data.password,
            user.password,
          );
          if (!passwordOk) return null;
        }

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

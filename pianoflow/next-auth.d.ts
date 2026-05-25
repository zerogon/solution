import type { Role } from "@/generated/prisma/enums";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    name: string;
    role: Role;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      role: Role;
      mustChangePassword: boolean;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: Role;
    mustChangePassword?: boolean;
  }
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  AUTH_COOKIE_NAME,
  COOKIE_OPTIONS,
} from "@/lib/auth";

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const password = formData.get("password") as string;

  if (password !== process.env.APP_PASSWORD) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);

  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect("/login");
}

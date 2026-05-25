import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { defaultRouteForRole } from "@/lib/auth-helpers";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mustChangePassword) redirect("/account/password");
  redirect(defaultRouteForRole(session.user.role));
}

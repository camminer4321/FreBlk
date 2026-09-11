import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, users } from "@/db";
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [u] = await db.select({ step: users.onboardingStep }).from(users).where(eq(users.id, session.user.id));
  if (!u) redirect("/login");
  redirect(u.step >= 99 ? "/today" : "/onboarding");
}

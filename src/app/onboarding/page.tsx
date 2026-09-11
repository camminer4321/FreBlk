import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, providersEnabled } from "@/auth";
import { db, users } from "@/db";
import Wizard from "./Wizard";
export default async function Onboarding() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signup");
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!u) redirect("/signup");
  if (u.onboardingStep >= 99) redirect("/today");
  const { passwordHash: _p, ...me } = u; void _p;
  return <Wizard initialStep={u.onboardingStep} me={me as never} features={{ ...providersEnabled, ai: !!process.env.ANTHROPIC_API_KEY }} />;
}

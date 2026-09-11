import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, users } from "@/db";
import Shell from "@/components/Shell";
import { schoolColors } from "@/lib/campus";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!u) redirect("/login");
  if (u.onboardingStep < 99) redirect("/onboarding");
  const colors = schoolColors(u.isStudent ? (u.schoolName || "Freblk") : (u.location || "Freblk"));
  return <Shell user={{ id: u.id, name: u.name, image: u.image, schoolName: u.isStudent ? u.schoolName : u.location, short: colors.short, c1: colors.c1, c2: colors.c2 }}>{children}</Shell>;
}

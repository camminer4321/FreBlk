import { redirect } from "next/navigation";
import { auth } from "@/auth";
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(session.user.onboardingStep >= 99 ? "/today" : "/onboarding");
}

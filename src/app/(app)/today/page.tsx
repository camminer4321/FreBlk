import { auth } from "@/auth";
import TodayClient from "./TodayClient";
export default async function Today({ searchParams }: { searchParams: Promise<{ welcome?: string; user?: string }> }) {
  const session = await auth(); const sp = await searchParams;
  return <TodayClient meId={session!.user.id} welcome={sp.welcome === "1"} initialUser={sp.user} />;
}

import { eq } from "drizzle-orm";
import { auth, providersEnabled } from "@/auth";
import { db, users } from "@/db";
import SettingsClient from "./SettingsClient";
import { pushEnabled } from "@/lib/push";
export default async function Settings() {
  const s = await auth(); const [u] = await db.select().from(users).where(eq(users.id, s!.user.id));
  const { passwordHash: _p, ...me } = u; void _p;
  return <SettingsClient me={me as never} features={{ ...providersEnabled, push: pushEnabled, vapid: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null }} />;
}

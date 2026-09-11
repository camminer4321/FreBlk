import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, pushSubscriptions, notifications } from "@/db";

export const pushEnabled = !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushEnabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@freblk.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

/** Create an in-app notification (deduped) and push it to the user's devices. Returns true if it was new. */
export async function notify(userId: string, kind: string, dedupeKey: string, title: string, body: string, href?: string) {
  const inserted = await db.insert(notifications).values({ userId, kind, dedupeKey, title, body, href }).onConflictDoNothing().returning({ id: notifications.id });
  if (!inserted.length) return false;
  if (pushEnabled) {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body, href: href || "/today" })); }
      catch (e: unknown) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); }
    }));
  }
  return true;
}

import { eq } from "drizzle-orm";
import { db, pushSubscriptions } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
export const POST = withUser(async (userId, req) => {
  const b = await body<{ endpoint?: string; keys?: { p256dh: string; auth: string } }>(req);
  if (!b.endpoint || !b.keys?.p256dh || !b.keys?.auth) return bad("Bad subscription");
  await db.insert(pushSubscriptions).values({ userId, endpoint: b.endpoint, keys: b.keys }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, keys: b.keys } });
  return json({ ok: true });
});
export const DELETE = withUser(async (userId, req) => {
  const b = await body<{ endpoint?: string }>(req);
  if (b.endpoint) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, b.endpoint));
  return json({ ok: true });
});

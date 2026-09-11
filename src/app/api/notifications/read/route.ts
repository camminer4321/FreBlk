import { and, eq, isNull } from "drizzle-orm";
import { db, notifications } from "@/db";
import { withUser, json, body } from "@/lib/api";
export const POST = withUser(async (userId, req) => {
  const b = await body<{ id?: string }>(req);
  if (b.id) await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, b.id), eq(notifications.userId, userId)));
  else await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return json({ ok: true });
});

import { and, eq } from "drizzle-orm";
import { db, friendships } from "@/db";
import { withUser, json, body } from "@/lib/api";
export const POST = withUser(async (userId, req) => {
  const b = await body<{ userId?: string }>(req);
  await db.update(friendships).set({ status: "accepted" }).where(and(eq(friendships.userId, String(b.userId)), eq(friendships.friendId, userId)));
  return json({ ok: true });
});

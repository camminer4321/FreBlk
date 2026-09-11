import { and, eq, or, inArray } from "drizzle-orm";
import { db, friendships, users } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
import { busyFor, isFreeAt } from "@/lib/engine";
import { notify } from "@/lib/push";

export const GET = withUser(async (userId) => {
  const rows = await db.select().from(friendships).where(or(eq(friendships.userId, userId), eq(friendships.friendId, userId)));
  const otherIds = rows.map((r) => (r.userId === userId ? r.friendId : r.userId));
  const people = otherIds.length ? await db.select({ id: users.id, name: users.name, image: users.image, schoolName: users.schoolName }).from(users).where(inArray(users.id, otherIds)) : [];
  const accepted = rows.filter((r) => r.status === "accepted").map((r) => (r.userId === userId ? r.friendId : r.userId));
  const busy = await busyFor(accepted, new Date(Date.now() - 3600000), new Date(Date.now() + 8 * 3600000));
  const now = Date.now();
  return json({
    friends: people.filter((p) => accepted.includes(p.id)).map((p) => ({ ...p, ...isFreeAt(busy.get(p.id) || [], now) })),
    incoming: rows.filter((r) => r.status === "pending" && r.friendId === userId).map((r) => people.find((p) => p.id === r.userId)).filter(Boolean),
    outgoing: rows.filter((r) => r.status === "pending" && r.userId === userId).map((r) => people.find((p) => p.id === r.friendId)).filter(Boolean),
  });
});
/** Send a request (auto-accepts if the other person already requested you). */
export const POST = withUser(async (userId, req) => {
  const b = await body<{ userId?: string }>(req); const target = String(b.userId || "");
  if (!target || target === userId) return bad("Pick someone");
  const [t] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, target)); if (!t) return bad("Not found", 404);
  const [reverse] = await db.select().from(friendships).where(and(eq(friendships.userId, target), eq(friendships.friendId, userId)));
  if (reverse) { await db.update(friendships).set({ status: "accepted" }).where(and(eq(friendships.userId, target), eq(friendships.friendId, userId))); return json({ status: "accepted" }); }
  await db.insert(friendships).values({ userId, friendId: target }).onConflictDoNothing();
  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  await notify(target, "friend", `friend|${userId}`, `${me?.name || "Someone"} wants to connect`, "Accept to see each other's free time.", "/friends");
  return json({ status: "pending" });
});
export const DELETE = withUser(async (userId, req) => {
  const b = await body<{ userId?: string }>(req); const target = String(b.userId || "");
  await db.delete(friendships).where(or(and(eq(friendships.userId, userId), eq(friendships.friendId, target)), and(eq(friendships.userId, target), eq(friendships.friendId, userId))));
  return json({ ok: true });
});

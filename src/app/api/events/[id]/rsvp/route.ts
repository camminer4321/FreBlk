import { and, eq } from "drizzle-orm";
import { db, events, groupMembers, rsvps } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
export const POST = withUser(async (userId, req, ctx) => {
  const { id } = await ctx.params;
  const [e] = await db.select().from(events).where(eq(events.id, id));
  if (!e || !e.groupId) return bad("Not a group event", 404);
  const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, e.groupId), eq(groupMembers.userId, userId)));
  if (!m) return bad("Join the group first", 403);
  const b = await body<{ status?: "going" | "declined" | "clear" }>(req);
  if (b.status === "clear") { await db.delete(rsvps).where(and(eq(rsvps.eventId, id), eq(rsvps.userId, userId))); return json({ status: null }); }
  const status = b.status === "declined" ? "declined" : "going";
  await db.insert(rsvps).values({ eventId: id, userId, status }).onConflictDoUpdate({ target: [rsvps.eventId, rsvps.userId], set: { status, at: new Date() } });
  return json({ status });
});

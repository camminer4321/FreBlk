import { and, eq, gte, inArray } from "drizzle-orm";
import { db, groups, groupMembers, users, events, rsvps } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
import { busyFor, isFreeAt, sharedFree } from "@/lib/engine";

export const GET = withUser(async (userId, _req, ctx) => {
  const { id } = await ctx.params;
  const [g] = await db.select().from(groups).where(eq(groups.id, id));
  if (!g) return bad("Not found", 404);
  const members = await db.select({ m: groupMembers, u: users }).from(groupMembers).innerJoin(users, eq(users.id, groupMembers.userId)).where(eq(groupMembers.groupId, id));
  const me = members.find((x) => x.m.userId === userId);
  const ids = members.map((x) => x.u.id);
  const busy = await busyFor(ids, new Date(Date.now() - 3600000), new Date(Date.now() + 6 * 3600000));
  const now = Date.now();
  const evs = await db.select().from(events).where(and(eq(events.groupId, id), gte(events.end, new Date(now - 3600000)))).orderBy(events.start).limit(40);
  const evIds = evs.map((e) => e.id);
  const rs = evIds.length ? await db.select().from(rsvps).where(inArray(rsvps.eventId, evIds)) : [];
  const [me2] = await db.select({ tz: users.timezone }).from(users).where(eq(users.id, userId));
  const windows = me && ids.length ? await sharedFree(ids, new Date(), new Date(now + 4 * 86400000), 60, me2?.tz || "America/New_York") : [];
  // council: flag same-slot conflicts
  const conflicts: string[] = [];
  if (g.isCouncil) for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) if (evs[i].start < evs[j].end && evs[j].start < evs[i].end) { conflicts.push(evs[i].id, evs[j].id); }
  return json({
    group: { ...g, joinCode: me ? g.joinCode : undefined },
    me: me ? { role: me.m.role } : null,
    members: members.map((x) => ({ id: x.u.id, name: x.u.name, image: x.u.image, role: x.m.role, ...(me && g.visibility !== "event times only" ? isFreeAt(busy.get(x.u.id) || [], now) : {}) })),
    events: evs.map((e) => ({ ...e, going: rs.filter((r) => r.eventId === e.id && r.status === "going").length, declined: rs.filter((r) => r.eventId === e.id && r.status === "declined").length, mine: rs.find((r) => r.eventId === e.id && r.userId === userId)?.status || null, conflict: conflicts.includes(e.id) })),
    windows: windows.slice(0, 6),
  });
});

export const PATCH = withUser(async (userId, req, ctx) => {
  const { id } = await ctx.params;
  const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)));
  if (!m || m.role !== "officer") return bad("Officers only", 403);
  const b = await body<{ name?: string; kicker?: string; visibility?: string; description?: string }>(req);
  const patch: Partial<typeof groups.$inferInsert> = {};
  if (b.name) patch.name = String(b.name).trim().slice(0, 60);
  if (b.kicker) patch.kicker = String(b.kicker).trim().slice(0, 40);
  if (b.visibility) patch.visibility = String(b.visibility);
  if (typeof b.description === "string") patch.description = b.description.slice(0, 240);
  await db.update(groups).set(patch).where(eq(groups.id, id));
  return json({ ok: true });
});
export const DELETE = withUser(async (userId, _r, ctx) => {
  const { id } = await ctx.params;
  const [g] = await db.select().from(groups).where(eq(groups.id, id));
  if (!g) return bad("Not found", 404);
  if (g.createdById !== userId) return bad("Only the creator can delete a group", 403);
  await db.delete(groups).where(eq(groups.id, id));
  return json({ ok: true });
});

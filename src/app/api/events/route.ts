import { and, eq, gte, lte, inArray, or, isNull } from "drizzle-orm";
import { db, events, users, groupMembers, groups, rsvps, calendarSources } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
import { busyFor, gaps } from "@/lib/engine";
import { addDays, fromWall, startOfDay, toWall } from "@/lib/time";
import { acceptedFriendIds } from "@/lib/friends";

/** A person's board: events + sleep/downtime blocks + free gaps, day by day. `user` may be me or an accepted friend. */
export const GET = withUser(async (userId, req) => {
  const sp = new URL(req.url).searchParams;
  const target = sp.get("user") || userId;
  if (target !== userId && !(await acceptedFriendIds(userId)).includes(target)) return bad("Not connected with that person", 403);
  const [u] = await db.select().from(users).where(eq(users.id, target));
  if (!u) return bad("Not found", 404);
  const tz = u.timezone || "America/New_York";
  const from = sp.get("from") ? new Date(sp.get("from")!) : startOfDay(new Date(), tz);
  const days = Math.min(14, Math.max(1, Number(sp.get("days") || 7)));
  const to = addDays(from, days);
  const busy = (await busyFor([target], from, to)).get(target) || [];
  const evIds = busy.filter((b) => b.eventId).map((b) => b.eventId!);
  const myRsvps = evIds.length ? await db.select().from(rsvps).where(and(inArray(rsvps.eventId, evIds), eq(rsvps.userId, target))) : [];
  const sourceRows = await db.select().from(calendarSources).where(eq(calendarSources.userId, target));
  const srcById = new Map(sourceRows.map((s) => [s.id, s.label]));
  const evRows = evIds.length ? await db.select({ id: events.id, sourceId: events.sourceId, groupId: events.groupId, userId: events.userId, postedById: events.postedById }).from(events).where(inArray(events.id, evIds)) : [];
  const evMeta = new Map(evRows.map((e) => [e.id, e]));
  const gids = [...new Set(evRows.map((e) => e.groupId).filter(Boolean))] as string[];
  const gRows = gids.length ? await db.select({ id: groups.id, name: groups.name, accent: groups.accent }).from(groups).where(inArray(groups.id, gids)) : [];
  const gById = new Map(gRows.map((g) => [g.id, g]));
  const rsvpSet = new Set(myRsvps.filter((r) => r.status === "going").map((r) => r.eventId));

  const out: { date: string; wd: number; items: unknown[]; free: { start: number; end: number }[] }[] = [];
  let day = startOfDay(from, tz);
  while (day < to) {
    const w = toWall(day, tz);
    const ds = day.getTime(), de = addDays(day, 1).getTime();
    const winS = fromWall(w.y, w.m, w.d, 7, 0, tz).getTime(), winE = fromWall(w.y, w.m, w.d, 23, 0, tz).getTime();
    const items = busy.filter((b) => b.start < de && b.end > ds).map((b) => {
      const meta = b.eventId ? evMeta.get(b.eventId) : undefined;
      return { ...b, source: meta?.sourceId ? srcById.get(meta.sourceId) || "Calendar" : null, group: meta?.groupId ? gById.get(meta.groupId) || null : null, going: b.eventId ? rsvpSet.has(b.eventId) : null, editable: !!meta && !!meta.userId && !meta.sourceId && !meta.groupId };
    });
    out.push({ date: `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`, wd: w.wd, items, free: gaps(busy, winS, winE).filter((g) => g.end - g.start >= 20 * 60000) });
    day = addDays(day, 1);
  }
  return json({ tz, days: out, user: { id: u.id, name: u.name, wake: u.wake, bed: u.bed } });
});

/** Create a personal event (single, or repeat weekly for N weeks). */
export const POST = withUser(async (userId, req) => {
  const b = await body<{ title?: string; start?: string; end?: string; category?: string; repeatWeeks?: number; location?: string }>(req);
  const title = String(b.title || "").trim(); const s = new Date(String(b.start)), e = new Date(String(b.end));
  if (!title) return bad("Give it a name");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return bad("End has to be after start");
  const cat = ["classes", "greek", "sports", "social", "personal"].includes(String(b.category)) ? (b.category as "personal") : "personal";
  const weeks = Math.min(16, Math.max(1, Number(b.repeatWeeks || 1)));
  const seriesId = weeks > 1 ? crypto.randomUUID() : null;
  const rows = Array.from({ length: weeks }, (_, i) => ({ userId, title, category: cat, start: addDays(s, i * 7), end: addDays(e, i * 7), seriesId, location: b.location ? String(b.location).slice(0, 120) : null }));
  const inserted = await db.insert(events).values(rows).returning();
  return json({ events: inserted });
});

import { and, eq } from "drizzle-orm";
import { db, campusEvents, campusRsvps, events } from "@/db";
import { withUser, json, bad } from "@/lib/api";
/** Toggle "I'm going" — also puts a real block on your own calendar so it counts as busy. */
export const POST = withUser(async (userId, _r, ctx) => {
  const { id } = await ctx.params;
  const [ce] = await db.select().from(campusEvents).where(eq(campusEvents.id, id)); if (!ce) return bad("Not found", 404);
  const [existing] = await db.select().from(campusRsvps).where(and(eq(campusRsvps.campusEventId, id), eq(campusRsvps.userId, userId)));
  if (existing) {
    if (existing.eventId) await db.delete(events).where(eq(events.id, existing.eventId));
    await db.delete(campusRsvps).where(and(eq(campusRsvps.campusEventId, id), eq(campusRsvps.userId, userId)));
    return json({ going: false });
  }
  const [ev] = await db.insert(events).values({ userId, title: ce.title, category: ce.category, start: ce.start, end: ce.end, location: ce.place, externalId: `campus:${ce.id}` }).returning();
  await db.insert(campusRsvps).values({ campusEventId: id, userId, eventId: ev.id });
  return json({ going: true });
});

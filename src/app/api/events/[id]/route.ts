import { and, eq } from "drizzle-orm";
import { db, events, groupMembers } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";

async function canManage(userId: string, id: string) {
  const [e] = await db.select().from(events).where(eq(events.id, id));
  if (!e) return { e: null, ok: false };
  if (e.userId === userId) return { e, ok: true, personal: true };
  if (e.groupId) {
    const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, e.groupId), eq(groupMembers.userId, userId)));
    return { e, ok: !!m && (m.role === "officer" || e.postedById === userId) };
  }
  return { e, ok: false };
}
export const PATCH = withUser(async (userId, req, ctx) => {
  const { id } = await ctx.params; const { e, ok } = await canManage(userId, id);
  if (!e) return bad("Not found", 404); if (!ok) return bad("You can't edit that", 403);
  if (e.sourceId) return bad("Synced events are managed by their calendar — change it there", 400);
  const b = await body<{ title?: string; start?: string; end?: string; category?: string; mandatory?: boolean; scope?: "one" | "series" }>(req);
  const patch: Partial<typeof events.$inferInsert> = {};
  if (b.title) patch.title = String(b.title).trim().slice(0, 200);
  if (b.start && b.end) { const s = new Date(b.start), en = new Date(b.end); if (isNaN(s.getTime()) || en <= s) return bad("End has to be after start"); patch.start = s; patch.end = en; }
  if (b.category && ["classes", "greek", "sports", "social", "personal"].includes(b.category)) patch.category = b.category as "personal";
  if (typeof b.mandatory === "boolean" && e.groupId) patch.mandatory = b.mandatory;
  await db.update(events).set(patch).where(eq(events.id, id));
  return json({ ok: true });
});
export const DELETE = withUser(async (userId, req, ctx) => {
  const { id } = await ctx.params; const { e, ok } = await canManage(userId, id);
  if (!e) return bad("Not found", 404); if (!ok) return bad("You can't remove that", 403);
  if (e.sourceId) return bad("Synced events come from your calendar — remove it there, or disconnect the calendar in Settings", 400);
  const scope = new URL(req.url).searchParams.get("scope");
  if (scope === "series" && e.seriesId) await db.delete(events).where(eq(events.seriesId, e.seriesId));
  else await db.delete(events).where(eq(events.id, id));
  return json({ ok: true });
});

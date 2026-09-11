import { and, eq } from "drizzle-orm";
import { db, groups, groupMembers } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
/** Join by id (open groups at your school) or by join code (id = "code"). */
export const POST = withUser(async (userId, req, ctx) => {
  const { id } = await ctx.params; const b = await body<{ code?: string }>(req);
  let g;
  if (id === "code") { [g] = await db.select().from(groups).where(eq(groups.joinCode, String(b.code || "").trim().toUpperCase())); if (!g) return bad("No group with that code"); }
  else { [g] = await db.select().from(groups).where(eq(groups.id, id)); if (!g) return bad("Not found", 404); }
  await db.insert(groupMembers).values({ groupId: g.id, userId }).onConflictDoNothing();
  return json({ group: g });
});
export const DELETE = withUser(async (userId, _r, ctx) => {
  const { id } = await ctx.params;
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)));
  return json({ ok: true });
});

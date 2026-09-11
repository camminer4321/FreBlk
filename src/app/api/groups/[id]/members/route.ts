import { and, eq } from "drizzle-orm";
import { db, groupMembers } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
/** Officers: promote/demote or remove a member. */
export const POST = withUser(async (userId, req, ctx) => {
  const { id } = await ctx.params;
  const [me] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, userId)));
  if (!me || me.role !== "officer") return bad("Officers only", 403);
  const b = await body<{ userId?: string; role?: "member" | "officer"; remove?: boolean }>(req);
  if (!b.userId) return bad("Who?");
  if (b.remove) await db.delete(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, b.userId)));
  else await db.update(groupMembers).set({ role: b.role === "officer" ? "officer" : "member" }).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, b.userId)));
  return json({ ok: true });
});

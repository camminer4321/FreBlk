import { and, eq } from "drizzle-orm";
import { db, calendarSources } from "@/db";
import { withUser, json, bad } from "@/lib/api";
export const DELETE = withUser(async (userId, _req, ctx) => {
  const { id } = await ctx.params;
  const [src] = await db.select().from(calendarSources).where(and(eq(calendarSources.id, id), eq(calendarSources.userId, userId)));
  if (!src) return bad("Not found", 404);
  await db.delete(calendarSources).where(eq(calendarSources.id, id)); // events cascade
  return json({ ok: true });
});

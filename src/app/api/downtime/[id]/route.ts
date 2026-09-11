import { and, eq } from "drizzle-orm";
import { db, downtimes } from "@/db";
import { withUser, json } from "@/lib/api";
export const DELETE = withUser(async (userId, _r, ctx) => { const { id } = await ctx.params; await db.delete(downtimes).where(and(eq(downtimes.id, id), eq(downtimes.userId, userId))); return json({ ok: true }); });

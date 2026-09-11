import { and, eq } from "drizzle-orm";
import { db, calendarSources } from "@/db";
import { withUser, json, body } from "@/lib/api";
import { syncAllForUser, syncSource } from "@/lib/sync";
export const POST = withUser(async (userId, req) => {
  const b = await body<{ id?: string }>(req);
  if (b.id) {
    const [src] = await db.select().from(calendarSources).where(and(eq(calendarSources.id, b.id), eq(calendarSources.userId, userId)));
    if (!src) return json({ error: "Not found" }, 404);
    return json({ results: [{ id: src.id, label: src.label, ...(await syncSource(src.id)) }] });
  }
  return json({ results: await syncAllForUser(userId) });
});

import { eq } from "drizzle-orm";
import { db, calendarSources } from "@/db";
import { syncSource } from "@/lib/sync";
import { json, bad } from "@/lib/api";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return bad("nope", 401);
  const list = await db.select({ id: calendarSources.id }).from(calendarSources).where(eq(calendarSources.enabled, true));
  let ok = 0, failed = 0;
  for (const s of list) { const r = await syncSource(s.id); if (r.ok) ok++; else failed++; }
  return json({ ok, failed });
}

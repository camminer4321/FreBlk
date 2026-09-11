import { and, eq } from "drizzle-orm";
import { db, calendarSources } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
import { fetchIcsText, normalizeIcsUrl, syncSource } from "@/lib/sync";

export const GET = withUser(async (userId) => json({ sources: await db.select().from(calendarSources).where(eq(calendarSources.userId, userId)) }));

/** Add an ICS feed link (Canvas calendar feed, Google secret address, Outlook published ICS, Apple published, any webcal). */
export const POST = withUser(async (userId, req) => {
  const b = await body<{ url?: string; label?: string }>(req);
  const url = normalizeIcsUrl(String(b.url || ""));
  if (!/^https?:\/\//i.test(url)) return bad("Paste the full calendar link (it starts with https:// or webcal://)");
  try { await fetchIcsText(url); } catch (e) { return bad(e instanceof Error ? e.message : "Couldn't read that link"); }
  const [dup] = await db.select().from(calendarSources).where(and(eq(calendarSources.userId, userId), eq(calendarSources.url, url)));
  if (dup) return json({ source: dup, duplicate: true });
  const label = String(b.label || "").trim() || (/instructure|canvas/i.test(url) ? "Canvas" : /google/i.test(url) ? "Google Calendar" : /outlook|office|live\.com/i.test(url) ? "Outlook" : /icloud/i.test(url) ? "Apple Calendar" : "Calendar feed");
  const [src] = await db.insert(calendarSources).values({ userId, kind: "ics", label, url }).returning();
  const result = await syncSource(src.id);
  const [fresh] = await db.select().from(calendarSources).where(eq(calendarSources.id, src.id));
  return json({ source: fresh, result });
});

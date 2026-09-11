import { eq } from "drizzle-orm";
import { db, downtimes } from "@/db";
import { withUser, json, bad, body } from "@/lib/api";
const DOWNTIME_PRESETS = [
  { key: "gym", label: "Gym", start: "17:00", end: "18:00" },
  { key: "dinner", label: "Dinner", start: "18:00", end: "19:00" },
  { key: "study", label: "Study block", start: "20:00", end: "21:30" },
  { key: "family", label: "Family time", start: "12:00", end: "13:00" },
];
export const GET = withUser(async (userId) => json({ downtimes: await db.select().from(downtimes).where(eq(downtimes.userId, userId)), presets: DOWNTIME_PRESETS }));
export const POST = withUser(async (userId, req) => {
  const b = await body<{ key?: string; label?: string; start?: string; end?: string; days?: number[] }>(req);
  const preset = DOWNTIME_PRESETS.find((p) => p.key === b.key);
  const label = String(b.label || preset?.label || "").trim(), start = String(b.start || preset?.start || ""), end = String(b.end || preset?.end || "");
  if (!label || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return bad("Need a label, start and end");
  const days = Array.isArray(b.days) && b.days.length ? b.days.map(Number).filter((d) => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6];
  const [row] = await db.insert(downtimes).values({ userId, key: preset?.key || null, label, start, end, days }).returning();
  return json({ downtime: row });
});

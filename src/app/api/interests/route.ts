import { ilike, desc } from "drizzle-orm";
import { db, interests } from "@/db";
import { withUser, json, body } from "@/lib/api";
import { DEFAULT_INTERESTS } from "@/lib/interests";

export const GET = withUser(async (_u, req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  const rows = q
    ? await db.select().from(interests).where(ilike(interests.name, `%${q}%`)).orderBy(desc(interests.uses)).limit(20)
    : await db.select().from(interests).orderBy(desc(interests.uses)).limit(40);
  const names = new Set<string>(rows.map((r) => r.name));
  for (const d of DEFAULT_INTERESTS) if (!q || d.toLowerCase().includes(q.toLowerCase())) names.add(d);
  return json({ results: [...names].slice(0, 40) });
});
export const POST = withUser(async (_u, req) => {
  const b = await body<{ name?: string }>(req);
  const name = String(b.name || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (name.length < 2) return json({ error: "Too short" }, 400);
  const pretty = name[0].toUpperCase() + name.slice(1);
  await db.insert(interests).values({ name: pretty, uses: 1 }).onConflictDoNothing();
  return json({ name: pretty });
});

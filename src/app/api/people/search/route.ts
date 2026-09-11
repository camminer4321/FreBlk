import { ilike, ne, and, or, eq } from "drizzle-orm";
import { db, users } from "@/db";
import { withUser, json } from "@/lib/api";
export const GET = withUser(async (userId, req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ results: [] });
  const [me] = await db.select({ schoolName: users.schoolName }).from(users).where(eq(users.id, userId));
  const rows = await db.select({ id: users.id, name: users.name, image: users.image, schoolName: users.schoolName, email: users.email }).from(users)
    .where(and(ne(users.id, userId), or(ilike(users.name, `%${q}%`), ilike(users.email, `${q}%`)))).limit(12);
  return json({ results: rows.sort((a, b) => Number(b.schoolName === me?.schoolName) - Number(a.schoolName === me?.schoolName)).map((r) => ({ id: r.id, name: r.name, image: r.image, schoolName: r.schoolName, emailHint: r.email ? r.email.replace(/^(..).*(@.*)$/, "$1…$2") : null })) });
});

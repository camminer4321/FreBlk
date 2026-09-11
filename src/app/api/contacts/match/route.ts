import { inArray, ne, and, or } from "drizzle-orm";
import { db, users, friendships } from "@/db";
import { withUser, json, body } from "@/lib/api";
/** The phone's contact picker (or a pasted list) sends phones/emails; we return which of them are already on Freblk. Raw contacts are matched and discarded — never stored. */
export const POST = withUser(async (userId, req) => {
  const b = await body<{ phones?: string[]; emails?: string[] }>(req);
  const phones = [...new Set((b.phones || []).map((p) => String(p).replace(/[^\d+]/g, "")).filter((p) => p.length >= 7).map((p) => p.replace(/^\+?1(\d{10})$/, "$1")))].slice(0, 2000);
  const emails = [...new Set((b.emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes("@")))].slice(0, 2000);
  if (!phones.length && !emails.length) return json({ matches: [] });
  const all = await db.select({ id: users.id, name: users.name, image: users.image, schoolName: users.schoolName, phone: users.phone, email: users.email }).from(users).where(and(ne(users.id, userId), or(emails.length ? inArray(users.email, emails) : undefined, phones.length ? inArray(users.phone, phones) : undefined)));
  const ids = all.map((u) => u.id);
  const fr = ids.length ? await db.select().from(friendships).where(or(and(inArray(friendships.userId, ids)), and(inArray(friendships.friendId, ids)))) : [];
  return json({ matches: all.map((u) => ({ id: u.id, name: u.name, image: u.image, schoolName: u.schoolName, connected: fr.some((f) => (f.userId === userId && f.friendId === u.id) || (f.friendId === userId && f.userId === u.id)) })) });
});

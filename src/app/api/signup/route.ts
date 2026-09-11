import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { bad, json, body } from "@/lib/api";

export async function POST(req: Request) {
  const b = await body<{ name?: string; email?: string; password?: string; phone?: string; timezone?: string }>(req);
  const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
  if (name.length < 2) return bad("Tell us your name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("That email doesn't look right");
  if (password.length < 8) return bad("Password needs at least 8 characters");
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) return bad("There's already an account with that email — sign in instead", 409);
  const phone = b.phone ? String(b.phone).replace(/[^\d+]/g, "") : null;
  const [u] = await db.insert(users).values({ name, email, passwordHash: await bcrypt.hash(password, 10), phone, timezone: b.timezone || "America/New_York" }).returning({ id: users.id });
  return json({ ok: true, id: u.id });
}

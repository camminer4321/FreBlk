import { eq } from "drizzle-orm";
import { db, users, calendarSources, downtimes, interests } from "@/db";
import { withUser, json, body } from "@/lib/api";
import { schoolColors } from "@/lib/campus";
import { providersEnabled } from "@/auth";
import { pushEnabled } from "@/lib/push";

export const GET = withUser(async (userId) => {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const sources = await db.select().from(calendarSources).where(eq(calendarSources.userId, userId));
  const dts = await db.select().from(downtimes).where(eq(downtimes.userId, userId));
  const { passwordHash: _ph, ...safe } = u; void _ph;
  return json({ user: safe, sources, downtimes: dts, colors: schoolColors(u.schoolName || u.location || "Freblk"), features: { ...providersEnabled, push: pushEnabled, ai: !!process.env.ANTHROPIC_API_KEY, vapid: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null } });
});

export const PATCH = withUser(async (userId, req) => {
  const b = await body<Partial<{ name: string; phone: string; isStudent: boolean; schoolName: string; location: string; wake: string; bed: string; interests: string[]; timezone: string; onboardingStep: number }>>(req);
  const patch: Partial<typeof users.$inferInsert> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
  if (typeof b.phone === "string") patch.phone = b.phone.replace(/[^\d+]/g, "") || null;
  if (typeof b.isStudent === "boolean") patch.isStudent = b.isStudent;
  if (typeof b.schoolName === "string") patch.schoolName = b.schoolName.trim().slice(0, 120) || null;
  if (typeof b.location === "string") patch.location = b.location.trim().slice(0, 120) || null;
  if (typeof b.wake === "string" && /^\d{2}:\d{2}$/.test(b.wake)) patch.wake = b.wake;
  if (typeof b.bed === "string" && /^\d{2}:\d{2}$/.test(b.bed)) patch.bed = b.bed;
  if (typeof b.timezone === "string" && b.timezone.length < 60) patch.timezone = b.timezone;
  if (typeof b.onboardingStep === "number") patch.onboardingStep = Math.max(1, Math.min(99, Math.round(b.onboardingStep)));
  if (Array.isArray(b.interests)) {
    const clean = [...new Set(b.interests.map((s) => String(s).trim()).filter(Boolean).map((s) => s.slice(0, 40)))].slice(0, 40);
    patch.interests = clean;
    for (const name of clean) await db.insert(interests).values({ name, uses: 1 }).onConflictDoUpdate({ target: interests.name, set: { uses: interests.uses } });
  }
  await db.update(users).set(patch).where(eq(users.id, userId));
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const { passwordHash: _ph, ...safe } = u; void _ph;
  return json({ user: safe });
});

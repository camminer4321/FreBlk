import ical, { type VEvent, type EventInstance } from "node-ical";
import { and, eq } from "drizzle-orm";
import { db, accounts, calendarSources, events, type Category } from "@/db";
import { addDays } from "./time";

export const SYNC_PAST_DAYS = 7, SYNC_FUTURE_DAYS = 60;

export function guessCategory(title: string, fallback: Category = "personal"): Category {
  const t = title || "";
  if (/\b[A-Z]{2,4}\s?-?\d{3,4}[A-Z]?\b/.test(t) || /\b(lecture|lab|recitation|seminar|class|exam|quiz|midterm|final|office hours|discussion)\b/i.test(t)) return "classes";
  if (/\b(practice|game|match|lift|workout|scrimmage|tournament|meet|intramural)\b/i.test(t)) return "sports";
  if (/\b(chapter|rush|philanthropy|greek|fraternity|sorority|pledge|formal|mixer|brotherhood|sisterhood|exec|new member)\b/i.test(t)) return "greek";
  if (/\b(party|dinner|hangout|birthday|date|concert|tailgate|social|bar|trivia)\b/i.test(t)) return "social";
  return fallback;
}

type Incoming = { externalId: string; title: string; start: Date; end: Date; allDay: boolean; location?: string | null };

async function replaceSourceEvents(sourceId: string, userId: string, list: Incoming[]) {
  await db.delete(events).where(eq(events.sourceId, sourceId));
  const seen = new Set<string>();
  const rows = list.filter((e) => { const k = e.externalId + "|" + e.start.toISOString(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((e) => ({ userId, sourceId, externalId: e.externalId, title: e.title.slice(0, 200), category: guessCategory(e.title), start: e.start, end: e.end, allDay: e.allDay, location: e.location || null }));
  for (let i = 0; i < rows.length; i += 200) await db.insert(events).values(rows.slice(i, i + 200));
  return rows.length;
}

/* ---------------- ICS feed (Canvas, Google secret address, Outlook published, Apple, anything) ---------------- */
export function normalizeIcsUrl(url: string) {
  let u = url.trim();
  if (/^webcal:\/\//i.test(u)) u = "https://" + u.slice(9);
  return u;
}
export async function fetchIcsText(url: string) {
  const res = await fetch(normalizeIcsUrl(url), { headers: { "User-Agent": "Freblk/1.0 (+calendar sync)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Calendar link returned ${res.status}`);
  const text = await res.text();
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That link didn't return a calendar (.ics) file");
  return text;
}
export function expandIcs(text: string, from: Date, to: Date): Incoming[] {
  const data = ical.sync.parseICS(text);
  const out: Incoming[] = [];
  for (const k of Object.keys(data)) {
    const ev = data[k] as VEvent;
    if (!ev || ev.type !== "VEVENT" || !ev.start) continue;
    const uid = String(ev.uid || k);
    let instances: EventInstance[] = [];
    try { instances = ical.expandRecurringEvent(ev, { from, to, includeOverrides: true, excludeExdates: true }); }
    catch { const s = new Date(ev.start as unknown as Date); const e = new Date((ev.end as unknown as Date) || s.getTime() + 3600000); if (!(e < from || s > to)) instances = [{ start: s, end: e, summary: ev.summary, isFullDay: false, isRecurring: false, isOverride: false, event: ev } as unknown as EventInstance]; }
    for (const inst of instances) {
      const s = new Date(inst.start as unknown as Date), e = new Date(inst.end as unknown as Date);
      if (isNaN(s.getTime())) continue;
      const end = isNaN(e.getTime()) || e <= s ? new Date(s.getTime() + 3600000) : e;
      const title = String((inst.summary as unknown as { val?: string })?.val ?? inst.summary ?? ev.summary ?? "Untitled");
      out.push({ externalId: uid, title, start: s, end, allDay: !!inst.isFullDay, location: String((inst.event.location as unknown as { val?: string })?.val ?? inst.event.location ?? "") || null });
    }
  }
  return out;
}

/* ---------------- Google Calendar ---------------- */
async function googleAccessToken(userId: string) {
  const [acc] = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));
  if (!acc) throw new Error("Google isn't connected to this account");
  const fresh = acc.expires_at && acc.expires_at * 1000 > Date.now() + 60000;
  if (fresh && acc.access_token) return acc.access_token;
  if (!acc.refresh_token) throw new Error("Google needs to be reconnected (no refresh token)");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!, grant_type: "refresh_token", refresh_token: acc.refresh_token }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("Google token refresh failed: " + (j.error_description || j.error));
  await db.update(accounts).set({ access_token: j.access_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) })
    .where(and(eq(accounts.provider, "google"), eq(accounts.providerAccountId, acc.providerAccountId)));
  return j.access_token as string;
}
async function fetchGoogle(userId: string, from: Date, to: Date): Promise<Incoming[]> {
  const token = await googleAccessToken(userId);
  const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) throw new Error(`Google calendar list failed (${listRes.status})`);
  const cals = ((await listRes.json()).items || []) as { id: string; selected?: boolean; primary?: boolean }[];
  const out: Incoming[] = [];
  for (const cal of cals.filter((c) => c.selected !== false)) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin: from.toISOString(), timeMax: to.toISOString(), maxResults: "250" });
      if (pageToken) params.set("pageToken", pageToken);
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) break;
      const j = await r.json();
      for (const it of (j.items || []) as { id: string; summary?: string; status?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; location?: string; transparency?: string }[]) {
        if (it.status === "cancelled" || it.transparency === "transparent") continue;
        const allDay = !it.start.dateTime;
        const s = new Date(it.start.dateTime || it.start.date!), e = new Date(it.end.dateTime || it.end.date!);
        out.push({ externalId: it.id, title: it.summary || "Busy", start: s, end: e, allDay, location: it.location });
      }
      pageToken = j.nextPageToken;
    } while (pageToken);
  }
  return out;
}

/* ---------------- Microsoft Graph ---------------- */
async function msAccessToken(userId: string) {
  const [acc] = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.provider, "microsoft-entra-id")));
  if (!acc) throw new Error("Microsoft isn't connected to this account");
  if (acc.expires_at && acc.expires_at * 1000 > Date.now() + 60000 && acc.access_token) return acc.access_token;
  if (!acc.refresh_token) throw new Error("Microsoft needs to be reconnected");
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!, client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!, grant_type: "refresh_token", refresh_token: acc.refresh_token, scope: "openid profile email offline_access User.Read Calendars.Read" }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("Microsoft token refresh failed: " + (j.error_description || j.error));
  await db.update(accounts).set({ access_token: j.access_token, refresh_token: j.refresh_token || acc.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) })
    .where(and(eq(accounts.provider, "microsoft-entra-id"), eq(accounts.providerAccountId, acc.providerAccountId)));
  return j.access_token as string;
}
async function fetchMicrosoft(userId: string, from: Date, to: Date): Promise<Incoming[]> {
  const token = await msAccessToken(userId);
  const out: Incoming[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=200&$select=id,subject,start,end,isAllDay,location,showAs,isCancelled`;
  while (url) {
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
    if (!r.ok) throw new Error(`Microsoft calendar failed (${r.status})`);
    const j = await r.json();
    for (const it of (j.value || []) as { id: string; subject?: string; start: { dateTime: string }; end: { dateTime: string }; isAllDay?: boolean; location?: { displayName?: string }; showAs?: string; isCancelled?: boolean }[]) {
      if (it.isCancelled || it.showAs === "free") continue;
      out.push({ externalId: it.id, title: it.subject || "Busy", start: new Date(it.start.dateTime + "Z"), end: new Date(it.end.dateTime + "Z"), allDay: !!it.isAllDay, location: it.location?.displayName });
    }
    url = j["@odata.nextLink"] || null;
  }
  return out;
}

/* ---------------- orchestration ---------------- */
export async function syncSource(sourceId: string) {
  const [src] = await db.select().from(calendarSources).where(eq(calendarSources.id, sourceId));
  if (!src || !src.enabled) return { ok: false, error: "source not found" };
  const from = addDays(new Date(), -SYNC_PAST_DAYS), to = addDays(new Date(), SYNC_FUTURE_DAYS);
  try {
    let list: Incoming[];
    if (src.kind === "ics") { if (!src.url) throw new Error("no url"); list = expandIcs(await fetchIcsText(src.url), from, to); }
    else if (src.kind === "google") list = await fetchGoogle(src.userId, from, to);
    else list = await fetchMicrosoft(src.userId, from, to);
    const n = await replaceSourceEvents(src.id, src.userId, list);
    await db.update(calendarSources).set({ lastSyncAt: new Date(), lastError: null, eventCount: n }).where(eq(calendarSources.id, src.id));
    return { ok: true, count: n };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(calendarSources).set({ lastSyncAt: new Date(), lastError: msg }).where(eq(calendarSources.id, src.id));
    return { ok: false, error: msg };
  }
}
export async function syncAllForUser(userId: string) {
  const list = await db.select().from(calendarSources).where(and(eq(calendarSources.userId, userId), eq(calendarSources.enabled, true)));
  const results = [];
  for (const s of list) results.push({ id: s.id, label: s.label, ...(await syncSource(s.id)) });
  return results;
}

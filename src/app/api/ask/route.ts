import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, gte } from "drizzle-orm";
import { db, users, events, groups, groupMembers } from "@/db";
import { withUser, body } from "@/lib/api";
import { busyFor, sharedFree, isFreeAt, suggest, ACTIVITIES } from "@/lib/engine";
import { acceptedFriendIds } from "@/lib/friends";
import { addDays, fmtDay, fmtRange, fmtTime, startOfDay, toWall, DAY_NAMES, DAY_LABELS } from "@/lib/time";
import { notify } from "@/lib/push";

export const maxDuration = 60;
type Turn = { role: "user" | "assistant"; content: string };

async function crewFor(userId: string) {
  const ids = [userId, ...(await acceptedFriendIds(userId))];
  const people = await db.select().from(users).where(inArray(users.id, ids));
  const me = people.find((p) => p.id === userId)!;
  return { me, people, tz: me.timezone || "America/New_York" };
}
function findPeople(people: { id: string; name: string | null }[], names: string[] | undefined, meId: string) {
  if (!names || !names.length) return people.map((p) => p.id);
  const want = names.map((n) => String(n).toLowerCase());
  if (want.some((w) => ["everyone", "all", "the group", "us", "we"].includes(w))) return people.map((p) => p.id);
  const out = new Set<string>();
  for (const w of want) {
    if (["me", "i", "myself"].includes(w)) { out.add(meId); continue; }
    const hit = people.find((p) => (p.name || "").toLowerCase() === w || (p.name || "").toLowerCase().split(" ")[0] === w);
    if (hit) out.add(hit.id);
  }
  return [...out];
}

export const POST = withUser(async (userId, req) => {
  const b = await body<{ message?: string; turns?: Turn[] }>(req);
  const message = String(b.message || "").trim().slice(0, 2000);
  if (!message) return new Response("empty", { status: 400 });
  const { me, people, tz } = await crewFor(userId);
  const now = new Date();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      const done = (text: string, highlight?: unknown) => { send("done", { text, highlight }); controller.close(); };
      const engine = async () => fallbackAnswer(message, userId, people, tz);

      if (!process.env.ANTHROPIC_API_KEY) { const r = await engine(); return done(r.text, r.highlight); }
      try {
        const client = new Anthropic();
        const brief = await boardBrief(userId, people, tz);
        const system = `You are Freblk, the assistant inside a schedule app for a college friend group or fraternity chapter. You know everyone's schedule better than anyone in the group chat. Be decisive, warm and brief: 2–5 sentences, or a short list of concrete times. Ground every answer in the board and the tools — never invent events or people. When asked when people are free, give specific days and windows (use find_free_time). When asked for something to do, pick ONE activity that fits a real shared window and the group's interests. Only create events when the user clearly asks to schedule/post/plan something. Plain text, no markdown headers. Today is ${fmtDay(now, tz)} ${fmtTime(now, tz)} (${tz}).\n\nBOARD:\n${brief}`;
        let highlight: unknown = null;
        const tools: Anthropic.Tool[] = [
          { name: "find_free_time", description: "Exact shared free windows for the named people (or everyone in the crew) over the next N days. Sleep, downtime and every calendar block already excluded. Returns windows with day and times.", input_schema: { type: "object", properties: { people: { type: "array", items: { type: "string" } }, days: { type: "number" }, min_minutes: { type: "number" } } } },
          { name: "get_schedule", description: "One person's blocks for a given day offset (0=today, 1=tomorrow…).", input_schema: { type: "object", properties: { person: { type: "string" }, day_offset: { type: "number" } }, required: ["person"] } },
          { name: "who_is_free_now", description: "Which crew members are free right now and until when.", input_schema: { type: "object", properties: {} } },
          { name: "suggest_activity", description: "Best activity for the named people (or everyone) in their next shared window, based on interests.", input_schema: { type: "object", properties: { people: { type: "array", items: { type: "string" } } } } },
          { name: "post_group_event", description: "Create a real event on one of the user's groups (invites all members, sends them a notification). Only when the user explicitly asks to schedule/post/plan. start/end are ISO datetimes.", input_schema: { type: "object", properties: { group: { type: "string" }, title: { type: "string" }, start: { type: "string" }, end: { type: "string" }, mandatory: { type: "boolean" } }, required: ["group", "title", "start", "end"] } },
        ];
        const exec = async (name: string, input: Record<string, unknown>) => {
          if (name === "find_free_time") {
            const ids = findPeople(people, input.people as string[] | undefined, userId); if (!ids.length) return "None of those names are in this crew.";
            const days = Math.min(7, Math.max(1, Number(input.days || 3)));
            const wins = await sharedFree(ids, now, addDays(startOfDay(now, tz), days), Number(input.min_minutes || 60), tz);
            highlight = wins.slice(0, 8);
            return wins.slice(0, 10).map((w) => `${fmtDay(new Date(w.start), tz, now)} ${fmtRange(new Date(w.start), new Date(w.end), tz)}`).join("\n") || "No shared window that long.";
          }
          if (name === "get_schedule") {
            const ids = findPeople(people, [String(input.person)], userId); if (!ids.length) return "Not in this crew.";
            const d = startOfDay(addDays(now, Number(input.day_offset || 0)), tz);
            const busy = (await busyFor(ids, d, addDays(d, 1))).get(ids[0]) || [];
            return busy.filter((x) => x.kind !== "sleep").map((x) => `${fmtRange(new Date(x.start), new Date(x.end), tz)} ${x.label}`).join("\n") || "Nothing on the board.";
          }
          if (name === "who_is_free_now") {
            const busy = await busyFor(people.map((p) => p.id), new Date(now.getTime() - 3600000), addDays(now, 1));
            return people.map((p) => { const s = isFreeAt(busy.get(p.id) || [], now.getTime()); return `${p.name}: ${s.free ? "free" : "busy"}${s.until ? " until " + fmtTime(new Date(s.until), tz) : ""}`; }).join("\n");
          }
          if (name === "suggest_activity") {
            const ids = findPeople(people, input.people as string[] | undefined, userId);
            const wins = await sharedFree(ids, now, addDays(now, 4), 60, tz);
            const s = suggest(wins, people.filter((p) => ids.includes(p.id)).map((p) => p.interests || []));
            if (!s) return "No shared window long enough in the next 4 days.";
            highlight = [s.win];
            return `${s.act.name} (${s.act.rating}★, ~${s.act.minutes} min) — ${fmtDay(new Date(s.win.start), tz, now)} ${fmtRange(new Date(s.win.start), new Date(s.win.end), tz)}`;
          }
          if (name === "post_group_event") {
            const mine = await db.select({ g: groups, role: groupMembers.role }).from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(eq(groupMembers.userId, userId));
            const hit = mine.find((m) => m.g.name.toLowerCase() === String(input.group).toLowerCase()) || mine.find((m) => m.g.name.toLowerCase().includes(String(input.group).toLowerCase()));
            if (!hit) return `No group called ${input.group}. Groups: ${mine.map((m) => m.g.name).join(", ") || "none yet"}`;
            const s = new Date(String(input.start)), e = new Date(String(input.end));
            if (isNaN(s.getTime()) || e <= s) return "Bad start/end.";
            const [ev] = await db.insert(events).values({ groupId: hit.g.id, title: String(input.title).slice(0, 200), start: s, end: e, category: "social", mandatory: !!input.mandatory && hit.role === "officer", postedById: userId }).returning();
            const members = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, hit.g.id));
            await Promise.all(members.filter((m) => m.userId !== userId).map((m) => notify(m.userId, "post", `post|${ev.id}`, `${hit.g.name}: ${ev.title}`, `${me.name} posted ${ev.title} for ${fmtDay(s, tz, now)} ${fmtTime(s, tz)}.`, `/groups/${hit.g.id}`)));
            send("action", { type: "posted", groupId: hit.g.id, title: ev.title });
            return `Posted "${ev.title}" to ${hit.g.name} for ${fmtDay(s, tz, now)} ${fmtRange(s, e, tz)} (${members.length} invited).`;
          }
          return "unknown tool";
        };
        const turns: Anthropic.MessageParam[] = [...(b.turns || []).slice(-8).map((t) => ({ role: t.role, content: t.content })), { role: "user", content: message }];
        let text = "";
        for (let round = 0; round < 5; round++) {
          const res = await client.messages.create({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5", max_tokens: 700, system, tools, messages: turns });
          const toolUses = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
          text = res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("\n").trim();
          if (!toolUses.length || res.stop_reason !== "tool_use") break;
          turns.push({ role: "assistant", content: res.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) { send("status", { tool: tu.name }); results.push({ type: "tool_result", tool_use_id: tu.id, content: String(await exec(tu.name, tu.input as Record<string, unknown>)) }); }
          turns.push({ role: "user", content: results });
        }
        if (!text) { const r = await engine(); text = r.text; }
        done(text, highlight);
      } catch (e) {
        console.error("ask failed", e);
        const r = await engine();
        done(r.text + "\n\n(Answered from the board directly — the AI service didn't respond.)", r.highlight);
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
});

async function boardBrief(userId: string, people: (typeof users.$inferSelect)[], tz: string) {
  const now = new Date();
  const busy = await busyFor(people.map((p) => p.id), startOfDay(now, tz), addDays(startOfDay(now, tz), 4));
  const lines: string[] = [];
  for (const p of people) {
    lines.push(`\n${p.name}${p.id === userId ? " (the person asking)" : ""} — wakes ${p.wake || "?"}, bed ${p.bed || "?"}; into: ${(p.interests || []).join(", ") || "nothing listed"}`);
    const list = (busy.get(p.id) || []).filter((x) => x.kind !== "sleep");
    const byDay = new Map<string, string[]>();
    for (const x of list) { const k = fmtDay(new Date(x.start), tz, now); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(`${fmtRange(new Date(x.start), new Date(x.end), tz)} ${x.label}${x.mandatory ? " (mandatory)" : ""}`); }
    for (const [k, v] of byDay) lines.push(`  ${k}: ${v.slice(0, 12).join("; ")}`);
  }
  const mine = await db.select({ name: groups.name }).from(groupMembers).innerJoin(groups, eq(groups.id, groupMembers.groupId)).where(eq(groupMembers.userId, userId));
  lines.push(`\nGroups the asker is in: ${mine.map((m) => m.name).join(", ") || "none"}`);
  lines.push(`Activity catalog: ${ACTIVITIES.map((a) => `${a.name} (${a.minutes}m, ${a.rating}★, ${a.tags.join("/")})`).join("; ")}`);
  const t = lines.join("\n"); return t.length > 20000 ? t.slice(0, 20000) : t;
}

/** Deterministic fallback when there's no API key or the model fails. */
async function fallbackAnswer(message: string, userId: string, people: (typeof users.$inferSelect)[], tz: string) {
  const q = message.toLowerCase(); const now = new Date();
  const names = people.filter((p) => p.name && q.includes(p.name.toLowerCase().split(" ")[0]));
  const ids = names.length ? names.map((p) => p.id) : people.map((p) => p.id);
  const who = names.length ? names.map((p) => p.name).join(" & ") : "Everyone";
  const verb = names.length > 1 ? "are" : "is";
  const dayIdx = DAY_NAMES.findIndex((d, i) => q.includes(d.toLowerCase()) || q.includes(DAY_LABELS[i].toLowerCase()));
  let from = now, to = addDays(startOfDay(now, tz), 3);
  if (q.includes("tonight") || q.includes("today")) { to = addDays(startOfDay(now, tz), 1); if (q.includes("tonight")) from = new Date(Math.max(now.getTime(), startOfDay(now, tz).getTime() + 17 * 3600000)); }
  else if (q.includes("tomorrow")) { from = addDays(startOfDay(now, tz), 1); to = addDays(from, 1); }
  else if (q.includes("weekend")) { const wd = toWall(now, tz).wd; const sat = addDays(startOfDay(now, tz), (5 - wd + 7) % 7); from = sat; to = addDays(sat, 2); }
  else if (dayIdx >= 0) { const wd = toWall(now, tz).wd; from = addDays(startOfDay(now, tz), (dayIdx - wd + 7) % 7); to = addDays(from, 1); }
  if (/suggest|something to do|what should we|plan/.test(q)) {
    const wins = await sharedFree(ids, from, to, 60, tz);
    const s = suggest(wins, people.filter((p) => ids.includes(p.id)).map((p) => p.interests || []));
    if (!s) return { text: `${who} ${names.length > 1 ? "don't" : "doesn't"} have a shared hour open in that stretch. Try a wider window.`, highlight: null };
    return { text: `Here's my read: ${who} ${verb} open ${fmtDay(new Date(s.win.start), tz, now)} ${fmtRange(new Date(s.win.start), new Date(s.win.end), tz)}. Go with ${s.act.name} — ${s.act.rating}★, and it lines up with what this crew's into.`, highlight: [s.win] };
  }
  if (/free now|right now|free rn/.test(q)) {
    const busy = await busyFor(ids, new Date(now.getTime() - 3600000), addDays(now, 1));
    return { text: people.filter((p) => ids.includes(p.id)).map((p) => { const s = isFreeAt(busy.get(p.id) || [], now.getTime()); return `${p.name}: ${s.free ? "free" : "busy"}${s.until ? " until " + fmtTime(new Date(s.until), tz) : ""}`; }).join("\n"), highlight: null };
  }
  if (names.length === 1 && /look like|schedule|what does|what's|whats|day/.test(q) && !/free/.test(q)) {
    const busy = (await busyFor(ids, from, to)).get(ids[0]) || [];
    const list = busy.filter((x) => x.kind !== "sleep");
    return { text: list.length ? `${names[0].name}'s board:\n` + list.map((x) => `${fmtDay(new Date(x.start), tz, now)} ${fmtRange(new Date(x.start), new Date(x.end), tz)} — ${x.label}`).join("\n") : `${names[0].name} has nothing on the board for that stretch — probably open.`, highlight: null };
  }
  const wins = await sharedFree(ids, from, to, 45, tz);
  if (!wins.length) return { text: `${who}'s board is packed for that stretch — try a wider timeframe or fewer people.`, highlight: null };
  return { text: `${who} ${verb} actually free:\n` + wins.slice(0, 5).map((w) => `${fmtDay(new Date(w.start), tz, now)} ${fmtRange(new Date(w.start), new Date(w.end), tz)}`).join("\n"), highlight: wins.slice(0, 6) };
}

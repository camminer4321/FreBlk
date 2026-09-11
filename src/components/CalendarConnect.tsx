"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { api, useUI } from "@/components/ui";
import Icon from "@/components/Icon";

type Source = { id: string; kind: "google" | "microsoft" | "ics"; label: string; url: string | null; eventCount: number; lastSyncAt: string | null; lastError: string | null };
const FEEDS = [
  { key: "canvas", label: "Canvas", icon: "🎓", blurb: "Class schedule + due dates", steps: ["Open Canvas → Calendar (left sidebar).", "Bottom-right: Calendar Feed → copy the link (it starts with https://…/feeds/calendars/…).", "Paste it below. Freblk re-checks it every hour."] },
  { key: "gcal-link", label: "Google Calendar (link)", icon: "📆", blurb: "If you'd rather not sign in with Google", steps: ["Google Calendar on a computer → Settings → your calendar → Integrate calendar.", "Copy the Secret address in iCal format.", "Paste it below."] },
  { key: "outlook-link", label: "Outlook / school email (link)", icon: "📧", blurb: "If you'd rather not sign in with Microsoft", steps: ["Outlook on the web → Settings → Calendar → Shared calendars.", "Publish a calendar → pick it → Can view all details → Publish. Copy the ICS link.", "Paste it below."] },
  { key: "apple", label: "Apple / iCloud Calendar", icon: "🍎", blurb: "Public calendar link", steps: ["On iPhone: Calendars → (i) next to the calendar → Public Calendar → Share Link.", "Paste the webcal:// link below."] },
  { key: "other", label: "Any other calendar", icon: "📎", blurb: "Team schedules, club calendars, TeamSnap, anything with an .ics / webcal link", steps: ["Look for Subscribe, Export, or iCal link in that app.", "Paste it below."] },
];

export default function CalendarConnect({ features, returnTo = "/settings" }: { features: { google: boolean; microsoft: boolean }; returnTo?: string }) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const { toast, confirm } = useUI();
  const load = () => api<{ sources: Source[] }>("/api/calendars").then((r) => setSources(r.sources));
  useEffect(() => { load(); }, []);
  const hasOAuth = (kind: string) => sources?.some((s) => s.kind === kind);

  async function addLink(label: string) {
    setBusy(true); setErr("");
    try { const r = await api<{ source: Source; result: { ok: boolean; count?: number; error?: string }; duplicate?: boolean }>("/api/calendars", { method: "POST", json: { url, label } });
      if (r.duplicate) toast("That calendar is already connected"); else if (r.result?.ok) toast(`Connected — ${r.result.count} events synced`); else toast(r.result?.error || "Connected, but the first sync failed");
      setUrl(""); setOpen(null); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add that"); }
    setBusy(false);
  }
  async function syncAll() { setBusy(true); try { const r = await api<{ results: { label: string; ok: boolean; count?: number; error?: string }[] }>("/api/calendars/sync", { method: "POST", json: {} }); toast(r.results.map((x) => `${x.label}: ${x.ok ? x.count + " events" : x.error}`).join(" · ") || "Nothing to sync"); await load(); } catch (e) { toast(e instanceof Error ? e.message : "Sync failed"); } setBusy(false); }
  async function remove(s: Source) { if (!(await confirm({ title: `Disconnect ${s.label}?`, body: `Removes its ${s.eventCount} events from your board. You can reconnect anytime.`, ok: "Disconnect", danger: true }))) return; await api(`/api/calendars/${s.id}`, { method: "DELETE" }); toast(`Disconnected ${s.label}`); load(); }

  return (
    <div>
      {sources && sources.length > 0 && <div className="list" style={{ marginBottom: 14 }}>
        {sources.map((s) => <div key={s.id} className="rowcard on" style={{ cursor: "default" }}>
          <span className="sp-dot" style={{ background: "var(--highlight)" }}><Icon name="check" size={14} /></span>
          <span style={{ minWidth: 0 }}><span className="t">{s.label}</span><span className="d">{s.lastError ? <span style={{ color: "var(--danger)" }}>{s.lastError}</span> : `${s.eventCount} events · synced ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}`}</span></span>
          <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => remove(s)}>Remove</button>
        </div>)}
        <button className="btn sm ghost" onClick={syncAll} disabled={busy}><Icon name="refresh" size={14} /> Sync now</button>
      </div>}
      <div className="list">
        {features.google && !hasOAuth("google") && <button className="rowcard" onClick={() => signIn("google", { callbackUrl: returnTo })}><span className="sp-dot" style={{ background: "#4285F4" }}>G</span><span><span className="t">Google Calendar</span><span className="d">Sign in with Google — syncs automatically</span></span><span className="right">Connect ›</span></button>}
        {features.microsoft && !hasOAuth("microsoft") && <button className="rowcard" onClick={() => signIn("microsoft-entra-id", { callbackUrl: returnTo })}><span className="sp-dot" style={{ background: "#0078D4" }}>M</span><span><span className="t">Outlook / school email</span><span className="d">Sign in with Microsoft — syncs automatically</span></span><span className="right">Connect ›</span></button>}
        {FEEDS.filter((f) => !((f.key === "gcal-link" && features.google) || (f.key === "outlook-link" && features.microsoft))).map((f) => <div key={f.key}>
          <button className={"rowcard " + (open === f.key ? "on" : "")} onClick={() => { setOpen(open === f.key ? null : f.key); setErr(""); }}><span className="sp-dot" style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)", fontSize: 14 }}>{f.icon}</span><span><span className="t">{f.label}</span><span className="d">{f.blurb}</span></span><span className="right">{open === f.key ? "Close" : "Connect ›"}</span></button>
          {open === f.key && <div className="panel" style={{ padding: 14, marginTop: -4, marginBottom: 6, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            <ol style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13, color: "var(--ink-soft)" }}>{f.steps.map((s, i) => <li key={i} style={{ margin: "3px 0" }}>{s}</li>)}</ol>
            <input className="input" placeholder="https://… or webcal://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            {err && <div className="err">{err}</div>}
            <button className="btn block" style={{ marginTop: 8 }} disabled={busy || !url.trim()} onClick={() => addLink(f.label.replace(/ \(link\)/, ""))}>{busy ? "Checking the link…" : "Connect calendar"}</button>
          </div>}
        </div>)}
      </div>
      {!features.google && !features.microsoft && <p className="faint" style={{ marginTop: 10 }}>One-tap Google and Microsoft sign-in show up here once those API keys are added to the deployment.</p>}
    </div>
  );
}

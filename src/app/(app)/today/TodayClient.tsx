"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, useUI, fmtT, fmtRange, fmtDayLabel, CATS, toLocalInput } from "@/components/ui";
import Icon from "@/components/Icon";

type Item = { start: number; end: number; label?: string; kind?: string; eventId?: string; groupId?: string | null; category?: string; mandatory?: boolean; source?: string | null; group?: { id: string; name: string; accent: string } | null; going?: boolean | null; editable?: boolean };
type Day = { date: string; wd: number; items: Item[]; free: { start: number; end: number }[] };
type Board = { tz: string; days: Day[]; user: { id: string; name: string | null } };
type Notif = { id: string; title: string; body: string; href: string | null; readAt: string | null; kind: string };
type Friend = { id: string; name: string | null };

export default function TodayClient({ meId, welcome, initialUser }: { meId: string; welcome: boolean; initialUser?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [viewing, setViewing] = useState(initialUser || meId);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [freeWith, setFreeWith] = useState<Record<string, number>>({});
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => { setTodayLabel(new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })); }, []);
  const { toast, openSheet, closeSheet, confirm } = useUI();

  const load = useCallback(async () => {
    const b = await api<Board>(`/api/events?user=${viewing}&days=7`); setBoard(b);
    if (viewing === meId) {
      const f = await api<{ windows: { start: number; end: number }[] }>("/api/free?min=20&to=" + new Date(Date.now() + 7 * 864e5).toISOString()).catch(() => ({ windows: [] }));
      const map: Record<string, number> = {}; for (const w of f.windows) map[w.start] = 1; setFreeWith(map);
    }
  }, [viewing, meId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<{ friends: Friend[] }>("/api/friends").then((r) => setFriends(r.friends)).catch(() => {}); api<{ notifications: Notif[] }>("/api/notifications").then((r) => setNotifs(r.notifications.filter((n) => !n.readAt).slice(0, 4))).catch(() => {}); }, []);
  useEffect(() => { if (welcome) toast("You're in — this is your board."); }, [welcome, toast]);

  const day = board?.days[dayIdx];
  const timeline = day ? [...day.items.filter((i) => i.kind !== "sleep").map((i) => ({ ...i, free: false })), ...day.free.map((f) => ({ start: f.start, end: f.end, free: true } as Item & { free: boolean }))].sort((a, b) => a.start - b.start) : [];

  async function dismiss(n: Notif) { setNotifs(notifs.filter((x) => x.id !== n.id)); api("/api/notifications/read", { method: "POST", json: { id: n.id } }).catch(() => {}); }

  function openEvent(it: Item) {
    const isGroup = !!it.groupId;
    openSheet(<EventSheet it={it} tz={board!.tz} mine={viewing === meId} onChanged={() => { closeSheet(); load(); }} onClose={closeSheet} confirm={confirm} toast={toast} />);
  }
  function addBlock(prefill?: { start: number; end: number }) {
    openSheet(<AddBlockSheet prefill={prefill} onDone={() => { closeSheet(); load(); toast("Added to your board"); }} />);
  }

  return (
    <div>
      {notifs.length > 0 && <div id="inbox">{notifs.map((n) => <div key={n.id} className="notif"><div className="bell"><Icon name={n.kind === "bed" ? "moon" : n.kind === "suggest" ? "ask" : "bell"} /></div><div className="body"><div className="eyebrow">{n.title}</div><p>{n.body}</p>{n.href && <div className="actions"><Link href={n.href} onClick={() => dismiss(n)}>Open</Link></div>}</div><button className="dismiss" onClick={() => dismiss(n)} aria-label="Dismiss">×</button></div>)}</div>}

      <div className="viewer-row"><span>Board for</span>
        <select value={viewing} onChange={(e) => { setViewing(e.target.value); setDayIdx(0); }}><option value={meId}>Me</option>{friends.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <span className="mono faint" style={{ marginLeft: "auto" }}>{todayLabel}</span>
      </div>
      <div className="daytabs">{(board?.days || []).map((d, i) => { const dt = new Date(d.date + "T12:00:00"); return <button key={d.date} className={"daytab " + (i === dayIdx ? "on" : "")} onClick={() => setDayIdx(i)}>{i === 0 ? "Today" : dt.toLocaleDateString([], { weekday: "short" })}<b>{dt.getDate()}</b></button>; })}</div>

      <div className="panel" style={{ padding: 14 }}>
        {!board ? <><div className="skel" /><div className="skel" style={{ width: "80%" }} /><div className="skel" style={{ width: "60%" }} /></> :
          !timeline.length ? <div className="empty"><div className="big">🌤️</div>Nothing on the board {dayIdx === 0 ? "today" : "that day"}.<br /><span className="faint">Connect a calendar or add a block.</span></div> :
          <div className="agenda">{timeline.map((it, i) => it.free ? (
            <div key={"f" + i} className="agenda-item free" onClick={() => addBlock({ start: it.start, end: it.end })}>
              <div className="time">{fmtT(it.start, board.tz)}</div><div className="bar" style={{ background: "var(--highlight)" }} />
              <div className="body"><div className="title">{Math.round((it.end - it.start) / 6e4 / 6) / 10} hr open</div><div className="meta">{viewing === meId && friends.length ? (freeWith[it.start] ? "Friends are free too" : `until ${fmtT(it.end, board.tz)}`) : `until ${fmtT(it.end, board.tz)}`}</div></div>
              {viewing === meId && <Link href="/ask" className="cta" onClick={(e) => e.stopPropagation()}>Find a plan</Link>}
            </div>) : (
            <div key={it.eventId || "b" + i} className="agenda-item" onClick={() => openEvent(it)}>
              <div className="time">{fmtT(it.start, board.tz)}</div><div className="bar" style={{ background: `var(--cat-${it.category || "personal"})` }} />
              <div className="body"><div className="title">{it.label}</div><div className="meta">{fmtRange(it.start, it.end, board.tz)}{it.source && <span className="src">{it.source}</span>}{it.group && <span className="src" style={{ borderColor: it.group.accent, color: it.group.accent }}>{it.group.name}</span>}{it.mandatory && <span className="src" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>Mandatory</span>}{it.kind === "downtime" && <span className="src">Downtime</span>}{it.going && <span className="ok-tag"><Icon name="check" size={11} /> going</span>}</div></div>
              <Icon name="chevron" size={16} className="ic" />
            </div>))}
          </div>}
      </div>
      {viewing === meId && <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn ghost" onClick={() => addBlock()}><Icon name="plus" /> Add a block</button><Link href="/settings#calendars" className="btn ghost"><Icon name="link" /> Calendars</Link></div>}
    </div>
  );
}

function EventSheet({ it, tz, mine, onChanged, onClose, confirm, toast }: { it: Item; tz: string; mine: boolean; onChanged: () => void; onClose: () => void; confirm: (o: { title: string; body?: string; ok?: string; danger?: boolean }) => Promise<boolean>; toast: (t: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: it.label || "", start: toLocalInput(new Date(it.start)), end: toLocalInput(new Date(it.end)), category: it.category || "personal" });
  const isGroup = !!it.groupId;
  return (
    <div>
      <h2>{it.label}</h2>
      <div className="sub"><span className="pill" style={{ background: `var(--cat-${it.category || "blocked"})` }}>{CATS.find((c) => c.id === it.category)?.label || (it.kind === "downtime" ? "Downtime" : "Block")}</span> {it.mandatory && <span className="pill" style={{ background: "var(--accent)" }}>Mandatory</span>}</div>
      <div className="detail-row"><span>When</span><b>{fmtDayLabel(it.start, tz)} · {fmtRange(it.start, it.end, tz)}</b></div>
      <div className="detail-row"><span>From</span><b>{it.source || (it.group ? it.group.name : it.kind === "downtime" ? "Your downtime" : "Added by hand")}</b></div>
      {isGroup && <div className="detail-row"><span>Group</span><Link href={`/groups/${it.groupId}`}>{it.group?.name} ›</Link></div>}
      {edit && <div style={{ marginTop: 12 }}>
        <label className="field"><span>What</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <div className="row"><label className="field"><span>Start</span><input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label><label className="field"><span>End</span><input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label></div>
        <label className="field"><span>Category</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      </div>}
      <div className="sheet-actions">
        {isGroup && mine && <button className={"btn " + (it.going ? "ghost" : "")} onClick={async () => { await api(`/api/events/${it.eventId}/rsvp`, { method: "POST", json: { status: it.going ? "clear" : "going" } }); toast(it.going ? "RSVP removed" : "You're in"); onChanged(); }}>{it.going ? "Leave" : it.mandatory ? "I'll be there" : "I'm in"}</button>}
        {it.editable && mine && !edit && <button className="btn ghost" onClick={() => setEdit(true)}>Edit</button>}
        {it.editable && mine && edit && <button className="btn" onClick={async () => { try { await api(`/api/events/${it.eventId}`, { method: "PATCH", json: { title: f.title, start: new Date(f.start).toISOString(), end: new Date(f.end).toISOString(), category: f.category } }); toast("Saved"); onChanged(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save"); } }}>Save</button>}
        {it.editable && mine && <button className="btn danger" onClick={async () => { if (!(await confirm({ title: `Remove "${it.label}"?`, ok: "Remove", danger: true }))) return; await api(`/api/events/${it.eventId}`, { method: "DELETE" }); toast("Removed"); onChanged(); }}>Remove</button>}
        {it.source && <span className="faint" style={{ alignSelf: "center" }}>Synced from {it.source} — edit it there.</span>}
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function AddBlockSheet({ prefill, onDone }: { prefill?: { start: number; end: number }; onDone: () => void }) {
  const s0 = prefill ? new Date(prefill.start) : new Date(Math.ceil(Date.now() / 18e5) * 18e5);
  const e0 = prefill ? new Date(Math.min(prefill.end, prefill.start + 36e5)) : new Date(s0.getTime() + 36e5);
  const [f, setF] = useState({ title: "", start: toLocalInput(s0), end: toLocalInput(e0), category: "personal", repeatWeeks: 1 });
  const [err, setErr] = useState("");
  return (
    <div>
      <h2>Add a block</h2><div className="sub">Anything that takes your time. Repeat it weekly for classes, practice, shifts.</div>
      <label className="field"><span>What</span><input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Chem lab, Intramural volleyball, Work" /></label>
      <div className="row"><label className="field"><span>Start</span><input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label><label className="field"><span>End</span><input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label></div>
      <div className="row">
        <label className="field"><span>Category</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="field"><span>Repeat weekly</span><select value={f.repeatWeeks} onChange={(e) => setF({ ...f, repeatWeeks: Number(e.target.value) })}><option value={1}>Just once</option><option value={4}>4 weeks</option><option value={8}>8 weeks</option><option value={16}>Rest of semester</option></select></label>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="sheet-actions"><button className="btn block" onClick={async () => { try { await api("/api/events", { method: "POST", json: { ...f, start: new Date(f.start).toISOString(), end: new Date(f.end).toISOString() } }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add"); } }}>Add to board</button></div>
    </div>
  );
}

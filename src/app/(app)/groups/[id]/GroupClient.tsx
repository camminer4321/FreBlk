"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, useUI, Avatar, fmtDayLabel, fmtRange, fmtT, CATS, toLocalInput } from "@/components/ui";
import Icon from "@/components/Icon";

type Data = { group: { id: string; name: string; kicker: string; plate: string; accent: string; visibility: string; description: string | null; joinCode?: string; isCouncil: boolean; createdById: string }; me: { role: string } | null; members: { id: string; name: string | null; image: string | null; role: string; free?: boolean; until?: number | null }[]; events: { id: string; title: string; start: string; end: string; category: string; mandatory: boolean; going: number; declined: number; mine: string | null; conflict: boolean; location: string | null }[]; windows: { start: number; end: number }[] };

export default function GroupClient({ id, meId }: { id: string; meId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [f, setF] = useState({ title: "", start: toLocalInput(new Date(Math.ceil(Date.now() / 36e5) * 36e5 + 36e5)), end: toLocalInput(new Date(Math.ceil(Date.now() / 36e5) * 36e5 + 72e5)), category: "social", mandatory: false, location: "" });
  const { toast, confirm } = useUI();
  const load = useCallback(() => api<Data>(`/api/groups/${id}`).then(setD), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div><div className="skel" style={{ height: 120 }} /><div className="skel" /></div>;
  const officer = d.me?.role === "officer";
  const rsvp = async (eid: string, status: string) => { await api(`/api/events/${eid}/rsvp`, { method: "POST", json: { status } }); load(); };
  return (
    <div>
      <Link href="/groups" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10 }}><Icon name="back" size={14} /> All groups</Link>
      <div className="group-head" style={{ background: d.group.plate }}>
        <div className="kicker" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", opacity: .8 }}>{d.group.kicker}{d.group.isCouncil ? " · council" : ""}</div>
        <h2>{d.group.name}</h2>
        <div className="meta"><span><b>{d.members.length}</b> members</span><span>Shares: <b>{d.group.visibility}</b></span>{d.group.joinCode && <span>Join code: <b className="mono">{d.group.joinCode}</b></span>}</div>
        {d.group.description && <div style={{ fontSize: 13, marginTop: 8, opacity: .9 }}>{d.group.description}</div>}
      </div>
      {!d.me && <button className="btn block" onClick={async () => { await api(`/api/groups/${id}/join`, { method: "POST" }); toast("Joined"); load(); }}>Join this group</button>}

      {d.me && d.windows.length > 0 && <div className="section"><h3>When everyone's free</h3><div className="chips">{d.windows.map((w) => <span key={w.start} className="chip sm on" style={{ background: "var(--highlight)", borderColor: "var(--highlight)" }}>{fmtDayLabel(w.start)} {fmtRange(w.start, w.end)}</span>)}</div></div>}

      <div className="section"><h3>Upcoming</h3>
        {!d.events.length && <div className="empty">Nothing posted yet.{d.me ? " Post the first event below." : ""}</div>}
        {d.events.map((e) => <div key={e.id} className="group-event" style={e.conflict ? { borderColor: "var(--danger)" } : undefined}>
          <div className="when">{fmtDayLabel(e.start).replace("Today", "Today").slice(0, 9)}<br />{fmtT(e.start)}</div>
          <div className="what">{e.title}<small>{e.going} going{e.mandatory ? ` · ${Math.max(0, d.members.length - e.going - e.declined)} still to hear from` : ""}{e.location ? ` · ${e.location}` : ""}</small></div>
          {e.mandatory && <span className="tag">Mandatory</span>}{e.conflict && <span className="tag flag">Conflict</span>}
          {d.me && <button className={"rsvp " + (e.mine === "going" ? "on" : "")} style={{ marginTop: 0 }} onClick={() => rsvp(e.id, e.mine === "going" ? "clear" : "going")}>{e.mine === "going" ? "✓ Going" : e.mandatory ? "I'll be there" : "I'm in"}</button>}
          {officer && <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Delete" onClick={async () => { if (await confirm({ title: `Delete "${e.title}"?`, ok: "Delete", danger: true })) { await api(`/api/events/${e.id}`, { method: "DELETE" }); load(); } }}><Icon name="x" size={12} /></button>}
        </div>)}
      </div>

      {d.me && <div className="section panel" style={{ padding: 14 }}><h3>Post to {d.group.name}</h3>
        <label className="field"><span>What</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Chapter meeting, mixer, practice…" /></label>
        <div className="row"><label className="field"><span>Start</span><input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label><label className="field"><span>End</span><input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label></div>
        <div className="row"><label className="field"><span>Category</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label className="field"><span>Where (optional)</span><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label></div>
        {officer && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink-soft)", marginBottom: 10 }}><input type="checkbox" checked={f.mandatory} onChange={(e) => setF({ ...f, mandatory: e.target.checked })} /> Mandatory — members are asked to confirm</label>}
        <button className="btn block" disabled={!f.title.trim()} onClick={async () => { try { const r = await api<{ invited: number }>(`/api/groups/${id}/events`, { method: "POST", json: { ...f, start: new Date(f.start).toISOString(), end: new Date(f.end).toISOString() } }); toast(`Posted — ${r.invited} notified`); setF({ ...f, title: "", location: "", mandatory: false }); load(); } catch (e) { toast(e instanceof Error ? e.message : "Couldn't post"); } }}>Post — not just "you free?"</button>
      </div>}

      <div className="section"><h3>Members</h3>
        {d.members.map((m) => <div key={m.id} className="member"><Avatar name={m.name} image={m.image} size={30} /><span className="name">{m.name}{m.role === "officer" && <span className="faint"> · officer</span>}</span>
          {d.me && m.free !== undefined && <span className={"pill " + (m.free ? "free" : "busy")}>{m.free ? "Free" : "Busy"}</span>}
          {officer && m.id !== meId && <button className="btn sm ghost" onClick={async () => { await api(`/api/groups/${id}/members`, { method: "POST", json: { userId: m.id, role: m.role === "officer" ? "member" : "officer" } }); load(); }}>{m.role === "officer" ? "Demote" : "Make officer"}</button>}
        </div>)}
      </div>
      {d.me && <div className="section" style={{ display: "flex", gap: 8 }}>
        <button className="btn ghost sm" onClick={async () => { if (await confirm({ title: `Leave ${d.group.name}?`, ok: "Leave" })) { await api(`/api/groups/${id}/join`, { method: "DELETE" }); window.location.href = "/groups"; } }}>Leave group</button>
        {d.group.createdById === meId && <button className="btn ghost sm" style={{ color: "var(--danger)" }} onClick={async () => { if (await confirm({ title: `Delete ${d.group.name}?`, body: "Removes the group and every event posted to it for everyone.", ok: "Delete", danger: true })) { await api(`/api/groups/${id}`, { method: "DELETE" }); window.location.href = "/groups"; } }}>Delete group</button>}
      </div>}
    </div>
  );
}

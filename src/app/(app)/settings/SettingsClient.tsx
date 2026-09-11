"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { api, useUI } from "@/components/ui";
import CalendarConnect from "@/components/CalendarConnect";
import InterestPicker from "@/components/InterestPicker";
import Icon from "@/components/Icon";
type Me = { name: string | null; phone: string | null; isStudent: boolean; schoolName: string | null; location: string | null; wake: string | null; bed: string | null; interests: string[] };
type DT = { id: string; label: string; start: string; end: string; days: number[]; key: string | null };
const D = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export default function SettingsClient({ me: me0, features }: { me: Me; features: { google: boolean; microsoft: boolean; push: boolean; vapid: string | null } }) {
  const [me, setMe] = useState(me0); const [dts, setDts] = useState<DT[]>([]); const [nd, setNd] = useState({ label: "", start: "17:00", end: "18:00", days: [0, 1, 2, 3, 4] });
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const { toast, openSheet, closeSheet } = useUI();
  useEffect(() => { api<{ downtimes: DT[] }>("/api/downtime").then((r) => setDts(r.downtimes)); if ("serviceWorker" in navigator && "PushManager" in window) navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setPushOn(!!s)).catch(() => setPushOn(false)); else setPushOn(false); }, []);
  const save = async (patch: Partial<Me>) => { const r = await api<{ user: Me }>("/api/me", { method: "PATCH", json: patch }); setMe(r.user); toast("Saved"); };
  async function enablePush() {
    if (!features.vapid) { toast("Push isn't configured on this deployment yet"); return; }
    const perm = await Notification.requestPermission(); if (perm !== "granted") { toast("Notifications blocked in your browser settings"); return; }
    const reg = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(features.vapid.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api("/api/push/subscribe", { method: "POST", json: sub.toJSON() }); setPushOn(true); toast("Notifications on");
  }
  async function disablePush() { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await api("/api/push/subscribe", { method: "DELETE", json: { endpoint: sub.endpoint } }); await sub.unsubscribe(); } setPushOn(false); }
  return (
    <div>
      <h2 style={{ fontSize: 22 }}>Settings</h2>
      <div className="section"><h3>You</h3>
        <label className="field"><span>Name</span><input defaultValue={me.name || ""} onBlur={(e) => e.target.value !== me.name && save({ name: e.target.value })} /></label>
        <label className="field"><span>Phone (for contact matching — never shown)</span><input defaultValue={me.phone || ""} onBlur={(e) => e.target.value !== me.phone && save({ phone: e.target.value })} /></label>
        <div className="settings-row"><div className="grow"><div className="t">{me.isStudent ? me.schoolName || "No school set" : me.location || "No location set"}</div><div className="d">{me.isStudent ? "Student · campus feed + school colors" : "Not a student · set up by location"}</div></div><button className="btn sm ghost" onClick={() => openSheet(<SchoolSheet me={me} onDone={(p) => { closeSheet(); save(p); }} />)}>Change</button></div>
      </div>
      <div className="section" id="calendars"><h3>Calendars</h3><CalendarConnect features={features} returnTo="/settings" /></div>
      <div className="section"><h3>When you like to be free</h3>
        <div className="row"><label className="field"><span>Wake up</span><input type="time" defaultValue={me.wake || "07:30"} step={900} onBlur={(e) => e.target.value !== me.wake && save({ wake: e.target.value })} /></label><label className="field"><span>Go to bed</span><input type="time" defaultValue={me.bed || "23:30"} step={900} onBlur={(e) => e.target.value !== me.bed && save({ bed: e.target.value })} /></label></div>
        {dts.map((d) => <div key={d.id} className="settings-row"><div className="grow"><div className="t">{d.label}</div><div className="d">{d.start.replace(/^0/, "")}–{d.end.replace(/^0/, "")} · {d.days.length === 7 ? "every day" : d.days.map((x) => D[x]).join(" ")}</div></div><button className="btn sm ghost" onClick={async () => { await api(`/api/downtime/${d.id}`, { method: "DELETE" }); setDts(dts.filter((x) => x.id !== d.id)); }}>Remove</button></div>)}
        <div className="panel" style={{ padding: 12, marginTop: 10 }}>
          <label className="field"><span>Add downtime</span><input value={nd.label} onChange={(e) => setNd({ ...nd, label: e.target.value })} placeholder="Gym, dinner, shift, church…" /></label>
          <div className="row"><label className="field"><span>From</span><input type="time" value={nd.start} step={900} onChange={(e) => setNd({ ...nd, start: e.target.value })} /></label><label className="field"><span>To</span><input type="time" value={nd.end} step={900} onChange={(e) => setNd({ ...nd, end: e.target.value })} /></label></div>
          <div className="chips" style={{ marginBottom: 10 }}>{D.map((n, i) => <button key={n} className={"chip sm " + (nd.days.includes(i) ? "on" : "")} onClick={() => setNd({ ...nd, days: nd.days.includes(i) ? nd.days.filter((x) => x !== i) : [...nd.days, i] })}>{n}</button>)}</div>
          <button className="btn sm" disabled={!nd.label.trim() || !nd.days.length} onClick={async () => { const r = await api<{ downtime: DT }>("/api/downtime", { method: "POST", json: nd }); setDts([...dts, r.downtime]); setNd({ ...nd, label: "" }); toast("Added"); }}><Icon name="plus" size={14} /> Add</button>
        </div>
      </div>
      <div className="section"><h3>What you're into</h3><InterestPicker value={me.interests} onChange={(v) => setMe({ ...me, interests: v })} /><button className="btn sm" style={{ marginTop: 10 }} onClick={() => save({ interests: me.interests })}>Save interests</button></div>
      <div className="section"><h3>Notifications</h3>
        <div className="settings-row"><div className="grow"><div className="t">Push to this device</div><div className="d">Mandatory-event reminders, group posts, wind-down before bed, the daily group suggestion.{!features.push && " (Not configured on this deployment yet.)"}</div></div>{pushOn === null ? null : pushOn ? <button className="btn sm ghost" onClick={disablePush}>Turn off</button> : <button className="btn sm" onClick={enablePush} disabled={!features.push}>Turn on</button>}</div>
        <p className="faint">On iPhone, add Freblk to your Home Screen first (Share → Add to Home Screen) — Apple only allows push for installed web apps.</p>
      </div>
      <div className="section"><button className="btn ghost" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></div>
    </div>
  );
}
function SchoolSheet({ me, onDone }: { me: Me; onDone: (p: Partial<Me>) => void }) {
  const [isStudent, setIs] = useState(me.isStudent); const [q, setQ] = useState(""); const [res, setRes] = useState<string[]>([]); const [school, setSchool] = useState(me.schoolName || ""); const [loc, setLoc] = useState(me.location || "");
  useEffect(() => { if (!isStudent) return; const t = setTimeout(() => api<{ results: string[] }>(`/api/schools?q=${encodeURIComponent(q)}`).then((r) => setRes(r.results)), 120); return () => clearTimeout(t); }, [q, isStudent]);
  return <div><h2>Where are you?</h2><div className="chips" style={{ marginBottom: 12 }}><button className={"chip " + (isStudent ? "on" : "")} onClick={() => setIs(true)}>College student</button><button className={"chip " + (!isStudent ? "on" : "")} onClick={() => setIs(false)}>Not in college</button></div>
    {isStudent ? <><input className="input" placeholder="Search any US college…" value={q} onChange={(e) => setQ(e.target.value)} /><div className="list" style={{ marginTop: 8, maxHeight: "40vh", overflowY: "auto" }}>{res.map((n) => <button key={n} className={"rowcard " + (school === n ? "on" : "")} onClick={() => setSchool(n)}><span className="t">{n}</span></button>)}</div></> : <label className="field"><span>City & state</span><input value={loc} onChange={(e) => setLoc(e.target.value)} /></label>}
    <div className="sheet-actions"><button className="btn block" disabled={isStudent ? !school : !loc.trim()} onClick={() => onDone({ isStudent, schoolName: isStudent ? school : "", location: isStudent ? "" : loc })}>Save</button></div></div>;
}

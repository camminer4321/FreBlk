"use client";
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { api, useUI, Avatar, fmtDayLabel, fmtRange } from "@/components/ui";
import Icon from "@/components/Icon";
import CalendarConnect from "@/components/CalendarConnect";
import ContactsConnect from "@/components/ContactsConnect";
import InterestPicker from "@/components/InterestPicker";
import GroupCreateSheet from "@/components/GroupCreateSheet";

type Me = { id: string; name: string | null; isStudent: boolean; schoolName: string | null; location: string | null; wake: string | null; bed: string | null; interests: string[]; onboardingStep: number };
type Features = { google: boolean; microsoft: boolean; ai: boolean };
const TOTAL = 7;
const PRESETS = [{ key: "gym", label: "Gym", start: "17:00", end: "18:00" }, { key: "dinner", label: "Dinner", start: "18:00", end: "19:00" }, { key: "study", label: "Study block", start: "20:00", end: "21:30" }, { key: "family", label: "Family time", start: "12:00", end: "13:00" }];

export default function Wizard({ initialStep, me: me0, features }: { initialStep: number; me: Me; features: Features }) {
  const [step, setStep] = useState(Math.max(2, Math.min(7, initialStep)));
  const [me, setMe] = useState<Me>(me0);
  const [busy, setBusy] = useState(false);
  const { toast, openSheet, closeSheet } = useUI();

  async function save(patch: Partial<Me> & { onboardingStep?: number }) {
    const r = await api<{ user: Me }>("/api/me", { method: "PATCH", json: patch }); setMe(r.user); return r.user;
  }
  async function next(patch: Partial<Me> = {}) {
    setBusy(true);
    try { await save({ ...patch, onboardingStep: step + 1 }); setStep(step + 1); window.scrollTo(0, 0); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save"); }
    setBusy(false);
  }
  async function finish() {
    setBusy(true);
    try { await save({ onboardingStep: 99 }); window.location.href = "/today?welcome=1"; } catch { setBusy(false); }
  }

  /* ---- step 2: student or not ---- */
  const [isStudent, setIsStudent] = useState(me.isStudent);
  const [school, setSchool] = useState(me.schoolName || "");
  const [q, setQ] = useState(""); const [results, setResults] = useState<string[]>([]); const [featured, setFeatured] = useState<string[]>([]);
  const [location, setLocation] = useState(me.location || "");
  useEffect(() => { if (step !== 2 || !isStudent) return; const t = setTimeout(() => api<{ results: string[]; featured: string[] }>(`/api/schools?q=${encodeURIComponent(q)}`).then((r) => { setResults(r.results); setFeatured(r.featured); }), 120); return () => clearTimeout(t); }, [q, step, isStudent]);

  /* ---- step 5: free time ---- */
  const [wake, setWake] = useState(me.wake || "07:30"), [bed, setBed] = useState(me.bed || "23:30");
  const [downtimes, setDowntimes] = useState<{ id: string; key: string | null; label: string }[]>([]);
  useEffect(() => { if (step === 5) api<{ downtimes: typeof downtimes }>("/api/downtime").then((r) => setDowntimes(r.downtimes)); }, [step]);
  async function togglePreset(p: typeof PRESETS[number]) {
    const have = downtimes.find((d) => d.key === p.key);
    if (have) { await api(`/api/downtime/${have.id}`, { method: "DELETE" }); setDowntimes(downtimes.filter((d) => d.id !== have.id)); }
    else { const r = await api<{ downtime: typeof downtimes[number] }>("/api/downtime", { method: "POST", json: { key: p.key } }); setDowntimes([...downtimes, r.downtime]); }
  }

  /* ---- step 6: interests ---- */
  const [interests, setInterests] = useState<string[]>(me.interests || []);

  /* ---- step 7: groups ---- */
  const [groupsData, setGroupsData] = useState<{ groups: { id: string; name: string }[]; discover: { id: string; name: string; kicker: string; accent: string; memberCount: number }[] } | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [payoff, setPayoff] = useState<{ text: string } | null>(null);
  const loadGroups = () => api<typeof groupsData>("/api/groups").then((g) => { setGroupsData(g); if (g) setJoined(new Set(g.groups.map((x) => x.id))); });
  useEffect(() => { if (step === 7) { loadGroups(); api<{ windows: { start: number; end: number }[] }>("/api/free?min=60").then((r) => { const w = r.windows[0]; setPayoff(w ? { text: `${fmtDayLabel(w.start)} ${fmtRange(w.start, w.end)}` } : null); }).catch(() => {}); } }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  async function joinGroup(id: string) {
    if (joined.has(id)) { await api(`/api/groups/${id}/join`, { method: "DELETE" }); const s = new Set(joined); s.delete(id); setJoined(s); }
    else { await api(`/api/groups/${id}/join`, { method: "POST" }); setJoined(new Set([...joined, id])); }
  }

  const dots = <div className="ob-dots">{Array.from({ length: TOTAL }, (_, i) => <span key={i} className={i + 1 <= step ? "on" : ""} />)}</div>;
  const actions = (onNext: () => void, label = "Continue", disabled = false) => (
    <div className="ob-actions">
      <button className="btn ghost" onClick={() => step > 2 ? (setStep(step - 1), window.scrollTo(0, 0)) : null} disabled={step <= 2 || busy}>Back</button>
      <button className="btn" onClick={onNext} disabled={disabled || busy}>{busy ? "Saving…" : label}</button>
    </div>
  );

  return (
    <main className="ob">
      {dots}
      {step === 2 && <>
        <h2>Who's this for?</h2><div className="sub">Step 2 of {TOTAL} · this decides where your board takes its colors and campus feed from.</div>
        <div className="ob-body">
          <div className="chips" style={{ marginBottom: 14 }}>
            <button className={"chip " + (isStudent ? "on" : "")} onClick={() => setIsStudent(true)}>I'm a college student</button>
            <button className={"chip " + (!isStudent ? "on" : "")} onClick={() => setIsStudent(false)}>Not in college</button>
          </div>
          {isStudent ? <>
            <input className="input" placeholder="Search your college…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="list" style={{ marginTop: 10, maxHeight: "50vh", overflowY: "auto" }}>
              {!q && <div className="faint" style={{ margin: "4px 0" }}>Fully built out — or search any US college below</div>}
              {(q ? results : featured).map((n) => <button key={n} className={"rowcard " + (school === n ? "on" : "")} onClick={() => setSchool(n)}><span className="sp-dot" style={{ background: "var(--ink)" }}>{n.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span><span className="t">{n}</span>{school === n && <span className="right"><Icon name="check" /></span>}</button>)}
              {q && !results.length && <div className="empty">No college matches "{q}"</div>}
            </div>
          </> : <label className="field"><span>Your city & state</span><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Portsmouth, NH" /></label>}
        </div>
        {actions(() => next({ isStudent, schoolName: isStudent ? school : "", location: isStudent ? "" : location }), "Continue", isStudent ? !school : !location.trim())}
      </>}

      {step === 3 && <>
        <h2>Bring every calendar in.</h2><div className="sub">Step 3 of {TOTAL} · connect once and Freblk keeps it in sync — classes, practices, work, everything. Add as many as you use.</div>
        <div className="ob-body"><CalendarConnect features={features} returnTo="/onboarding" /></div>
        {actions(() => next(), "Continue")}
      </>}

      {step === 4 && <>
        <h2>Find your people.</h2><div className="sub">Step 4 of {TOTAL} · see who from your contacts is already here. Their numbers are matched and thrown away — never stored.</div>
        <div className="ob-body"><ContactsConnect /></div>
        {actions(() => next(), "Continue")}
      </>}

      {step === 5 && <>
        <h2>When do you like to be free?</h2><div className="sub">Step 5 of {TOTAL} · sleep and downtime count as "not free" everywhere in the app, even when nothing's scheduled.</div>
        <div className="ob-body">
          <div className="row">
            <label className="field"><span>Wake up</span><input type="time" value={wake} onChange={(e) => setWake(e.target.value)} step={900} /></label>
            <label className="field"><span>Go to bed</span><input type="time" value={bed} onChange={(e) => setBed(e.target.value)} step={900} /></label>
          </div>
          <div className="field"><span>Block off time even when it's technically free</span></div>
          <div className="chips">{PRESETS.map((p) => <button key={p.key} className={"chip " + (downtimes.some((d) => d.key === p.key) ? "on" : "")} onClick={() => togglePreset(p)}>{p.label} · {p.start.replace(/^0/, "")}–{p.end.replace(/^0/, "")}</button>)}</div>
          <p className="faint" style={{ marginTop: 10 }}>You can add custom downtime (specific days, any hours) in Settings.</p>
        </div>
        {actions(() => next({ wake, bed }))}
      </>}

      {step === 6 && <>
        <h2>What are you into?</h2><div className="sub">Step 6 of {TOTAL} · this is how Freblk knows what to suggest for the group. Search for anything — if it's not listed, add it.</div>
        <div className="ob-body"><InterestPicker value={interests} onChange={setInterests} /></div>
        {actions(() => next({ interests }))}
      </>}

      {step === 7 && <>
        <h2>Groups at {me.schoolName || "your place"}.</h2><div className="sub">Step 7 of {TOTAL} · join what's already here, or start the first one. You control every group separately.</div>
        <div className="ob-body">
          {!groupsData ? <div className="skel" /> : (
            groupsData.discover.length || groupsData.groups.length ? <div className="list">
              {[...groupsData.groups.map((g) => ({ ...g, kicker: "Already in", accent: "#7fc3bd", memberCount: 0 })), ...groupsData.discover].map((g) => (
                <button key={g.id} className={"rowcard " + (joined.has(g.id) ? "on" : "")} onClick={() => joinGroup(g.id)}>
                  <span className="sp-dot" style={{ background: g.accent }} />
                  <span><span className="t">{g.name}</span><span className="d">{g.kicker}{g.memberCount ? ` · ${g.memberCount} members` : ""}</span></span>
                  <span className="right">{joined.has(g.id) ? "Joined ✓" : "Join"}</span>
                </button>))}
            </div> : <div className="empty"><div className="big">🫥</div>No groups {me.schoolName ? `at ${me.schoolName}` : "near you"} yet.<br />You'd be the first — that's how every chapter starts.</div>
          )}
          <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => openSheet(<GroupCreateSheet onDone={(g) => { closeSheet(); loadGroups(); toast(`Created ${g.name}`); }} />)}><Icon name="plus" /> Start a group</button>
          <div className="ob-payoff"><div className="eyebrow">{payoff ? "Already found something" : "You're set"}</div>{payoff ? <>Your first real shared window with the people you've connected: <b>{payoff.text}</b>. The assistant will have something to suggest for it.</> : <>Connect a few people and Freblk starts finding the windows you all actually share.</>}</div>
        </div>
        {actions(finish, "Open my board")}
      </>}
    </main>
  );
}

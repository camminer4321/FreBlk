"use client";
import { useEffect, useState } from "react";
import { api, useUI, Avatar } from "@/components/ui";
import Icon from "@/components/Icon";

type Person = { id: string; name: string | null; image: string | null; schoolName: string | null; connected?: boolean; emailHint?: string | null };
type ContactsAPI = { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[]; email?: string[] }[]> };

export default function ContactsConnect() {
  const [supported, setSupported] = useState(false);
  const [matches, setMatches] = useState<Person[] | null>(null);
  const [q, setQ] = useState(""); const [results, setResults] = useState<Person[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { toast } = useUI();
  useEffect(() => { setSupported(typeof navigator !== "undefined" && "contacts" in navigator && "select" in (navigator as unknown as { contacts: object }).contacts); }, []);
  useEffect(() => { if (q.length < 2) { setResults([]); return; } const t = setTimeout(() => api<{ results: Person[] }>(`/api/people/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.results)), 150); return () => clearTimeout(t); }, [q]);

  async function pickContacts() {
    setBusy(true);
    try {
      const contacts = await (navigator as unknown as { contacts: ContactsAPI }).contacts.select(["tel", "email"], { multiple: true });
      const phones = contacts.flatMap((c) => c.tel || []), emails = contacts.flatMap((c) => c.email || []);
      const r = await api<{ matches: Person[] }>("/api/contacts/match", { method: "POST", json: { phones, emails } });
      setMatches(r.matches);
      if (!r.matches.length) toast(`None of those ${contacts.length} contacts are on Freblk yet — invite them`);
    } catch { /* user cancelled */ }
    setBusy(false);
  }
  async function pasteContacts() {
    const text = prompt("Paste phone numbers or emails (any format, one per line):"); if (!text) return;
    const phones = text.match(/\+?\d[\d\s().-]{6,}\d/g) || [], emails = text.match(/[^\s,;<>]+@[^\s,;<>]+/g) || [];
    const r = await api<{ matches: Person[] }>("/api/contacts/match", { method: "POST", json: { phones, emails } });
    setMatches(r.matches); if (!r.matches.length) toast("No matches yet — they'll show up once they join");
  }
  async function connect(p: Person) { await api("/api/friends", { method: "POST", json: { userId: p.id } }); setSent(new Set([...sent, p.id])); toast(`Request sent to ${p.name}`); }
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/signup` : "";
  const share = async () => { const msg = `Get on Freblk so we can see when we're actually free: ${inviteUrl}`; if (navigator.share) { try { await navigator.share({ text: msg }); } catch {} } else { await navigator.clipboard?.writeText(msg); toast("Invite link copied"); } };

  const row = (p: Person) => <div key={p.id} className="friend"><Avatar name={p.name} image={p.image} /><div className="grow"><div className="fname">{p.name}</div><div className="fstatus">{p.schoolName || p.emailHint || ""}</div></div>
    {p.connected ? <span className="ok-tag"><Icon name="check" size={12} /> connected</span> : <button className="btn sm" disabled={sent.has(p.id)} onClick={() => connect(p)}>{sent.has(p.id) ? "Sent" : "Connect"}</button>}</div>;

  return (
    <div>
      {supported ? <button className="btn block" onClick={pickContacts} disabled={busy}><Icon name="phone" /> {busy ? "Checking…" : "Pick from my contacts"}</button>
        : <><button className="btn block" onClick={pasteContacts}><Icon name="phone" /> Match my contacts</button><p className="faint" style={{ marginTop: 6 }}>Your browser can't open the contact picker here (iPhone Safari doesn't allow it yet). Paste numbers or emails instead, or add Freblk to your home screen on Android for one-tap contact picking.</p></>}
      {matches && <div className="section"><h3>{matches.length ? `${matches.length} of your contacts are here` : "No matches yet"}</h3>{matches.map(row)}</div>}
      <div className="section"><h3>Search by name or email</h3>
        <input className="input" placeholder="Search people on Freblk…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.map(row)}
        {q.length >= 2 && !results.length && <div className="faint" style={{ marginTop: 8 }}>Nobody by that name yet.</div>}
      </div>
      <button className="btn ghost block" style={{ marginTop: 14 }} onClick={share}><Icon name="link" /> Invite friends (share link)</button>
    </div>
  );
}

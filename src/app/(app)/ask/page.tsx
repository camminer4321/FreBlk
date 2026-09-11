"use client";
import { useEffect, useRef, useState } from "react";
import { api, useUI, fmtDayLabel, fmtRange } from "@/components/ui";
import Icon from "@/components/Icon";
type Msg = { role: "user" | "assistant"; content: string; highlight?: { start: number; end: number }[] | null; status?: string };
const SUGG = ["When's everyone free tonight?", "Who's free right now?", "Suggest something for this weekend", "What does my Thursday look like?"];
export default function Ask() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: "Hey. I know everyone's schedule on your board. Ask me when people are free, what someone's day looks like, or to find something for the group — and I can post the plan to a group for you." }]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [ai, setAi] = useState<boolean | null>(null);
  const logRef = useRef<HTMLDivElement>(null); const { toast } = useUI();
  useEffect(() => { api<{ features: { ai: boolean } }>("/api/me").then((r) => setAi(r.features.ai)).catch(() => setAi(false)); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }); window.scrollTo(0, document.body.scrollHeight); }, [msgs]);
  async function send(text: string) {
    if (!text.trim() || busy) return;
    const turns = msgs.filter((m) => !m.status).slice(-8).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", status: "thinking" }]); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, turns }) });
      const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() || "";
        for (const p of parts) {
          const ev = (p.match(/^event: (.+)$/m) || [])[1]; const data = JSON.parse((p.match(/^data: (.+)$/m) || [, "{}"])[1]);
          if (ev === "status") setMsgs((m) => m.map((x, i) => i === m.length - 1 ? { ...x, status: ({ find_free_time: "checking free time…", get_schedule: "reading the board…", who_is_free_now: "checking who's free…", suggest_activity: "picking something…", post_group_event: "posting to the group…" } as Record<string, string>)[data.tool] || "working…" } : x));
          if (ev === "action" && data.type === "posted") toast(`Posted "${data.title}" to the group`);
          if (ev === "done") setMsgs((m) => m.map((x, i) => i === m.length - 1 ? { role: "assistant", content: data.text, highlight: data.highlight } : x));
        }
      }
    } catch { setMsgs((m) => m.map((x, i) => i === m.length - 1 ? { role: "assistant", content: "Couldn't reach the assistant — try again in a second." } : x)); }
    setBusy(false);
  }
  return (
    <div className="chat">
      <div style={{ marginBottom: 8 }}><h2 style={{ fontSize: 22, display: "inline" }}>Ask Freblk</h2>{ai !== null && <span className={"ai-badge " + (ai ? "" : "off")}>{ai ? "Live AI" : "Board engine"}</span>}<div className="muted">The one person in the group who actually knows everyone's schedule.</div></div>
      <div className="chat-log" ref={logRef}>
        {msgs.map((m, i) => m.role === "user" ? <div key={i} className="msg user">{m.content}</div> :
          <div key={i} className={"msg bot " + (m.status ? "thinking" : "")}><span className="who">Freblk</span>{m.status ? <><span className="dots"><span /><span /><span /></span> {m.status}</> : m.content}
            {m.highlight && m.highlight.length > 0 && <div className="chips" style={{ marginTop: 8 }}>{m.highlight.slice(0, 4).map((h) => <span key={h.start} className="chip sm" style={{ borderColor: "var(--highlight)", color: "var(--highlight)" }}>{fmtDayLabel(h.start)} {fmtRange(h.start, h.end)}</span>)}</div>}
          </div>)}
      </div>
      <div className="chips" style={{ margin: "10px 0 4px" }}>{SUGG.map((s) => <button key={s} className="sugg" onClick={() => send(s)}>{s}</button>)}</div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="When's everyone free to play pickleball?" />
        <button className="send" disabled={busy} aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}

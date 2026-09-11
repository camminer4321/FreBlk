"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
export default function SignupForm() {
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" }), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr("");
      const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      const j = await res.json(); if (!res.ok) { setErr(j.error || "Something went wrong"); setBusy(false); return; }
      const r = await signIn("credentials", { email: f.email, password: f.password, redirect: false });
      if (r?.error) { setErr("Account created, but sign-in failed — try logging in."); setBusy(false); return; }
      window.location.href = "/onboarding";
    }}>
      <label className="field"><span>Your name</span><input value={f.name} onChange={set("name")} required autoComplete="name" placeholder="First and last" /></label>
      <label className="field"><span>Email</span><input type="email" value={f.email} onChange={set("email")} required autoComplete="email" placeholder="you@vt.edu" /></label>
      <label className="field"><span>Phone (so friends can find you)</span><input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="(540) 555-0123" /></label>
      <label className="field"><span>Password</span><input type="password" value={f.password} onChange={set("password")} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label>
      {err && <div className="err">{err}</div>}
      <button className="btn block" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      <p className="faint" style={{ marginTop: 10 }}>Your phone number is only used to match you with friends who already have it in their contacts. It's never shown.</p>
    </form>
  );
}

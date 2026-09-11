"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "@/components/ui";

const NAV = [{ href: "/today", label: "Today", icon: "today" }, { href: "/groups", label: "Groups", icon: "groups" }, { href: "/ask", label: "Ask", icon: "ask", center: true }, { href: "/campus", label: "Campus", icon: "campus" }, { href: "/friends", label: "Friends", icon: "friends" }];

export default function Shell({ user, children }: { user: { id: string; name: string | null; image: string | null; schoolName: string | null; short: string; c1: string; c2: string }; children: React.ReactNode }) {
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const load = () => api<{ notifications: { readAt: string | null }[] }>("/api/notifications").then((r) => setUnread(r.notifications.filter((n) => !n.readAt).length)).catch(() => {});
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, [path]);
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  return (
    <div className="shell" style={{ ["--school-1" as string]: user.c1, ["--school-2" as string]: user.c2 }}>
      <header className="topbar">
        <div className="brand"><Link href="/today" className="brand-mark">Fre<span>blk</span></Link>{user.schoolName && <Link href="/campus" className="school-badge">{user.short}</Link>}</div>
        <div className="topbar-right">
          <Link href="/today#inbox" className="icon-btn" aria-label="Notifications"><Icon name="bell" />{unread > 0 && <span className="dot" />}</Link>
          <Link href="/settings" className="icon-btn" aria-label="Settings"><Icon name="gear" /></Link>
        </div>
      </header>
      <main className="screen">{children}</main>
      <nav className="phone-nav">
        {NAV.map((n) => <Link key={n.href} href={n.href} className={"navbtn " + (n.center ? "center " : "") + (path.startsWith(n.href) ? "on" : "")}>{n.center ? <span className="orb"><Icon name={n.icon} /></span> : <Icon name={n.icon} />}{n.label}</Link>)}
      </nav>
    </div>
  );
}

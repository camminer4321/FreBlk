import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UIProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "Freblk",
  description: "Every calendar you have, one board. See when your people are actually free.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Freblk" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};
export const viewport: Viewport = { themeColor: "#1E2438", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap" />
      </head>
      <body><UIProvider>{children}</UIProvider></body>
    </html>
  );
}

import NextAuth, { type DefaultSession } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db, users, accounts, sessions, verificationTokens, calendarSources } from "@/db";

declare module "next-auth" {
  interface Session {
    user: { id: string; onboardingStep: number } & DefaultSession["user"];
  }
}

export const GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/calendar.readonly";
export const MS_SCOPES = "openid profile email offline_access User.Read Calendars.Read";

export const providersEnabled = {
  google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  microsoft: !!(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET),
};

async function ensureOAuthCalendarSource(userId: string, provider: string) {
  const kind = provider === "google" ? "google" : provider === "microsoft-entra-id" ? "microsoft" : null;
  if (!kind) return;
  const existing = await db.select().from(calendarSources)
    .where(and(eq(calendarSources.userId, userId), eq(calendarSources.provider, provider)));
  if (existing.length) return;
  await db.insert(calendarSources).values({
    userId, kind, provider,
    label: kind === "google" ? "Google Calendar" : "Outlook / Microsoft 365",
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email || "").trim().toLowerCase();
        const password = String(creds?.password || "");
        if (!email || !password) return null;
        const [u] = await db.select().from(users).where(eq(users.email, email));
        if (!u || !u.passwordHash) return null;
        const ok = await bcrypt.compare(password, u.passwordHash);
        if (!ok) return null;
        return { id: u.id, name: u.name, email: u.email, image: u.image };
      },
    }),
    ...(providersEnabled.google ? [Google({
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { scope: GOOGLE_SCOPES, access_type: "offline", prompt: "consent" } },
    })] : []),
    ...(providersEnabled.microsoft ? [MicrosoftEntraID({
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { scope: MS_SCOPES } },
    })] : []),
  ],
  events: {
    async linkAccount({ user, account }) {
      if (user.id) await ensureOAuthCalendarSource(user.id, account.provider);
    },
    async signIn({ user, account }) {
      if (user.id && account && account.provider !== "credentials") await ensureOAuthCalendarSource(user.id, account.provider);
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user?.id) token.sub = user.id;
      if (token.sub && (user || trigger === "update" || !token.onboardingStep)) {
        const [u] = await db.select({ step: users.onboardingStep, name: users.name, image: users.image }).from(users).where(eq(users.id, token.sub));
        if (u) { token.onboardingStep = u.step; token.name = u.name; token.picture = u.image; }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub!;
      session.user.onboardingStep = (token.onboardingStep as number) ?? 1;
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Response("Unauthorized", { status: 401 });
  return session.user;
}

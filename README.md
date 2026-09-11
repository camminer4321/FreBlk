# Freblk

Every calendar a student has — Canvas, Google, Outlook, clubs, Greek life — on one board, with a live "who's free when" assistant.
Real accounts, real calendar sync, real groups and RSVPs, real notifications. Next.js 15 + Postgres.

## What's in the box

- **Accounts** — email + password, or one-tap Google / Microsoft (which also connects that calendar).
- **7-step onboarding** — create account → student or not (any US college, or a location) → connect calendars → find your people from your phone contacts → when you like to be free → interests (searchable, anything you add shows up for everyone) → groups at your school (only real ones; create the first if there are none).
- **Calendar sync** — Google Calendar and Microsoft 365/Outlook via OAuth; Canvas, Apple/iCloud, Outlook-published, TeamSnap, anything with an `.ics`/`webcal` link via feed URL. Re-synced hourly by cron. Timezone-correct recurring events.
- **Free/busy engine** — sleep (wake/bed), downtime blocks, every synced or posted event → exact shared free windows across friends and groups.
- **Groups** — create/join (open at your school, or by join code), officers vs members, post events (mandatory flag + "X of Y confirmed"), RSVP, council-style conflict flags, live "free now" per member gated by the group's visibility level.
- **Campus** — school-specific games and events (seeded for Virginia Tech, TCU, Penn State, Georgia); "I'm going" puts a real block on your board.
- **Friends** — contact matching (Contact Picker API on Android/Chrome; paste fallback elsewhere), search, requests, live status, view a friend's board.
- **Ask** — Claude with tools over the board (find free time, read a schedule, who's free now, suggest an activity, post a plan to a group). Falls back to a deterministic engine when no API key is set.
- **Notifications** — in-app inbox + Web Push (mandatory events you haven't confirmed, group posts, wind-down before bed, daily group suggestion). Installable PWA.

## Run it locally (10 minutes)

1. Postgres: easiest is a free [Neon](https://neon.tech) or [Supabase](https://supabase.com) database — copy its connection string. (Or local: `createdb freblk`.)
2. `cp .env.example .env` and fill in `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`).
3. `npm install`
4. `npm run db:push` — creates the tables.
5. `npm run dev` → http://localhost:3000

Everything works at this point with email/password accounts and `.ics` calendar links. The optional keys below turn on the rest.

## Optional keys (each one lights up a feature)

| Feature | What to set | Where to get it |
|---|---|---|
| Sign in with Google + Google Calendar sync | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web). Add redirect URI `https://YOURDOMAIN/api/auth/callback/google`. Enable **Google Calendar API**. Add the Calendar read-only scope on the consent screen. Until Google verifies the app, add testers' emails under "Test users". |
| Sign in with Microsoft + Outlook/school calendar sync | `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` | portal.azure.com → Microsoft Entra ID → App registrations → New. Supported accounts: "any org directory + personal". Redirect URI (Web) `https://YOURDOMAIN/api/auth/callback/microsoft-entra-id`. Certificates & secrets → new client secret. API permissions → Microsoft Graph delegated: `openid email profile offline_access User.Read Calendars.Read`. |
| Live AI assistant | `ANTHROPIC_API_KEY` (optionally `ANTHROPIC_MODEL`) | console.anthropic.com |
| Push notifications | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `npx web-push generate-vapid-keys` |
| Cron (hourly sync, 15-min notifications) | `CRON_SECRET` | any random string; `vercel.json` already schedules both jobs |

## Deploy (Vercel, ~15 minutes)

1. Push this folder to a GitHub repo.
2. vercel.com → New Project → import the repo. Framework: Next.js (auto).
3. Environment variables: paste everything from your `.env` (set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your Vercel URL, e.g. `https://freblk.vercel.app`).
4. Deploy. Then run the tables once against production: `DATABASE_URL=... npm run db:push` from your laptop.
5. Cron jobs from `vercel.json` start automatically (Hobby plan allows both schedules).
6. Add the production redirect URIs to Google / Microsoft (step above) once you have the domain.

Any host that runs Node works too (Railway, Render, Fly) — you'd just schedule the two cron URLs yourself (`GET /api/cron/sync` hourly, `GET /api/cron/notify` every 15 min, with `Authorization: Bearer $CRON_SECRET`).

## Canvas specifically

Canvas doesn't offer a public OAuth app for students without the school issuing developer keys, so Freblk uses the **Calendar Feed** every Canvas account already has: Canvas → Calendar → "Calendar Feed" (bottom right) → copy link → paste into Freblk. It's re-checked hourly, so new assignments and class changes show up on their own. When a school wants to partner, swap in their Canvas developer key and it becomes one-tap.

## Phone contacts

The Contact Picker API works in Chrome on Android (and when Freblk is installed to the home screen). iOS Safari doesn't expose contacts to web apps, so there the flow is: paste numbers/emails, or search by name, or send the invite link. A native iOS wrapper (Capacitor/Expo) would make it one-tap there too — the API and matching logic already exist for it.

## Layout

```
src/
  auth.ts               Auth.js config (credentials + Google + Microsoft), calendar source auto-link
  db/schema.ts          Drizzle schema (users, accounts, calendar_source, event, downtime, group, group_member, rsvp, friendship, interest, push_subscription, notification, campus_event, campus_rsvp)
  lib/engine.ts         busy/free math, shared windows, activity suggestion
  lib/sync.ts           ICS feeds (node-ical, RRULE expansion), Google Calendar API, Microsoft Graph, hourly sync
  lib/notify-jobs.ts    reminder / wind-down / suggestion jobs (cron)
  lib/push.ts           in-app notifications + Web Push
  app/api/*             REST routes (see files; all require a session except signup/schools/cron)
  app/(app)/*           Today, Groups, Ask, Campus, Friends, Settings
  app/onboarding        the 7-step wizard (steps 2–7; step 1 is /signup)
  components/*          CalendarConnect, ContactsConnect, InterestPicker, GroupCreateSheet, Shell, ui (toast/sheet/api)
public/sw.js            service worker for push
vercel.json             cron schedules
```

## Tests run before hand-off

Headless-browser pass against a production build: signup → all 7 onboarding steps → a real Canvas-style `.ics` feed synced (recurring classes expanded, all-day skipped) → Today agenda with synced class, downtime and free windows → event sheet → add block → create group → post mandatory event → RSVP → campus RSVP creates a board block → Ask (engine fallback) → settings sync-now → second user matches the first by phone number → friend request → accept → shared free windows for both → cron endpoints (auth-gated). OAuth flows and the live-AI path need real keys and were not exercised here.

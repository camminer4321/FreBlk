import {
  pgTable, text, timestamp, boolean, integer, primaryKey, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ---------- auth (Auth.js drizzle adapter shape) ---------- */
export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("passwordHash"),
  phone: text("phone"),
  // profile
  isStudent: boolean("isStudent").default(true).notNull(),
  schoolName: text("schoolName"),
  location: text("location"),
  wake: text("wake").default("07:30"),
  bed: text("bed").default("23:30"),
  interests: jsonb("interests").$type<string[]>().default([]).notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
  onboardingStep: integer("onboardingStep").default(1).notNull(), // 1..7, 99 = done
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable("account", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<AdapterAccountType>().notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (a) => [primaryKey({ columns: [a.provider, a.providerAccountId] })]);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verificationToken", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]);

/* ---------- calendars ---------- */
export const calendarSources = pgTable("calendar_source", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"google" | "microsoft" | "ics">().notNull(),
  label: text("label").notNull(),
  url: text("url"),                 // ics feed url
  provider: text("provider"),       // for oauth kinds: matches accounts.provider
  enabled: boolean("enabled").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt", { mode: "date" }),
  lastError: text("lastError"),
  eventCount: integer("eventCount").default(0).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (t) => [index("cal_source_user").on(t.userId)]);

export type Category = "classes" | "greek" | "sports" | "social" | "personal" | "blocked";

export const events = pgTable("event", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),   // personal event owner
  groupId: text("groupId").references(() => groups.id, { onDelete: "cascade" }), // group-owned event
  sourceId: text("sourceId").references(() => calendarSources.id, { onDelete: "cascade" }),
  externalId: text("externalId"),
  seriesId: text("seriesId"),
  title: text("title").notNull(),
  category: text("category").$type<Category>().default("personal").notNull(),
  start: timestamp("start", { mode: "date", withTimezone: true }).notNull(),
  end: timestamp("end", { mode: "date", withTimezone: true }).notNull(),
  allDay: boolean("allDay").default(false).notNull(),
  location: text("location"),
  mandatory: boolean("mandatory").default(false).notNull(),
  postedById: text("postedById"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (t) => [index("event_user_start").on(t.userId, t.start), index("event_group_start").on(t.groupId, t.start), index("event_source").on(t.sourceId)]);

export const downtimes = pgTable("downtime", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  key: text("key"),                 // preset key (gym, dinner...) or null for custom
  days: jsonb("days").$type<number[]>().default([0, 1, 2, 3, 4, 5, 6]).notNull(), // 0=Mon..6=Sun
  start: text("start").notNull(),   // HH:MM
  end: text("end").notNull(),
}, (t) => [index("downtime_user").on(t.userId)]);

/* ---------- groups ---------- */
export const groups = pgTable("group", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  kicker: text("kicker").default("Group").notNull(),
  accent: text("accent").default("#94bce3").notNull(),
  plate: text("plate").default("linear-gradient(140deg,#33526e,#1e3446)").notNull(),
  description: text("description"),
  visibility: text("visibility").default("free/busy + details").notNull(),
  schoolName: text("schoolName"),
  isCouncil: boolean("isCouncil").default(false).notNull(),
  joinCode: text("joinCode").notNull().$defaultFn(() => Math.random().toString(36).slice(2, 8).toUpperCase()),
  createdById: text("createdById").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (t) => [uniqueIndex("group_join_code").on(t.joinCode), index("group_school").on(t.schoolName)]);

export const groupMembers = pgTable("group_member", {
  groupId: text("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<"member" | "officer">().default("member").notNull(),
  joinedAt: timestamp("joinedAt", { mode: "date" }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.groupId, t.userId] })]);

export const rsvps = pgTable("rsvp", {
  eventId: text("eventId").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"going" | "declined">().default("going").notNull(),
  at: timestamp("at", { mode: "date" }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

/* ---------- people ---------- */
export const friendships = pgTable("friendship", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  friendId: text("friendId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "accepted">().default("pending").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.friendId] })]);

export const interests = pgTable("interest", {
  name: text("name").primaryKey(),
  uses: integer("uses").default(0).notNull(),
});

export const pushSubscriptions = pgTable("push_subscription", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const notifications = pgTable("notification", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupeKey").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  readAt: timestamp("readAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
}, (t) => [uniqueIndex("notif_dedupe").on(t.userId, t.dedupeKey)]);

export const campusEvents = pgTable("campus_event", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  schoolName: text("schoolName").notNull(),
  kind: text("kind").$type<"game" | "campus">().notNull(),
  title: text("title").notNull(),
  place: text("place"),
  note: text("note"),
  category: text("category").$type<Category>().default("social").notNull(),
  start: timestamp("start", { mode: "date", withTimezone: true }).notNull(),
  end: timestamp("end", { mode: "date", withTimezone: true }).notNull(),
  warn: boolean("warn").default(false).notNull(),
}, (t) => [index("campus_school_start").on(t.schoolName, t.start)]);

export const campusRsvps = pgTable("campus_rsvp", {
  campusEventId: text("campusEventId").notNull().references(() => campusEvents.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventId: text("eventId"), // the personal event created from the RSVP
}, (t) => [primaryKey({ columns: [t.campusEventId, t.userId] })]);

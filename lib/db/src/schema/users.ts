import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// An application user. Login is via Google OAuth, but we keep our own numeric
// primary key (`id`) and a human-readable `username`; `googleId` links the row
// to the Google account. `email`/`displayName` come from the Google profile.
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  googleId: text("google_id").unique(),
  email: text("email"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;

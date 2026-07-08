import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per successful sign-in, used by the owner-only admin analytics.
export const visitsTable = pgTable("visits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  email: text("email"),
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
});

export type Visit = typeof visitsTable.$inferSelect;

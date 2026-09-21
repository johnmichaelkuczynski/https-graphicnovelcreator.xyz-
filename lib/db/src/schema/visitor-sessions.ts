import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Anonymous visit tracking is intentionally separate from `visits`, which
// records successful Google sign-ins for the private admin analytics.
export const visitorSessionsTable = pgTable(
  "visitor_sessions",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    visitedAt: timestamp("visited_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("visitor_sessions_session_id_unique").on(table.sessionId),
  ],
);

export const insertVisitorSessionSchema = createInsertSchema(
  visitorSessionsTable,
).omit({ id: true, visitedAt: true });
export type InsertVisitorSession = z.infer<
  typeof insertVisitorSessionSchema
>;
export type VisitorSession = typeof visitorSessionsTable.$inferSelect;
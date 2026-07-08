import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

// Session store for express-session via connect-pg-simple. The library expects
// exactly these columns (`sid` / `sess` / `expire`). We declare the table here
// so `db push` provisions it in every environment (dev + production): the
// library's own `createTableIfMissing` can't read its bundled `table.sql` after
// the server is esbuild-bundled, so we cannot rely on it to auto-create.
export const userSessionsTable = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_user_sessions_expire").on(table.expire)],
);

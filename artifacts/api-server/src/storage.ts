import { desc, eq, gte } from "drizzle-orm";
import { db, usersTable, visitsTable, type User } from "@workspace/db";

// Data-access layer used by the canonical auth implementation (src/auth.ts).
// Backed by Drizzle over the shared Postgres pool.

async function getUserByUsername(username: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);
  return row ?? null;
}

export const storage = {
  async getUserById(id: number): Promise<User | null> {
    const [row] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    return row ?? null;
  },

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const [row] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, googleId))
      .limit(1);
    return row ?? null;
  },

  async getUserByEmail(email: string): Promise<User | null> {
    const [row] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    return row ?? null;
  },

  async createUserWithGoogle(data: {
    username: string;
    googleId: string;
    email: string | null;
    displayName: string | null;
  }): Promise<User> {
    // Email prefixes can collide across different Google accounts, so make the
    // username unique before inserting (the column has a UNIQUE constraint).
    let username = data.username;
    for (let i = 1; await getUserByUsername(username); i++) {
      username = `${data.username}_${i}`;
    }
    const [row] = await db
      .insert(usersTable)
      .values({
        username,
        googleId: data.googleId,
        email: data.email,
        displayName: data.displayName,
      })
      .returning();
    return row;
  },

  async updateUserGoogle(
    id: number,
    data: { googleId?: string; displayName?: string | null },
  ): Promise<User> {
    const [row] = await db
      .update(usersTable)
      .set(data)
      .where(eq(usersTable.id, id))
      .returning();
    return row;
  },

  async recordVisit(userId: number, email: string | null): Promise<void> {
    await db.insert(visitsTable).values({ userId, email });
  },

  async getVisits(
    limit: number,
  ): Promise<{ id: number; email: string | null; visitedAt: Date }[]> {
    return db
      .select({
        id: visitsTable.id,
        email: visitsTable.email,
        visitedAt: visitsTable.visitedAt,
      })
      .from(visitsTable)
      .orderBy(desc(visitsTable.visitedAt))
      .limit(limit);
  },

  async getVisitTimestampsSince(since: Date | null): Promise<Date[]> {
    const rows = since
      ? await db
          .select({ visitedAt: visitsTable.visitedAt })
          .from(visitsTable)
          .where(gte(visitsTable.visitedAt, since))
      : await db.select({ visitedAt: visitsTable.visitedAt }).from(visitsTable);
    return rows.map((r) => r.visitedAt);
  },
};

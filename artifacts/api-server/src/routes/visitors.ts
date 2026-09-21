import { Router, type IRouter } from "express";
import { count } from "drizzle-orm";
import { db, visitorSessionsTable } from "@workspace/db";
import {
  RecordVisitorBody,
  RecordVisitorResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/visitors", async (req, res): Promise<void> => {
  const parsed = RecordVisitorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid visitor session" });
    return;
  }

  await db
    .insert(visitorSessionsTable)
    .values({ sessionId: parsed.data.sessionId })
    .onConflictDoNothing({ target: visitorSessionsTable.sessionId });

  const [result] = await db
    .select({ total: count() })
    .from(visitorSessionsTable);

  res.json(RecordVisitorResponse.parse({ total: result.total }));
});

export default router;
import type { RequestHandler } from "express";

// Gate a route behind a signed-in session. Replaces the previous Clerk
// `getAuth(req).userId` checks.
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    next();
    return;
  }
  res.status(401).json({ error: "Sign in to continue." });
};

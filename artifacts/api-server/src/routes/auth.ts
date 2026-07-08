import { Router, type IRouter } from "express";
import passport, { isGoogleConfigured } from "../lib/passport";

const router: IRouter = Router();

// Kick off the Google OAuth flow.
router.get("/auth/google", (req, res, next) => {
  if (!isGoogleConfigured()) {
    res.status(503).json({ error: "Google sign-in is not configured." });
    return;
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })(req, res, next);
});

// Google redirects back here with an auth code; passport exchanges it, runs the
// verify callback (which upserts the user), then we land the user in the app.
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
  (_req, res) => {
    res.redirect("/");
  },
);

// The client polls this to learn who (if anyone) is signed in.
router.get("/auth/me", (req, res) => {
  if (req.isAuthenticated() && req.user) {
    const { id, email, name, avatarUrl } = req.user;
    res.json({ user: { id, email, name, avatarUrl } });
    return;
  }
  res.status(401).json({ error: "Not signed in." });
});

router.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err);
      return;
    }
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

export default router;

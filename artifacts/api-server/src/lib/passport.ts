import passport from "passport";
import {
  Strategy as GoogleStrategy,
  type Profile,
} from "passport-google-oauth20";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

// Make `req.user` carry our persisted user shape everywhere in the app.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
    }
  }
}

const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

export function isGoogleConfigured(): boolean {
  return Boolean(clientID && clientSecret);
}

// The redirect URI Google sends the user back to. It must be registered in the
// Google Cloud console. In development we use the Replit dev domain; in a
// deployment we use the first published domain.
export function getCallbackURL(): string {
  const isProd = process.env.NODE_ENV === "production";
  const domain = isProd
    ? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
    : process.env.REPLIT_DEV_DOMAIN;
  if (!domain) {
    throw new Error(
      "Cannot build the Google OAuth callback URL: neither REPLIT_DOMAINS nor REPLIT_DEV_DOMAIN is set.",
    );
  }
  return `https://${domain}/api/auth/google/callback`;
}

async function upsertUser(profile: Profile): Promise<User> {
  const email = profile.emails?.[0]?.value ?? "";
  const name = profile.displayName?.trim() || null;
  const avatarUrl = profile.photos?.[0]?.value ?? null;

  const [user] = await db
    .insert(usersTable)
    .values({ id: profile.id, email, name, avatarUrl })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { email, name, avatarUrl },
    })
    .returning();
  return user;
}

if (isGoogleConfigured()) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: clientID as string,
        clientSecret: clientSecret as string,
        callbackURL: getCallbackURL(),
        // Store an anti-CSRF `state` value in the session and verify it on the
        // callback, preventing OAuth login-CSRF / account-confusion attacks.
        state: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await upsertUser(profile);
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );
}

passport.serializeUser<string>((user, done) => {
  done(null, user.id);
});

passport.deserializeUser<string>(async (id, done) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    done(null, user ?? false);
  } catch (err) {
    done(err as Error);
  }
});

export default passport;

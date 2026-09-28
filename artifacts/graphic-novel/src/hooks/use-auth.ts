import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  devPreview?: boolean;
}

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

// UI-only gate for the Administrative page/link. The real authorization is
// enforced server-side by `isAdmin` in the API (which returns 403 otherwise);
// this just decides whether to render the admin affordances.
const ADMIN_EMAIL = "johnmichaelkuczynski@gmail.com";

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Could not load your session.");
  return (await res.json()) as AuthUser;
}

export function useAuth() {
  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: query.data ?? null,
    isSignedIn: !!query.data,
    isAdmin: !query.data?.devPreview && query.data?.email?.toLowerCase() === ADMIN_EMAIL,
    isLoading: query.isLoading,
  };
}

// Start the Google OAuth flow with a full-page navigation to our server route.
export function signInWithGoogle(): void {
  window.location.href = "/api/auth/google";
}

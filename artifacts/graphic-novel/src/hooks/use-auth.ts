import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Could not load your session.");
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
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
    isLoading: query.isLoading,
  };
}

// Start the Google OAuth flow with a full-page navigation to our server route.
export function signInWithGoogle(): void {
  window.location.href = "/api/auth/google";
}

import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
}

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

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
    isLoading: query.isLoading,
  };
}

// Start the Google OAuth flow with a full-page navigation to our server route.
export function signInWithGoogle(): void {
  window.location.href = "/api/auth/google";
}

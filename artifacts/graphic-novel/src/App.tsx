import { useEffect, useState } from "react";
import {
  Switch,
  Route,
  Redirect,
  Router as WouterRouter,
  useLocation,
} from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Studio from "@/pages/Studio";
import Library from "@/pages/Library";
import Landing from "@/pages/Landing";
import Administrative from "@/pages/Administrative";
import { ProjectProvider } from "@/lib/project-context";
import { getProjectSelectionKey, migrateLegacyData, selectDataScope } from "@/lib/db";
import { developmentPreview, useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const privateRoutes = new Set(["/library", "/admin"]);

// Only the recorded owner may import the old unscoped database. Unknown-owner
// data is kept intact but never presented to a production account.
const LAST_USER_KEY = "gnc:last-user-id";

function AuthDataGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const principal = developmentPreview ? "preview" : user ? String(user.id) : null;

  useEffect(() => {
    if (isLoading || !principal) return;
    let cancelled = false;
    (async () => {
      try {
        if (readyFor && readyFor !== principal) qc.clear();
        if (!developmentPreview) {
          const previous = localStorage.getItem(LAST_USER_KEY);
          const migratedKey = `gnc:legacy-imported:${principal}`;
          if (previous === principal && !localStorage.getItem(migratedKey)) {
            await migrateLegacyData(principal);
            localStorage.setItem(migratedKey, "1");
            const legacySelection = localStorage.getItem('novel-current-project-id');
            if (legacySelection) localStorage.setItem(getProjectSelectionKey(principal), legacySelection);
          }
          localStorage.setItem(LAST_USER_KEY, principal);
        }
        if (!cancelled) {
          selectDataScope(principal, developmentPreview);
          setReadyFor(principal);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not prepare local project storage.');
      }
    })();
    return () => { cancelled = true; };
  }, [principal, isLoading, qc]);

  if (error) return <div role="alert" className="p-8">Could not open your projects: {error}. Your local data was not deleted. Reload to retry.</div>;
  if (!principal || isLoading || readyFor !== principal) {
    // Signed-out landing must not mount ProjectProvider (and access another
    // account's data); private routes are handled by AppRoutes below.
    return principal ? <FullScreenLoader /> : <AppRoutes />;
  }
  return <>{children}</>;
}

function FullScreenLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { isSignedIn, isAdmin, isLoading } = useAuth();
  const [location] = useLocation();

  // Non-API legacy auth URLs can be served by Vite's SPA fallback rather
  // than the API proxy. Bring development visitors straight into Studio.
  if (developmentPreview && (
    location === "/auth/google" ||
    location === "/auth/google/callback" ||
    location === "/sign-in" ||
    location === "/sign-up"
  )) {
    return <Redirect to="/" replace />;
  }

  // Keep the pre-rendered root landing markup stable while the auth query
  // resolves. This lets hydrateRoot attach the sign-in handlers immediately;
  // authenticated visitors transition to Studio as soon as the session is
  // known.
  if (isLoading) {
    return location === "/" ? <Landing /> : <FullScreenLoader />;
  }

  // The landing page is public only at the canonical root URL. Private routes
  // must never render a copy of it under their own URL when signed out.
  if (!isSignedIn) {
    if (privateRoutes.has(location)) {
      return <Redirect to="/" replace />;
    }
    return location === "/" ? <Landing /> : <NotFound />;
  }

  return (
    <Switch>
      <Route path="/">
        <Studio />
      </Route>
      <Route path="/library">
        <Library />
      </Route>
      <Route path="/admin">{isAdmin ? <Administrative /> : <NotFound />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthDataGuard>
            <ProjectProvider key={developmentPreview ? "preview" : "account"}>
              <AppRoutes />
            </ProjectProvider>
          </AuthDataGuard>
          <Toaster />
          <SonnerToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;

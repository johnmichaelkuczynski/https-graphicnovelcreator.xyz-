import { useEffect } from "react";
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
import { ProjectProvider, STORAGE_KEY } from "@/lib/project-context";
import { dbApi } from "@/lib/db";
import { developmentPreview, useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const privateRoutes = new Set(["/library", "/admin"]);

// Remember which account last used this browser so we can wipe locally stored
// novels whenever a different account (or a signed-out state) is detected —
// one person's browser must never surface another person's content.
const LAST_USER_KEY = "gnc:last-user-id";

function AuthDataGuard() {
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    // A development preview may render before /auth/me resolves (or after a
    // cached 401). Never erase browser projects because its synthetic
    // principal temporarily replaces a real account.
    if (developmentPreview || isLoading) return;
    const userId = user ? String(user.id) : null;
    const previous = localStorage.getItem(LAST_USER_KEY);

    const wipeLocalData = () => {
      localStorage.removeItem(STORAGE_KEY);
      void dbApi.clearAllData().finally(() => qc.clear());
    };

    if (userId === null) {
      if (previous !== null) {
        wipeLocalData();
        localStorage.removeItem(LAST_USER_KEY);
      }
      return;
    }

    if (previous !== userId) {
      wipeLocalData();
    }
    localStorage.setItem(LAST_USER_KEY, userId);
  }, [user, isLoading, qc]);

  return null;
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
        <AuthDataGuard />
        <TooltipProvider>
          <ProjectProvider>
            <AppRoutes />
          </ProjectProvider>
          <Toaster />
          <SonnerToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;

import { useEffect } from "react";
import {
  Switch,
  Route,
  Router as WouterRouter,
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
import { ProjectProvider, STORAGE_KEY } from "@/lib/project-context";
import { dbApi } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Remember which account last used this browser so we can wipe locally stored
// novels whenever a different account (or a signed-out state) is detected —
// one person's browser must never surface another person's content.
const LAST_USER_KEY = "gnc:last-user-id";

function AuthDataGuard() {
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (isLoading) return;
    const userId = user?.id ?? null;
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
  const { isSignedIn, isLoading } = useAuth();

  if (isLoading) {
    return <FullScreenLoader />;
  }

  return (
    <Switch>
      <Route path="/">{isSignedIn ? <Studio /> : <Landing />}</Route>
      <Route path="/library">{isSignedIn ? <Library /> : <Landing />}</Route>
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

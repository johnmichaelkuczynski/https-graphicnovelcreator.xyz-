import { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { neobrutalism } from "@clerk/themes";
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Studio from "@/pages/Studio";
import Library from "@/pages/Library";
import Landing from "@/pages/Landing";
import { ProjectProvider, STORAGE_KEY } from "@/lib/project-context";
import { dbApi } from "@/lib/db";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: neobrutalism,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#FFCC00",
    colorForeground: "#1A1A1A",
    colorMutedForeground: "#555555",
    colorDanger: "#E23A3A",
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: "#1A1A1A",
    colorNeutral: "#1A1A1A",
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white border-4 border-[#1A1A1A] w-[440px] max-w-full overflow-hidden shadow-[6px_6px_0px_0px_#1A1A1A]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#1A1A1A] font-black uppercase tracking-tight",
    headerSubtitle: "text-[#555555] font-medium",
    socialButtonsBlockButton:
      "border-2 border-[#1A1A1A] bg-white text-[#1A1A1A] font-bold hover:bg-[#FFCC00]",
    socialButtonsBlockButtonText: "text-[#1A1A1A] font-bold",
    formButtonPrimary:
      "bg-[#FFCC00] text-[#1A1A1A] border-2 border-[#1A1A1A] font-black uppercase tracking-tight hover:bg-[#FFCC00]/90",
    formFieldLabel: "text-[#1A1A1A] font-bold",
    formFieldInput: "border-2 border-[#1A1A1A] bg-white text-[#1A1A1A]",
    footerActionLink: "text-[#1A1A1A] font-bold underline",
    footerActionText: "text-[#555555]",
    dividerText: "text-[#555555]",
    dividerLine: "bg-[#1A1A1A]/30",
    identityPreviewEditButton: "text-[#1A1A1A]",
    formFieldSuccessText: "text-[#1A1A1A]",
    alertText: "text-[#1A1A1A]",
    logoBox: "h-10",
    logoImage: "h-10",
    otpCodeFieldInput: "border-2 border-[#1A1A1A] text-[#1A1A1A]",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Studio />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function LibraryRoute() {
  return (
    <>
      <Show when="signed-in">
        <Library />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        // The signed-in user changed on this browser. Wipe all locally stored
        // projects/panels/audio so one account never sees another's content.
        localStorage.removeItem(STORAGE_KEY);
        void dbApi.clearAllData().finally(() => qc.clear());
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to your studio",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Start building graphic novels",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <ProjectProvider>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/library" component={LibraryRoute} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route component={NotFound} />
            </Switch>
          </ProjectProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;

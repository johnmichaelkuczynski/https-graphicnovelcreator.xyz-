import React from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, Wand2, Music, Film } from "lucide-react";
import { signInWithGoogle } from "@/hooks/use-auth";
import { BrandMark } from "@/components/BrandMark";

const features = [
  {
    icon: Wand2,
    title: "Story to Panels",
    desc: "Paste a story or screenplay, pick an art style, and generate illustrated panels with dialogue. Or upload your own images.",
  },
  {
    icon: Music,
    title: "Score It With Audio",
    desc: "Add soundtracks and effects to bring each scene to life.",
  },
  {
    icon: Film,
    title: "Play & Export",
    desc: "Watch it as a slideshow, then download as PDF or video.",
  },
];

export default function Landing() {
  const authFailed =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("error") === "auth_failed";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      {authFailed && (
        <div className="bg-destructive text-destructive-foreground border-b-4 border-border px-6 py-3 text-center font-bold">
          Sign-in didn't complete. Please try again.
        </div>
      )}
      <header className="border-b-4 border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="font-black uppercase tracking-tight text-lg hidden sm:inline">
            Graphic Novel Creator
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            className="hidden sm:inline-flex font-bold underline underline-offset-4"
          >
            <a href="https://zhisystems.org" target="_blank" rel="noreferrer">
              Contact Us
            </a>
          </Button>
          <Button
            variant="outline"
            className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold"
            onClick={signInWithGoogle}
          >
            Sign In
          </Button>
          <Button
            className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight hover:bg-primary/90"
            onClick={signInWithGoogle}
          >
            Get Started
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-12">
        <div className="max-w-2xl flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground border-2 border-border brutal-shadow px-4 py-1.5 font-bold uppercase text-xs tracking-widest">
            <BookOpen className="w-4 h-4" /> Your Story, Your Panels
          </div>
          <h1 className="text-5xl sm:text-6xl font-black uppercase tracking-tighter leading-[0.95]">
            Turn Your Story Into a Graphic Novel
          </h1>
          <p className="text-lg text-muted-foreground font-medium max-w-xl">
            Paste a story, dialogue, or screenplay and choose a drawing style.
            Generate illustrated panels with captions, or build manually from your own images.
            Save your projects in this browser, add audio, and export.
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight text-base px-8 hover:bg-primary/90"
              onClick={signInWithGoogle}
            >
              Start Creating — Free
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold text-base px-8"
              onClick={signInWithGoogle}
            >
              Sign In
            </Button>
          </div>
        </div>

        <section aria-labelledby="feature-section-title" className="w-full max-w-4xl">
          <h2 id="feature-section-title" className="sr-only">
            Create and Share Graphic Novels
          </h2>
          <div className="grid gap-6 sm:grid-cols-3 w-full">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-card border-4 border-border brutal-shadow p-6 flex flex-col items-center gap-3 text-center"
              >
                <div className="w-12 h-12 bg-primary border-2 border-border flex items-center justify-center">
                  <f.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="font-black uppercase tracking-tight">{f.title}</h3>
                <p className="text-sm text-muted-foreground font-medium">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t-4 border-border px-6 py-4 flex items-center justify-center gap-4 text-center text-sm font-bold text-muted-foreground">
        <span>Graphic Novel Creator</span>
        <span aria-hidden="true">•</span>
        <a
          href="https://zhisystems.org"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-4 hover:text-primary"
        >
          Contact Us
        </a>
      </footer>
    </div>
  );
}

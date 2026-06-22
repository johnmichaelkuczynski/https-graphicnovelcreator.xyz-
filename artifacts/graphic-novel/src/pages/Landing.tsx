import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, ImagePlus, Music, Film } from "lucide-react";

const features = [
  {
    icon: ImagePlus,
    title: "Upload Your Panels",
    desc: "Drag and drop your own images to build pages, instantly.",
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
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <header className="border-b-4 border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary border-2 border-border brutal-shadow flex items-center justify-center font-bold text-xl">
            GN
          </div>
          <span className="font-black uppercase tracking-tight text-lg hidden sm:inline">
            Graphic Novel Creator
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold"
            onClick={() => setLocation("/sign-in")}
          >
            Sign In
          </Button>
          <Button
            className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight hover:bg-primary/90"
            onClick={() => setLocation("/sign-up")}
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
            Build Graphic Novels From Your Own Images
          </h1>
          <p className="text-lg text-muted-foreground font-medium max-w-xl">
            Upload images, write captions, add audio, and play it back as a
            cinematic slideshow. Everything stays in your browser.
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground border-2 border-border brutal-shadow brutal-shadow-hover font-black uppercase tracking-tight text-base px-8 hover:bg-primary/90"
              onClick={() => setLocation("/sign-up")}
            >
              Start Creating — Free
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-card border-2 border-border brutal-shadow brutal-shadow-hover font-bold text-base px-8"
              onClick={() => setLocation("/sign-in")}
            >
              Sign In
            </Button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-3 max-w-4xl w-full">
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
      </main>

      <footer className="border-t-4 border-border px-6 py-4 text-center text-sm font-bold text-muted-foreground">
        Graphic Novel Creator
      </footer>
    </div>
  );
}

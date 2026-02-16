import { ArrowRight, Download, ExternalLink, ShieldCheck, Sparkles, SplitSquareVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const githubRepo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "joshu/pulse";
const windowsInstallerUrl =
  process.env.NEXT_PUBLIC_WINDOWS_INSTALLER_URL ??
  `https://github.com/${githubRepo}/releases/latest/download/Pulse-Setup.exe`;

const highlights = [
  {
    icon: SplitSquareVertical,
    title: "Native Tab Sessions",
    description: "Each logical tab runs in its own native CEF browser view with real isolation.",
  },
  {
    icon: Sparkles,
    title: "AI-First Workspace",
    description: "Pulse starts as a browser shell and grows into a capability-gated creation engine.",
  },
  {
    icon: ShieldCheck,
    title: "Safe Host Bridge",
    description: "Only the trusted UI context can execute host commands through a deny-by-default boundary.",
  },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden px-4 py-8 sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute inset-0 -z-20 grid-overlay" />
      <div className="pointer-events-none absolute -left-10 top-24 -z-10 h-48 w-48 rounded-full bg-sky-200/55 blur-3xl animate-float sm:h-72 sm:w-72" />
      <div className="pointer-events-none absolute -right-14 top-16 -z-10 h-52 w-52 rounded-full bg-orange-200/60 blur-3xl animate-float sm:h-80 sm:w-80" />

      <section className="mx-auto max-w-6xl rounded-3xl border border-border/80 bg-card/80 p-6 shadow-[0_18px_60px_-35px_rgba(29,34,46,0.35)] backdrop-blur-md sm:p-10">
        <div className="animate-reveal flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground font-mono text-sm font-semibold">
              PL
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight">Pulse</p>
              <p className="font-mono text-xs text-muted-foreground">cef-native workspace browser</p>
            </div>
          </div>
          <Badge className="rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]">
            Windows Preview
          </Badge>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="animate-reveal space-y-6" style={{ animationDelay: "120ms" }}>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              A browser shell built for deep creation workflows.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Pulse combines a trusted React UI with native CEF content sessions, so you get real browser behavior now
              and a clean path to AI-native tools next.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="rounded-full px-7 font-semibold">
                <a href={windowsInstallerUrl}>
                  <Download className="size-4" />
                  Download for Windows
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary" className="rounded-full px-7">
                <a href={`https://github.com/${githubRepo}`} target="_blank" rel="noreferrer">
                  View GitHub
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              Installer URL: <span className="break-all">{windowsInstallerUrl}</span>
            </p>
          </div>

          <div className="animate-reveal rounded-3xl border border-border/70 bg-background/75 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" style={{ animationDelay: "220ms" }}>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Release Channel</p>
            <p className="mt-4 text-sm text-muted-foreground">
              Velopack-generated installers and update packages ship from GitHub Releases. Vercel hosts this site.
            </p>
            <div className="mt-5 rounded-2xl border border-border bg-card p-4">
              <p className="font-mono text-xs text-muted-foreground">Latest stable endpoint</p>
              <p className="mt-2 text-sm font-medium leading-relaxed">/releases/latest/download/Pulse-Setup.exe</p>
            </div>
            <Button asChild variant="ghost" className="mt-4 h-auto px-0 text-sm">
              <a href={`https://github.com/${githubRepo}/releases`} target="_blank" rel="noreferrer">
                Browse releases
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-3">
        {highlights.map((item, index) => (
          <Card key={item.title} className="animate-reveal border-border/80 bg-card/88 backdrop-blur-sm" style={{ animationDelay: `${300 + index * 90}ms` }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <item.icon className="size-4 text-primary" />
                {item.title}
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Pulse Core</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

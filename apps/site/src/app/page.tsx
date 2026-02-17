import {
  ArrowRight,
  Bot,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GridPattern } from "@/components/ui/grid-pattern";
import { Marquee } from "@/components/ui/marquee";
import { ShineBorder } from "@/components/ui/shine-border";
import { WordRotate } from "@/components/ui/word-rotate";
import { AnimatedList } from "@/components/ui/animated-list";

const githubRepo = (process.env.NEXT_PUBLIC_GITHUB_REPO ?? "").trim() || "isaac10334/pulse";
const windowsInstallerUrl =
  (process.env.NEXT_PUBLIC_WINDOWS_INSTALLER_URL ?? "").trim() ||
  `https://github.com/${githubRepo}/releases/latest/download/Pulse-win-Setup.exe`;

const replaces = [
  "Notion",
  "Coda",
  "Airtable",
  "Browser Tabs",
  "File Managers",
  "Scratchpad Apps",
  "Standalone IDE Playgrounds",
  "Fragmented AI Chats",
];

const highlights = [
  {
    icon: Globe,
    title: "One Surface For Everything",
    description:
      "Browse the web, manage project files, draft docs, and run experiments from one clean command center.",
  },
  {
    icon: Bot,
    title: "Built For Humans + Agents",
    description:
      "Pulse keeps context in one place so your AI helpers can actually act, not just answer in isolated chats.",
  },
  {
    icon: FolderKanban,
    title: "Docs, Files, Ideas, Shipping",
    description:
      "Replace scattered docs tools and tab chaos with one workspace that is fast enough for daily execution.",
  },
];

const liveFeed = [
  { title: "Open Product Plan", detail: "Roadmap and notes live beside active browser sessions." },
  { title: "Browse + Capture", detail: "Research, screenshot, and organize findings without context switching." },
  { title: "Prototype Fast", detail: "Use the built-in coding playground to test ideas in seconds." },
  { title: "Delegate To AI", detail: "Give agents the same workspace context you see, with less overhead." },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden px-4 py-8 sm:px-8 sm:py-10">
      <GridPattern
        width={54}
        height={54}
        x={-2}
        y={-2}
        className="pointer-events-none absolute inset-0 -z-20 fill-white/[0.02] stroke-white/[0.06]"
      />
      <div className="pointer-events-none absolute -left-20 top-16 -z-10 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl animate-float sm:h-80 sm:w-80" />
      <div className="pointer-events-none absolute -right-24 top-10 -z-10 h-64 w-64 rounded-full bg-indigo-400/15 blur-3xl animate-float sm:h-96 sm:w-96" />

      <section className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-card/65 p-6 shadow-[0_24px_90px_-50px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <BlurFade className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/90 text-primary-foreground font-mono text-sm font-semibold">
              PU
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-foreground">Pulse</p>
              <p className="font-mono text-xs text-muted-foreground">Everything workspace</p>
            </div>
          </BlurFade>
          <BlurFade delay={0.08}>
            <Badge className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground">
              Windows Preview
            </Badge>
          </BlurFade>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <BlurFade delay={0.12} className="space-y-6">
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              The all-in-one workspace for ambitious builders and AI agents.
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-base text-muted-foreground sm:text-lg">
              <span>One secure Chromium-powered app for</span>
              <WordRotate
                words={["browsing", "file exploration", "IDE-style playgrounds", "docs + execution"]}
                className="font-semibold text-primary sm:text-xl"
                duration={2200}
              />
            </div>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Pulse is built for a future where your browser, file explorer, and coding workspace feel like one product.
              It keeps your workstream smooth for humans and gives AI agents the context they need to help in real time.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="rounded-full bg-primary px-7 font-semibold text-primary-foreground">
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
            <p className="font-mono text-xs text-muted-foreground/90">
              Installer URL: <span className="break-all">{windowsInstallerUrl}</span>
            </p>
          </BlurFade>

          <BlurFade delay={0.22}>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-background/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <ShineBorder
                borderWidth={1}
                duration={18}
                shineColor={["rgba(106,190,255,0.6)", "rgba(168,111,255,0.35)", "rgba(98,233,195,0.55)"]}
              />
              <div className="relative space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Live Workspace Feed</p>
                  <Badge className="border border-primary/30 bg-primary/15 text-primary">Active</Badge>
                </div>
                <div className="h-72 overflow-hidden rounded-2xl border border-white/10 bg-card/80 p-3">
                  <AnimatedList delay={900}>
                    {liveFeed.map((item) => (
                      <div key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </AnimatedList>
                </div>
                <Button asChild variant="ghost" className="h-auto w-fit px-0 text-sm">
                  <a href={`https://github.com/${githubRepo}/releases`} target="_blank" rel="noreferrer">
                    Browse releases
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </BlurFade>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-3xl border border-white/10 bg-card/55 p-4 backdrop-blur-xl sm:p-6">
        <BlurFade>
          <p className="px-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">What Pulse Replaces</p>
          <Marquee pauseOnHover className="[--duration:28s]">
            {replaces.map((item) => (
              <div
                key={item}
                className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-foreground/90"
              >
                {item}
              </div>
            ))}
          </Marquee>
        </BlurFade>
      </section>

      <section className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-3">
        {highlights.map((item, index) => (
          <BlurFade key={item.title} delay={0.06 * (index + 1)}>
            <Card className="h-full border-white/10 bg-card/78 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <item.icon className="size-4 text-primary" />
                  {item.title}
                </CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  <span>Designed to grow into a true everything app.</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TerminalSquare className="size-3.5 text-primary" />
                  <span>From capture to execution, in one flow.</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="size-3.5 text-primary" />
                  <span>Notes, plans, and output stay connected.</span>
                </div>
              </CardContent>
            </Card>
          </BlurFade>
        ))}
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-3xl border border-white/10 bg-card/55 p-6 backdrop-blur-xl sm:p-8">
        <BlurFade>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xl font-semibold tracking-tight">The goal: your complete digital desk.</p>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Pulse is heading toward one seamless home for files, browsing, docs, coding, and AI-powered execution.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-full px-7 font-semibold">
              <a href={`https://github.com/${githubRepo}/releases`} target="_blank" rel="noreferrer">
                Try the latest build
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </BlurFade>
      </section>
    </main>
  );
}

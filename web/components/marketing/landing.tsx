import { ArrowRight, Boxes, Gauge, History, ScanSearch, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { Cavman } from "@/components/brand/cavman";
import { LiveCavman } from "@/components/brand/live-cavman";
import { FlintSticker } from "@/components/brand/logo";
import { Redacted } from "@/components/brand/redacted";
import { buttonClass } from "@/components/ui/button";
import { BuildPrompt } from "./build-prompt";
import { ExampleRun } from "./example-run";

// The four steps really are a sequence, so they are numbered finds with their spot on the dig grid.
const FINDS = [
  { grid: "A2", title: "Plans", body: "Breaks your idea into small tasks and a checklist of what done means." },
  { grid: "B2", title: "Builds", body: "A crew of specialist agents writes the code inside a sealed box with no internet." },
  { grid: "C2", title: "Tests by fire", body: "Runs real tests, fixes what breaks, and runs them again until they pass." },
  { grid: "D2", title: "Hands it over", body: "A second model reviews it first. You download it or publish it. Your call." },
];

const TRUST = [
  { icon: ShieldCheck, title: "Trusted validation", body: "Checks run in an isolated sandbox with no network and no access to your secrets. An agent’s claim that tests pass counts for nothing." },
  { icon: ScanSearch, title: "Independent review", body: "A fresh reviewer that never touched the work inspects every candidate before it can be accepted." },
  { icon: History, title: "Durable runs", body: "Every task, attempt, check and decision is recorded. Close the browser and the build keeps going, even through restarts." },
  { icon: UserCheck, title: "You approve what matters", body: "Consequential actions wait for your decision, bound to the exact scope you were shown. Nothing else interrupts you." },
  { icon: Gauge, title: "Spending under control", body: "Every run has a budget ceiling. Provider-reported cost and model usage are tracked per call." },
  { icon: Boxes, title: "Any model", body: "Cavman is model-agnostic and routes work through economical open models. No single vendor required." },
];

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <section className="stone dig-grid relative overflow-hidden border-b-2 border-ink">
        <div aria-hidden="true" className="tape pointer-events-none absolute -right-24 top-9 z-10 w-[30rem] rotate-[15deg] sm:-right-16 sm:top-12 sm:w-[26rem] sm:rotate-[32deg]">
          <span>DO NOT DISTURB THE SPECIMEN</span>
        </div>
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-28 sm:px-6 sm:pt-20 lg:grid-cols-[1.3fr_1fr] lg:px-8 lg:pb-24">
          <div className="min-w-0">
            <p className="eyebrow text-muted">Site: cavman.dev · Grid C4 · Layer 0</p>
            <h1 className="display text-balance mt-5 text-[1.9rem] leading-[1.08] text-fg sm:text-5xl lg:text-[3rem]">
              We dug up a caveman who <span className="marker">builds software.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-soft">
              Type what you want. He plans it, builds it in a sealed box, and only hands it over once real tests and a
              second reviewer say it works. Best today at Python and TypeScript libraries, CLIs and API cores.
            </p>
            <div className="mt-9 max-w-2xl">
              <BuildPrompt signedIn={signedIn} />
            </div>
            <p className="mt-6 font-mono text-xs text-muted">
              Open source · every build shows what it cost · nothing leaves the box without your OK
            </p>
          </div>

          <figure className="relative mx-auto flex flex-col items-center" aria-label="Specimen 001: Cavman, alive, in a display case">
            <div className="relative grid aspect-square w-[min(15rem,68vw)] place-items-center rounded-xl border-[2.5px] border-ink bg-white/60 shadow-[inset_0_0_0_6px_rgb(255_255_255/0.6)]">
              <span aria-hidden="true" className="absolute left-[14%] top-[10%] h-[40%] w-[11%] -skew-x-12 rounded bg-white/70" />
              <LiveCavman className="h-[72%] w-[72%]" />
            </div>
            <div aria-hidden="true" className="h-4 w-[calc(min(15rem,68vw)+1.5rem)] rounded-t bg-ink" />
            <figcaption className="-mt-1 -rotate-3 rounded-md border-2 border-ink bg-surface px-3 py-2 font-mono text-xs leading-relaxed shadow-[var(--shadow-sticker)]">
              <span className="display block text-xs">Specimen 001</span>
              homo buildicus
              <br />
              condition: <Redacted>alive. do not tap the glass.</Redacted>
            </figcaption>
            <span aria-hidden="true" className="sticker absolute -right-4 top-5 rotate-[9deg] bg-gum">NO SUDO</span>
            <span aria-hidden="true" className="sticker absolute -left-6 top-1/2 -rotate-6 bg-sky">RUNS IN A BOX</span>
            <FlintSticker className="absolute -right-3 bottom-16 h-14 w-14 -rotate-12 drop-shadow-[2px_2px_0_rgb(0_0_0/0.22)]" />
          </figure>
        </div>
      </section>

      <section aria-labelledby="finds-title" className="border-b-2 border-ink bg-surface-2">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 id="finds-title" className="eyebrow text-muted">Layer 1 · what we found him doing</h2>
          <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FINDS.map((find, index) => (
              <li key={find.title} className="panel p-5">
                <p className="font-mono text-[0.7rem] font-medium text-muted">
                  FIND 0{index + 1} · GRID {find.grid}
                </p>
                <h3 className="display mt-3 text-sm text-fg">{find.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-soft">{find.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="product" aria-labelledby="product-title" className="scroll-mt-20 border-b-2 border-ink">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:px-8">
          <div>
            <p className="eyebrow text-muted">Layer 2 · the product</p>
            <h2 id="product-title" className="display text-balance mt-4 text-2xl leading-tight text-fg sm:text-3xl">
              One request in. A verified project out.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-soft">
              You never manage agents. Cavman decomposes the goal, assigns specialists, runs independent work in
              parallel, and keeps going, retrying, revising or replanning, until the work is accepted or it genuinely
              needs you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={signedIn ? "/app/new" : "/sign-up"} className={buttonClass("primary", "lg")}>
                Start building <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/how-it-works" className={buttonClass("secondary", "lg")}>
                How it works
              </Link>
            </div>
          </div>
          <ExampleRun />
        </div>
      </section>

      <section aria-labelledby="trust-title" className="border-b-2 border-ink bg-surface-2">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow text-muted">Layer 3 · why he can be trusted</p>
            <h2 id="trust-title" className="display text-balance mt-4 text-2xl leading-tight text-fg sm:text-3xl">
              Autonomous, with the receipts.
            </h2>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((item) => (
              <li key={item.title} className="panel p-6">
                <item.icon className="h-5 w-5 text-glacier" aria-hidden="true" />
                <h3 className="mt-4 text-base font-bold text-fg">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="stone dig-grid">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6">
          <Cavman mood="cheer" className="h-16 w-16" />
          <h2 className="display text-balance mt-6 text-2xl text-fg sm:text-3xl">Fire was a good start.</h2>
          <p className="mt-4 max-w-xl text-fg-soft">Say what you want. Approve what matters. Download what was verified.</p>
          <Link href={signedIn ? "/app/new" : "/sign-up"} className={buttonClass("primary", "lg", "mt-8")}>
            Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}

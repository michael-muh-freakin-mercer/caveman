import { ArrowRight, Boxes, ClipboardList, Gauge, Hammer, History, PackageCheck, ScanSearch, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { BuildPrompt } from "./build-prompt";
import { ExampleRun } from "./example-run";

const STEPS = [
  { icon: ClipboardList, title: "Plan", body: "Caveman understands the request and creates executable work." },
  { icon: Hammer, title: "Build", body: "Specialist agents execute appropriate tasks." },
  { icon: ScanSearch, title: "Review", body: "Generated work is tested, inspected, and refined." },
  { icon: PackageCheck, title: "Deliver", body: "A verified project is returned to the user." },
];

const TRUST = [
  { icon: ShieldCheck, title: "Trusted validation", body: "Checks run in an isolated sandbox with no network and no access to your secrets. An agent’s claim that tests pass counts for nothing." },
  { icon: ScanSearch, title: "Independent review", body: "A fresh reviewer that never touched the work inspects every candidate before it can be accepted." },
  { icon: History, title: "Durable runs", body: "Every task, attempt, check and decision is recorded. Close the browser — the build keeps going and survives restarts." },
  { icon: UserCheck, title: "You approve what matters", body: "Consequential actions wait for your decision, bound to the exact scope you were shown. Nothing else interrupts you." },
  { icon: Gauge, title: "Spending under control", body: "Every run has a budget ceiling. Provider-reported cost and model usage are tracked per call." },
  { icon: Boxes, title: "Any model", body: "Caveman is model-agnostic and routes work through economical open models — no single vendor required." },
];

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <section className="stone relative overflow-hidden">
        <div aria-hidden="true" className="hairline-grid absolute inset-0 -z-10" />
        <div aria-hidden="true" className="absolute left-1/2 top-[-18rem] -z-10 h-[38rem] w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_106_31/0.16),transparent)]" />
        <div aria-hidden="true" className="absolute right-[-10rem] top-40 -z-10 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgb(47_212_238/0.08),transparent)]" />
        <div className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28 lg:pb-28">
          <p className="eyebrow text-ember">From idea to working software</p>
          <h1 className="text-balance mt-6 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-fg sm:text-6xl lg:text-7xl">
            Type what you want.
            <br />
            <span className="bg-gradient-to-r from-ember via-ember-hot to-[#ffb07a] bg-clip-text text-transparent">Caveman builds it.</span>
          </h1>
          <p className="text-balance mx-auto mt-7 max-w-2xl text-base leading-relaxed text-fg-soft sm:text-lg">
            Describe the software you want in plain English. Caveman plans the work, coordinates specialist agents,
            tests the result, fixes failures, and delivers the project.
          </p>
          <div className="mx-auto mt-10 max-w-3xl">
            <BuildPrompt signedIn={signedIn} />
          </div>
          <p className="mt-8 font-mono text-xs tracking-[0.14em] text-muted">YOU DESCRIBE. CAVEMAN DELIVERS.</p>
        </div>
      </section>

      <section aria-labelledby="steps-title" className="border-t border-line bg-ink/40">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 id="steps-title" className="sr-only">What Caveman does</h2>
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative bg-surface p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-surface-2">
                    <step.icon className="h-5 w-5 text-ember" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-faint">0{index + 1}</span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="product" aria-labelledby="product-title" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:px-8">
          <div>
            <p className="eyebrow text-glacier">The product</p>
            <h2 id="product-title" className="text-balance mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              One request in. A verified project out.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-soft">
              You never manage agents. Caveman decomposes the goal, assigns specialists, runs independent work in
              parallel, and keeps going — retrying, revising or replanning — until the work is accepted or it genuinely
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

      <section aria-labelledby="trust-title" className="border-t border-line bg-ink/40">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="eyebrow text-ember">Built to be trusted</p>
            <h2 id="trust-title" className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Autonomous, with the receipts.
            </h2>
          </div>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((item) => (
              <li key={item.title} className="panel p-6">
                <item.icon className="h-5 w-5 text-glacier" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold text-fg">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="stone border-t border-line">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6">
          <Mark className="h-10 w-10" />
          <h2 className="text-balance mt-5 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Fire was a good start.
          </h2>
          <p className="mt-4 max-w-xl text-fg-soft">Say what you want. Approve what matters. Download what was verified.</p>
          <Link href={signedIn ? "/app/new" : "/sign-up"} className={buttonClass("primary", "lg", "mt-8")}>
            Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}

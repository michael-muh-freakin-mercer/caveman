import { ArrowRight, BrainCircuit, CheckCircle2, MessageSquareText, Network, PackageCheck, Rocket, ScanSearch, Workflow } from "lucide-react";
import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

const STAGES = [
  { n: "01", icon: BrainCircuit, title: "Understand", body: "Interpret objective, constraints, requirements, and desired outcome.", detail: "Caveman turns your words into measurable success criteria before any work starts." },
  { n: "02", icon: Network, title: "Plan", body: "Create a dependency-aware execution graph and select specialists.", detail: "Each task gets one owner, one deliverable, acceptance criteria and predeclared checks." },
  { n: "03", icon: Workflow, title: "Build", body: "Execute ready work in parallel where appropriate.", detail: "Specialists work in isolated workspaces with only the tools their task needs." },
  { n: "04", icon: ScanSearch, title: "Review", body: "Validate, inspect, critique, retry, recover, or replan.", detail: "Sandboxed checks and a fresh independent reviewer gate every candidate. Failures are classified and routed." },
  { n: "05", icon: PackageCheck, title: "Deliver", body: "Verify and return the assembled result.", detail: "Completion requires every success criterion to cite accepted work. You download exactly what was verified." },
];

const SPECIALISTS = ["Product specialist", "Frontend specialist", "Backend specialist", "QA specialist", "DevOps specialist"];

function FlowNode({ icon: Icon, title, caption, accent = false }: { icon: React.ElementType; title: string; caption: string; accent?: boolean }) {
  return (
    <div className={`panel flex w-full max-w-sm items-center gap-4 px-5 py-4 ${accent ? "shadow-ember" : ""}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${accent ? "border-ember/40 bg-ember/10" : "border-line-strong bg-surface-2"}`}>
        <Icon className={`h-5 w-5 ${accent ? "text-ember" : "text-glacier"}`} aria-hidden="true" />
      </span>
      <div className="text-left">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <p className="text-xs text-muted">{caption}</p>
      </div>
    </div>
  );
}

function Down() {
  return (
    <div className="flex h-10 items-center justify-center" aria-hidden="true">
      <svg width="2" height="40" className="overflow-visible">
        <line x1="1" y1="0" x2="1" y2="40" stroke="rgb(47 212 238 / 0.6)" strokeWidth="1.5" className="animate-flow" />
      </svg>
    </div>
  );
}

export function HowItWorks({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <section className="stone relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="hairline-grid absolute inset-0 -z-10" />
        <div className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <p className="eyebrow text-ember">How it works</p>
          <h1 className="text-balance mt-6 text-5xl font-semibold tracking-[-0.035em] text-fg sm:text-6xl">From prompt to production.</h1>
          <p className="text-balance mx-auto mt-6 max-w-2xl text-lg text-fg-soft">
            One Manager owns your goal. Specialists do the work. Nothing counts as done until trusted checks and an
            independent reviewer say so.
          </p>
        </div>
      </section>

      <section aria-labelledby="stages-title" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h2 id="stages-title" className="sr-only">Stages</h2>
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
          {STAGES.map((stage) => (
            <li key={stage.n} className="panel flex flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-ember">{stage.n}</span>
                <stage.icon className="h-5 w-5 text-glacier" aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-lg font-semibold text-fg">{stage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-soft">{stage.body}</p>
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-muted">{stage.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="flow-title" className="border-y border-line bg-ink/40">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8">
          <div className="lg:pt-8">
            <p className="eyebrow text-glacier">The flow</p>
            <h2 id="flow-title" className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              You talk to Caveman. Caveman runs the team.
            </h2>
            <p className="mt-5 max-w-lg text-fg-soft">
              Specialists are created for each project, scoped to one lane of work, and retired when their work is
              accepted. The set below is only an example — Caveman chooses the specialists your project actually needs.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-fg-soft">
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden="true" />Only accepted work unlocks the tasks that depend on it.</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden="true" />Failures are classified and routed: retry, revise, replace, escalate or replan.</li>
              <li className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden="true" />Material plan changes and risky actions wait for your exact approval.</li>
            </ul>
          </div>
          <figure className="flex flex-col items-center" aria-label="Flow from your prompt, through Caveman and its specialists, to a verified project">
            <FlowNode icon={MessageSquareText} title="User Prompt" caption="“Build me a booking app for a tattoo studio”" />
            <Down />
            <div className="panel flex w-full max-w-sm items-center gap-4 px-5 py-4 shadow-ember">
              <Mark className="h-10 w-10" />
              <div className="text-left">
                <p className="text-sm font-semibold text-fg">Caveman</p>
                <p className="text-xs text-muted">Plans, delegates, validates, reviews, accepts</p>
              </div>
            </div>
            <Down />
            <div className="w-full max-w-md rounded-2xl border border-dashed border-line-strong p-4">
              <p className="eyebrow mb-3 text-center text-[0.62rem] text-muted">Specialists · chosen per project</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {SPECIALISTS.map((name, index) => (
                  <li key={name} className={`flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg-soft ${index === SPECIALISTS.length - 1 ? "sm:col-span-2 sm:justify-center" : ""}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-glacier" aria-hidden="true" />
                    {name}
                  </li>
                ))}
              </ul>
            </div>
            <Down />
            <FlowNode icon={Rocket} title="Verified Project" caption="Accepted, tested, reviewed — ready to download" accent />
            <figcaption className="sr-only">
              User Prompt, then Caveman, then a dynamic set of specialists such as product, frontend, backend, QA and
              DevOps, then a verified project.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="mx-auto flex max-w-4xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Ready when you are.</h2>
        <p className="mt-4 text-fg-soft">Describe it once. Caveman does the rest.</p>
        <Link href={signedIn ? "/app/new" : "/sign-up"} className={buttonClass("primary", "lg", "mt-8")}>
          Build something <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}

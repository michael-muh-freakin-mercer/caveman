import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Docs" };

const SECTIONS = [
  {
    id: "start",
    title: "Start a build",
    body: [
      "Sign in, describe what you want on the New build screen, and press Build it. Caveman creates a project, a durable run, and queues it for a worker. You can close the browser at any time; the run continues.",
      "Optional settings let you name a preferred stack, add constraints, record a deployment target, and set the run's budget ceiling. Everything else is inferred.",
    ],
  },
  {
    id: "run",
    title: "Follow a run",
    body: [
      "The run dashboard shows real state from the orchestration core: the current stage, each task and its specialist, attempts, dependencies, trusted check results, reviews, failures and recoveries, approvals, model usage and cost.",
      "Task states: Waiting, Ready, Running, Validating, Reviewing, Revision Needed, Needs Approval, Blocked, Failed, Accepted.",
    ],
  },
  {
    id: "trust",
    title: "What “done” means",
    body: [
      "A specialist returning work only creates a candidate. It is accepted only after every predeclared check passes in the sandbox and a fresh independent reviewer approves it — against the exact bytes submitted. The run completes only when every success criterion cites accepted work.",
      "Checks run inside Bubblewrap with no network, a cleared environment, and resource limits. The sandbox runs Python (compile, pytest) and Node/TypeScript (the Node test runner and tsc). npm dependencies are installed by a separate isolated step with install scripts disabled, then mounted read-only. Other stacks are delivered as reviewed source and documents.",
    ],
  },
  {
    id: "approvals",
    title: "Approvals",
    body: [
      "Caveman asks only for consequential decisions: material plan changes, capability escalations, and actions such as publishing code. Each request states what, why, the risk and the exact scope. Approving binds to the scope digest you were shown; if the request changes, you are asked again.",
    ],
  },
  {
    id: "budget",
    title: "Budgets and cost",
    body: [
      "Every run has a spending ceiling and a model-call ceiling. Caveman records provider, model, tokens, cache usage and provider-reported cost for each call. When a limit is reached the run pauses safely; raise the budget and continue if you choose.",
      "Some providers do not report cost for every call. Caveman shows that honestly rather than estimating.",
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    body: [
      "When a run completes, Caveman assembles an archive from exactly the accepted, fingerprint-verified files plus a build report. Nothing is pushed or deployed on your behalf.",
    ],
  },
  {
    id: "limits",
    title: "Current limitations",
    body: [
      "Live previews of generated apps are not available yet; Caveman will not render untrusted code on its own origin. Publishing to GitHub is not wired yet. Sandboxed execution supports Python and Node/TypeScript; builds and dev servers are not run. OpenRouter is the only configured model provider.",
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
      <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow text-muted">Docs</p>
        <ul className="mt-4 space-y-2 text-sm">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-fg-soft hover:text-fg">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-fg">Caveman documentation</h1>
        <p className="mt-4 text-lg text-fg-soft">
          Everything you need to use Caveman. Operators should read the{" "}
          <a className="text-glacier underline-offset-4 hover:underline" href="https://github.com/michael-muh-freakin-mercer/caveman#readme" rel="noreferrer">
            setup guide in the repository
          </a>
          .
        </p>
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 border-t border-line pt-10 mt-10">
            <h2 className="text-2xl font-semibold text-fg">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)} className="mt-4 leading-relaxed text-fg-soft">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <p className="mt-14 text-sm text-muted">
          Ready? <Link href="/app/new" className="text-ember hover:underline">Start a build</Link>.
        </p>
      </article>
    </div>
  );
}

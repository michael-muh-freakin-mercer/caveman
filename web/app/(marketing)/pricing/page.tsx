import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pricing" };

const HOSTED = [
  "Nothing to install: describe it at cavman.dev and Cavman builds it",
  "A monthly model allowance on us, shown in your account",
  "Sandboxed validation and independent review on every build",
  "Download the finished project from every completed build",
];

const SELF_HOSTED = [
  "The full Cavman product: web app, API and durable workers",
  "Trusted sandboxed validation and independent review",
  "Per-run budget ceilings with provider-reported cost tracking",
  "Bring your own model provider key (OpenRouter today)",
];

function Included({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 space-y-3 text-sm text-fg-soft">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Check className="h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="max-w-2xl">
        <p className="eyebrow text-muted">The back of the cave · pricing</p>
        <h1 className="display text-balance mt-5 text-2xl leading-tight text-fg sm:text-4xl">Free while we dig. <span className="marker">Honest prices after.</span></h1>
        <p className="mt-5 text-lg text-fg-soft">
          Hosted Cavman is free during the beta. Cavman is also open source under the MIT license: run it yourself and
          you pay only what your model provider charges. Either way, every run shows exactly what it cost.
        </p>
      </div>
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <section className="panel p-8 shadow-ember" aria-labelledby="hosted">
          <h2 id="hosted" className="text-lg font-semibold text-fg">Hosted beta</h2>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-fg">$0</span>
            <span className="text-sm text-muted">during the beta</span>
          </p>
          <Included items={HOSTED} />
          <Link href="/sign-up" className={buttonClass("primary", "lg", "mt-10 w-full")}>
            Start building free
          </Link>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Paid plans are coming. We will tell you before anything is charged, and beta users get a discount.
          </p>
        </section>
        <section className="panel p-8" aria-labelledby="self-hosted">
          <h2 id="self-hosted" className="text-lg font-semibold text-fg">Self-hosted</h2>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-fg">$0</span>
            <span className="text-sm text-muted">+ your provider usage</span>
          </p>
          <Included items={SELF_HOSTED} />
          <Link href="/docs" className={buttonClass("secondary", "lg", "mt-10 w-full")}>
            Read the setup guide
          </Link>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Each run starts with a budget ceiling (five US dollars by default) and pauses safely when it is reached.
          </p>
        </section>
      </div>
    </div>
  );
}

import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pricing" };

const INCLUDED = [
  "The full Cavman product: web app, API and durable workers",
  "Trusted sandboxed validation and independent review",
  "Per-run budget ceilings with provider-reported cost tracking",
  "Bring your own model provider key (OpenRouter today)",
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="max-w-2xl">
        <p className="eyebrow text-ember">Pricing</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Pay for the models. Nothing else.</h1>
        <p className="mt-5 text-lg text-fg-soft">
          Cavman is open source under the MIT license. Run it yourself and you pay only what your model provider
          charges — and every run shows exactly what it cost.
        </p>
      </div>
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <section className="panel p-8 shadow-ember" aria-labelledby="self-hosted">
          <h2 id="self-hosted" className="text-lg font-semibold text-fg">Self-hosted</h2>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-fg">$0</span>
            <span className="text-sm text-muted">+ your provider usage</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-fg-soft">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3">
                <Check className="h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <Link href="/docs" className={buttonClass("primary", "lg", "mt-10 w-full")}>
            Read the setup guide
          </Link>
        </section>
        <section className="panel p-8" aria-labelledby="hosted">
          <h2 id="hosted" className="text-lg font-semibold text-fg">Hosted</h2>
          <p className="mt-4 text-4xl font-semibold text-muted">Not yet</p>
          <p className="mt-8 text-sm leading-relaxed text-fg-soft">
            A managed Cavman is not available today. When it is, it will be listed here with real prices — not
            before.
          </p>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            Spending protection applies everywhere: each run starts with a budget ceiling (five US dollars by default)
            and pauses safely when it is reached.
          </p>
        </section>
      </div>
    </div>
  );
}

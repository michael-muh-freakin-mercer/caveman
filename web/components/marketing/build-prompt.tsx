"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { MAX_PROMPT_LENGTH, newBuildPath, savePendingPrompt } from "@/lib/prompt-storage";
import { useHydrated } from "@/lib/use-hydrated";

const EXAMPLES: { label: string; prompt: string }[] = [
  { label: "Web app", prompt: "Build me a booking app for a tattoo studio" },
  { label: "SaaS", prompt: "Build a subscription invoicing SaaS for freelancers" },
  { label: "Mobile app", prompt: "Build a habit-tracking mobile app with streaks and reminders" },
  { label: "Internal tool", prompt: "Build an internal tool to track equipment check-outs" },
  { label: "API", prompt: "Build a REST API for a recipe catalogue with search" },
  { label: "CLI", prompt: "Build a CLI that renames photos by the date they were taken" },
];

export function BuildPrompt({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (text.length < 3) {
      setError("Describe what you want to build.");
      return;
    }
    setError(null);
    if (!signedIn) {
      savePendingPrompt(text);
      router.push(`/sign-up?next=${encodeURIComponent(newBuildPath(text))}`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cavman/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Cavman could not start this build.");
      router.push(`/app/runs/${body.run_id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cavman could not start this build.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <form method="post" onSubmit={submit} className="group relative" aria-describedby={error ? errorId : undefined}>
        <div className="rounded-2xl bg-gradient-to-b from-line-strong/80 to-line/40 p-px shadow-[0_30px_80px_-40px_rgb(255_106_31/0.55)] transition-shadow focus-within:shadow-ember">
          <div className="flex flex-col gap-3 rounded-[15px] bg-surface/95 p-3 sm:flex-row sm:items-end sm:p-2.5 sm:pl-5">
            <label htmlFor={inputId} className="sr-only">
              Describe the software you want
            </label>
            <textarea
              id={inputId}
              name="prompt"
              rows={1}
              value={prompt}
              maxLength={MAX_PROMPT_LENGTH}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Build me a booking app for a tattoo studio"
              className="min-h-12 flex-1 resize-none bg-transparent px-1 py-3 text-base text-fg placeholder:text-faint focus:outline-none sm:py-2.5 sm:text-lg"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              type="submit"
              disabled={busy || !hydrated}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ember px-6 text-base font-semibold text-ink transition-colors hover:bg-ember-hot disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              {busy ? "Starting…" : "Build it"}
              {busy ? null : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        ) : null}
      </form>
      <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Examples">
        {EXAMPLES.map((example) => (
          <li key={example.label}>
            <button
              type="button"
              onClick={() => setPrompt(example.prompt)}
              className="rounded-full border border-line bg-surface/60 px-3.5 py-1.5 text-sm text-fg-soft transition-colors hover:border-line-strong hover:text-fg"
            >
              {example.label}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => {
              setPrompt("");
              document.getElementById(inputId)?.focus();
            }}
            className="rounded-full border border-dashed border-line-strong px-3.5 py-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            Anything...
          </button>
        </li>
      </ul>
    </div>
  );
}
